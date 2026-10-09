-- Continuity lapse outbox: one dispatch-blocking email per lapse.
-- DEPENDS ON Phase A + Phase B (certification_types, craft_continuity_logs).
-- Run manually in the SQL editor AFTER Phase B. Idempotent; safe to re-run.
-- Until this runs, the daily job finds nothing and sends no email.
--
-- "Once per lapse": a lapse = (personnel, trade code, anchor date), anchor = last
-- verified work date (or cert issue date). New work moves the anchor, so a later
-- lapse is a new lapse and gets a new email.

DO $$
BEGIN
  IF to_regclass('public.craft_continuity_logs') IS NULL THEN
    RAISE EXCEPTION 'Requires Phase B (public.craft_continuity_logs). Apply Phase A and B first.';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.continuity_lapse_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  personnel_id uuid NOT NULL REFERENCES public.personnel_records(id) ON DELETE CASCADE,
  cert_id uuid NOT NULL REFERENCES public.personnel_certs(id) ON DELETE CASCADE,
  cert_type_code text NOT NULL REFERENCES public.certification_types(code),
  anchor_date date NOT NULL,
  recipient_email text NOT NULL,
  recipient_role text NOT NULL,
  delivery_status text NOT NULL DEFAULT 'claimed',
  provider_message_id text,
  notice_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  dispatched_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE public.continuity_lapse_notifications
    ADD CONSTRAINT cln_role_chk CHECK (recipient_role IN ('welder','supervisor','admin_fallback'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.continuity_lapse_notifications
    ADD CONSTRAINT cln_status_chk CHECK (delivery_status IN ('claimed','dispatched','delivered','bounced','failed'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Claim row: first claim wins; failed/bounced rows free the slot for a replay.
CREATE UNIQUE INDEX IF NOT EXISTS cln_claim_uniq
  ON public.continuity_lapse_notifications (personnel_id, cert_type_code, anchor_date, recipient_role)
  WHERE delivery_status IN ('claimed','dispatched','delivered');

CREATE INDEX IF NOT EXISTS cln_company_created_idx
  ON public.continuity_lapse_notifications (company_id, created_at DESC);

-- Service-role writes only; tenants read their own history.
REVOKE ALL ON public.continuity_lapse_notifications FROM anon, authenticated;
GRANT SELECT ON public.continuity_lapse_notifications TO authenticated;
GRANT ALL ON public.continuity_lapse_notifications TO service_role;
ALTER TABLE public.continuity_lapse_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cln_select ON public.continuity_lapse_notifications;
CREATE POLICY cln_select ON public.continuity_lapse_notifications FOR SELECT TO authenticated
  USING (company_id = app_internal.get_current_company_id() OR app_internal.is_super_admin());

-- Candidates: approved, unexpired continuity-trade certs past 150 days with no
-- live claim for that anchor. Matching mirrors Phase B (strpos, case-insensitive).
-- admin_fallback_email is always returned; the job uses it only when the
-- welder and supervisor both have no email.
CREATE OR REPLACE FUNCTION public.find_lapsed_continuity(p_company_id uuid DEFAULT NULL)
RETURNS TABLE(
  company_id uuid, personnel_id uuid, cert_id uuid, cert_name text,
  cert_type_code text, cert_type_name text, anchor_date date, days_elapsed integer,
  person_name text, welder_email text, supervisor_email text, admin_fallback_email text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  WITH matched AS (
    SELECT DISTINCT ON (pc.personnel_id, ct.code)
      pc.company_id, pc.personnel_id, pc.id AS cert_id, pc.cert_name, pc.issue_date,
      ct.code, ct.name
    FROM public.personnel_certs pc
    JOIN public.certification_types ct
      ON ct.requires_continuity
     AND (strpos(upper(pc.cert_name), upper(ct.code)) > 0
          OR strpos(upper(pc.cert_name), upper(ct.name)) > 0)
    WHERE pc.approval_status = 'approved'
      AND (pc.expiration_date IS NULL OR pc.expiration_date >= CURRENT_DATE)
      AND (p_company_id IS NULL OR pc.company_id = p_company_id)
    ORDER BY pc.personnel_id, ct.code, pc.issue_date DESC
  ),
  anchored AS (
    SELECT m.*,
      COALESCE((SELECT max(l.performed_date) FROM public.craft_continuity_logs l
                WHERE l.personnel_id = m.personnel_id AND l.cert_type_code = m.code),
               m.issue_date) AS anchor
    FROM matched m
  )
  SELECT a.company_id, a.personnel_id, a.cert_id, a.cert_name, a.code, a.name,
         a.anchor, (CURRENT_DATE - a.anchor)::integer,
         pr.first_name || ' ' || pr.last_name, pr.email, sup.email, fb.email
  FROM anchored a
  JOIN public.personnel_records pr ON pr.id = a.personnel_id AND pr.status = 'active'
  LEFT JOIN public.profiles sup ON sup.id = pr.supervisor_id
  LEFT JOIN LATERAL (
    SELECT p.email FROM public.profiles p
    WHERE p.company_id = a.company_id AND p.role IN ('safety_director','company_admin')
      AND p.email IS NOT NULL
    ORDER BY CASE WHEN p.role = 'safety_director' THEN 1 ELSE 2 END, p.created_at
    LIMIT 1
  ) fb ON true
  WHERE CURRENT_DATE - a.anchor > 150
    AND NOT EXISTS (
      SELECT 1 FROM public.continuity_lapse_notifications n
      WHERE n.personnel_id = a.personnel_id AND n.cert_type_code = a.code
        AND n.anchor_date = a.anchor
        AND n.delivery_status IN ('claimed','dispatched','delivered')
    );
$$;

REVOKE EXECUTE ON FUNCTION public.find_lapsed_continuity(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.find_lapsed_continuity(uuid) TO service_role;
