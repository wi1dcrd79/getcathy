DROP POLICY IF EXISTS cert_types_read ON public.certification_types;
CREATE POLICY cert_types_read ON public.certification_types
  FOR SELECT TO authenticated
  USING (is_active = true);