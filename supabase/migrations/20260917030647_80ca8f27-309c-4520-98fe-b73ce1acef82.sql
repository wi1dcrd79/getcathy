-- Self-service insert: no elevated fields allowed at all.
DROP POLICY IF EXISTS profiles_insert ON public.profiles;
CREATE POLICY profiles_insert ON public.profiles
FOR INSERT TO authenticated
WITH CHECK (
  id = auth.uid()
  AND coalesce(is_super_admin, false) = false
  AND company_id IS NULL
  AND role IN ('operator', 'field_tech', 'viewer')
);

-- Updates: own row, or a company member's row when you are that company's admin
-- (or the platform owner). Privilege columns are still gated by the
-- app_internal.enforce_profile_security() trigger on INSERT/UPDATE.
DROP POLICY IF EXISTS profiles_update ON public.profiles;
CREATE POLICY profiles_update ON public.profiles
FOR UPDATE TO authenticated
USING (
  id = auth.uid()
  OR app_internal.is_super_admin()
  OR (
    company_id IS NOT NULL
    AND company_id = app_internal.get_current_company_id()
    AND app_internal.current_user_role() = 'company_admin'
  )
)
WITH CHECK (
  id = auth.uid()
  OR app_internal.is_super_admin()
  OR (
    company_id IS NOT NULL
    AND company_id = app_internal.get_current_company_id()
    AND app_internal.current_user_role() = 'company_admin'
  )
);