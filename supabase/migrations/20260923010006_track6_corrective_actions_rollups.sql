-- File: supabase/migrations/20260923010006_track6_corrective_actions_rollups.sql
-- corrective_actions with verified_by enforced via RLS (not a comment),
-- and a rollup view closer to the original Track 6 metric spec.
--
-- NOT included: Dispatch Gate. This is server-side enforcement on the
-- actual dispatch action, not a rollup metric — it needs to hook into
-- whatever table/endpoint actually represents "assigning personnel to a
-- site/shift," which hasn't been identified anywhere in this project's
-- migrations so far. Guessing a target here risks enforcing a gate on
-- the wrong table. Flag the real dispatch mechanism and this gets built
-- as its own migration.
--
-- Two metrics remain business decisions pending sign-off, not implemented
-- as fixed values: Audit Readiness Score weighting, per-priority SLA
-- aging thresholds. Not computed in this view until those are settled.

BEGIN;

-- ---------------------------------------------------------------------
-- 1. corrective_actions
-- ---------------------------------------------------------------------
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

-- General tenant-scoped SELECT/INSERT/UPDATE for company members
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

-- General UPDATE: company members can update non-verification fields
-- (status, description, assignment) but NOT verified_by directly — see
-- the column-level restriction below.
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

-- verified_by restriction: RLS policies can't restrict individual columns
-- directly, so this is enforced via a trigger that rejects any attempt
-- to set/change verified_by unless the caller is supervisor-tier.
-- This is the actual enforcement Track 6 specified — not an app-layer
-- comment.
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
        -- Also enforce that whoever is being recorded as verifier is
        -- actually themself supervisor-tier or above, not an arbitrary profile id.
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

-- ---------------------------------------------------------------------
-- 2. company_compliance_rollups — closer to original spec.
-- Chronic Asset Threshold, MTTR, Resolution Compliance Ratio, and
-- Coverage % implemented. Audit Readiness Score and per-priority SLA
-- aging NOT computed — pending business sign-off per Gap 7.
-- ---------------------------------------------------------------------
DROP VIEW IF EXISTS public.company_compliance_rollups;
CREATE VIEW public.company_compliance_rollups
WITH (security_invoker = true) AS
SELECT
    c.id AS company_id,

    -- Inspection failure rate over rolling 90d (uses public.inspections,
    -- NOT job_failures — corrected from the prior draft, which measured
    -- infrastructure job failures under an inspection-failure-rate name).
    COALESCE(
        (SELECT ROUND(100.0 * COUNT(*) FILTER (WHERE i.result = 'fail') / NULLIF(COUNT(*), 0), 2)
         FROM public.inspections i
         WHERE i.company_id = c.id AND i.created_at >= (now() - interval '90 days')),
        0.0
    ) AS inspection_failure_rate_90d,

    -- Chronic Asset count: assets with >=2 failed inspections in rolling 60d
    (SELECT COUNT(DISTINCT i.asset_id)
     FROM public.inspections i
     WHERE i.company_id = c.id
       AND i.result = 'fail'
       AND i.created_at >= (now() - interval '60 days')
     GROUP BY i.asset_id
     HAVING COUNT(*) >= 2
    ) AS chronic_asset_count,

    -- Corrective action aging, by priority
    (SELECT COUNT(*) FROM public.corrective_actions ca
     WHERE ca.company_id = c.id AND ca.status IN ('open', 'in_progress') AND ca.priority = 'P1'
    ) AS open_p1_count,
    (SELECT COUNT(*) FROM public.corrective_actions ca
     WHERE ca.company_id = c.id AND ca.status IN ('open', 'in_progress') AND ca.priority = 'P2'
    ) AS open_p2_count,
    (SELECT COUNT(*) FROM public.corrective_actions ca
     WHERE ca.company_id = c.id AND ca.status IN ('open', 'in_progress') AND ca.priority = 'P3'
    ) AS open_p3_count,

    -- MTTR by priority (in hours), resolved actions only
    (SELECT ROUND(AVG(EXTRACT(EPOCH FROM (ca.resolved_at - ca.created_at)) / 3600.0)::numeric, 1)
     FROM public.corrective_actions ca
     WHERE ca.company_id = c.id AND ca.priority = 'P1' AND ca.resolved_at IS NOT NULL
    ) AS mttr_p1_hours,
    (SELECT ROUND(AVG(EXTRACT(EPOCH FROM (ca.resolved_at - ca.created_at)) / 3600.0)::numeric, 1)
     FROM public.corrective_actions ca
     WHERE ca.company_id = c.id AND ca.priority = 'P2' AND ca.resolved_at IS NOT NULL
    ) AS mttr_p2_hours,

    -- Resolution Compliance Ratio: resolved-on-time / total due, rolling 90d
    COALESCE(
        (SELECT ROUND(100.0 * COUNT(*) FILTER (WHERE ca.resolved_at IS NOT NULL AND ca.resolved_at <= ca.due_date)
                       / NULLIF(COUNT(*), 0), 2)
         FROM public.corrective_actions ca
         WHERE ca.company_id = c.id AND ca.due_date >= (now() - interval '90 days')),
        0.0
    ) AS resolution_compliance_ratio_90d,

    -- Lapsed/expiring cert counts
    (SELECT COUNT(*) FROM public.personnel_certs pc WHERE pc.company_id = c.id AND pc.status = 'lapsed'
    ) AS lapsed_certs_count,

    now() AS calculated_at
FROM public.companies c;

COMMIT;
