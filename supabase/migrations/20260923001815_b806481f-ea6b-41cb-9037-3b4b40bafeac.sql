CREATE TABLE public.compliance_report_jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  requested_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  period_start DATE,
  period_end DATE,
  status TEXT NOT NULL DEFAULT 'pending',
  summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);
CREATE INDEX compliance_report_jobs_company_idx ON public.compliance_report_jobs (company_id, created_at DESC);

GRANT SELECT ON public.compliance_report_jobs TO authenticated;
GRANT ALL ON public.compliance_report_jobs TO service_role;
ALTER TABLE public.compliance_report_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY compliance_report_jobs_select ON public.compliance_report_jobs FOR SELECT TO authenticated
USING (company_id = app_internal.get_current_company_id() OR app_internal.is_super_admin());