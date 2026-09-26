DROP POLICY IF EXISTS signatures_insert_authorized ON public.signatures;

REVOKE INSERT ON public.signatures FROM authenticated, anon;

GRANT SELECT ON public.signatures TO authenticated;
GRANT ALL ON public.signatures TO service_role;