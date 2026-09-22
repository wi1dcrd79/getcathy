CREATE TABLE public.crash_reports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  reported_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  route TEXT NOT NULL,
  screen_label TEXT NOT NULL,
  problem TEXT NOT NULL,
  detail TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'error',
  device_kind TEXT NOT NULL DEFAULT 'unknown',
  platform TEXT NOT NULL DEFAULT 'unknown',
  viewport TEXT NOT NULL DEFAULT 'unknown',
  app_build TEXT NOT NULL DEFAULT 'unknown',
  was_offline BOOLEAN NOT NULL DEFAULT false,
  occurrences INTEGER NOT NULL DEFAULT 1,
  recovery_actions JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'open',
  reviewer_notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX crash_reports_company_created_idx ON public.crash_reports (company_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.crash_reports TO authenticated;
GRANT ALL ON public.crash_reports TO service_role;

ALTER TABLE public.crash_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "crash_reports_select" ON public.crash_reports
FOR SELECT TO authenticated
USING (company_id = app_internal.get_current_company_id() OR app_internal.is_super_admin());

CREATE POLICY "crash_reports_insert" ON public.crash_reports
FOR INSERT TO authenticated
WITH CHECK (company_id = app_internal.get_current_company_id() AND reported_by = auth.uid());

CREATE POLICY "crash_reports_update" ON public.crash_reports
FOR UPDATE TO authenticated
USING (
  (company_id = app_internal.get_current_company_id()
   AND app_internal.current_user_role() IN ('company_admin', 'safety_director'))
  OR app_internal.is_super_admin()
)
WITH CHECK (
  (company_id = app_internal.get_current_company_id()
   AND app_internal.current_user_role() IN ('company_admin', 'safety_director'))
  OR app_internal.is_super_admin()
);

CREATE POLICY "crash_reports_delete" ON public.crash_reports
FOR DELETE TO authenticated
USING (
  (company_id = app_internal.get_current_company_id()
   AND app_internal.current_user_role() IN ('company_admin', 'safety_director'))
  OR app_internal.is_super_admin()
);

CREATE TRIGGER update_crash_reports_updated_at
BEFORE UPDATE ON public.crash_reports
FOR EACH ROW EXECUTE FUNCTION app_internal.update_updated_at_column();