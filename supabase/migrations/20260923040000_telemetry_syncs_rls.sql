ALTER TABLE public.telemetry_syncs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS telemetry_syncs_select ON public.telemetry_syncs;
CREATE POLICY telemetry_syncs_select ON public.telemetry_syncs
FOR SELECT TO authenticated
USING (
  app_internal.is_super_admin()
  OR company_id = app_internal.get_current_company_id()
);

GRANT SELECT ON public.telemetry_syncs TO authenticated;
GRANT ALL ON public.telemetry_syncs TO service_role;
REVOKE INSERT, UPDATE, DELETE ON public.telemetry_syncs FROM authenticated;
