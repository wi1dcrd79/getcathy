-- Ownership columns
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS owner_id uuid DEFAULT auth.uid();
ALTER TABLE public.inspections ADD COLUMN IF NOT EXISTS owner_id uuid DEFAULT auth.uid();
ALTER TABLE public.welder_qualifications ADD COLUMN IF NOT EXISTS owner_id uuid DEFAULT auth.uid();

-- Drop permissive public policies
DROP POLICY IF EXISTS assets_public_all ON public.assets;
DROP POLICY IF EXISTS inspections_public_all ON public.inspections;
DROP POLICY IF EXISTS welders_public_all ON public.welder_qualifications;

-- Revoke anonymous access
REVOKE ALL ON public.assets FROM anon;
REVOKE ALL ON public.inspections FROM anon;
REVOKE ALL ON public.welder_qualifications FROM anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.assets TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inspections TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.welder_qualifications TO authenticated;
GRANT ALL ON public.assets TO service_role;
GRANT ALL ON public.inspections TO service_role;
GRANT ALL ON public.welder_qualifications TO service_role;

ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inspections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.welder_qualifications ENABLE ROW LEVEL SECURITY;

-- assets
CREATE POLICY assets_select ON public.assets FOR SELECT TO authenticated USING (true);
CREATE POLICY assets_insert ON public.assets FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY assets_update ON public.assets FOR UPDATE TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY assets_delete ON public.assets FOR DELETE TO authenticated USING (owner_id = auth.uid());

-- inspections
CREATE POLICY inspections_select ON public.inspections FOR SELECT TO authenticated USING (true);
CREATE POLICY inspections_insert ON public.inspections FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY inspections_update ON public.inspections FOR UPDATE TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY inspections_delete ON public.inspections FOR DELETE TO authenticated USING (owner_id = auth.uid());

-- welder qualifications (PII: signed-in only, owner-writable)
CREATE POLICY welders_select ON public.welder_qualifications FOR SELECT TO authenticated USING (true);
CREATE POLICY welders_insert ON public.welder_qualifications FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY welders_update ON public.welder_qualifications FOR UPDATE TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY welders_delete ON public.welder_qualifications FOR DELETE TO authenticated USING (owner_id = auth.uid());