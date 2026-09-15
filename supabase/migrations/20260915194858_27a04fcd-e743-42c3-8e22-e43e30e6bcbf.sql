
CREATE SCHEMA IF NOT EXISTS app_internal;
REVOKE ALL ON SCHEMA app_internal FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA app_internal TO authenticated, service_role;

-- helpers
CREATE OR REPLACE FUNCTION app_internal.is_super_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT is_super_admin FROM public.profiles WHERE id = auth.uid()), false);
$$;

CREATE OR REPLACE FUNCTION app_internal.current_user_role()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT role FROM public.profiles WHERE id = auth.uid()), 'craftsman');
$$;

CREATE OR REPLACE FUNCTION app_internal.get_current_company_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT company_id FROM public.profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION app_internal.can_write_compliance()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT app_internal.current_user_role() IN ('company_admin','safety_director','qc_inspector')
      OR app_internal.is_super_admin();
$$;

CREATE OR REPLACE FUNCTION app_internal.company_billing_state(_company_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN c.subscription_status = 'past_due'
      AND c.past_due_since IS NOT NULL
      AND now() > c.past_due_since + make_interval(days => c.grace_days) THEN 'grace_expired'
    WHEN c.subscription_status = 'past_due' THEN 'past_due'
    ELSE 'ok'
  END
  FROM public.companies c WHERE c.id = _company_id;
$$;

CREATE OR REPLACE FUNCTION app_internal.company_write_locked()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    app_internal.company_billing_state(app_internal.get_current_company_id()) IN ('past_due','grace_expired'),
    false
  ) AND NOT app_internal.is_super_admin();
$$;

-- trigger functions
CREATE OR REPLACE FUNCTION app_internal.update_updated_at_column()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE OR REPLACE FUNCTION app_internal.enforce_seat_limit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE seats int; used int;
BEGIN
  IF NEW.company_id IS NULL THEN RETURN NEW; END IF;
  SELECT seat_limit INTO seats FROM public.companies WHERE id = NEW.company_id;
  SELECT count(*) INTO used FROM public.profiles WHERE company_id = NEW.company_id AND id <> NEW.id;
  IF seats IS NOT NULL AND used >= seats THEN RAISE EXCEPTION 'SEAT_LIMIT'; END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION app_internal.enforce_free_asset_limit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE tier text; n int;
BEGIN
  IF NEW.company_id IS NULL THEN RETURN NEW; END IF;
  IF app_internal.company_billing_state(NEW.company_id) IN ('past_due','grace_expired') THEN
    SELECT count(*) INTO n FROM public.assets WHERE company_id = NEW.company_id;
    IF n >= 3 THEN RAISE EXCEPTION 'PAST_DUE_READ_ONLY'; END IF;
    RETURN NEW;
  END IF;
  SELECT subscription_tier INTO tier FROM public.companies WHERE id = NEW.company_id;
  IF tier IS DISTINCT FROM 'free' THEN RETURN NEW; END IF;
  SELECT count(*) INTO n FROM public.assets WHERE company_id = NEW.company_id;
  IF n >= 3 THEN RAISE EXCEPTION 'FREE_PLAN_LIMIT'; END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION app_internal.enforce_profile_security()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (auth.jwt() ->> 'role') = 'service_role' THEN RETURN NEW; END IF;
  IF current_user NOT IN ('authenticated', 'anon') THEN RETURN NEW; END IF;

  IF TG_OP = 'INSERT' THEN
    IF coalesce(NEW.is_super_admin, false) = true THEN
      RAISE EXCEPTION 'Unauthorized: Cannot self-assign is_super_admin on account creation.';
    END IF;
    IF NEW.id IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'Unauthorized: Profile ID must match auth.uid().';
    END IF;
    IF NEW.role IS NULL OR NEW.role NOT IN ('operator', 'field_tech', 'viewer') THEN
      NEW.role := 'operator';
    END IF;
    NEW.company_id := NULL;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.is_super_admin IS DISTINCT FROM OLD.is_super_admin THEN
      RAISE EXCEPTION 'Unauthorized: You cannot modify is_super_admin status.';
    END IF;
    IF NEW.company_id IS DISTINCT FROM OLD.company_id THEN
      RAISE EXCEPTION 'Unauthorized: Tenant company reassignment is strictly prohibited.';
    END IF;
    IF NEW.role IS DISTINCT FROM OLD.role THEN
      IF NOT (
        app_internal.is_super_admin()
        OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND company_id = OLD.company_id AND role = 'company_admin')
      ) THEN
        RAISE EXCEPTION 'Unauthorized: Only a verified company admin can modify roles.';
      END IF;
    END IF;
    RETURN NEW;
  END IF;
  RETURN NEW;
END; $$;

REVOKE ALL ON FUNCTION app_internal.update_updated_at_column(), app_internal.enforce_seat_limit(), app_internal.enforce_free_asset_limit(), app_internal.enforce_profile_security() FROM PUBLIC, anon, authenticated;

-- rebind triggers
DROP TRIGGER IF EXISTS enforce_free_asset_limit_trg ON public.assets;
CREATE TRIGGER enforce_free_asset_limit_trg BEFORE INSERT ON public.assets FOR EACH ROW EXECUTE FUNCTION app_internal.enforce_free_asset_limit();
DROP TRIGGER IF EXISTS enforce_seat_limit_trg ON public.profiles;
CREATE TRIGGER enforce_seat_limit_trg BEFORE INSERT ON public.profiles FOR EACH ROW EXECUTE FUNCTION app_internal.enforce_seat_limit();
DROP TRIGGER IF EXISTS tr_enforce_profile_security ON public.profiles;
CREATE TRIGGER tr_enforce_profile_security BEFORE INSERT OR UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION app_internal.enforce_profile_security();
DROP TRIGGER IF EXISTS update_profiles_updated_at ON public.profiles;
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION app_internal.update_updated_at_column();

-- repoint policies
DROP POLICY IF EXISTS assets_select ON public.assets;
CREATE POLICY assets_select ON public.assets FOR SELECT TO authenticated
USING ((company_id = app_internal.get_current_company_id()) OR app_internal.is_super_admin());
DROP POLICY IF EXISTS assets_insert ON public.assets;
CREATE POLICY assets_insert ON public.assets FOR INSERT TO authenticated
WITH CHECK ((company_id = app_internal.get_current_company_id()) OR app_internal.is_super_admin());
DROP POLICY IF EXISTS assets_update ON public.assets;
CREATE POLICY assets_update ON public.assets FOR UPDATE TO authenticated
USING (((company_id = app_internal.get_current_company_id()) OR app_internal.is_super_admin()) AND NOT app_internal.company_write_locked())
WITH CHECK (((company_id = app_internal.get_current_company_id()) OR app_internal.is_super_admin()) AND NOT app_internal.company_write_locked());
DROP POLICY IF EXISTS assets_delete ON public.assets;
CREATE POLICY assets_delete ON public.assets FOR DELETE TO authenticated
USING (((company_id = app_internal.get_current_company_id()) OR app_internal.is_super_admin()) AND NOT app_internal.company_write_locked());

DROP POLICY IF EXISTS companies_select ON public.companies;
CREATE POLICY companies_select ON public.companies FOR SELECT TO authenticated
USING ((id = app_internal.get_current_company_id()) OR app_internal.is_super_admin());
DROP POLICY IF EXISTS companies_update ON public.companies;
CREATE POLICY companies_update ON public.companies FOR UPDATE TO authenticated
USING (app_internal.is_super_admin() OR ((id = app_internal.get_current_company_id()) AND app_internal.current_user_role() = 'company_admin'))
WITH CHECK (app_internal.is_super_admin() OR (id = app_internal.get_current_company_id()));

DROP POLICY IF EXISTS custom_trades_select ON public.custom_trades;
CREATE POLICY custom_trades_select ON public.custom_trades FOR SELECT TO authenticated
USING (company_id = app_internal.get_current_company_id());
DROP POLICY IF EXISTS custom_trades_modify ON public.custom_trades;
CREATE POLICY custom_trades_modify ON public.custom_trades FOR ALL TO authenticated
USING (company_id = app_internal.get_current_company_id() AND NOT app_internal.company_write_locked() AND (app_internal.can_write_compliance() OR app_internal.is_super_admin()))
WITH CHECK (company_id = app_internal.get_current_company_id() AND NOT app_internal.company_write_locked() AND (app_internal.can_write_compliance() OR app_internal.is_super_admin()));

DROP POLICY IF EXISTS inspections_select ON public.inspections;
CREATE POLICY inspections_select ON public.inspections FOR SELECT TO authenticated
USING ((company_id = app_internal.get_current_company_id()) OR app_internal.is_super_admin());
DROP POLICY IF EXISTS inspections_write ON public.inspections;
CREATE POLICY inspections_write ON public.inspections FOR INSERT TO authenticated
WITH CHECK (((company_id = app_internal.get_current_company_id()) OR app_internal.is_super_admin()) AND app_internal.can_write_compliance());
DROP POLICY IF EXISTS inspections_update ON public.inspections;
CREATE POLICY inspections_update ON public.inspections FOR UPDATE TO authenticated
USING (((company_id = app_internal.get_current_company_id()) OR app_internal.is_super_admin()) AND app_internal.can_write_compliance())
WITH CHECK ((company_id = app_internal.get_current_company_id()) OR app_internal.is_super_admin());
DROP POLICY IF EXISTS inspections_delete ON public.inspections;
CREATE POLICY inspections_delete ON public.inspections FOR DELETE TO authenticated
USING (((company_id = app_internal.get_current_company_id()) OR app_internal.is_super_admin()) AND app_internal.can_write_compliance());

DROP POLICY IF EXISTS location_history_select ON public.location_history;
CREATE POLICY location_history_select ON public.location_history FOR SELECT TO authenticated
USING ((company_id = app_internal.get_current_company_id()) OR app_internal.is_super_admin());
DROP POLICY IF EXISTS location_history_insert ON public.location_history;
CREATE POLICY location_history_insert ON public.location_history FOR INSERT TO authenticated
WITH CHECK (((company_id = app_internal.get_current_company_id()) OR app_internal.is_super_admin()) AND moved_by = auth.uid() AND NOT app_internal.company_write_locked());

DROP POLICY IF EXISTS personnel_certs_select ON public.personnel_certs;
CREATE POLICY personnel_certs_select ON public.personnel_certs FOR SELECT TO authenticated
USING ((company_id = app_internal.get_current_company_id()) OR app_internal.is_super_admin());
DROP POLICY IF EXISTS personnel_certs_write ON public.personnel_certs;
CREATE POLICY personnel_certs_write ON public.personnel_certs FOR INSERT TO authenticated
WITH CHECK (((company_id = app_internal.get_current_company_id()) OR app_internal.is_super_admin()) AND (app_internal.can_write_compliance() OR (approval_status = 'pending' AND submitted_by = auth.uid())));
DROP POLICY IF EXISTS personnel_certs_update ON public.personnel_certs;
CREATE POLICY personnel_certs_update ON public.personnel_certs FOR UPDATE TO authenticated
USING (((company_id = app_internal.get_current_company_id()) OR app_internal.is_super_admin()) AND app_internal.can_write_compliance())
WITH CHECK ((company_id = app_internal.get_current_company_id()) OR app_internal.is_super_admin());
DROP POLICY IF EXISTS personnel_certs_delete ON public.personnel_certs;
CREATE POLICY personnel_certs_delete ON public.personnel_certs FOR DELETE TO authenticated
USING (((company_id = app_internal.get_current_company_id()) OR app_internal.is_super_admin()) AND app_internal.can_write_compliance());

DROP POLICY IF EXISTS personnel_records_select ON public.personnel_records;
CREATE POLICY personnel_records_select ON public.personnel_records FOR SELECT TO authenticated
USING (company_id = app_internal.get_current_company_id());
DROP POLICY IF EXISTS personnel_records_modify ON public.personnel_records;
CREATE POLICY personnel_records_modify ON public.personnel_records FOR ALL TO authenticated
USING (company_id = app_internal.get_current_company_id() AND NOT app_internal.company_write_locked() AND (app_internal.can_write_compliance() OR app_internal.is_super_admin()))
WITH CHECK (company_id = app_internal.get_current_company_id() AND NOT app_internal.company_write_locked() AND (app_internal.can_write_compliance() OR app_internal.is_super_admin()));

DROP POLICY IF EXISTS profiles_select ON public.profiles;
CREATE POLICY profiles_select ON public.profiles FOR SELECT TO authenticated
USING ((id = auth.uid()) OR (is_super_admin = true) OR (company_id = app_internal.get_current_company_id()));

DROP POLICY IF EXISTS subscriptions_select ON public.subscriptions;
CREATE POLICY subscriptions_select ON public.subscriptions FOR SELECT TO authenticated
USING ((user_id = auth.uid()) OR (company_id = app_internal.get_current_company_id()) OR app_internal.is_super_admin());

DROP POLICY IF EXISTS welders_select ON public.welder_qualifications;
CREATE POLICY welders_select ON public.welder_qualifications FOR SELECT TO authenticated
USING (company_id = app_internal.get_current_company_id());
DROP POLICY IF EXISTS welders_modify ON public.welder_qualifications;
CREATE POLICY welders_modify ON public.welder_qualifications FOR ALL TO authenticated
USING (company_id = app_internal.get_current_company_id() AND NOT app_internal.company_write_locked() AND (app_internal.can_write_compliance() OR app_internal.is_super_admin()))
WITH CHECK (company_id = app_internal.get_current_company_id() AND NOT app_internal.company_write_locked() AND (app_internal.can_write_compliance() OR app_internal.is_super_admin()));

-- bootstrap keeps working (client RPC stays in public)
CREATE OR REPLACE FUNCTION public.bootstrap_current_user()
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  uemail text;
  cid uuid;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT company_id INTO cid FROM public.profiles WHERE id = uid;
  IF cid IS NOT NULL THEN RETURN cid; END IF;
  SELECT email INTO uemail FROM auth.users WHERE id = uid;
  INSERT INTO public.companies (name, subscription_tier, subscription_status, seat_limit)
  VALUES (SPLIT_PART(COALESCE(uemail,'new'), '@', 1) || ' Co', 'free', 'active', 1)
  RETURNING id INTO cid;
  INSERT INTO public.profiles (id, company_id, email, role, is_super_admin, plan)
  VALUES (uid, cid, uemail, 'company_admin', COALESCE(uemail,'') = 'w1dcrd79@gmail.com', 'free')
  ON CONFLICT (id) DO UPDATE
    SET company_id = EXCLUDED.company_id, email = EXCLUDED.email, is_super_admin = EXCLUDED.is_super_admin;
  RETURN cid;
END; $$;

-- remove the publicly exposed copies
DROP FUNCTION IF EXISTS public.company_write_locked();
DROP FUNCTION IF EXISTS public.can_write_compliance();
DROP FUNCTION IF EXISTS public.company_billing_state(uuid);
DROP FUNCTION IF EXISTS public.get_current_company_id();
DROP FUNCTION IF EXISTS public.current_user_role();
DROP FUNCTION IF EXISTS public.is_super_admin();
DROP FUNCTION IF EXISTS public.prevent_profile_privilege_escalation();
DROP FUNCTION IF EXISTS public.enforce_profile_security();
DROP FUNCTION IF EXISTS public.enforce_free_asset_limit();
DROP FUNCTION IF EXISTS public.enforce_seat_limit();
