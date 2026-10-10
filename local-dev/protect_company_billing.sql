-- Only super-admins or the service role (Paddle webhook) may change billing fields.
CREATE OR REPLACE FUNCTION app_internal.protect_company_billing()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (NEW.subscription_tier IS DISTINCT FROM OLD.subscription_tier
      OR NEW.seat_limit IS DISTINCT FROM OLD.seat_limit
      OR NEW.subscription_status IS DISTINCT FROM OLD.subscription_status)
     AND coalesce(auth.role(), 'service_role') <> 'service_role'
     AND NOT app_internal.is_super_admin() THEN
    RAISE EXCEPTION 'BILLING_FIELDS_LOCKED: plan changes go through checkout'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS tr_protect_company_billing ON public.companies;
CREATE TRIGGER tr_protect_company_billing
  BEFORE UPDATE ON public.companies
  FOR EACH ROW EXECUTE FUNCTION app_internal.protect_company_billing();
