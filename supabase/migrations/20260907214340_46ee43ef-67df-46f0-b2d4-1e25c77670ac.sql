CREATE POLICY "inspection_photos_select_own" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'inspection-photos' AND owner = auth.uid());

CREATE POLICY "inspection_photos_insert_own" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'inspection-photos'
  AND owner = auth.uid()
  AND (storage.foldername(name))[1] = auth.uid()::text
  AND lower(coalesce(metadata->>'mimetype', '')) IN ('image/jpeg','image/png','image/webp')
);

CREATE POLICY "inspection_photos_update_own" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'inspection-photos' AND owner = auth.uid())
WITH CHECK (bucket_id = 'inspection-photos' AND owner = auth.uid());

CREATE POLICY "inspection_photos_delete_own" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'inspection-photos' AND owner = auth.uid());