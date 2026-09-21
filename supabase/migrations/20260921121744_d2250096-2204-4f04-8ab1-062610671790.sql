CREATE TABLE public.risk_assessments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  asset_tag TEXT,
  notes TEXT NOT NULL,
  photo_count INTEGER NOT NULL DEFAULT 0,
  overall_risk TEXT NOT NULL,
  summary TEXT NOT NULL,
  actions JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX risk_assessments_company_created_idx ON public.risk_assessments (company_id, created_at DESC);

GRANT SELECT, INSERT, DELETE ON public.risk_assessments TO authenticated;
GRANT ALL ON public.risk_assessments TO service_role;

ALTER TABLE public.risk_assessments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "risk_assessments_select_company" ON public.risk_assessments
  FOR SELECT TO authenticated
  USING (company_id = app_internal.get_current_company_id() OR app_internal.is_super_admin());

CREATE POLICY "risk_assessments_insert_compliance" ON public.risk_assessments
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND company_id = app_internal.get_current_company_id()
    AND app_internal.can_write_compliance()
    AND NOT app_internal.company_write_locked()
  );

CREATE POLICY "risk_assessments_delete_admin" ON public.risk_assessments
  FOR DELETE TO authenticated
  USING (
    (company_id = app_internal.get_current_company_id()
     AND app_internal.current_user_role() IN ('company_admin', 'safety_director'))
    OR app_internal.is_super_admin()
  );