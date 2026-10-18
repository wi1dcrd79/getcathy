CREATE TABLE IF NOT EXISTS public.continuity_submissions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES public.companies(id), personnel_id uuid NOT NULL REFERENCES public.personnel_records(id), submitted_by uuid NOT NULL REFERENCES public.profiles(id), cert_type_code text NOT NULL REFERENCES public.certification_types(code), performed_date date NOT NULL, work_reference text NOT NULL, standard text NOT NULL DEFAULT '', position text NOT NULL DEFAULT '', status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')), version integer NOT NULL DEFAULT 1, reviewed_by uuid REFERENCES public.profiles(id), reviewed_at timestamptz, review_note text, verified_log_id uuid REFERENCES public.craft_continuity_logs(id), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.continuity_submissions TO authenticated;
GRANT ALL ON public.continuity_submissions TO service_role;
ALTER TABLE public.continuity_submissions ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS continuity_submissions_company_status ON public.continuity_submissions(company_id,status);
DROP POLICY IF EXISTS submissions_read ON public.continuity_submissions;
CREATE POLICY submissions_read ON public.continuity_submissions FOR SELECT TO authenticated USING (company_id = app_internal.get_current_company_id() AND (submitted_by = auth.uid() OR app_internal.current_user_role() IN ('company_admin','safety_director','qc_inspector') OR (app_internal.current_user_role() = 'field_supervisor' AND EXISTS (SELECT 1 FROM public.personnel_records p WHERE p.id = personnel_id AND p.supervisor_id = auth.uid()))));
DROP POLICY IF EXISTS submissions_insert ON public.continuity_submissions;
CREATE POLICY submissions_insert ON public.continuity_submissions FOR INSERT TO authenticated WITH CHECK (company_id = app_internal.get_current_company_id() AND submitted_by = auth.uid() AND NOT app_internal.company_write_locked());
DROP POLICY IF EXISTS submissions_update ON public.continuity_submissions;
CREATE POLICY submissions_update ON public.continuity_submissions FOR UPDATE TO authenticated USING (company_id = app_internal.get_current_company_id() AND NOT app_internal.company_write_locked() AND (submitted_by = auth.uid() OR app_internal.current_user_role() IN ('company_admin','safety_director','qc_inspector') OR (app_internal.current_user_role() = 'field_supervisor' AND EXISTS (SELECT 1 FROM public.personnel_records p WHERE p.id = personnel_id AND p.supervisor_id = auth.uid())))) WITH CHECK (company_id = app_internal.get_current_company_id());
CREATE OR REPLACE FUNCTION app_internal.guard_continuity_submission() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_email text; v_count integer; v_role text; v_supervisor uuid; v_log uuid;
BEGIN
 IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Continuity submissions cannot be deleted'; END IF;
 IF auth.uid() IS NULL OR NEW.company_id IS DISTINCT FROM app_internal.get_current_company_id() OR app_internal.company_write_locked() THEN RAISE EXCEPTION 'Continuity write not permitted'; END IF;
 SELECT role INTO v_role FROM public.profiles WHERE id = auth.uid() AND company_id = NEW.company_id;
 IF v_role IS NULL OR v_role = 'viewer' THEN RAISE EXCEPTION 'Read-only account'; END IF;
 IF TG_OP = 'UPDATE' THEN
  IF OLD.status = 'approved' THEN RAISE EXCEPTION 'Approved evidence is immutable'; END IF;
  IF ROW(NEW.id,NEW.company_id,NEW.personnel_id,NEW.submitted_by,NEW.created_at) IS DISTINCT FROM ROW(OLD.id,OLD.company_id,OLD.personnel_id,OLD.submitted_by,OLD.created_at) THEN RAISE EXCEPTION 'Identity cannot change'; END IF;
  IF NEW.version <> OLD.version + 1 THEN RAISE EXCEPTION 'Version conflict'; END IF;
 ELSE
  IF NEW.submitted_by <> auth.uid() OR NEW.status <> 'pending' OR NEW.version <> 1 THEN RAISE EXCEPTION 'Invalid submission'; END IF;
  NEW.created_at := now();
 END IF;
 IF TG_OP = 'INSERT' OR (NEW.status = 'pending' AND NEW.submitted_by = auth.uid()) THEN
  SELECT email INTO v_email FROM public.profiles WHERE id = auth.uid() AND company_id = NEW.company_id;
  SELECT count(*) INTO v_count FROM public.personnel_records WHERE company_id = NEW.company_id AND status = 'active' AND lower(trim(email)) = lower(trim(v_email));
  IF v_count <> 1 OR NOT EXISTS (SELECT 1 FROM public.personnel_records WHERE id = NEW.personnel_id AND company_id = NEW.company_id AND status = 'active' AND lower(trim(email)) = lower(trim(v_email))) THEN RAISE EXCEPTION 'Your account must match one active personnel record'; END IF;
  NEW.reviewed_by := NULL; NEW.reviewed_at := NULL; NEW.review_note := NULL; NEW.verified_log_id := NULL;
 ELSE
  IF NEW.status NOT IN ('approved','rejected') OR OLD.status <> 'pending' OR NEW.submitted_by = auth.uid() THEN RAISE EXCEPTION 'Independent review required'; END IF;
  SELECT supervisor_id INTO v_supervisor FROM public.personnel_records WHERE id = NEW.personnel_id AND company_id = NEW.company_id;
  IF NOT (v_role IN ('company_admin','safety_director','qc_inspector') OR (v_role = 'field_supervisor' AND v_supervisor = auth.uid())) THEN RAISE EXCEPTION 'Reviewer not authorized'; END IF;
  IF ROW(NEW.cert_type_code,NEW.performed_date,NEW.work_reference,NEW.standard,NEW.position) IS DISTINCT FROM ROW(OLD.cert_type_code,OLD.performed_date,OLD.work_reference,OLD.standard,OLD.position) THEN RAISE EXCEPTION 'Reviewer cannot edit submitted work'; END IF;
  IF NEW.status = 'rejected' AND coalesce(length(trim(NEW.review_note)),0) = 0 THEN RAISE EXCEPTION 'A rejection reason is required'; END IF;
  NEW.reviewed_by := auth.uid(); NEW.reviewed_at := now(); NEW.verified_log_id := NULL;
  IF NEW.status = 'approved' THEN
   INSERT INTO public.craft_continuity_logs(company_id,personnel_id,cert_type_code,performed_date,work_reference,verified_by) VALUES (NEW.company_id,NEW.personnel_id,NEW.cert_type_code,NEW.performed_date,NEW.work_reference || CASE WHEN NEW.standard <> '' THEN ' | Standard: ' || NEW.standard ELSE '' END || CASE WHEN NEW.position <> '' THEN ' | Position: ' || NEW.position ELSE '' END,auth.uid()) RETURNING id INTO v_log;
   NEW.verified_log_id := v_log;
  END IF;
 END IF;
 IF NEW.performed_date > current_date OR NEW.performed_date < date '1900-01-01' THEN RAISE EXCEPTION 'Invalid performed date'; END IF;
 IF length(trim(NEW.work_reference)) NOT BETWEEN 1 AND 500 OR length(NEW.standard)>120 OR length(NEW.position)>120 OR coalesce(length(NEW.review_note),0)>1000 THEN RAISE EXCEPTION 'Invalid continuity fields'; END IF;
 IF NOT EXISTS (SELECT 1 FROM public.certification_types WHERE code = NEW.cert_type_code AND requires_continuity AND is_active) THEN RAISE EXCEPTION 'Invalid continuity process'; END IF;
 NEW.updated_at := now(); RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS guard_continuity_submission ON public.continuity_submissions;
CREATE TRIGGER guard_continuity_submission BEFORE INSERT OR UPDATE OR DELETE ON public.continuity_submissions FOR EACH ROW EXECUTE FUNCTION app_internal.guard_continuity_submission();
CREATE OR REPLACE FUNCTION app_internal.freeze_verified_continuity() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$ BEGIN RAISE EXCEPTION 'Verified continuity evidence is append-only'; END; $$;
DROP TRIGGER IF EXISTS freeze_verified_continuity ON public.craft_continuity_logs;
CREATE TRIGGER freeze_verified_continuity BEFORE UPDATE OR DELETE ON public.craft_continuity_logs FOR EACH ROW EXECUTE FUNCTION app_internal.freeze_verified_continuity();