REVOKE EXECUTE ON FUNCTION public.bootstrap_current_user() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bootstrap_current_user() TO service_role;