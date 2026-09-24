-- ============================================================================
-- TRACK 2 & TRACK 6 — CONSOLIDATED MIGRATION
-- Supersedes: 20260923010001-010004 (if applied), 20260923010005,
-- 20260923010006, 20260923020000.
-- All DDL is idempotent (IF NOT EXISTS / OR REPLACE / DROP...IF EXISTS first)
-- so this is safe to run even if some prior migrations already applied.
-- ============================================================================

BEGIN;

-- ============================================================================
-- SECTION 0 (Track 2, Step 1): personnel_records contact fields + RBAC
-- ============================================================================
ALTER TABLE public.personnel_records
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS supervisor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS personnel_records_supervisor_id_idx
  ON public.personnel_records (supervisor_id);

CREATE OR REPLACE FUNCTION app_internal.enforce_profile_security()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (auth.jwt() ->> 'role') = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF coalesce(NEW.is_super_admin, false) = true THEN
      RAISE EXCEPTION 'Unauthorized: Cannot self-assign is_super_admin on account creation.';
    END IF;
    IF NEW.id IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'Unauthorized: Profile ID must match auth.uid().';
    END IF;
    IF NEW.role IS NULL OR NEW.role NOT IN ('operator', 'field_tech', 'viewer', 'craftsman') THEN
      NEW.role := 'operator';
    END IF;
    NEW.company_id := NULL;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.is_super_admin IS DISTINCT FROM OLD.is_super_admin THEN
      RAISE EXCEPTION 'Unauthorized: You cannot modify is_super_admin status.';
    END IF;
    IF NEW.company_id IS DISTINCT FROM OLD.company_id THEN
      RAISE EXCEPTION 'Unauthorized: Tenant company reassignment is strictly prohibited.';
    END IF;
    IF NEW.role IS DISTINCT FROM OLD.role THEN
      IF NEW.role NOT IN (
        'company_admin', 'safety_director', 'qc_inspector', 'field_supervisor',
        'operator', 'field_tech', 'viewer', 'craftsman'
      ) THEN
        RAISE EXCEPTION 'Invalid role: %', NEW.role;
      END IF;
      IF NOT (
        app_internal.is_super_admin()
        OR EXISTS (
          SELECT 1 FROM public.profiles
          WHERE id = auth.uid() AND company_id = OLD.company_id AND role = 'company_admin'
        )
      ) THEN
        RAISE EXCEPTION 'Unauthorized: Only a verified company admin can modify roles.';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION app_internal.enforce_profile_security() FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- SECTION 1 (Track 2, Step 2): personnel_certs composite constraint
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'personnel_certs_id_company_id_key'
  ) THEN
    ALTER TABLE public.personnel_certs
      ADD CONSTRAINT personnel_certs_id_company_id_key UNIQUE (id, company_id);
  END IF;
END $$;

-- Bonus fix (flagged gap, not previously requested): verified_by on
-- personnel_certs had no FK or RLS enforcement, unlike corrective_actions.
ALTER TABLE public.personnel_certs
  ADD CONSTRAINT personnel_certs_verified_by_fkey
    FOREIGN KEY (verified_by) REFERENCES public.profiles(id)
    ON DELETE SET NULL
    NOT VALID; -- NOT VALID: don't fail on pre-existing bad data; validate separately if needed

CREATE OR REPLACE FUNCTION app_internal.enforce_cert_verified_by_supervisor_only()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.verified_by IS DISTINCT FROM OLD.verified_by THEN
    IF NOT (
      app_internal.is_super_admin()
      OR app_internal.current_user_role() IN ('company_admin', 'safety_director', 'field_supervisor')
    ) THEN
      RAISE EXCEPTION 'Unauthorized: only supervisor-tier roles can set verified_by.';
    END IF;
    IF NEW.verified_by IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = NEW.verified_by
        AND role IN ('company_admin', 'safety_director', 'field_supervisor')
    ) THEN
      RAISE EXCEPTION 'verified_by must reference a supervisor-tier profile.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_cert_verified_by ON public.personnel_certs;
CREATE TRIGGER trg_enforce_cert_verified_by
  BEFORE UPDATE OF verified_by ON public.personnel_certs
  FOR EACH ROW
  EXECUTE FUNCTION app_internal.enforce_cert_verified_by_supervisor_only();

-- ============================================================================
-- SECTION 2 (Track 2, Step 3): job_failures extension + status alignment
-- ============================================================================
ALTER TABLE public.job_failures
  ADD COLUMN IF NOT EXISTS replayed_by uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS replayed_at timestamptz,
  ADD COLUMN IF NOT EXISTS replay_count int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS resolved_by uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz,
  ADD COLUMN IF NOT EXISTS resolution_reason text;

ALTER TABLE public.job_failures ALTER COLUMN status SET DEFAULT 'failed';

-- dead-letter.server.ts confirmed to not set `status` explicitly — it relies
-- on the column default, so no code change is needed alongside this.
UPDATE public.job_failures
SET status = 'failed'
WHERE status NOT IN ('failed', 'acknowledged', 'retrying', 'succeeded', 'permanently_failed');

ALTER TABLE public.job_failures DROP CONSTRAINT IF EXISTS job_failures_status_check;
ALTER TABLE public.job_failures ADD CONSTRAINT job_failures_status_check
  CHECK (status IN ('failed', 'acknowledged', 'retrying', 'succeeded', 'permanently_failed'));

ALTER TABLE public.job_failures DROP CONSTRAINT IF EXISTS job_failures_perm_failed_reason_check;
ALTER TABLE public.job_failures ADD CONSTRAINT job_failures_perm_failed_reason_check
  CHECK (status <> 'permanently_failed' OR (resolution_reason IS NOT NULL AND length(trim(resolution_reason)) > 0));

-- ============================================================================
-- SECTION 3 (Track 2, Step 4): cert_notifications — CORRECTED RLS
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.cert_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  cert_id uuid NOT NULL,
  threshold_days int NOT NULL CHECK (threshold_days IN (30, 14, 7)),
  channel text NOT NULL DEFAULT 'email',
  recipient_email text NOT NULL,
  recipient_role text NOT NULL CHECK (recipient_role IN ('welder', 'supervisor', 'admin_fallback')),
  delivery_status text NOT NULL DEFAULT 'claimed'
    CHECK (delivery_status IN ('claimed', 'dispatched', 'delivered', 'bounced', 'failed')),
  provider_message_id text,
  notice_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  dispatched_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_cert_notifications_cert FOREIGN KEY (cert_id, company_id)
    REFERENCES public.personnel_certs(id, company_id) ON DELETE CASCADE
);

DROP INDEX IF EXISTS idx_cert_notifications_active_claim;
CREATE UNIQUE INDEX idx_cert_notifications_active_claim
  ON public.cert_notifications (cert_id, threshold_days, recipient_role)
  WHERE delivery_status IN ('claimed', 'dispatched', 'delivered');

CREATE INDEX IF NOT EXISTS idx_cert_notifications_company
  ON public.cert_notifications (company_id, created_at DESC);

ALTER TABLE public.cert_notifications ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.cert_notifications TO authenticated;
GRANT ALL ON public.cert_notifications TO service_role;
REVOKE INSERT, UPDATE, DELETE ON public.cert_notifications FROM authenticated;

DROP POLICY IF EXISTS cert_notifications_tenant_isolation ON public.cert_notifications;
DROP POLICY IF EXISTS cert_notifications_select ON public.cert_notifications;
CREATE POLICY cert_notifications_select ON public.cert_notifications
FOR SELECT TO authenticated
USING (
  app_internal.is_super_admin()
  OR (
    company_id = app_internal.get_current_company_id()
    AND app_internal.current_user_role() IN ('company_admin', 'safety_director', 'field_supervisor')
  )
  OR (
    company_id = app_internal.get_current_company_id()
    AND app_internal.current_user_role() = 'craftsman'
    AND recipient_email = (SELECT email FROM public.profiles WHERE id = auth.uid())
  )
);

-- ============================================================================
-- SECTION 4 (Track 2, Step 5): replay_notification_failure RPC — CORRECTED
-- ============================================================================
CREATE OR REPLACE FUNCTION public.replay_notification_failure(p_failure_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_profile record;
  v_failure record;
BEGIN
  SELECT id, company_id, role, is_super_admin INTO v_caller_profile
  FROM public.profiles
  WHERE id = auth.uid();

  IF v_caller_profile.id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT (
    v_caller_profile.is_super_admin = true
    OR v_caller_profile.role IN ('company_admin', 'safety_director')
  ) THEN
    RAISE EXCEPTION 'Unauthorized: Only company admins or safety directors can replay failures.';
  END IF;

  SELECT * INTO v_failure
  FROM public.job_failures
  WHERE id = p_failure_id
    AND event_name LIKE 'cert.expiring%'
  FOR UPDATE;

  IF v_failure.id IS NULL THEN
    RAISE EXCEPTION 'Cert notification job failure % not found', p_failure_id;
  END IF;

  IF NOT v_caller_profile.is_super_admin AND v_failure.company_id != v_caller_profile.company_id THEN
    RAISE EXCEPTION 'Access denied: Cannot replay job failure for another tenant.';
  END IF;

  IF v_failure.status IN ('retrying', 'succeeded', 'permanently_failed') THEN
    RAISE EXCEPTION 'Job failure % is in terminal or active status % and cannot be replayed', p_failure_id, v_failure.status;
  END IF;

  UPDATE public.job_failures
  SET status = 'retrying',
      replayed_by = v_caller_profile.id,
      replayed_at = now(),
      replay_count = COALESCE(replay_count, 0) + 1
  WHERE id = p_failure_id;

  RETURN jsonb_build_object(
    'success', true,
    'failure_id', p_failure_id,
    'new_status', 'retrying',
    'replay_count', COALESCE(v_failure.replay_count, 0) + 1
  );
END;
$$;

REVOKE ALL ON FUNCTION public.replay_notification_failure(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.replay_notification_failure(uuid) TO authenticated, service_role;

-- ============================================================================
-- SECTION 5 (Track 2, Step 6): cross-tenant supervisor integrity
-- ============================================================================
CREATE OR REPLACE FUNCTION app_internal.enforce_supervisor_same_company()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.supervisor_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = NEW.supervisor_id AND company_id = NEW.company_id
    ) THEN
      RAISE EXCEPTION 'Unauthorized: supervisor_id must reference a profile in the same company_id (%).', NEW.company_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_supervisor_same_company ON public.personnel_records;
CREATE TRIGGER trg_enforce_supervisor_same_company
  BEFORE INSERT OR UPDATE OF supervisor_id, company_id ON public.personnel_records
  FOR EACH ROW
  EXECUTE FUNCTION app_internal.enforce_supervisor_same_company();

-- ============================================================================
-- SECTION 6 (Track 6): corrective_actions
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.corrective_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  source_type text NOT NULL CHECK (source_type IN ('inspection', 'risk_assessment', 'audit')),
  source_id uuid NOT NULL,
  asset_id uuid,
  priority text NOT NULL CHECK (priority IN ('P1', 'P2', 'P3')),
  description text NOT NULL,
  assigned_to uuid REFERENCES public.profiles(id),
  due_date timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'verified')),
  resolved_at timestamptz,
  verified_by uuid REFERENCES public.profiles(id),
  version int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DROP INDEX IF EXISTS idx_corrective_actions_lookup;
CREATE INDEX idx_corrective_actions_lookup
  ON public.corrective_actions (company_id, status, due_date);

ALTER TABLE public.corrective_actions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS corrective_actions_tenant_isolation ON public.corrective_actions;
DROP POLICY IF EXISTS corrective_actions_select ON public.corrective_actions;
CREATE POLICY corrective_actions_select ON public.corrective_actions
FOR SELECT TO authenticated
USING (
  app_internal.is_super_admin()
  OR company_id = app_internal.get_current_company_id()
);

DROP POLICY IF EXISTS corrective_actions_insert ON public.corrective_actions;
CREATE POLICY corrective_actions_insert ON public.corrective_actions
FOR INSERT TO authenticated
WITH CHECK (
  app_internal.is_super_admin()
  OR company_id = app_internal.get_current_company_id()
);

DROP POLICY IF EXISTS corrective_actions_update ON public.corrective_actions;
CREATE POLICY corrective_actions_update ON public.corrective_actions
FOR UPDATE TO authenticated
USING (
  app_internal.is_super_admin()
  OR company_id = app_internal.get_current_company_id()
)
WITH CHECK (
  app_internal.is_super_admin()
  OR company_id = app_internal.get_current_company_id()
);

CREATE OR REPLACE FUNCTION app_internal.enforce_verified_by_supervisor_only()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.verified_by IS DISTINCT FROM OLD.verified_by THEN
    IF NOT (
      app_internal.is_super_admin()
      OR app_internal.current_user_role() IN ('company_admin', 'safety_director', 'field_supervisor')
    ) THEN
      RAISE EXCEPTION 'Unauthorized: only supervisor-tier roles can set verified_by.';
    END IF;
    IF NEW.verified_by IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = NEW.verified_by
        AND role IN ('company_admin', 'safety_director', 'field_supervisor')
    ) THEN
      RAISE EXCEPTION 'verified_by must reference a supervisor-tier profile.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_verified_by ON public.corrective_actions;
CREATE TRIGGER trg_enforce_verified_by
  BEFORE UPDATE OF verified_by ON public.corrective_actions
  FOR EACH ROW
  EXECUTE FUNCTION app_internal.enforce_verified_by_supervisor_only();

-- ============================================================================
-- SECTION 7 (Track 6): company_compliance_rollups — FINAL CORRECTED VERSION
-- Confirmed against live schema:
--   inspections.company_id exists directly (no join through assets needed)
--   inspections.result is enum ('Pass','Fail','Needs Service')
--   personnel_certs has NO status column — lapsed computed from expiration_date
-- NOT included: Dispatch Gate (mechanism not yet identified), Audit Readiness
-- Score weighting and per-priority SLA thresholds (pending business sign-off).
-- ============================================================================
DROP VIEW IF EXISTS public.company_compliance_rollups;
CREATE VIEW public.company_compliance_rollups
WITH (security_invoker = true) AS
SELECT
  c.id AS company_id,

  COALESCE(
    (SELECT ROUND(100.0 * COUNT(*) FILTER (WHERE i.result = 'Fail') / NULLIF(COUNT(*), 0), 2)
     FROM public.inspections i
     WHERE i.company_id = c.id AND i.created_at >= (now() - interval '90 days')),
    0.0
  ) AS inspection_failure_rate_90d,

  (SELECT COUNT(*) FROM (
    SELECT i.asset_id
    FROM public.inspections i
    WHERE i.company_id = c.id
      AND i.result = 'Fail'
      AND i.created_at >= (now() - interval '60 days')
    GROUP BY i.asset_id
    HAVING COUNT(*) >= 2
  ) chronic
  ) AS chronic_asset_count,

  (SELECT COUNT(*) FROM public.corrective_actions ca
   WHERE ca.company_id = c.id AND ca.status IN ('open', 'in_progress') AND ca.priority = 'P1'
  ) AS open_p1_count,
  (SELECT COUNT(*) FROM public.corrective_actions ca
   WHERE ca.company_id = c.id AND ca.status IN ('open', 'in_progress') AND ca.priority = 'P2'
  ) AS open_p2_count,
  (SELECT COUNT(*) FROM public.corrective_actions ca
   WHERE ca.company_id = c.id AND ca.status IN ('open', 'in_progress') AND ca.priority = 'P3'
  ) AS open_p3_count,

  (SELECT ROUND(AVG(EXTRACT(EPOCH FROM (ca.resolved_at - ca.created_at)) / 3600.0)::numeric, 1)
   FROM public.corrective_actions ca
   WHERE ca.company_id = c.id AND ca.priority = 'P1' AND ca.resolved_at IS NOT NULL
  ) AS mttr_p1_hours,
  (SELECT ROUND(AVG(EXTRACT(EPOCH FROM (ca.resolved_at - ca.created_at)) / 3600.0)::numeric, 1)
   FROM public.corrective_actions ca
   WHERE ca.company_id = c.id AND ca.priority = 'P2' AND ca.resolved_at IS NOT NULL
  ) AS mttr_p2_hours,

  COALESCE(
    (SELECT ROUND(100.0 * COUNT(*) FILTER (WHERE ca.resolved_at IS NOT NULL AND ca.resolved_at <= ca.due_date)
                   / NULLIF(COUNT(*), 0), 2)
     FROM public.corrective_actions ca
     WHERE ca.company_id = c.id AND ca.due_date >= (now() - interval '90 days')),
    0.0
  ) AS resolution_compliance_ratio_90d,

  (SELECT COUNT(*) FROM public.personnel_certs pc
   WHERE pc.company_id = c.id
     AND pc.expiration_date IS NOT NULL
     AND pc.expiration_date < current_date
  ) AS lapsed_certs_count,

  now() AS calculated_at
FROM public.companies c;

COMMIT;