-- 1. Unified enforcement trigger function
CREATE OR REPLACE FUNCTION public.enforce_profile_security()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Service role (backend administrative functions/webhooks) bypasses checks
  IF (auth.jwt() ->> 'role') = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- Trusted server-side provisioning (bootstrap_current_user) runs as the
  -- function owner, not as a client role. Clients cannot SET ROLE to the
  -- owner, so this path cannot be faked from the browser.
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  -- ON INSERT: strip or block unauthorized privileges
  IF TG_OP = 'INSERT' THEN
    -- Block self-granting super admin status on creation
    IF coalesce(NEW.is_super_admin, false) = true THEN
      RAISE EXCEPTION 'Unauthorized: Cannot self-assign is_super_admin on account creation.';
    END IF;

    -- Ensure the user ID matches the authenticated session
    IF NEW.id IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'Unauthorized: Profile ID must match auth.uid().';
    END IF;

    -- Force a standard default role; company_admin is only grantable by the
    -- trusted server-side provisioning path.
    IF NEW.role IS NULL OR NEW.role NOT IN ('operator', 'field_tech', 'viewer') THEN
      NEW.role := 'operator';
    END IF;

    -- Tenant assignment only happens via trusted server-side bootstrap
    NEW.company_id := NULL;

    RETURN NEW;
  END IF;

  -- ON UPDATE: prevent tampering with tenant, role, and admin flags
  IF TG_OP = 'UPDATE' THEN
    -- Block changes to super admin flag
    IF NEW.is_super_admin IS DISTINCT FROM OLD.is_super_admin THEN
      RAISE EXCEPTION 'Unauthorized: You cannot modify is_super_admin status.';
    END IF;

    -- Block tenant switching across different companies
    IF NEW.company_id IS DISTINCT FROM OLD.company_id THEN
      RAISE EXCEPTION 'Unauthorized: Tenant company reassignment is strictly prohibited.';
    END IF;

    -- Role modification check: only a verified company admin or super admin
    IF NEW.role IS DISTINCT FROM OLD.role THEN
      IF NOT (
        public.is_super_admin()
        OR EXISTS (
          SELECT 1 FROM public.profiles
          WHERE id = auth.uid()
            AND company_id = OLD.company_id
            AND role = 'company_admin'
        )
      ) THEN
        RAISE EXCEPTION 'Unauthorized: Only a verified company admin can modify roles.';
      END IF;
    END IF;

    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

-- 2. Drop the old update-only trigger
DROP TRIGGER IF EXISTS tr_prevent_profile_privilege_escalation ON public.profiles;
DROP TRIGGER IF EXISTS tr_enforce_profile_security ON public.profiles;

-- 3. Bind the unified trigger to BOTH INSERT and UPDATE
CREATE TRIGGER tr_enforce_profile_security
BEFORE INSERT OR UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.enforce_profile_security();

-- 4. Revoke direct external access to the trigger function
REVOKE EXECUTE ON FUNCTION public.enforce_profile_security() FROM PUBLIC, anon, authenticated;