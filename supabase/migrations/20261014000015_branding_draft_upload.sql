-- Allow authenticated users to upload draft branding images into their own
-- auth.uid() folder during create-workspace (before a tenant membership exists).
-- Tenant-id folders remain restricted to workspace admins / super admins.

DROP POLICY IF EXISTS tenant_branding_storage_insert ON storage.objects;
CREATE POLICY tenant_branding_storage_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'tenant-branding'
    AND (
      -- Draft uploads during self-serve / admin create flow
      (storage.foldername(name))[1] = auth.uid()::text
      OR (
        (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        AND (
          public.is_super_admin()
          OR public.has_role(
            (storage.foldername(name))[1]::uuid,
            ARRAY['landlord_admin', 'utility_admin']::public.app_role[]
          )
        )
      )
    )
  );

DROP POLICY IF EXISTS tenant_branding_storage_update ON storage.objects;
CREATE POLICY tenant_branding_storage_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'tenant-branding'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR (
        (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        AND (
          public.is_super_admin()
          OR public.has_role(
            (storage.foldername(name))[1]::uuid,
            ARRAY['landlord_admin', 'utility_admin']::public.app_role[]
          )
        )
      )
    )
  )
  WITH CHECK (
    bucket_id = 'tenant-branding'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR (
        (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        AND (
          public.is_super_admin()
          OR public.has_role(
            (storage.foldername(name))[1]::uuid,
            ARRAY['landlord_admin', 'utility_admin']::public.app_role[]
          )
        )
      )
    )
  );

DROP POLICY IF EXISTS tenant_branding_storage_delete ON storage.objects;
CREATE POLICY tenant_branding_storage_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'tenant-branding'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR (
        (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        AND (
          public.is_super_admin()
          OR public.has_role(
            (storage.foldername(name))[1]::uuid,
            ARRAY['landlord_admin', 'utility_admin']::public.app_role[]
          )
        )
      )
    )
  );
