-- Inspection failure rate, corrected: inspections has its own company_id
-- directly (added in 20260908000707) — no join through assets required.
COALESCE(
    (SELECT ROUND(100.0 * COUNT(*) FILTER (WHERE i.result = 'Fail') / NULLIF(COUNT(*), 0), 2)
     FROM public.inspections i
     WHERE i.company_id = c.id AND i.created_at >= (now() - interval '90 days')),
    0.0
) AS inspection_failure_rate_90d,

-- Chronic Asset count: >=2 failed inspections on the same asset within 60d
(SELECT COUNT(*) FROM (
    SELECT i.asset_id
    FROM public.inspections i
    WHERE i.company_id = c.id
      AND i.result = 'Fail'
      AND i.created_at >= (now() - interval '60 days')
    GROUP BY i.asset_id
    HAVING COUNT(*) >= 2
) chronic
) AS chronic_asset_count,

-- Lapsed certs: computed from expiration_date, since personnel_certs has
-- no status column at all.
(SELECT COUNT(*) FROM public.personnel_certs pc
 WHERE pc.company_id = c.id
   AND pc.expiration_date IS NOT NULL
   AND pc.expiration_date < current_date
) AS lapsed_certs_count,
