-- ============================================================================
-- TRACK 2 & TRACK 6 DATABASE MIGRATION SCRIPT
-- Target: PostgreSQL / Supabase
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. TRACK 2: PERSONNEL CERTS & JOB FAILURES SCHEMA EXTENSIONS
-- ============================================================================

-- Ensure composite unique constraint on personnel_certs for multi-tenant FK integrity
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'personnel_certs_id_company_id_key'
    ) THEN
        ALTER TABLE public.personnel_certs ADD CONSTRAINT personnel_certs_id_company_id_key UNIQUE (id, company_id);
    END IF;
END $$;

-- Extend public.job_failures for the 5-state lifecycle and tracking
ALTER TABLE public.job_failures 
    ADD COLUMN IF NOT EXISTS replayed_by uuid REFERENCES auth.users(id),
    ADD COLUMN IF NOT EXISTS replayed_at timestamptz,
    ADD COLUMN IF NOT EXISTS replay_count int DEFAULT 0,
    ADD COLUMN IF NOT EXISTS resolved_by uuid REFERENCES auth.users(id),
    ADD COLUMN IF NOT EXISTS resolved_at timestamptz,
    ADD COLUMN IF NOT EXISTS resolution_reason text;

-- Align status default and backfill legacy rows
ALTER TABLE public.job_failures ALTER COLUMN status SET DEFAULT 'failed';
UPDATE public.job_failures SET status = 'failed' WHERE status IS NULL;

-- Enforce 5-state lifecycle CHECK constraint on job_failures
ALTER TABLE public.job_failures DROP CONSTRAINT IF EXISTS job_failures_status_check;
ALTER TABLE public.job_failures ADD CONSTRAINT job_failures_status_check 
    CHECK (status IN ('failed', 'acknowledged', 'retrying', 'succeeded', 'permanently_failed'));

-- Enforce mandatory resolution reason on permanently_failed state
ALTER TABLE public.job_failures DROP CONSTRAINT IF EXISTS job_failures_perm_failed_reason_check;
ALTER TABLE public.job_failures ADD CONSTRAINT job_failures_perm_failed_reason_check 
    CHECK (status <> 'permanently_failed' OR (resolution_reason IS NOT NULL AND length(trim(resolution_reason)) > 0));


-- ============================================================================
-- 2. TRACK 2: CERTIFICATIONS NOTIFICATIONS & CONCURRENCY CONTROLS
-- ============================================================================

-- Create public.cert_notifications
CREATE TABLE IF NOT EXISTS public.cert_notifications (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id uuid NOT NULL,
    cert_id uuid NOT NULL,
    threshold_days int NOT NULL CHECK (threshold_days IN (30, 14, 7)),
    channel text NOT NULL,
    recipient_email text NOT NULL,
    recipient_role text NOT NULL CHECK (recipient_role IN ('welder', 'supervisor', 'admin_fallback')),
    delivery_status text NOT NULL DEFAULT 'claimed' CHECK (delivery_status IN ('claimed', 'dispatched', 'delivered', 'bounced', 'failed')),
    provider_message_id text,
    notice_payload jsonb DEFAULT '{}'::jsonb,
    dispatched_at timestamptz,
    resolved_at timestamptz,
    created_at timestamptz DEFAULT now(),
    CONSTRAINT fk_cert_notifications_cert FOREIGN KEY (cert_id, company_id) 
        REFERENCES public.personnel_certs(id, company_id) ON DELETE CASCADE
);

-- Partial unique index for claim-row concurrency control (prevents duplicate active notices)
DROP INDEX IF EXISTS idx_cert_notifications_active_claim;
CREATE UNIQUE INDEX idx_cert_notifications_active_claim 
    ON public.cert_notifications (cert_id, threshold_days, recipient_role) 
    WHERE delivery_status IN ('claimed', 'dispatched', 'delivered');

-- Enable Row Level Security
ALTER TABLE public.cert_notifications ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Tenant isolation via profiles mapping
DROP POLICY IF EXISTS cert_notifications_tenant_isolation ON public.cert_notifications;
CREATE POLICY cert_notifications_tenant_isolation ON public.cert_notifications
    FOR ALL USING (
        company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    );


-- ============================================================================
-- 3. TRACK 2: REPLAY NOTIFICATION FAILURE RPC & CROSS-TENANT TRIGGER
-- ============================================================================

-- Replay notification failure RPC with terminal-state immutability and FOR UPDATE lock
CREATE OR REPLACE FUNCTION public.replay_notification_failure(p_failure_id uuid)
returns jsonb
security definer
set search_path = public
as $$
declare
    v_failure record;
begin
    -- Lock row and fetch failure record
    SELECT * INTO v_failure 
    FROM public.job_failures 
    WHERE id = p_failure_id 
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Job failure record not found: %', p_failure_id;
    END IF;

    -- Validate terminal states and blocked states (retrying, succeeded, permanently_failed)
    IF v_failure.status IN ('retrying', 'succeeded', 'permanently_failed') THEN
        RAISE EXCEPTION 'Cannot replay failure in terminal or locked state: %', v_failure.status;
    END IF;

    -- Validate event scope
    IF v_failure.event_name NOT LIKE 'cert.expiring%' THEN
        RAISE EXCEPTION 'Event scope mismatch. Only cert.expiring events can be replayed via this function.';
    End IF;

    -- Update failure state to retrying/acknowledged for worker pickup
    UPDATE public.job_failures
    SET status = 'retrying',
        replay_count = COALESCE(replay_count, 0) + 1,
        replayed_by = auth.uid(),
        replayed_at = now()
    WHERE id = p_failure_id;

    RETURN jsonb_build_object(
        'success', true,
        'failure_id', p_failure_id,
        'new_status', 'retrying',
        'replay_count', v_failure.replay_count + 1
    );
end;
$$ language plpgsql;

-- Cross-tenant integrity trigger function for personnel_records
CREATE OR REPLACE FUNCTION public.enforce_supervisor_same_company()
returns trigger
security definer
as $$
declare
    v_sup_company uuid;
begin
    IF NEW.supervisor_id IS NOT NULL THEN
        SELECT company_id INTO v_sup_company 
        FROM public.profiles 
        WHERE id = NEW.supervisor_id;

        IF v_sup_company IS DISTINCT FROM NEW.company_id THEN
            RAISE EXCEPTION 'Cross-tenant violation: Supervisor company_id does not match record company_id.';
        END IF;
    END IF;
    RETURN NEW;
end;
$$ language plpgsql;

-- Attach trigger to personnel_records if table exists
DROP TRIGGER IF EXISTS trg_enforce_supervisor_same_company ON public.personnel_records;
CREATE TRIGGER trg_enforce_supervisor_same_company
    BEFORE INSERT OR UPDATE ON public.personnel_records
    FOR EACH ROW
    EXECUTE FUNCTION public.enforce_supervisor_same_company();


-- ============================================================================
-- 4. TRACK 6: CORRECTIVE ACTIONS & COMPLIANCE ROLLUPS SCHEMA
-- ============================================================================

-- Create corrective_actions table
CREATE TABLE IF NOT EXISTS public.corrective_actions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id uuid NOT NULL,
    source_type text NOT NULL CHECK (source_type IN ('inspection', 'risk_assessment', 'audit')),
    source_id uuid NOT NULL,
    asset_id uuid, -- Optional reference to yard assets
    priority text NOT NULL CHECK (priority IN ('P1', 'P2', 'P3')),
    description text NOT NULL,
    assigned_to uuid REFERENCES public.profiles(id),
    due_date timestamptz NOT NULL,
    status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'verified')),
    resolved_at timestamptz,
    verified_by uuid REFERENCES public.profiles(id), -- Supervisor-only write enforced at application/RPC layer
    version int NOT NULL DEFAULT 1,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Index for high-performance dashboard filtering
DROP INDEX IF EXISTS idx_corrective_actions_lookup;
CREATE INDEX idx_corrective_actions_lookup 
    ON public.corrective_actions (company_id, status, due_date);

-- Enable RLS on corrective_actions
ALTER TABLE public.corrective_actions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS corrective_actions_tenant_isolation ON public.corrective_actions;
CREATE POLICY corrective_actions_tenant_isolation ON public.corrective_actions
    FOR ALL USING (
        company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    );

-- Create company_compliance_rollups security-invoker view
-- Consolidates inspections, corrective actions, and personnel certs metrics
DROP VIEW IF EXISTS public.company_compliance_rollups;
CREATE VIEW public.company_compliance_rollups
WITH (security_invoker = true) AS
SELECT 
    c.id AS company_id,
    -- Failure rate calculation: (failed inspections or jobs / total) * 100
    COALESCE(
        (SELECT ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'failed') / NULLIF(COUNT(*), 0), 2)
         FROM public.job_failures jf 
         WHERE jf.company_id = c.id AND jf.created_at >= (now() - interval '90 days')), 0.0
    ) AS failure_rate_90d,
    -- Open corrective actions counts by priority
    (SELECT COUNT(*) FROM public.corrective_actions ca WHERE ca.company_id = c.id AND ca.status IN ('open', 'in_progress') AND ca.priority = 'P1') AS open_p1_count,
    (SELECT COUNT(*) FROM public.corrective_actions ca WHERE ca.company_id = c.id AND ca.status IN ('open', 'in_progress') AND ca.priority = 'P2') AS open_p2_count,
    -- Lapsed or expiring certs count
    (SELECT COUNT(*) FROM public.personnel_certs pc WHERE pc.company_id = c.id AND pc.status = 'lapsed') AS lapsed_certs_count,
    now() as calculated_at
FROM public.companies c;

COMMIT;
