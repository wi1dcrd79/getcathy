-- 1. supervisor_id must reference a real supervisory role in the same company
CREATE OR REPLACE FUNCTION app_internal.enforce_supervisor_same_company()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.supervisor_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = NEW.supervisor_id AND company_id = NEW.company_id
    ) THEN
      RAISE EXCEPTION 'Unauthorized: supervisor_id must reference a profile in the same company_id (%).', NEW.company_id;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = NEW.supervisor_id
        AND role IN ('field_supervisor', 'company_admin', 'safety_director')
    ) THEN
      RAISE EXCEPTION 'Unauthorized: supervisor_id must reference a profile with a supervisory role (field_supervisor, company_admin, safety_director).';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- 2. Crew-scope field_supervisor reads on cert_notifications
DROP POLICY cert_notifications_select ON public.cert_notifications;

CREATE POLICY cert_notifications_select ON public.cert_notifications
  FOR SELECT TO authenticated
  USING (
    app_internal.is_super_admin()
    OR (
      company_id = app_internal.get_current_company_id()
      AND app_internal.current_user_role() IN ('company_admin', 'safety_director')
    )
    OR (
      company_id = app_internal.get_current_company_id()
      AND app_internal.current_user_role() = 'field_supervisor'
      AND EXISTS (
        SELECT 1
        FROM public.personnel_certs pc
        JOIN public.personnel_records pr ON pr.id = pc.personnel_id
        WHERE pc.id = cert_notifications.cert_id
          AND pr.supervisor_id = auth.uid()
      )
    )
    OR (
      company_id = app_internal.get_current_company_id()
      AND app_internal.current_user_role() = 'craftsman'
      AND recipient_email = (SELECT email FROM public.profiles WHERE id = auth.uid())
    )
  );