-- File: supabase/migrations/20260927010001_track3_signatures_and_version_freeze.sql
-- Description: Track 3 - Digital Signatures, Parent Immutability Freezes, and Audit Binder Versioning

-- ============================================================================
-- 1. Create audit_binders table (prerequisite target for binder signatures)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.audit_binders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  version integer NOT NULL DEFAULT 1,
  title text NOT NULL DEFAULT 'Compliance Audit Binder',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'compiled', 'signed', 'superseded')),
  pdf_storage_path text,
  content_sha256 text,
  compiled_at timestamptz,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT audit_binders_company_version_key UNIQUE (company_id, id, version)
);

CREATE INDEX IF NOT EXISTS audit_binders_company_idx 
  ON public.audit_binders (company_id, created_at DESC);

ALTER TABLE public.audit_binders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS audit_binders_select_company ON public.audit_binders;
CREATE POLICY audit_binders_select_company ON public.audit_binders
  FOR SELECT TO authenticated
  USING (company_id = app_internal.get_current_company_id() OR app_internal.is_super_admin());

DROP POLICY IF EXISTS audit_binders_insert_compliance ON public.audit_binders;
CREATE POLICY audit_binders_insert_compliance ON public.audit_binders
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = app_internal.get_current_company_id()
    AND app_internal.can_write_compliance()
    AND NOT app_internal.company_write_locked()
  );

DROP POLICY IF EXISTS audit_binders_update_compliance ON public.audit_binders;
CREATE POLICY audit_binders_update_compliance ON public.audit_binders
  FOR UPDATE TO authenticated
  USING (
    company_id = app_internal.get_current_company_id()
    AND app_internal.can_write_compliance()
    AND NOT app_internal.company_write_locked()
  );

GRANT SELECT, INSERT, UPDATE ON public.audit_binders TO authenticated;
GRANT ALL ON public.audit_binders TO service_role;

-- ============================================================================
-- 2. Create signatures table with explicit FKs and first-signature uniqueness
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.signatures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  
  -- Explicit target FKs (exactly one must be populated)
  audit_binder_id uuid REFERENCES public.audit_binders(id) ON DELETE RESTRICT,
  inspection_id uuid REFERENCES public.inspections(id) ON DELETE RESTRICT,
  cert_verification_id uuid REFERENCES public.personnel_certs(id) ON DELETE RESTRICT,
  risk_assessment_id uuid REFERENCES public.risk_assessments(id) ON DELETE RESTRICT,
  
  -- Signer audit stamp (verified server-side)
  signer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  signer_role text NOT NULL,
  
  -- Signature artifact & verification payload
  signature_image_path text,
  content_sha256 text NOT NULL CHECK (content_sha256 ~ '^[0-9a-f]{64}$'),
  
  -- Temporal audit separation
  offline_created_at timestamptz,
  signed_at timestamptz,
  synced_at timestamptz NOT NULL DEFAULT now(),
  
  -- Client metadata
  device_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip_address inet,

  -- Exactly one target enforced
  CONSTRAINT signatures_exactly_one_target CHECK (
    (audit_binder_id IS NOT NULL)::integer +
    (inspection_id IS NOT NULL)::integer +
    (cert_verification_id IS NOT NULL)::integer +
    (risk_assessment_id IS NOT NULL)::integer = 1
  ),
  
  -- First-signature-wins finality per record
  CONSTRAINT signatures_audit_binder_unique UNIQUE (audit_binder_id),
  CONSTRAINT signatures_inspection_unique UNIQUE (inspection_id),
  CONSTRAINT signatures_cert_verification_unique UNIQUE (cert_verification_id),
  CONSTRAINT signatures_risk_assessment_unique UNIQUE (risk_assessment_id)
);

CREATE INDEX IF NOT EXISTS signatures_company_synced_idx 
  ON public.signatures (company_id, synced_at DESC);

ALTER TABLE public.signatures ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS signatures_select_company ON public.signatures;
CREATE POLICY signatures_select_company ON public.signatures
  FOR SELECT TO authenticated
  USING (company_id = app_internal.get_current_company_id() OR app_internal.is_super_admin());

DROP POLICY IF EXISTS signatures_insert_authorized ON public.signatures;
CREATE POLICY signatures_insert_authorized ON public.signatures
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = app_internal.get_current_company_id()
    AND signer_id = auth.uid()
    AND NOT app_internal.company_write_locked()
  );

-- Append-only audit table: explicitly deny UPDATE and DELETE
GRANT SELECT, INSERT ON public.signatures TO authenticated;
REVOKE UPDATE, DELETE ON public.signatures FROM authenticated, anon;
GRANT ALL ON public.signatures TO service_role;

-- ============================================================================
-- 3. Trigger: Server-validate and stamp signer role, server sync timestamp, and content hash
-- ============================================================================
CREATE OR REPLACE FUNCTION app_internal.enforce_signature_security()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_signer_role text;
  v_signer_company_id uuid;
  v_expected_sha256 text;
BEGIN
  -- 1. Ensure caller is creating their own signature
  IF NEW.signer_id != auth.uid() AND auth.role() != 'service_role' THEN
    RAISE EXCEPTION 'Signer ID must match the authenticated user.';
  END IF;

  -- 2. Verify signer profile, tenant alignment, and authorized role
  SELECT role, company_id INTO v_signer_role, v_signer_company_id
  FROM public.profiles
  WHERE id = NEW.signer_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Signer profile not found.';
  END IF;

  IF v_signer_company_id != NEW.company_id THEN
    RAISE EXCEPTION 'Cross-tenant signature creation rejected.';
  END IF;

  IF v_signer_role NOT IN ('company_admin', 'safety_director', 'qc_inspector', 'field_supervisor') THEN
    RAISE EXCEPTION 'Role % is not authorized to execute digital sign-offs.', v_signer_role;
  END IF;

  -- 3. Server-verify compiled audit binder content hash if target is an audit binder
  IF NEW.audit_binder_id IS NOT NULL THEN
    SELECT content_sha256 INTO v_expected_sha256
    FROM public.audit_binders
    WHERE id = NEW.audit_binder_id;

    IF v_expected_sha256 IS NULL OR NEW.content_sha256 != v_expected_sha256 THEN
      RAISE EXCEPTION 'Signature content_sha256 does not match compiled audit binder content_sha256.';
    END IF;
  END IF;

  -- 4. Stamp authoritative role snapshot and server sync timestamp
  NEW.signer_role := v_signer_role;
  NEW.synced_at := now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_signature_security ON public.signatures;
CREATE TRIGGER trg_enforce_signature_security
  BEFORE INSERT ON public.signatures
  FOR EACH ROW
  EXECUTE FUNCTION app_internal.enforce_signature_security();

-- ============================================================================
-- 4. Triggers: Parent Immutability Freezes
-- ============================================================================

-- A. Audit Binders Freeze
CREATE OR REPLACE FUNCTION app_internal.enforce_audit_binder_freeze()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.signatures WHERE audit_binder_id = OLD.id) THEN
    -- Allow status transitions to 'signed' or 'superseded', but block content mutations
    IF NEW.pdf_storage_path != OLD.pdf_storage_path OR NEW.content_sha256 != OLD.content_sha256 THEN
      RAISE EXCEPTION 'Signed audit binders are frozen and immutable. Edits must spawn a new binder version.';
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_audit_binder_freeze ON public.audit_binders;
CREATE TRIGGER trg_enforce_audit_binder_freeze
  BEFORE UPDATE ON public.audit_binders
  FOR EACH ROW
  EXECUTE FUNCTION app_internal.enforce_audit_binder_freeze();

-- B. Inspections Freeze
CREATE OR REPLACE FUNCTION app_internal.enforce_inspection_freeze()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.signatures WHERE inspection_id = OLD.id) THEN
    RAISE EXCEPTION 'Signed inspections are frozen and immutable. Edits must spawn a new revision record.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_inspection_freeze ON public.inspections;
CREATE TRIGGER trg_enforce_inspection_freeze
  BEFORE UPDATE ON public.inspections
  FOR EACH ROW
  EXECUTE FUNCTION app_internal.enforce_inspection_freeze();

-- C. Risk Assessments (JHA) Freeze
CREATE OR REPLACE FUNCTION app_internal.enforce_risk_assessment_freeze()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.signatures WHERE risk_assessment_id = OLD.id) THEN
    RAISE EXCEPTION 'Signed risk assessments (JHA) are frozen and immutable. Edits must spawn a new revision record.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_risk_assessment_freeze ON public.risk_assessments;
CREATE TRIGGER trg_enforce_risk_assessment_freeze
  BEFORE UPDATE ON public.risk_assessments
  FOR EACH ROW
  EXECUTE FUNCTION app_internal.enforce_risk_assessment_freeze();

-- D. Personnel Certifications Freeze
CREATE OR REPLACE FUNCTION app_internal.enforce_personnel_certs_freeze()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.signatures WHERE cert_verification_id = OLD.id) THEN
    RAISE EXCEPTION 'Signed personnel certifications are frozen and immutable. Renewals or updates must spawn a new certificate record.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_personnel_certs_freeze ON public.personnel_certs;
CREATE TRIGGER trg_enforce_personnel_certs_freeze
  BEFORE UPDATE ON public.personnel_certs
  FOR EACH ROW
  EXECUTE FUNCTION app_internal.enforce_personnel_certs_freeze();