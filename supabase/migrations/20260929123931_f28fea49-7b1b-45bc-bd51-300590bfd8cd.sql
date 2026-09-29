ALTER TABLE public.audit_binders ADD COLUMN IF NOT EXISTS snapshot jsonb;

-- Freeze: once compiled, the snapshot/hash can't change; once signed, nothing but status->superseded.
CREATE OR REPLACE FUNCTION app_internal.enforce_audit_binder_freeze()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF OLD.status IN ('compiled','signed','superseded') AND (
       NEW.snapshot IS DISTINCT FROM OLD.snapshot
    OR NEW.content_sha256 IS DISTINCT FROM OLD.content_sha256
    OR NEW.pdf_storage_path IS DISTINCT FROM OLD.pdf_storage_path) THEN
    RAISE EXCEPTION 'Compiled audit binders are frozen. Edits must spawn a new binder version.';
  END IF;
  IF OLD.status = 'signed' AND NEW.status NOT IN ('signed','superseded') THEN
    RAISE EXCEPTION 'A signed audit binder cannot return to %.', NEW.status;
  END IF;
  IF OLD.status = 'superseded' AND NEW.status <> 'superseded' THEN
    RAISE EXCEPTION 'A superseded audit binder is terminal.';
  END IF;
  IF NEW.status = 'signed' AND OLD.status <> 'signed'
     AND NOT EXISTS (SELECT 1 FROM public.signatures WHERE audit_binder_id = OLD.id) THEN
    RAISE EXCEPTION 'A binder can only become signed through a verified sign-off.';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;

-- Binder-level sign-off flips the binder to signed and supersedes older versions.
CREATE OR REPLACE FUNCTION app_internal.signatures_apply_binder_signoff()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v int;
BEGIN
  IF NEW.audit_binder_id IS NULL THEN RETURN NULL; END IF;
  UPDATE public.audit_binders SET status = 'signed'
   WHERE id = NEW.audit_binder_id AND status = 'compiled' RETURNING version INTO v;
  IF v IS NOT NULL THEN
    UPDATE public.audit_binders SET status = 'superseded'
     WHERE company_id = NEW.company_id AND id <> NEW.audit_binder_id
       AND version < v AND status IN ('compiled','signed');
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_signatures_apply_binder_signoff ON public.signatures;
CREATE TRIGGER trg_signatures_apply_binder_signoff AFTER INSERT ON public.signatures
FOR EACH ROW EXECUTE FUNCTION app_internal.signatures_apply_binder_signoff();

-- Auto re-inspect: when an asset flips out of compliance, open a P1 re-inspection
-- action assigned to a QC inspector / field supervisor (fallback safety director, admin).
CREATE OR REPLACE FUNCTION app_internal.assets_schedule_reinspection()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE insp record; assignee uuid;
BEGIN
  IF NEW.status <> 'out_of_compliance' OR OLD.status IS NOT DISTINCT FROM NEW.status OR NEW.company_id IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT id, result, expiration_date INTO insp FROM public.inspections
   WHERE asset_id = NEW.id ORDER BY inspection_date DESC, created_at DESC LIMIT 1;
  IF insp.id IS NULL THEN RETURN NULL; END IF;
  IF EXISTS (SELECT 1 FROM public.corrective_actions WHERE asset_id = NEW.id
              AND source_type = 'inspection' AND status IN ('open','in_progress')
              AND description LIKE 'Re-inspection required%') THEN
    RETURN NULL;
  END IF;
  SELECT id INTO assignee FROM public.profiles WHERE company_id = NEW.company_id
   AND role IN ('qc_inspector','field_supervisor','safety_director','company_admin')
   ORDER BY CASE role WHEN 'qc_inspector' THEN 1 WHEN 'field_supervisor' THEN 2
                      WHEN 'safety_director' THEN 3 ELSE 4 END, created_at LIMIT 1;
  INSERT INTO public.corrective_actions
    (company_id, source_type, source_id, asset_id, priority, description, assigned_to, due_date, status)
  VALUES (NEW.company_id, 'inspection', insp.id, NEW.id, 'P1',
    'Re-inspection required: ' || NEW.asset_tag || ' ' ||
      CASE WHEN insp.result = 'Fail' THEN 'failed its last inspection'
           ELSE 'inspection expired ' || insp.expiration_date::text END,
    assignee, now() + interval '3 days', 'open');
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_assets_schedule_reinspection ON public.assets;
CREATE TRIGGER trg_assets_schedule_reinspection AFTER UPDATE OF status ON public.assets
FOR EACH ROW EXECUTE FUNCTION app_internal.assets_schedule_reinspection();

REVOKE ALL ON FUNCTION app_internal.signatures_apply_binder_signoff() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app_internal.assets_schedule_reinspection() FROM PUBLIC, anon, authenticated;