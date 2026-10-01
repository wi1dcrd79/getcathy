-- DRAFT: signature hardening. Not applied. Test on a Supabase branch first.

-- 1. Incident targets: columns, constraints (idempotent; skipped if no incident_reports)
DO $$
BEGIN
  IF to_regclass('public.incident_reports') IS NULL THEN
    RAISE NOTICE 'incident_reports missing; skipping incident targets';
    RETURN;
  END IF;

  ALTER TABLE public.signatures
    ADD COLUMN IF NOT EXISTS incident_report_id uuid REFERENCES public.incident_reports(id) ON DELETE RESTRICT,
    ADD COLUMN IF NOT EXISTS incident_report_resolution_id uuid REFERENCES public.incident_reports(id) ON DELETE RESTRICT;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'signatures_incident_report_unique') THEN
    ALTER TABLE public.signatures ADD CONSTRAINT signatures_incident_report_unique UNIQUE (incident_report_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'signatures_incident_resolution_unique') THEN
    ALTER TABLE public.signatures ADD CONSTRAINT signatures_incident_resolution_unique UNIQUE (incident_report_resolution_id);
  END IF;

  ALTER TABLE public.signatures DROP CONSTRAINT IF EXISTS signatures_exactly_one_target;
  ALTER TABLE public.signatures ADD CONSTRAINT signatures_exactly_one_target CHECK (
    (audit_binder_id IS NOT NULL)::int + (inspection_id IS NOT NULL)::int +
    (cert_verification_id IS NOT NULL)::int + (risk_assessment_id IS NOT NULL)::int +
    (incident_report_id IS NOT NULL)::int + (incident_report_resolution_id IS NOT NULL)::int = 1
  );

  CREATE OR REPLACE FUNCTION app_internal.enforce_incident_report_freeze()
  RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
  BEGIN
    IF EXISTS (SELECT 1 FROM public.signatures WHERE incident_report_id = OLD.id) AND (
         NEW.incident_type IS DISTINCT FROM OLD.incident_type OR NEW.severity IS DISTINCT FROM OLD.severity
      OR NEW.description IS DISTINCT FROM OLD.description OR NEW.occurred_at IS DISTINCT FROM OLD.occurred_at
      OR NEW.reported_by IS DISTINCT FROM OLD.reported_by) THEN
      RAISE EXCEPTION 'Signed incident reports are frozen. Edits must spawn a new revision.';
    END IF;
    IF EXISTS (SELECT 1 FROM public.signatures WHERE incident_report_resolution_id = OLD.id)
       AND NEW.resolution_notes IS DISTINCT FROM OLD.resolution_notes THEN
      RAISE EXCEPTION 'Signed incident resolution notes are frozen.';
    END IF;
    RETURN NEW;
  END $f$;
  DROP TRIGGER IF EXISTS trg_enforce_incident_report_freeze ON public.incident_reports;
  CREATE TRIGGER trg_enforce_incident_report_freeze BEFORE UPDATE ON public.incident_reports
    FOR EACH ROW EXECUTE FUNCTION app_internal.enforce_incident_report_freeze();
END $$;

-- 3/4. Metadata size cap + image required (NOT VALID: existing rows untouched)
ALTER TABLE public.signatures DROP CONSTRAINT IF EXISTS signatures_device_metadata_size;
ALTER TABLE public.signatures ADD CONSTRAINT signatures_device_metadata_size
  CHECK (octet_length(device_metadata::text) <= 4096) NOT VALID;

ALTER TABLE public.signatures DROP CONSTRAINT IF EXISTS signatures_image_required;
ALTER TABLE public.signatures ADD CONSTRAINT signatures_image_required
  CHECK (signature_image_path IS NOT NULL) NOT VALID;

CREATE OR REPLACE FUNCTION app_internal.enforce_signature_security()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_role text; v_company uuid; v_expected text;
BEGIN
  IF NEW.signer_id != auth.uid() AND auth.role() != 'service_role' THEN
    RAISE EXCEPTION 'Signer ID must match the authenticated user.';
  END IF;
  SELECT role, company_id INTO v_role, v_company FROM public.profiles WHERE id = NEW.signer_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Signer profile not found.'; END IF;
  IF v_company != NEW.company_id THEN RAISE EXCEPTION 'Cross-tenant signature creation rejected.'; END IF;
  IF v_role NOT IN ('company_admin','safety_director','qc_inspector','field_supervisor') THEN
    RAISE EXCEPTION 'Role % is not authorized to execute digital sign-offs.', v_role;
  END IF;
  IF NEW.audit_binder_id IS NOT NULL THEN
    SELECT content_sha256 INTO v_expected FROM public.audit_binders WHERE id = NEW.audit_binder_id;
    IF v_expected IS NULL OR NEW.content_sha256 != v_expected THEN
      RAISE EXCEPTION 'Signature content_sha256 does not match compiled audit binder content_sha256.';
    END IF;
  END IF;
  NEW.signer_role := v_role;
  NEW.synced_at := now();
  NEW.signed_at := LEAST(COALESCE(NEW.signed_at, now()), now());
  IF NEW.offline_created_at IS NOT NULL THEN NEW.offline_created_at := LEAST(NEW.offline_created_at, now()); END IF;
  RETURN NEW;
END $$;

-- 2. Atomic sign: lock target row, compare snapshot, insert in one transaction
CREATE OR REPLACE FUNCTION public.record_signature(
  p_signature_id uuid, p_company_id uuid, p_target_column text, p_target_id uuid,
  p_signer_id uuid, p_content_sha256 text, p_snapshot jsonb, p_image_path text,
  p_offline_created_at timestamptz, p_signed_at timestamptz, p_device_metadata jsonb
) RETURNS TABLE (id uuid, synced_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_table text; v_row jsonb; v_key text;
BEGIN
  v_table := CASE p_target_column
    WHEN 'audit_binder_id' THEN 'audit_binders'
    WHEN 'inspection_id' THEN 'inspections'
    WHEN 'cert_verification_id' THEN 'personnel_certs'
    WHEN 'risk_assessment_id' THEN 'risk_assessments'
    WHEN 'incident_report_id' THEN 'incident_reports'
    WHEN 'incident_report_resolution_id' THEN 'incident_reports'
    ELSE NULL END;
  IF v_table IS NULL THEN RAISE EXCEPTION 'Invalid signature target' USING ERRCODE = '22023'; END IF;

  EXECUTE format('SELECT to_jsonb(t) FROM public.%I t WHERE t.id = $1 AND t.company_id = $2 FOR UPDATE', v_table)
    INTO v_row USING p_target_id, p_company_id;
  IF v_row IS NULL THEN RAISE EXCEPTION 'Target record not found' USING ERRCODE = 'SG002'; END IF;

  IF v_table = 'audit_binders' THEN
    IF v_row->>'status' <> 'compiled' THEN
      RAISE EXCEPTION 'Binder is not in compiled state' USING ERRCODE = 'SG003';
    END IF;
  ELSE
    FOR v_key IN SELECT jsonb_object_keys(p_snapshot) LOOP
      IF (v_row -> v_key) IS DISTINCT FROM (p_snapshot -> v_key) THEN
        RAISE EXCEPTION 'Record changed since it was hashed (%)', v_key USING ERRCODE = 'SG001';
      END IF;
    END LOOP;
    IF p_snapshot = '{}'::jsonb THEN RAISE EXCEPTION 'Empty snapshot' USING ERRCODE = 'SG001'; END IF;
  END IF;

  RETURN QUERY EXECUTE format(
    'INSERT INTO public.signatures (id, company_id, %I, signer_id, signer_role, content_sha256,
       signature_image_path, offline_created_at, signed_at, device_metadata)
     VALUES ($1,$2,$3,$4,''pending'',$5,$6,$7,$8,$9) RETURNING id, synced_at', p_target_column)
    USING p_signature_id, p_company_id, p_target_id, p_signer_id, p_content_sha256,
          p_image_path, p_offline_created_at, p_signed_at, coalesce(p_device_metadata, '{}'::jsonb);
END $$;

REVOKE ALL ON FUNCTION public.record_signature(uuid,uuid,text,uuid,uuid,text,jsonb,text,timestamptz,timestamptz,jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_signature(uuid,uuid,text,uuid,uuid,text,jsonb,text,timestamptz,timestamptz,jsonb)
  TO service_role;
