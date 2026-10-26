-- Fix property-photos storage INSERT/SELECT path binding.
--
-- Bug: inside EXISTS (SELECT ... FROM public.properties p ...), unqualified
-- `name` resolves to properties.name (listing title), not storage.objects.name.
-- Live pg_policies previously showed storage.foldername(p.name) for these two
-- policies. Upload path convention (app + original migration comment):
--   {tenant_id}/{property_id}/{uuid}.ext
--
-- Scope: DROP/CREATE only property_photos_storage_insert and
-- property_photos_storage_select. UPDATE/DELETE are unchanged (they reference
-- storage.objects.name at policy scope without an aliased properties.p shadow).
-- Bucket remains private. No table/schema/Auth changes.

DROP POLICY IF EXISTS property_photos_storage_select ON storage.objects;
CREATE POLICY property_photos_storage_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'property-photos'
    AND (
      public.can_manage_landlord_ops(
        (storage.foldername(storage.objects.name))[1]::uuid
      )
      OR public.is_super_admin()
      OR EXISTS (
        SELECT 1
        FROM public.properties p
        WHERE p.id = (storage.foldername(storage.objects.name))[2]::uuid
          AND (
            (p.is_listed = true AND p.status = 'available')
            OR p.current_renter_id = auth.uid()
            OR public.is_member_of(p.tenant_id)
          )
      )
    )
  );

DROP POLICY IF EXISTS property_photos_storage_insert ON storage.objects;
CREATE POLICY property_photos_storage_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'property-photos'
    AND public.can_manage_landlord_ops(
      (storage.foldername(storage.objects.name))[1]::uuid
    )
    AND EXISTS (
      SELECT 1
      FROM public.properties p
      WHERE p.id = (storage.foldername(storage.objects.name))[2]::uuid
        AND p.tenant_id = (storage.foldername(storage.objects.name))[1]::uuid
    )
  );
