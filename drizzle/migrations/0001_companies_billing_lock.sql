CREATE OR REPLACE FUNCTION app_internal.enforce_company_billing_lock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, app_internal
AS $$
BEGIN
  IF (auth.jwt() ->> 'role') = 'service_role' THEN RETURN NEW; END IF;
  IF current_user NOT IN ('authenticated', 'anon') THEN RETURN NEW; END IF;
  IF app_internal.is_super_admin() THEN RETURN NEW; END IF;

  IF NEW.subscription_tier   IS DISTINCT FROM OLD.subscription_tier
  OR NEW.subscription_status IS DISTINCT FROM OLD.subscription_status
  OR NEW.seat_limit          IS DISTINCT FROM OLD.seat_limit
  OR NEW.past_due_since      IS DISTINCT FROM OLD.past_due_since
  OR NEW.grace_days          IS DISTINCT FROM OLD.grace_days THEN
    RAISE EXCEPTION 'Unauthorized: billing fields are managed by the billing system.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_enforce_company_billing_lock ON public.companies;
CREATE TRIGGER tr_enforce_company_billing_lock
  BEFORE UPDATE ON public.companies
  FOR EACH ROW EXECUTE FUNCTION app_internal.enforce_company_billing_lock();