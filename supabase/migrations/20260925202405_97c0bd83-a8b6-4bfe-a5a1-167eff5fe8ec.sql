CREATE OR REPLACE FUNCTION public.find_certs_crossing_threshold(p_threshold_days integer)
 RETURNS TABLE(cert_id uuid, company_id uuid, cert_name text, cert_number text, expiration_date date, welder_email text, supervisor_email text, admin_fallback_email text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    pc.id,
    pc.company_id,
    pc.cert_name,
    pc.cert_number,
    pc.expiration_date,
    pr.email,
    sup.email,
    fb.email
  FROM public.personnel_certs pc
  JOIN public.personnel_records pr ON pr.id = pc.personnel_id
  LEFT JOIN public.profiles sup ON sup.id = pr.supervisor_id
  LEFT JOIN LATERAL (
    SELECT p.email
    FROM public.profiles p
    WHERE p.company_id = pc.company_id
      AND p.role IN ('safety_director', 'company_admin')
    ORDER BY
      CASE WHEN p.role = 'safety_director' THEN 1 ELSE 2 END,
      p.created_at ASC
    LIMIT 1
  ) fb ON (pr.email IS NULL AND (sup.email IS NULL OR sup.id IS NULL))
  WHERE pc.expiration_date IS NOT NULL
    AND (
      (p_threshold_days = 30 AND pc.expiration_date <= (CURRENT_DATE + 30) AND pc.expiration_date > (CURRENT_DATE + 14)) OR
      (p_threshold_days = 14 AND pc.expiration_date <= (CURRENT_DATE + 14) AND pc.expiration_date > (CURRENT_DATE + 7)) OR
      (p_threshold_days = 7  AND pc.expiration_date <= (CURRENT_DATE + 7)  AND pc.expiration_date >= CURRENT_DATE)
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.cert_notifications cn
      WHERE cn.cert_id = pc.id
        AND cn.threshold_days = p_threshold_days
        AND cn.delivery_status IN ('claimed', 'dispatched', 'delivered')
    );
$function$;

REVOKE ALL ON FUNCTION public.find_certs_crossing_threshold(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.find_certs_crossing_threshold(integer) FROM anon;
REVOKE ALL ON FUNCTION public.find_certs_crossing_threshold(integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.find_certs_crossing_threshold(integer) TO service_role;