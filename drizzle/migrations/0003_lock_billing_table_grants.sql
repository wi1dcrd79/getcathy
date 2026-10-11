REVOKE ALL ON TABLE public.subscriptions FROM anon, authenticated;
GRANT SELECT ON TABLE public.subscriptions TO authenticated;
REVOKE ALL ON TABLE public.company_billing FROM anon, authenticated;