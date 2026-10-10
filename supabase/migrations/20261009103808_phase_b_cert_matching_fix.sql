UPDATE public.certification_types SET name = 'Journeyman Electrician' WHERE code = 'ELEC_JOURNEYMAN' AND name = 'Journeyman Electrician License';
UPDATE public.certification_types SET name = 'Master Electrician' WHERE code = 'ELEC_MASTER' AND name = 'Master Electrician License';
UPDATE public.certification_types SET name = 'Journeyman Plumber' WHERE code = 'PLUMB_JOURNEYMAN' AND name = 'Journeyman Plumber License';
UPDATE public.certification_types SET name = 'Master Plumber' WHERE code = 'PLUMB_MASTER' AND name = 'Master Plumber License';

CREATE OR REPLACE FUNCTION app_internal.evaluate_craft_compliance(
  p_personnel_id uuid,
  p_cert_type_code text
)
RETURNS TABLE (status text, is_dispatchable boolean, days_remaining integer, reason text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_requires_continuity boolean;
  v_interval integer;
  v_type_name text;
  v_cert_id uuid;
  v_exp_date date;
  v_issue_date date;
  v_last_work date;
  v_days_since integer;
BEGIN
  SELECT ct.requires_continuity, ct.default_continuity_days, ct.name
    INTO v_requires_continuity, v_interval, v_type_name
  FROM public.certification_types ct
  WHERE ct.code = p_cert_type_code AND ct.is_active;

  IF v_requires_continuity IS NULL THEN
    RETURN QUERY SELECT 'missing_cert'::text, false, NULL::integer, 'Unknown certification type'::text;
    RETURN;
  END IF;

  SELECT pc.id, pc.expiration_date, pc.issue_date
    INTO v_cert_id, v_exp_date, v_issue_date
  FROM public.personnel_certs pc
  JOIN public.personnel_records pr ON pr.id = pc.personnel_id
  WHERE pc.personnel_id = p_personnel_id
    AND pr.status = 'active'
    AND pc.approval_status = 'approved'
    AND (strpos(upper(pc.cert_name), upper(p_cert_type_code)) > 0
         OR strpos(upper(pc.cert_name), upper(v_type_name)) > 0)
  ORDER BY pc.expiration_date DESC NULLS LAST
  LIMIT 1;

  IF v_cert_id IS NULL THEN
    RETURN QUERY SELECT 'missing_cert'::text, false, NULL::integer, 'No active certification on file'::text;
    RETURN;
  END IF;

  IF v_exp_date IS NOT NULL AND v_exp_date < CURRENT_DATE THEN
    RETURN QUERY SELECT 'expired'::text, false, (v_exp_date - CURRENT_DATE), 'Certification expired'::text;
    RETURN;
  END IF;

  IF v_requires_continuity THEN
    SELECT max(l.performed_date) INTO v_last_work
    FROM public.craft_continuity_logs l
    WHERE l.personnel_id = p_personnel_id AND l.cert_type_code = p_cert_type_code;

    v_days_since := CURRENT_DATE - COALESCE(v_last_work, v_issue_date);

    IF v_days_since > v_interval THEN
      RETURN QUERY SELECT 'lapsed'::text, false, (v_interval - v_days_since),
        format('Continuity lapsed: %s days since last verified work', v_days_since);
      RETURN;
    ELSIF v_days_since > 120 THEN
      RETURN QUERY SELECT 'warning'::text, true, (v_interval - v_days_since),
        format('Continuity warning: %s days since last verified work', v_days_since);
      RETURN;
    END IF;
  END IF;

  IF v_exp_date IS NOT NULL AND v_exp_date - CURRENT_DATE <= 30 THEN
    RETURN QUERY SELECT 'warning'::text, true, (v_exp_date - CURRENT_DATE), 'Certification expiring within 30 days'::text;
    RETURN;
  END IF;

  RETURN QUERY SELECT 'compliant'::text, true, (v_exp_date - CURRENT_DATE), 'Active and in full compliance'::text;
END;
$$;