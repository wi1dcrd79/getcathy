
-- 1. Draft inspections
ALTER TABLE public.inspections ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'final';
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='inspections_status_check') THEN
    ALTER TABLE public.inspections ADD CONSTRAINT inspections_status_check CHECK (status IN ('draft','final'));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION app_internal.refresh_asset_compliance_status(p_asset_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; bad boolean;
BEGIN
  SELECT result, expiration_date INTO r FROM public.inspections
   WHERE asset_id = p_asset_id AND status = 'final'
   ORDER BY inspection_date DESC, created_at DESC LIMIT 1;
  IF NOT FOUND THEN RETURN; END IF;
  bad := r.result = 'Fail' OR r.expiration_date < current_date;
  IF bad THEN
    UPDATE public.assets SET status = 'out_of_compliance'
     WHERE id = p_asset_id AND status IN ('active','available','in_service');
  ELSE
    UPDATE public.assets SET status = 'active'
     WHERE id = p_asset_id AND status = 'out_of_compliance';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION app_internal.inspections_refresh_asset_status()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP IN ('INSERT','UPDATE') AND NEW.status = 'final' THEN PERFORM app_internal.refresh_asset_compliance_status(NEW.asset_id); END IF;
  IF TG_OP IN ('UPDATE','DELETE') AND OLD.status = 'final' THEN PERFORM app_internal.refresh_asset_compliance_status(OLD.asset_id); END IF;
  RETURN NULL;
END $$;

-- Final inspections can never go back to draft
CREATE OR REPLACE FUNCTION app_internal.block_inspection_unfinalize()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF OLD.status = 'final' AND NEW.status = 'draft' THEN
    RAISE EXCEPTION 'A final inspection cannot be reverted to draft' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_block_inspection_unfinalize ON public.inspections;
CREATE TRIGGER trg_block_inspection_unfinalize BEFORE UPDATE OF status ON public.inspections
  FOR EACH ROW EXECUTE FUNCTION app_internal.block_inspection_unfinalize();

-- Drafts cannot be signed
CREATE OR REPLACE FUNCTION app_internal.block_signing_drafts()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.inspection_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.inspections WHERE id = NEW.inspection_id AND status = 'draft') THEN
    RAISE EXCEPTION 'Draft inspections cannot be signed' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_block_signing_drafts ON public.signatures;
CREATE TRIGGER trg_block_signing_drafts BEFORE INSERT ON public.signatures
  FOR EACH ROW EXECUTE FUNCTION app_internal.block_signing_drafts();

-- 2. Task status ready_for_review + dedupe covers it; ignore drafts
ALTER TABLE public.corrective_actions DROP CONSTRAINT IF EXISTS corrective_actions_status_check;
ALTER TABLE public.corrective_actions ADD CONSTRAINT corrective_actions_status_check
  CHECK (status IN ('open','in_progress','ready_for_review','resolved','verified'));

CREATE OR REPLACE FUNCTION app_internal.assets_schedule_reinspection()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE insp record; assignee uuid;
BEGIN
  IF NEW.status <> 'out_of_compliance' OR OLD.status IS NOT DISTINCT FROM NEW.status OR NEW.company_id IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT id, result, expiration_date INTO insp FROM public.inspections
   WHERE asset_id = NEW.id AND status = 'final' ORDER BY inspection_date DESC, created_at DESC LIMIT 1;
  IF insp.id IS NULL THEN RETURN NULL; END IF;
  IF EXISTS (SELECT 1 FROM public.corrective_actions WHERE asset_id = NEW.id
              AND source_type = 'inspection' AND status IN ('open','in_progress','ready_for_review')
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

-- 3. Assistant grants (write_drafts scope), owner-only
CREATE TABLE IF NOT EXISTS public.assistant_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id text NOT NULL,
  client_name text,
  scope text NOT NULL CHECK (scope IN ('write_drafts')),
  granted_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS assistant_grants_active_uidx
  ON public.assistant_grants (user_id, client_id, scope) WHERE revoked_at IS NULL;
GRANT SELECT, INSERT, UPDATE ON public.assistant_grants TO authenticated;
GRANT ALL ON public.assistant_grants TO service_role;
ALTER TABLE public.assistant_grants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS assistant_grants_own_select ON public.assistant_grants;
CREATE POLICY assistant_grants_own_select ON public.assistant_grants FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS assistant_grants_own_insert ON public.assistant_grants;
CREATE POLICY assistant_grants_own_insert ON public.assistant_grants FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS assistant_grants_own_update ON public.assistant_grants;
CREATE POLICY assistant_grants_own_update ON public.assistant_grants FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- 4. Assistant action audit log (append-only)
CREATE TABLE IF NOT EXISTS public.assistant_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  assistant_id text NOT NULL,
  approving_user_id uuid NOT NULL,
  tool_name text NOT NULL,
  input jsonb NOT NULL DEFAULT '{}'::jsonb,
  result text NOT NULL CHECK (result IN ('success','refused')),
  detail text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS assistant_actions_company_idx ON public.assistant_actions (company_id, created_at DESC);
GRANT SELECT ON public.assistant_actions TO authenticated;
GRANT ALL ON public.assistant_actions TO service_role;
REVOKE INSERT, UPDATE, DELETE ON public.assistant_actions FROM authenticated, anon;
ALTER TABLE public.assistant_actions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS assistant_actions_admin_read ON public.assistant_actions;
CREATE POLICY assistant_actions_admin_read ON public.assistant_actions FOR SELECT TO authenticated
  USING (company_id = app_internal.get_current_company_id()
         AND app_internal.current_user_role() IN ('company_admin','safety_director'));

CREATE OR REPLACE FUNCTION public.log_assistant_action(p_assistant_id text, p_tool text, p_input jsonb, p_result text, p_detail text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501'; END IF;
  INSERT INTO public.assistant_actions (company_id, assistant_id, approving_user_id, tool_name, input, result, detail)
  VALUES ((SELECT company_id FROM public.profiles WHERE id = auth.uid()), coalesce(p_assistant_id,'unknown'),
          auth.uid(), left(p_tool, 100), coalesce(p_input,'{}'::jsonb), p_result, left(p_detail, 500));
END $$;
REVOKE EXECUTE ON FUNCTION public.log_assistant_action(text,text,jsonb,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_assistant_action(text,text,jsonb,text,text) TO authenticated;
