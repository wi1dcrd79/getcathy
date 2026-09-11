ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS past_due_since timestamptz,
  ADD COLUMN IF NOT EXISTS grace_days integer NOT NULL DEFAULT 30;

CREATE OR REPLACE FUNCTION public.company_billing_state(_company_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN c.subscription_status = 'past_due'
      AND c.past_due_since IS NOT NULL
      AND now() > c.past_due_since + make_interval(days => c.grace_days) THEN 'grace_expired'
    WHEN c.subscription_status = 'past_due' THEN 'past_due'
    ELSE 'ok'
  END
  FROM public.companies c
  WHERE c.id = _company_id;
$$;

CREATE OR REPLACE FUNCTION public.company_write_locked()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    public.company_billing_state(public.get_current_company_id()) IN ('past_due','grace_expired'),
    false
  ) AND NOT public.is_super_admin();
$$;

CREATE OR REPLACE FUNCTION public.enforce_free_asset_limit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  tier text;
  n int;
BEGIN
  IF NEW.company_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF public.company_billing_state(NEW.company_id) IN ('past_due','grace_expired') THEN
    SELECT count(*) INTO n FROM public.assets WHERE company_id = NEW.company_id;
    IF n >= 3 THEN
      RAISE EXCEPTION 'PAST_DUE_READ_ONLY';
    END IF;
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

DROP POLICY IF EXISTS assets_tenant ON public.assets;

CREATE POLICY assets_select ON public.assets FOR SELECT TO authenticated
  USING ((company_id = public.get_current_company_id()) OR public.is_super_admin());

CREATE POLICY assets_insert ON public.assets FOR INSERT TO authenticated
  WITH CHECK ((company_id = public.get_current_company_id()) OR public.is_super_admin());

CREATE POLICY assets_update ON public.assets FOR UPDATE TO authenticated
  USING (((company_id = public.get_current_company_id()) OR public.is_super_admin()) AND NOT public.company_write_locked())
  WITH CHECK (((company_id = public.get_current_company_id()) OR public.is_super_admin()) AND NOT public.company_write_locked());

CREATE POLICY assets_delete ON public.assets FOR DELETE TO authenticated
  USING (((company_id = public.get_current_company_id()) OR public.is_super_admin()) AND NOT public.company_write_locked());

DROP POLICY IF EXISTS location_history_insert ON public.location_history;

CREATE POLICY location_history_insert ON public.location_history FOR INSERT TO authenticated
  WITH CHECK (
    ((company_id = public.get_current_company_id()) OR public.is_super_admin())
    AND (moved_by = auth.uid())
    AND NOT public.company_write_locked()
  );