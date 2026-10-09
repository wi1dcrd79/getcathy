-- Pro asset cap: Free = 3 assets, Field Yard Pro = 15, Enterprise = unlimited.
-- FILE ONLY. Already applied manually by the owner; intended path:
-- supabase/migrations/20261009000100_pro_asset_limit.sql
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
  SELECT COALESCE(subscription_tier, 'free') INTO tier FROM public.companies WHERE id = NEW.company_id;
  SELECT count(*) INTO n FROM public.assets WHERE company_id = NEW.company_id;
  IF tier = 'free' AND n >= 3 THEN RAISE EXCEPTION 'FREE_PLAN_LIMIT'; END IF;
  IF tier = 'pro' AND n >= 15 THEN RAISE EXCEPTION 'PRO_PLAN_LIMIT'; END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION app_internal.enforce_free_asset_limit() FROM PUBLIC, anon, authenticated;
