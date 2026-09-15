-- 1. Isolated billing table
CREATE TABLE IF NOT EXISTS public.company_billing (
  company_id UUID PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

GRANT SELECT ON public.company_billing TO authenticated;
GRANT ALL ON public.company_billing TO service_role;

ALTER TABLE public.company_billing ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company_billing_admin_only"
ON public.company_billing
FOR ALL
TO authenticated
USING (
  company_id = app_internal.get_current_company_id()
  AND (app_internal.current_user_role() = 'company_admin' OR app_internal.is_super_admin())
)
WITH CHECK (
  company_id = app_internal.get_current_company_id()
  AND (app_internal.current_user_role() = 'company_admin' OR app_internal.is_super_admin())
);

-- 2. Migrate existing billing data out of companies
INSERT INTO public.company_billing (company_id, stripe_customer_id, stripe_subscription_id)
SELECT id, stripe_customer_id, stripe_subscription_id
FROM public.companies
WHERE stripe_customer_id IS NOT NULL OR stripe_subscription_id IS NOT NULL
ON CONFLICT (company_id) DO UPDATE
SET stripe_customer_id = EXCLUDED.stripe_customer_id,
    stripe_subscription_id = EXCLUDED.stripe_subscription_id;

ALTER TABLE public.companies DROP COLUMN IF EXISTS stripe_customer_id;
ALTER TABLE public.companies DROP COLUMN IF EXISTS stripe_subscription_id;

-- 3. Inspection photos: company-wide read, company-scoped write
DROP POLICY IF EXISTS "inspection_photos_read" ON storage.objects;
DROP POLICY IF EXISTS "inspection_photos_insert" ON storage.objects;

CREATE POLICY "inspection_photos_read_company"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'inspection-photos'
  AND (
    (storage.foldername(name))[1]::uuid = app_internal.get_current_company_id()
    OR app_internal.is_super_admin()
  )
);

CREATE POLICY "inspection_photos_insert_company"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'inspection-photos'
  AND (storage.foldername(name))[1]::uuid = app_internal.get_current_company_id()
);