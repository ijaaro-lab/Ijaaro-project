-- Tenant logo / branding images (path: {user_id}/logo.* or {tenant_id}/logo.*)

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'tenant-branding',
  'tenant-branding',
  true,
  2097152,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml']
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS tenant_branding_storage_select ON storage.objects;
CREATE POLICY tenant_branding_storage_select ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'tenant-branding');

DROP POLICY IF EXISTS tenant_branding_storage_insert ON storage.objects;
CREATE POLICY tenant_branding_storage_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'tenant-branding'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.is_member_of((storage.foldername(name))[1]::uuid)
    )
  );

DROP POLICY IF EXISTS tenant_branding_storage_update ON storage.objects;
CREATE POLICY tenant_branding_storage_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'tenant-branding'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.is_member_of((storage.foldername(name))[1]::uuid)
    )
  )
  WITH CHECK (
    bucket_id = 'tenant-branding'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.is_member_of((storage.foldername(name))[1]::uuid)
    )
  );

DROP POLICY IF EXISTS tenant_branding_storage_delete ON storage.objects;
CREATE POLICY tenant_branding_storage_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'tenant-branding'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.is_member_of((storage.foldername(name))[1]::uuid)
    )
  );
