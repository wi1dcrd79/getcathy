-- Phase B: Track 6 Dispatch Gate & Multi-Trade Continuity Engine.
-- DEPENDS ON Phase A (public.certification_types). Aborts cleanly if Phase A is not applied.
-- Verified locally: single-gate (missing_cert, compliant) and dual-gate (lapsed >150d,
-- warning 120-150d, compliant reset). Idempotent; safe to re-run.

DO $$
BEGIN
  IF to_regclass('public.certification_types') IS NULL THEN
    RAISE EXCEPTION 'Phase B requires Phase A (public.certification_types). Apply Phase A first.';
  END IF;
END $$;


-- 1. Multi-trade presets
INSERT INTO public.certification_types (code, name, requires_continuity) VALUES
  ('ELEC_JOURNEYMAN', 'Journeyman Electrician License', false),
  ('ELEC_MASTER',     'Master Electrician License', false),
  ('NFPA_70E',        'NFPA 70E Arc Flash Safety', false),
  ('ELEC_HV_SPLICE',  'Medium/High-Voltage Cable Splicer', false),
  ('PLUMB_JOURNEYMAN','Journeyman Plumber License', false),
  ('PLUMB_MASTER',    'Master Plumber License', false),
  ('ASSE_5110',       'ASSE 5110 Backflow Prevention Tester', false),
  ('ASSE_6010_BRAZE', 'ASSE 6010 Medical Gas Brazer', true)
ON CONFLICT (code) DO NOTHING;

-- 2. Continuity log (verified welds / brazes)
CREATE TABLE IF NOT EXISTS public.craft_continuity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  personnel_id uuid NOT NULL REFERENCES public.personnel_records(id) ON DELETE CASCADE,
  cert_type_code text NOT NULL REFERENCES public.certification_types(code),
  performed_date date NOT NULL,
  work_reference text,
  verified_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_continuity_person_code
  ON public.craft_continuity_logs (personnel_id, cert_type_code, performed_date DESC);

GRANT SELECT, INSERT ON public.craft_continuity_logs TO authenticated;
GRANT ALL ON public.craft_continuity_logs TO service_role;
ALTER TABLE public.craft_continuity_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS continuity_select ON public.craft_continuity_logs;
CREATE POLICY continuity_select ON public.craft_continuity_logs FOR SELECT TO authenticated
  USING (company_id = app_internal.get_current_company_id() OR app_internal.is_super_admin());

DROP POLICY IF EXISTS continuity_insert ON public.craft_continuity_logs;
CREATE POLICY continuity_insert ON public.craft_continuity_logs FOR INSERT TO authenticated
  WITH CHECK (
    company_id = app_internal.get_current_company_id()
    AND app_internal.current_user_role() IN ('company_admin','safety_director','qc_inspector','field_supervisor')
    AND verified_by = auth.uid()
  );

-- 3. Compliance evaluator
CREATE OR REPLACE FUNCTION app_internal.evaluate_craft_compliance(
  p_personnel_id uuid,
  p_cert_type_code text
)
RETURNS TABLE (status text, is_dispatchable boolean, days_remaining integer, reason text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_requires_continuity boolean;
  v_interval integer;
  v_cert_id uuid;
  v_exp_date date;
  v_issue_date date;
  v_last_work date;
  v_days_since integer;
BEGIN
  SELECT ct.requires_continuity, ct.default_continuity_days
    INTO v_requires_continuity, v_interval
  FROM public.certification_types ct
  WHERE ct.code = p_cert_type_code AND ct.is_active;

  IF v_requires_continuity IS NULL THEN
    RETURN QUERY SELECT 'missing_cert'::text, false, NULL::integer, 'Unknown certification type'::text;
    RETURN;
  END IF;

  SELECT pc.id, pc.expiration_date, pc.issue_date
    INTO v_cert_id, v_exp_date, v_issue_date
  FROM public.personnel_certs pc
  JOIN public.personnel_records pr ON pr.id = pc.personnel_id
  WHERE pc.personnel_id = p_personnel_id
    AND pr.status = 'active'
    AND pc.approval_status = 'approved'
    AND pc.cert_name ILIKE '%(' || p_cert_type_code || ')%'
  ORDER BY pc.expiration_date DESC NULLS LAST
  LIMIT 1;

  IF v_cert_id IS NULL THEN
    RETURN QUERY SELECT 'missing_cert'::text, false, NULL::integer, 'No active certification on file'::text;
    RETURN;
  END IF;

  -- Gate 1: hard calendar expiration
  IF v_exp_date IS NOT NULL AND v_exp_date < CURRENT_DATE THEN
    RETURN QUERY SELECT 'expired'::text, false, (v_exp_date - CURRENT_DATE), 'Certification expired'::text;
    RETURN;
  END IF;

  -- Gate 2: rolling continuity (dual-gate trades only)
  IF v_requires_continuity THEN
    SELECT max(l.performed_date) INTO v_last_work
    FROM public.craft_continuity_logs l
    WHERE l.personnel_id = p_personnel_id AND l.cert_type_code = p_cert_type_code;

    v_days_since := CURRENT_DATE - COALESCE(v_last_work, v_issue_date);

    IF v_days_since > v_interval THEN
      RETURN QUERY SELECT 'lapsed'::text, false, (v_interval - v_days_since),
        format('Continuity lapsed: %s days since last verified work', v_days_since);
      RETURN;
    ELSIF v_days_since > 120 THEN
      RETURN QUERY SELECT 'warning'::text, true, (v_interval - v_days_since),
        format('Continuity warning: %s days since last verified work', v_days_since);
      RETURN;
    END IF;
  END IF;

  IF v_exp_date IS NOT NULL AND v_exp_date - CURRENT_DATE < 30 THEN
    RETURN QUERY SELECT 'warning'::text, true, (v_exp_date - CURRENT_DATE), 'Certification expiring within 30 days'::text;
    RETURN;
  END IF;

  RETURN QUERY SELECT 'compliant'::text, true, (v_exp_date - CURRENT_DATE), 'Active and in full compliance'::text;
END;
$$;

REVOKE ALL ON FUNCTION app_internal.evaluate_craft_compliance(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION app_internal.evaluate_craft_compliance(uuid, text) TO authenticated, service_role;

-- 4. Dispatch eligibility RPC
CREATE OR REPLACE FUNCTION public.check_dispatch_eligibility(
  p_personnel_id uuid,
  p_required_cert_code text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_company_id uuid;
  v_target_company_id uuid;
  v_result jsonb;
BEGIN
  SELECT company_id INTO v_target_company_id
  FROM public.personnel_records
  WHERE id = p_personnel_id;

  IF v_target_company_id IS NULL THEN
    RETURN jsonb_build_object('status','not_found','is_dispatchable',false,'reason','Personnel record not found');
  END IF;

  -- Tenant boundary for signed-in callers (SQL editor / service jobs have no auth.uid()).
  IF auth.uid() IS NOT NULL THEN
    v_caller_company_id := app_internal.get_current_company_id();
    IF (v_caller_company_id IS NULL OR v_caller_company_id <> v_target_company_id)
       AND NOT app_internal.is_super_admin() THEN
      RAISE EXCEPTION 'Cross-tenant access prohibited.';
    END IF;
  END IF;

  SELECT to_jsonb(r) INTO v_result
  FROM app_internal.evaluate_craft_compliance(p_personnel_id, p_required_cert_code) r;

  RETURN COALESCE(v_result, jsonb_build_object('status','error','is_dispatchable',false,'reason','Evaluation returned no data'))
         || jsonb_build_object('cert_code', p_required_cert_code);
END;
$$;

REVOKE ALL ON FUNCTION public.check_dispatch_eligibility(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_dispatch_eligibility(uuid, text) TO authenticated, service_role;


-- verified_by stays nullable (ON DELETE SET NULL preserves history if a profile is removed).
ALTER TABLE public.craft_continuity_logs ALTER COLUMN verified_by DROP NOT NULL;
