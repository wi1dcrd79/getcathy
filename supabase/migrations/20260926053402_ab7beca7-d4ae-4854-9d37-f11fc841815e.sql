DROP POLICY IF EXISTS job_locks_deny_all ON public.job_locks;
CREATE POLICY job_locks_deny_all ON public.job_locks
  FOR ALL
  TO authenticated, anon
  USING (false);

REVOKE ALL ON FUNCTION app_internal.get_current_company_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION app_internal.get_current_company_id() TO authenticated, service_role;

REVOKE ALL ON FUNCTION app_internal.current_user_role() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION app_internal.current_user_role() TO authenticated, service_role;

REVOKE ALL ON FUNCTION app_internal.is_super_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION app_internal.is_super_admin() TO authenticated, service_role;