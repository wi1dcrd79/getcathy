ALTER TABLE public.personnel_certs
  ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS submitted_by uuid,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz;

UPDATE public.personnel_certs SET approval_status = 'approved' WHERE approval_status IS NULL;

DROP POLICY IF EXISTS personnel_certs_write ON public.personnel_certs;
CREATE POLICY personnel_certs_write ON public.personnel_certs
  FOR INSERT TO authenticated
  WITH CHECK (
    ((company_id = get_current_company_id()) OR is_super_admin())
    AND (
      can_write_compliance()
      OR (approval_status = 'pending' AND submitted_by = auth.uid())
    )
  );