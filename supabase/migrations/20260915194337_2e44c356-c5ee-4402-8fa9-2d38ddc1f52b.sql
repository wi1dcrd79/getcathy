-- 1. CUSTOM TRADES: split read from write
DROP POLICY IF EXISTS "custom_trades_tenant" ON public.custom_trades;

CREATE POLICY "custom_trades_select"
ON public.custom_trades
FOR SELECT
TO authenticated
USING (company_id = get_current_company_id());

CREATE POLICY "custom_trades_modify"
ON public.custom_trades
FOR ALL
TO authenticated
USING (
  company_id = get_current_company_id()
  AND NOT company_write_locked()
  AND (can_write_compliance() OR is_super_admin())
)
WITH CHECK (
  company_id = get_current_company_id()
  AND NOT company_write_locked()
  AND (can_write_compliance() OR is_super_admin())
);

-- 2. PERSONNEL RECORDS: split read from write
DROP POLICY IF EXISTS "personnel_records_tenant" ON public.personnel_records;

CREATE POLICY "personnel_records_select"
ON public.personnel_records
FOR SELECT
TO authenticated
USING (company_id = get_current_company_id());

CREATE POLICY "personnel_records_modify"
ON public.personnel_records
FOR ALL
TO authenticated
USING (
  company_id = get_current_company_id()
  AND NOT company_write_locked()
  AND (can_write_compliance() OR is_super_admin())
)
WITH CHECK (
  company_id = get_current_company_id()
  AND NOT company_write_locked()
  AND (can_write_compliance() OR is_super_admin())
);

-- 3. WELDER QUALIFICATIONS: split read from write
-- (project table is welder_qualifications, not "welders")
DROP POLICY IF EXISTS "welders_tenant" ON public.welder_qualifications;

CREATE POLICY "welders_select"
ON public.welder_qualifications
FOR SELECT
TO authenticated
USING (company_id = get_current_company_id());

CREATE POLICY "welders_modify"
ON public.welder_qualifications
FOR ALL
TO authenticated
USING (
  company_id = get_current_company_id()
  AND NOT company_write_locked()
  AND (can_write_compliance() OR is_super_admin())
)
WITH CHECK (
  company_id = get_current_company_id()
  AND NOT company_write_locked()
  AND (can_write_compliance() OR is_super_admin())
);