ALTER TABLE public.assets
  ADD COLUMN IF NOT EXISTS site text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS zone text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS bin text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS current_location text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS make_model text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS serial_or_vin text NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS assets_serial_or_vin_idx ON public.assets (serial_or_vin);
CREATE INDEX IF NOT EXISTS assets_current_location_idx ON public.assets (current_location);

CREATE TABLE IF NOT EXISTS public.location_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  asset_tag text NOT NULL DEFAULT '',
  moved_from text NOT NULL DEFAULT '',
  moved_to text NOT NULL,
  moved_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.location_history TO authenticated;
GRANT ALL ON public.location_history TO service_role;
ALTER TABLE public.location_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "location_history_select" ON public.location_history
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "location_history_insert" ON public.location_history
  FOR INSERT TO authenticated WITH CHECK (moved_by = auth.uid());

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  plan text NOT NULL DEFAULT 'free',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_select_own" ON public.profiles
  FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY "profiles_insert_own" ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (id = auth.uid());
CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS update_profiles_updated_at ON public.profiles;
CREATE TRIGGER update_profiles_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.enforce_free_asset_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_plan text;
  asset_count integer;
BEGIN
  IF NEW.owner_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT plan INTO user_plan FROM public.profiles WHERE id = NEW.owner_id;
  IF user_plan IS NOT NULL AND user_plan <> 'free' THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO asset_count FROM public.assets WHERE owner_id = NEW.owner_id;
  IF asset_count >= 3 THEN
    RAISE EXCEPTION 'FREE_PLAN_LIMIT: Free accounts are limited to 3 active assets. Upgrade to Contractor Pro.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_free_asset_limit_trg ON public.assets;
CREATE TRIGGER enforce_free_asset_limit_trg
BEFORE INSERT ON public.assets
FOR EACH ROW EXECUTE FUNCTION public.enforce_free_asset_limit();