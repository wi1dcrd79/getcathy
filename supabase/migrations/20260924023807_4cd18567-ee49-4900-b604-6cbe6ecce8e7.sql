GRANT SELECT, INSERT, UPDATE ON public.corrective_actions TO authenticated;
GRANT ALL ON public.corrective_actions TO service_role;
GRANT SELECT ON public.company_compliance_rollups TO authenticated;
GRANT SELECT ON public.company_compliance_rollups TO service_role;
DROP TRIGGER IF EXISTS update_corrective_actions_updated_at ON public.corrective_actions;
CREATE TRIGGER update_corrective_actions_updated_at BEFORE UPDATE ON public.corrective_actions
  FOR EACH ROW EXECUTE FUNCTION app_internal.update_updated_at_column();