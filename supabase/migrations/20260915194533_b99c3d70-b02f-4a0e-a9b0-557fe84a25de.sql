-- Block anonymous/public direct RPC calls on internal helpers
-- (re-grant to authenticated so RLS policy evaluation keeps working)

REVOKE EXECUTE ON FUNCTION public.get_current_company_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_current_company_id() TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.can_write_compliance() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_write_compliance() TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.is_super_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.current_user_role() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_user_role() TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.company_billing_state(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.company_billing_state(uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.company_write_locked() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.company_write_locked() TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.bootstrap_current_user() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bootstrap_current_user() TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.rotate_session_token(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rotate_session_token(text) TO authenticated, service_role;