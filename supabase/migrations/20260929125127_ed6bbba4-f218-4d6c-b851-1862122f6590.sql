
DROP FUNCTION IF EXISTS public.log_assistant_action(text,text,jsonb,text,text);
CREATE OR REPLACE FUNCTION app_internal.stamp_assistant_action()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    NEW.approving_user_id := auth.uid();
    NEW.company_id := (SELECT company_id FROM public.profiles WHERE id = auth.uid());
  END IF;
  NEW.created_at := now();
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_stamp_assistant_action ON public.assistant_actions;
CREATE TRIGGER trg_stamp_assistant_action BEFORE INSERT ON public.assistant_actions
  FOR EACH ROW EXECUTE FUNCTION app_internal.stamp_assistant_action();
ALTER TABLE public.assistant_actions ALTER COLUMN approving_user_id SET DEFAULT auth.uid();
GRANT INSERT ON public.assistant_actions TO authenticated;
DROP POLICY IF EXISTS assistant_actions_self_insert ON public.assistant_actions;
CREATE POLICY assistant_actions_self_insert ON public.assistant_actions FOR INSERT TO authenticated
  WITH CHECK (approving_user_id = auth.uid());
