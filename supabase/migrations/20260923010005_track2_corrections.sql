-- File: supabase/migrations/20260923010005_track2_corrections.sql
-- Corrected version: restores service-role-only writes and role-scoped
-- SELECT on cert_notifications, restores caller authorization and tenant
-- checks on replay_notification_failure, fixes job_failures backfill
-- condition, standardizes FK targets to public.profiles(id).
--
-- PREREQUISITE: confirm Track 2 Step 1 (personnel_records.email,
-- personnel_records.supervisor_id, and the field_supervisor role trigger
-- update) has already been deployed. This migration assumes those exist.

BEGIN;

-- ---------------------------------------------------------------------
-- 1. personnel_certs composite constraint
-- ---------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'personnel_certs_id_company_id_key'
    ) THEN
        ALTER TABLE public.personnel_certs
          ADD CONSTRAINT personnel_certs_id_company_id_key UNIQUE (id, company_id);
    END IF;
END $$;

-- ---------------------------------------------------------------------
-- 2. job_failures: extend + align status model
-- FK targets standardized to public.profiles(id), matching the rest of
-- the schema's convention (not auth.users(id)).
-- ---------------------------------------------------------------------
ALTER TABLE public.job_failures
    ADD COLUMN IF NOT EXISTS replayed_by uuid REFERENCES public.profiles(id),
    ADD COLUMN IF NOT EXISTS replayed_at timestamptz,
    ADD COLUMN IF NOT EXISTS replay_count int NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS resolved_by uuid REFERENCES public.profiles(id),
    ADD COLUMN IF NOT EXISTS resolved_at timestamptz,
    ADD COLUMN IF NOT EXISTS resolution_reason text;

ALTER TABLE public.job_failures ALTER COLUMN status SET DEFAULT 'failed';

-- Fixed: catches any legacy value not in the new 5-state set, not just NULL
-- (the live default is 'open', which is NOT NULL, so a `WHERE status IS NULL`
-- backfill would silently miss every existing row).
UPDATE public.job_failures
SET status = 'failed'
WHERE status NOT IN ('failed', 'acknowledged', 'retrying', 'succeeded', 'permanently_failed');

ALTER TABLE public.job_failures DROP CONSTRAINT IF EXISTS job_failures_status_check;
ALTER TABLE public.job_failures ADD CONSTRAINT job_failures_status_check
    CHECK (status IN ('failed', 'acknowledged', 'retrying', 'succeeded', 'permanently_failed'));

ALTER TABLE public.job_failures DROP CONSTRAINT IF EXISTS job_failures_perm_failed_reason_check;
ALTER TABLE public.job_failures ADD CONSTRAINT job_failures_perm_failed_reason_check
    CHECK (status <> 'permanently_failed' OR (resolution_reason IS NOT NULL AND length(trim(resolution_reason)) > 0));

-- REMINDER (not enforced by this migration): src/lib/inngest/dead-letter.server.ts
-- currently inserts status: 'open'. It MUST be updated to 'failed' in the
-- same deploy as this migration, or every new dead-letter insert will fail
-- the CHECK constraint above the moment this ships.

-- ---------------------------------------------------------------------
-- 3. cert_notifications: create + CORRECTED RLS (service-role writes only,
-- role-scoped SELECT — restores what the last draft accidentally dropped)
-- ---------------------------------------------------------------------
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

-- Writes: service-role only. Explicit REVOKE — this is the protection the
-- prior draft's blanket `FOR ALL` policy silently removed.
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

-- ---------------------------------------------------------------------
-- 4. replay_notification_failure: RESTORED caller authorization and
-- tenant boundary checks. The prior draft dropped both — meaning any
-- caller able to execute the function could replay any tenant's failure.
-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
-- 5. Cross-tenant supervisor integrity trigger
-- ---------------------------------------------------------------------
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

COMMIT;
