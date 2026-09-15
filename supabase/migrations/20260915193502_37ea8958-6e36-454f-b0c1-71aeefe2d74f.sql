CREATE OR REPLACE FUNCTION public.prevent_profile_privilege_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Allow the service_role (backend admin functions) to update anything
  IF (auth.jwt() ->> 'role') = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- Block altering 'is_super_admin' except the provisioning path, which may
  -- only set it to the value derived from the hardcoded super-admin email.
  IF NEW.is_super_admin IS DISTINCT FROM OLD.is_super_admin THEN
    IF NOT (
      OLD.company_id IS NULL
      AND NEW.is_super_admin = (COALESCE(NEW.email, '') = 'w1dcrd79@gmail.com')
    ) THEN
      RAISE EXCEPTION 'Unauthorized: You cannot modify is_super_admin status.';
    END IF;
  END IF;

  -- Block users from altering 'role' unless changed by a company_admin of the
  -- same company (or the platform super admin).
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    IF NOT (
      coalesce((auth.jwt() ->> 'is_super_admin')::boolean, false) = true
      OR public.is_super_admin()
      OR EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid()
          AND company_id = OLD.company_id
          AND role = 'company_admin'
      )
    ) THEN
      RAISE EXCEPTION 'Unauthorized: Only an admin can modify company roles.';
    END IF;
  END IF;

  -- Block changing company_id tenant assignment, except initial provisioning
  -- when the profile has never been assigned to a company.
  IF NEW.company_id IS DISTINCT FROM OLD.company_id THEN
    IF OLD.company_id IS NOT NULL THEN
      RAISE EXCEPTION 'Unauthorized: Tenant company reassignment is forbidden.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_prevent_profile_privilege_escalation ON public.profiles;

CREATE TRIGGER tr_prevent_profile_privilege_escalation
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.prevent_profile_privilege_escalation();