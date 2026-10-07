-- Phase A (LOCAL TESTING ONLY): corrective_actions anti-tamper lifecycle,
-- append-only event log, certification_types lookup, null-safe rollups.
-- Idempotent: safe to run more than once.
-- Run locally:  psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -f local-dev/phase_a_corrective_actions.sql

-- 1. Sanitize legacy rows + state integrity
UPDATE public.corrective_actions SET status = 'resolved', resolved_at = COALESCE(resolved_at, updated_at)
 WHERE status = 'verified' AND (verified_by IS NULL OR resolved_at IS NULL);
UPDATE public.corrective_actions SET resolved_at = COALESCE(resolved_at, updated_at)
 WHERE status = 'resolved' AND resolved_at IS NULL;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_verified_state_integrity') THEN
    ALTER TABLE public.corrective_actions ADD CONSTRAINT chk_verified_state_integrity
      CHECK (status <> 'verified' OR (verified_by IS NOT NULL AND resolved_at IS NOT NULL));
  END IF;
END $$;
DROP TRIGGER IF EXISTS trg_enforce_verified_by ON public.corrective_actions;

-- 2. Append-only event log
CREATE TABLE IF NOT EXISTS public.corrective_action_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  corrective_action_id uuid NOT NULL REFERENCES public.corrective_actions(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('created','status_change','priority_change','due_date_change')),
  old_status text, new_status text, old_priority text, new_priority text,
  old_due_date timestamptz, new_due_date timestamptz,
  actor_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ca_events_action ON public.corrective_action_events (corrective_action_id, created_at);
REVOKE ALL ON public.corrective_action_events FROM anon, authenticated;
GRANT SELECT ON public.corrective_action_events TO authenticated;
GRANT SELECT, INSERT ON public.corrective_action_events TO service_role;
ALTER TABLE public.corrective_action_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ca_events_select ON public.corrective_action_events;
CREATE POLICY ca_events_select ON public.corrective_action_events FOR SELECT TO authenticated
  USING (app_internal.is_super_admin() OR company_id = app_internal.get_current_company_id());

CREATE OR REPLACE FUNCTION app_internal.block_ca_events_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'corrective_action_events is append-only'; END $$;
DROP TRIGGER IF EXISTS trg_block_ca_events_mutation ON public.corrective_action_events;
CREATE TRIGGER trg_block_ca_events_mutation BEFORE UPDATE OR DELETE ON public.corrective_action_events
  FOR EACH ROW EXECUTE FUNCTION app_internal.block_ca_events_mutation();

CREATE OR REPLACE FUNCTION app_internal.log_ca_event(
  p_company uuid, p_action uuid, p_type text, p_old_status text, p_new_status text,
  p_old_priority text, p_new_priority text, p_old_due timestamptz, p_new_due timestamptz)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.corrective_action_events (company_id, corrective_action_id, event_type,
    old_status, new_status, old_priority, new_priority, old_due_date, new_due_date, actor_id)
  VALUES (p_company, p_action, p_type, p_old_status, p_new_status,
          p_old_priority, p_new_priority, p_old_due, p_new_due, auth.uid());
$$;
REVOKE ALL ON FUNCTION app_internal.log_ca_event(uuid,uuid,text,text,text,text,text,timestamptz,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_internal.log_ca_event(uuid,uuid,text,text,text,text,text,timestamptz,timestamptz) TO authenticated, service_role;

-- 3. Lifecycle trigger (SECURITY INVOKER so it sees the real caller)
CREATE OR REPLACE FUNCTION app_internal.ca_sla_due(p_priority text, p_from timestamptz)
RETURNS timestamptz LANGUAGE sql IMMUTABLE AS $$
  SELECT p_from + CASE p_priority WHEN 'P1' THEN interval '24 hours'
                                  WHEN 'P2' THEN interval '72 hours' ELSE interval '7 days' END;
$$;

CREATE OR REPLACE FUNCTION app_internal.enforce_corrective_action_lifecycle()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  is_system boolean := COALESCE(current_setting('role', true), '') = 'service_role'
                       OR current_user IN ('postgres', 'supabase_admin');
  is_supervisor boolean := COALESCE(app_internal.is_super_admin(), false)
                       OR COALESCE(app_internal.current_user_role() IN ('company_admin','safety_director','field_supervisor'), false);
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'verified' THEN
      RAISE EXCEPTION 'A corrective action cannot be created already verified';
    END IF;
    IF NEW.due_date IS NULL OR NOT (is_system OR is_supervisor) THEN
      NEW.due_date := app_internal.ca_sla_due(NEW.priority, now());
    END IF;
    NEW.verified_by := NULL;
    NEW.resolved_at := CASE WHEN NEW.status = 'resolved' THEN now() ELSE NULL END;
    NEW.version := 1;
    RETURN NEW;
  END IF;

  IF (NEW.priority IS DISTINCT FROM OLD.priority OR NEW.due_date IS DISTINCT FROM OLD.due_date)
     AND NOT (is_system OR is_supervisor) THEN
    RAISE EXCEPTION 'Only supervisors can change priority or due date';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'verified' THEN
      IF NOT is_supervisor OR auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Only a signed-in supervisor can verify a corrective action';
      END IF;
      IF OLD.status <> 'resolved' THEN
        RAISE EXCEPTION 'Only resolved actions can be verified';
      END IF;
      NEW.verified_by := auth.uid();
      NEW.resolved_at := OLD.resolved_at;
    ELSIF NEW.status = 'resolved' THEN
      IF OLD.status = 'verified' AND NOT (is_system OR is_supervisor) THEN
        RAISE EXCEPTION 'Only supervisors can reopen a verified action';
      END IF;
      NEW.resolved_at := now();
      NEW.verified_by := NULL;
    ELSE
      IF OLD.status IN ('resolved','verified') AND NOT (is_system OR is_supervisor) THEN
        RAISE EXCEPTION 'Only supervisors can reopen a resolved action';
      END IF;
      NEW.resolved_at := NULL;
      NEW.verified_by := NULL;
    END IF;
  ELSE
    NEW.resolved_at := OLD.resolved_at;
    NEW.verified_by := OLD.verified_by;
  END IF;

  NEW.version := OLD.version + 1;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_ca_lifecycle ON public.corrective_actions;
CREATE TRIGGER trg_ca_lifecycle BEFORE INSERT OR UPDATE ON public.corrective_actions
  FOR EACH ROW EXECUTE FUNCTION app_internal.enforce_corrective_action_lifecycle();

CREATE OR REPLACE FUNCTION app_internal.ca_log_after()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM app_internal.log_ca_event(NEW.company_id, NEW.id, 'created', NULL, NEW.status, NULL, NEW.priority, NULL, NEW.due_date);
    RETURN NULL;
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM app_internal.log_ca_event(NEW.company_id, NEW.id, 'status_change', OLD.status, NEW.status, NULL, NULL, NULL, NULL);
  END IF;
  IF NEW.priority IS DISTINCT FROM OLD.priority THEN
    PERFORM app_internal.log_ca_event(NEW.company_id, NEW.id, 'priority_change', NULL, NULL, OLD.priority, NEW.priority, NULL, NULL);
  END IF;
  IF NEW.due_date IS DISTINCT FROM OLD.due_date THEN
    PERFORM app_internal.log_ca_event(NEW.company_id, NEW.id, 'due_date_change', NULL, NULL, NULL, NULL, OLD.due_date, NEW.due_date);
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_ca_log_after ON public.corrective_actions;
CREATE TRIGGER trg_ca_log_after AFTER INSERT OR UPDATE ON public.corrective_actions
  FOR EACH ROW EXECUTE FUNCTION app_internal.ca_log_after();

-- 4. Certification types lookup (not an enum); continuity fixed at 150 days
CREATE TABLE IF NOT EXISTS public.certification_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  requires_continuity boolean NOT NULL DEFAULT false,
  default_continuity_days integer NOT NULL DEFAULT 150 CHECK (default_continuity_days = 150),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.certification_types TO authenticated;
GRANT ALL ON public.certification_types TO service_role;
ALTER TABLE public.certification_types ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cert_types_read ON public.certification_types;
CREATE POLICY cert_types_read ON public.certification_types FOR SELECT TO authenticated USING (true);
INSERT INTO public.certification_types (code, name, requires_continuity) VALUES
  ('SMAW','Shielded Metal Arc Welding', true), ('GMAW','Gas Metal Arc Welding', true),
  ('FCAW','Flux-Cored Arc Welding', true), ('GTAW','Gas Tungsten Arc Welding', true),
  ('RIGGER','Qualified Rigger', false), ('CRANE_OP','Crane Operator', false)
ON CONFLICT (code) DO NOTHING;

-- 5. Null-safe rollups (NULL = no data, never a fake 0%)
DROP VIEW IF EXISTS public.company_compliance_rollups;
CREATE VIEW public.company_compliance_rollups WITH (security_invoker = true) AS
SELECT
  c.id AS company_id,
  (SELECT ROUND(100.0 * COUNT(*) FILTER (WHERE i.result = 'Pass') / NULLIF(COUNT(*),0), 2)
     FROM public.inspections i WHERE i.company_id = c.id AND i.created_at >= now() - interval '90 days') AS inspection_pass_rate_90d,
  (SELECT ROUND(100.0 * COUNT(*) FILTER (WHERE i.result = 'Fail') / NULLIF(COUNT(*),0), 2)
     FROM public.inspections i WHERE i.company_id = c.id AND i.created_at >= now() - interval '90 days') AS inspection_failure_rate_90d,
  (SELECT ROUND(100.0 * COUNT(*) FILTER (WHERE i.result = 'Needs Service') / NULLIF(COUNT(*),0), 2)
     FROM public.inspections i WHERE i.company_id = c.id AND i.created_at >= now() - interval '90 days') AS inspection_needs_service_rate_90d,
  (SELECT COUNT(*) FROM (SELECT i.asset_id FROM public.inspections i
      WHERE i.company_id = c.id AND i.result = 'Fail' AND i.created_at >= now() - interval '60 days'
      GROUP BY i.asset_id HAVING COUNT(*) >= 2) x) AS chronic_asset_count,
  (SELECT COUNT(*) FROM public.corrective_actions ca WHERE ca.company_id = c.id
      AND ca.status IN ('open','in_progress','ready_for_review') AND ca.priority = 'P1') AS open_p1_count,
  (SELECT COUNT(*) FROM public.corrective_actions ca WHERE ca.company_id = c.id
      AND ca.status IN ('open','in_progress','ready_for_review') AND ca.priority = 'P2') AS open_p2_count,
  (SELECT COUNT(*) FROM public.corrective_actions ca WHERE ca.company_id = c.id
      AND ca.status IN ('open','in_progress','ready_for_review') AND ca.priority = 'P3') AS open_p3_count,
  (SELECT ROUND(AVG(EXTRACT(EPOCH FROM (ca.resolved_at - ca.created_at))/3600.0)::numeric, 1)
     FROM public.corrective_actions ca WHERE ca.company_id = c.id AND ca.priority = 'P1' AND ca.resolved_at IS NOT NULL) AS mttr_p1_hours,
  (SELECT ROUND(AVG(EXTRACT(EPOCH FROM (ca.resolved_at - ca.created_at))/3600.0)::numeric, 1)
     FROM public.corrective_actions ca WHERE ca.company_id = c.id AND ca.priority = 'P2' AND ca.resolved_at IS NOT NULL) AS mttr_p2_hours,
  (SELECT ROUND(AVG(EXTRACT(EPOCH FROM (ca.resolved_at - ca.created_at))/3600.0)::numeric, 1)
     FROM public.corrective_actions ca WHERE ca.company_id = c.id AND ca.priority = 'P3' AND ca.resolved_at IS NOT NULL) AS mttr_p3_hours,
  (SELECT ROUND(100.0 * COUNT(*) FILTER (WHERE ca.resolved_at IS NOT NULL AND ca.resolved_at <= ca.due_date) / NULLIF(COUNT(*),0), 2)
     FROM public.corrective_actions ca
    WHERE ca.company_id = c.id AND ca.due_date <= now() AND ca.due_date >= now() - interval '90 days') AS resolution_compliance_ratio_90d,
  (SELECT COUNT(*) FROM public.personnel_certs pc
    WHERE pc.company_id = c.id AND pc.expiration_date IS NOT NULL AND pc.expiration_date < current_date) AS lapsed_certs_count,
  (SELECT COUNT(DISTINCT pc.personnel_id) FROM public.personnel_certs pc
    WHERE pc.company_id = c.id AND pc.expiration_date IS NOT NULL AND pc.expiration_date < current_date) AS noncompliant_personnel_count,
  now() AS calculated_at
FROM public.companies c;
GRANT SELECT ON public.company_compliance_rollups TO authenticated, service_role;
