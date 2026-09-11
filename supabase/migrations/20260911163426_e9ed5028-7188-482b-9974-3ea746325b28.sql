REVOKE EXECUTE ON FUNCTION public.company_billing_state(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.company_write_locked() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.company_billing_state(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.company_write_locked() TO authenticated, service_role;