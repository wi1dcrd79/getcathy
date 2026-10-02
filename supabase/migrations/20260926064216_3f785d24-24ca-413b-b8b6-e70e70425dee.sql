CREATE TABLE IF NOT EXISTS public.evidence_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  created_by uuid NOT NULL,
  title text NOT NULL,
  document_names jsonb NOT NULL DEFAULT '[]'::jsonb,
  record_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  overall_status text NOT NULL,
  summary text NOT NULL,
  findings jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.evidence_reviews TO authenticated;
GRANT ALL ON public.evidence_reviews TO service_role;
ALTER TABLE public.evidence_reviews ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS evidence_reviews_select ON public.evidence_reviews;
CREATE POLICY evidence_reviews_select ON public.evidence_reviews FOR SELECT TO authenticated
  USING (company_id = app_internal.get_current_company_id() OR app_internal.is_super_admin());
DROP POLICY IF EXISTS evidence_reviews_insert ON public.evidence_reviews;
CREATE POLICY evidence_reviews_insert ON public.evidence_reviews FOR INSERT TO authenticated
  WITH CHECK (
    company_id = app_internal.get_current_company_id()
    AND created_by = auth.uid()
    AND app_internal.current_user_role() IN ('company_admin','safety_director','qc_inspector')
  );
CREATE INDEX IF NOT EXISTS evidence_reviews_company_created_idx ON public.evidence_reviews(company_id, created_at DESC);