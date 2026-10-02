DROP POLICY IF EXISTS signatures_read_company ON storage.objects;
CREATE POLICY signatures_read_company ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'signatures'
    AND (
      (storage.foldername(name))[1] = app_internal.get_current_company_id()::text
      OR app_internal.is_super_admin()
    )
  );