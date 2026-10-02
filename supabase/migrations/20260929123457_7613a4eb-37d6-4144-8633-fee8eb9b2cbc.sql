CREATE OR REPLACE FUNCTION app_internal.refresh_asset_compliance_status(p_asset_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; bad boolean;
BEGIN
  SELECT result, expiration_date INTO r FROM public.inspections
   WHERE asset_id = p_asset_id ORDER BY inspection_date DESC, created_at DESC LIMIT 1;
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
  IF TG_OP IN ('INSERT','UPDATE') THEN PERFORM app_internal.refresh_asset_compliance_status(NEW.asset_id); END IF;
  IF TG_OP IN ('UPDATE','DELETE') THEN PERFORM app_internal.refresh_asset_compliance_status(OLD.asset_id); END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_inspections_refresh_asset_status ON public.inspections;
CREATE TRIGGER trg_inspections_refresh_asset_status
AFTER INSERT OR UPDATE OR DELETE ON public.inspections
FOR EACH ROW EXECUTE FUNCTION app_internal.inspections_refresh_asset_status();

CREATE OR REPLACE FUNCTION app_internal.sweep_asset_compliance_status()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a uuid; n integer := 0;
BEGIN
  FOR a IN SELECT DISTINCT asset_id FROM public.inspections LOOP
    PERFORM app_internal.refresh_asset_compliance_status(a); n := n + 1;
  END LOOP;
  RETURN n;
END $$;

REVOKE ALL ON FUNCTION app_internal.refresh_asset_compliance_status(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app_internal.inspections_refresh_asset_status() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app_internal.sweep_asset_compliance_status() FROM PUBLIC, anon, authenticated;

CREATE EXTENSION IF NOT EXISTS pg_cron;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sweep-asset-compliance-status') THEN
    PERFORM cron.unschedule('sweep-asset-compliance-status');
  END IF;
  PERFORM cron.schedule('sweep-asset-compliance-status', '5 0 * * *', 'SELECT app_internal.sweep_asset_compliance_status()');
END $$;