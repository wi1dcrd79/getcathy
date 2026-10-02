-- Admin dead-letter queue for exhausted durable job runs
CREATE TABLE public.job_failures (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  function_id TEXT NOT NULL,
  event_name TEXT NOT NULL,
  run_id TEXT,
  attempts INT NOT NULL DEFAULT 0,
  error_message TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  crash_report_id UUID REFERENCES public.crash_reports(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'open',
  acknowledged_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  acknowledged_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX job_failures_company_status_idx ON public.job_failures (company_id, status, created_at DESC);

GRANT SELECT, UPDATE ON public.job_failures TO authenticated;
GRANT ALL ON public.job_failures TO service_role;
ALTER TABLE public.job_failures ENABLE ROW LEVEL SECURITY;

CREATE POLICY job_failures_select ON public.job_failures FOR SELECT TO authenticated
USING (
  (company_id IS NOT NULL AND company_id = app_internal.get_current_company_id()
   AND app_internal.current_user_role() = ANY (ARRAY['company_admin','safety_director']))
  OR app_internal.is_super_admin()
);

CREATE POLICY job_failures_update ON public.job_failures FOR UPDATE TO authenticated
USING (
  (company_id IS NOT NULL AND company_id = app_internal.get_current_company_id()
   AND app_internal.current_user_role() = ANY (ARRAY['company_admin','safety_director']))
  OR app_internal.is_super_admin()
)
WITH CHECK (
  (company_id IS NOT NULL AND company_id = app_internal.get_current_company_id()
   AND app_internal.current_user_role() = ANY (ARRAY['company_admin','safety_director']))
  OR app_internal.is_super_admin()
);

-- Rolling telemetry snapshots produced by the scheduled sync job
CREATE TABLE public.telemetry_syncs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  window_hours INT NOT NULL DEFAULT 24,
  open_crashes INT NOT NULL DEFAULT 0,
  crash_occurrences INT NOT NULL DEFAULT 0,
  critical_risks INT NOT NULL DEFAULT 0,
  open_job_failures INT NOT NULL DEFAULT 0,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX telemetry_syncs_company_idx ON public.telemetry_syncs (company_id, synced_at DESC);

GRANT SELECT ON public.telemetry_syncs TO authenticated;
GRANT ALL ON public.telemetry_syncs TO service_role;
ALTER TABLE public.telemetry_syncs ENABLE ROW LEVEL SECURITY;

CREATE POLICY telemetry_syncs_select ON public.telemetry_syncs FOR SELECT TO authenticated
USING (company_id = app_internal.get_current_company_id() OR app_internal.is_super_admin());

-- Single-flight leases so a second concurrent run exits instead of duplicating work
CREATE TABLE public.job_locks (
  lock_name TEXT PRIMARY KEY,
  locked_until TIMESTAMPTZ NOT NULL,
  holder TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.job_locks TO service_role;
ALTER TABLE public.job_locks ENABLE ROW LEVEL SECURITY;
-- No authenticated policies: server-side jobs only.

CREATE OR REPLACE FUNCTION public.acquire_job_lock(_name TEXT, _holder TEXT, _seconds INT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  acquired BOOLEAN;
BEGIN
  INSERT INTO public.job_locks (lock_name, locked_until, holder)
  VALUES (_name, now() + make_interval(secs => _seconds), _holder)
  ON CONFLICT (lock_name) DO UPDATE
    SET locked_until = EXCLUDED.locked_until,
        holder = EXCLUDED.holder,
        updated_at = now()
    WHERE public.job_locks.locked_until < now()
  RETURNING TRUE INTO acquired;

  RETURN COALESCE(acquired, FALSE);
END;
$$;

REVOKE ALL ON FUNCTION public.acquire_job_lock(TEXT, TEXT, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.acquire_job_lock(TEXT, TEXT, INT) TO service_role;