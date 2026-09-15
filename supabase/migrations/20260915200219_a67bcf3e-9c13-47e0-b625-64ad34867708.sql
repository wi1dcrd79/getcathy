-- 1. Restrict direct profiles SELECT: own row only, except admins/safety directors/super admins
DROP POLICY IF EXISTS "profiles_select" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_restricted" ON public.profiles;

CREATE POLICY "profiles_select_restricted"
ON public.profiles
FOR SELECT
TO authenticated
USING (
    id = auth.uid()
    OR (
        company_id = app_internal.get_current_company_id()
        AND (
            app_internal.current_user_role() IN ('company_admin', 'safety_director')
            OR app_internal.is_super_admin()
        )
    )
);

-- 2. Sanitized directory view for general coworker lookups (no email).
-- profiles has no full_name/avatar_url columns, so expose only safe fields.
-- security_invoker + explicit grant so RLS semantics stay tight.
DROP VIEW IF EXISTS public.company_team_directory;

CREATE VIEW public.company_team_directory
WITH (security_invoker = true) AS
SELECT
    id,
    company_id,
    role,
    created_at
FROM public.profiles;

GRANT SELECT ON public.company_team_directory TO authenticated;
GRANT SELECT ON public.company_team_directory TO service_role;

-- 3. Belt-and-braces: confirm all remaining public SECURITY DEFINER functions
-- have a pinned search_path so they can't be hijacked via schema search path.
ALTER FUNCTION public.bootstrap_current_user() SET search_path = public;
ALTER FUNCTION public.rotate_session_token(text) SET search_path = public;