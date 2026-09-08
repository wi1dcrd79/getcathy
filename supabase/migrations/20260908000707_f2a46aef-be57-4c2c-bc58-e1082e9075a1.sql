-- 1. COMPANIES ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  stripe_customer_id text,
  stripe_subscription_id text,
  subscription_tier text NOT NULL DEFAULT 'free',
  subscription_status text NOT NULL DEFAULT 'active',
  seat_limit int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.companies TO authenticated;
GRANT ALL ON public.companies TO service_role;
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

-- 2. PROFILES --------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'company_admin',
  ADD COLUMN IF NOT EXISTS is_super_admin boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS current_session_token text;
CREATE INDEX IF NOT EXISTS profiles_company_id_idx ON public.profiles (company_id);

-- 3. HELPERS (SECURITY DEFINER, no recursion) ------------------------------
CREATE OR REPLACE FUNCTION public.get_current_company_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE cid uuid;
BEGIN
  SELECT company_id INTO cid FROM public.profiles WHERE id = auth.uid();
  RETURN cid;
END;
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT is_super_admin FROM public.profiles WHERE id = auth.uid()), false);
$$;

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT role FROM public.profiles WHERE id = auth.uid()), 'craftsman');
$$;

CREATE OR REPLACE FUNCTION public.can_write_compliance()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.current_user_role() IN ('company_admin','safety_director','qc_inspector')
      OR public.is_super_admin();
$$;

REVOKE ALL ON FUNCTION public.get_current_company_id() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_super_admin() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.current_user_role() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_write_compliance() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_current_company_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_write_compliance() TO authenticated;
REVOKE ALL ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_free_asset_limit() FROM PUBLIC, anon, authenticated;

-- 4. BOOTSTRAP (called by the app right after sign-in) ---------------------
CREATE OR REPLACE FUNCTION public.bootstrap_current_user()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  uemail text;
  cid uuid;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT company_id INTO cid FROM public.profiles WHERE id = uid;
  IF cid IS NOT NULL THEN
    RETURN cid;
  END IF;

  SELECT email INTO uemail FROM auth.users WHERE id = uid;

  INSERT INTO public.companies (name, subscription_tier, subscription_status, seat_limit)
  VALUES (SPLIT_PART(COALESCE(uemail,'new'), '@', 1) || ' Co', 'free', 'active', 1)
  RETURNING id INTO cid;

  INSERT INTO public.profiles (id, company_id, email, role, is_super_admin, plan)
  VALUES (uid, cid, uemail, 'company_admin', COALESCE(uemail,'') = 'w1dcrd79@gmail.com', 'free')
  ON CONFLICT (id) DO UPDATE
    SET company_id = EXCLUDED.company_id,
        email = EXCLUDED.email,
        is_super_admin = EXCLUDED.is_super_admin;

  RETURN cid;
END;
$$;
REVOKE ALL ON FUNCTION public.bootstrap_current_user() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bootstrap_current_user() TO authenticated;

CREATE OR REPLACE FUNCTION public.rotate_session_token(_token text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.profiles SET current_session_token = _token WHERE id = auth.uid();
$$;
REVOKE ALL ON FUNCTION public.rotate_session_token(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rotate_session_token(text) TO authenticated;

-- 5. COMPANY_ID ON EXISTING TABLES ----------------------------------------
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';
ALTER TABLE public.inspections ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.inspections ADD COLUMN IF NOT EXISTS inspection_type text NOT NULL DEFAULT 'periodic';
ALTER TABLE public.inspections ADD COLUMN IF NOT EXISTS inspected_by uuid;
ALTER TABLE public.welder_qualifications ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.location_history ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE;

DO $$
DECLARE demo uuid;
BEGIN
  SELECT id INTO demo FROM public.companies WHERE name = 'Demo Yard Co';
  IF demo IS NULL THEN
    INSERT INTO public.companies (name, subscription_tier, seat_limit)
    VALUES ('Demo Yard Co', 'pro', 5) RETURNING id INTO demo;
  END IF;
  UPDATE public.assets SET company_id = demo WHERE company_id IS NULL;
  UPDATE public.inspections SET company_id = demo WHERE company_id IS NULL;
  UPDATE public.welder_qualifications SET company_id = demo WHERE company_id IS NULL;
  UPDATE public.location_history SET company_id = demo WHERE company_id IS NULL;
END $$;

CREATE INDEX IF NOT EXISTS assets_company_id_idx ON public.assets (company_id);
CREATE INDEX IF NOT EXISTS inspections_company_id_idx ON public.inspections (company_id);
CREATE INDEX IF NOT EXISTS welders_company_id_idx ON public.welder_qualifications (company_id);
CREATE INDEX IF NOT EXISTS location_history_company_id_idx ON public.location_history (company_id);

-- 6. NEW CORE TABLES -------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.personnel_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  first_name text NOT NULL,
  last_name text NOT NULL,
  employee_id text NOT NULL,
  trade_title text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.personnel_records TO authenticated;
GRANT ALL ON public.personnel_records TO service_role;
ALTER TABLE public.personnel_records ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS personnel_records_company_id_idx ON public.personnel_records (company_id);

CREATE TABLE IF NOT EXISTS public.personnel_certs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  personnel_id uuid NOT NULL REFERENCES public.personnel_records(id) ON DELETE CASCADE,
  cert_name text NOT NULL,
  cert_number text,
  issue_date date NOT NULL,
  expiration_date date,
  verified_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.personnel_certs TO authenticated;
GRANT ALL ON public.personnel_certs TO service_role;
ALTER TABLE public.personnel_certs ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS personnel_certs_company_id_idx ON public.personnel_certs (company_id);

CREATE TABLE IF NOT EXISTS public.custom_trades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  trade_name text NOT NULL,
  recurrence_months int NOT NULL DEFAULT 12,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.custom_trades TO authenticated;
GRANT ALL ON public.custom_trades TO service_role;
ALTER TABLE public.custom_trades ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS custom_trades_company_id_idx ON public.custom_trades (company_id);

-- 7. RLS POLICIES ----------------------------------------------------------
DROP POLICY IF EXISTS assets_select ON public.assets;
DROP POLICY IF EXISTS assets_insert ON public.assets;
DROP POLICY IF EXISTS assets_update ON public.assets;
DROP POLICY IF EXISTS assets_delete ON public.assets;
DROP POLICY IF EXISTS inspections_select ON public.inspections;
DROP POLICY IF EXISTS inspections_insert ON public.inspections;
DROP POLICY IF EXISTS inspections_update ON public.inspections;
DROP POLICY IF EXISTS inspections_delete ON public.inspections;
DROP POLICY IF EXISTS welders_select ON public.welder_qualifications;
DROP POLICY IF EXISTS welders_insert ON public.welder_qualifications;
DROP POLICY IF EXISTS welders_update ON public.welder_qualifications;
DROP POLICY IF EXISTS welders_delete ON public.welder_qualifications;
DROP POLICY IF EXISTS location_history_select ON public.location_history;
DROP POLICY IF EXISTS location_history_insert ON public.location_history;
DROP POLICY IF EXISTS profiles_select_own ON public.profiles;
DROP POLICY IF EXISTS profiles_insert_own ON public.profiles;
DROP POLICY IF EXISTS profiles_update_own ON public.profiles;

CREATE POLICY profiles_select ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid() OR is_super_admin = true OR company_id = public.get_current_company_id());
CREATE POLICY profiles_insert ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (id = auth.uid());
CREATE POLICY profiles_update ON public.profiles
  FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());

CREATE POLICY companies_select ON public.companies
  FOR SELECT TO authenticated
  USING (id = public.get_current_company_id() OR public.is_super_admin());
CREATE POLICY companies_update ON public.companies
  FOR UPDATE TO authenticated
  USING (public.is_super_admin() OR (id = public.get_current_company_id() AND public.current_user_role() = 'company_admin'))
  WITH CHECK (public.is_super_admin() OR id = public.get_current_company_id());

CREATE POLICY assets_tenant ON public.assets
  FOR ALL TO authenticated
  USING (company_id = public.get_current_company_id() OR public.is_super_admin())
  WITH CHECK (company_id = public.get_current_company_id() OR public.is_super_admin());

CREATE POLICY welders_tenant ON public.welder_qualifications
  FOR ALL TO authenticated
  USING (company_id = public.get_current_company_id() OR public.is_super_admin())
  WITH CHECK (company_id = public.get_current_company_id() OR public.is_super_admin());

CREATE POLICY personnel_records_tenant ON public.personnel_records
  FOR ALL TO authenticated
  USING (company_id = public.get_current_company_id() OR public.is_super_admin())
  WITH CHECK (company_id = public.get_current_company_id() OR public.is_super_admin());

CREATE POLICY custom_trades_tenant ON public.custom_trades
  FOR ALL TO authenticated
  USING (company_id = public.get_current_company_id() OR public.is_super_admin())
  WITH CHECK (company_id = public.get_current_company_id() OR public.is_super_admin());

-- immutable audit trail: read + append only
CREATE POLICY location_history_select ON public.location_history
  FOR SELECT TO authenticated
  USING (company_id = public.get_current_company_id() OR public.is_super_admin());
CREATE POLICY location_history_insert ON public.location_history
  FOR INSERT TO authenticated
  WITH CHECK ((company_id = public.get_current_company_id() OR public.is_super_admin()) AND moved_by = auth.uid());

-- compliance writes restricted by role; craftsman is read-only
CREATE POLICY personnel_certs_select ON public.personnel_certs
  FOR SELECT TO authenticated
  USING (company_id = public.get_current_company_id() OR public.is_super_admin());
CREATE POLICY personnel_certs_write ON public.personnel_certs
  FOR INSERT TO authenticated
  WITH CHECK ((company_id = public.get_current_company_id() OR public.is_super_admin()) AND public.can_write_compliance());
CREATE POLICY personnel_certs_update ON public.personnel_certs
  FOR UPDATE TO authenticated
  USING ((company_id = public.get_current_company_id() OR public.is_super_admin()) AND public.can_write_compliance())
  WITH CHECK (company_id = public.get_current_company_id() OR public.is_super_admin());
CREATE POLICY personnel_certs_delete ON public.personnel_certs
  FOR DELETE TO authenticated
  USING ((company_id = public.get_current_company_id() OR public.is_super_admin()) AND public.can_write_compliance());

CREATE POLICY inspections_select ON public.inspections
  FOR SELECT TO authenticated
  USING (company_id = public.get_current_company_id() OR public.is_super_admin());
CREATE POLICY inspections_write ON public.inspections
  FOR INSERT TO authenticated
  WITH CHECK ((company_id = public.get_current_company_id() OR public.is_super_admin()) AND public.can_write_compliance());
CREATE POLICY inspections_update ON public.inspections
  FOR UPDATE TO authenticated
  USING ((company_id = public.get_current_company_id() OR public.is_super_admin()) AND public.can_write_compliance())
  WITH CHECK (company_id = public.get_current_company_id() OR public.is_super_admin());
CREATE POLICY inspections_delete ON public.inspections
  FOR DELETE TO authenticated
  USING ((company_id = public.get_current_company_id() OR public.is_super_admin()) AND public.can_write_compliance());

-- 8. LIMITS ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_free_asset_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  tier text;
  n int;
BEGIN
  IF NEW.company_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT subscription_tier INTO tier FROM public.companies WHERE id = NEW.company_id;
  IF tier IS DISTINCT FROM 'free' THEN
    RETURN NEW;
  END IF;
  SELECT count(*) INTO n FROM public.assets WHERE company_id = NEW.company_id;
  IF n >= 3 THEN
    RAISE EXCEPTION 'FREE_PLAN_LIMIT';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.enforce_free_asset_limit() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS enforce_free_asset_limit_trg ON public.assets;
CREATE TRIGGER enforce_free_asset_limit_trg
BEFORE INSERT ON public.assets
FOR EACH ROW EXECUTE FUNCTION public.enforce_free_asset_limit();

CREATE OR REPLACE FUNCTION public.enforce_seat_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  seats int;
  used int;
BEGIN
  IF NEW.company_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT seat_limit INTO seats FROM public.companies WHERE id = NEW.company_id;
  SELECT count(*) INTO used FROM public.profiles WHERE company_id = NEW.company_id AND id <> NEW.id;
  IF seats IS NOT NULL AND used >= seats THEN
    RAISE EXCEPTION 'SEAT_LIMIT';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.enforce_seat_limit() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS enforce_seat_limit_trg ON public.profiles;
CREATE TRIGGER enforce_seat_limit_trg
BEFORE INSERT ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.enforce_seat_limit();