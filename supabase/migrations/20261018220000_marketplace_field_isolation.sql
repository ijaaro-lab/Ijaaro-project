-- STEP 5.4.31 / 5.4.18: Marketplace public-field isolation
--
-- Product decisions (approved DTO):
--   * Cards + detail shared: id, name, district, city, property_type, status,
--     rent_amount, currency
--   * Detail-only: address_line, description, contact_phone, contact_email
--   * Do NOT return is_listed, created_at, updated_at, tenant/owner/renter ids,
--     created_source, or private photo metadata
--   * Marketplace browse requires authentication (no anon)
--   * Marketplace photos deferred — keep bucket private; remove listed+available
--     cross-tenant branches from photo/table SELECT policies
--
-- Security model:
--   * Base-table RLS no longer grants cross-tenant SELECT for listed+available rows.
--   * Authenticated users read marketplace only via SECURITY DEFINER RPCs that return
--     allowlisted columns for is_listed=true AND status='available'.
--   * Owner/member/renter/super-admin SELECT paths are preserved.
--
-- Apply via privileged SQL editor / direct SQL workflow only.
-- Do NOT supabase db push / migration repair / historical replay.

-- =============================================================================
-- 1) Marketplace RPCs (allowlisted public fields only)
-- =============================================================================

-- Drop first so OUT-parameter / return-type changes replace cleanly.
DROP FUNCTION IF EXISTS public.list_marketplace_listings();
DROP FUNCTION IF EXISTS public.get_marketplace_listing(uuid);

CREATE OR REPLACE FUNCTION public.list_marketplace_listings()
RETURNS TABLE (
  id uuid,
  name text,
  district text,
  city text,
  property_type public.property_type,
  status public.property_status,
  rent_amount numeric,
  currency text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    p.name,
    p.district,
    p.city,
    p.property_type,
    p.status,
    p.rent_amount,
    p.currency
  FROM public.properties AS p
  WHERE p.is_listed = true
    AND p.status = 'available'::public.property_status
  ORDER BY p.created_at DESC;
END;
$$;

COMMENT ON FUNCTION public.list_marketplace_listings() IS
  'Authenticated marketplace browse: allowlisted card fields for listed+available properties only.';

CREATE OR REPLACE FUNCTION public.get_marketplace_listing(p_id uuid)
RETURNS TABLE (
  id uuid,
  name text,
  district text,
  city text,
  property_type public.property_type,
  status public.property_status,
  rent_amount numeric,
  currency text,
  address_line text,
  description text,
  contact_phone text,
  contact_email text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  IF p_id IS NULL THEN
    RAISE EXCEPTION 'listing id is required' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    p.name,
    p.district,
    p.city,
    p.property_type,
    p.status,
    p.rent_amount,
    p.currency,
    p.address_line,
    p.description,
    p.contact_phone,
    p.contact_email
  FROM public.properties AS p
  WHERE p.id = p_id
    AND p.is_listed = true
    AND p.status = 'available'::public.property_status;
END;
$$;

COMMENT ON FUNCTION public.get_marketplace_listing(uuid) IS
  'Authenticated marketplace detail: allowlisted fields including address and inquiry contacts for one listed+available property.';

REVOKE ALL ON FUNCTION public.list_marketplace_listings() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_marketplace_listings() FROM anon;
GRANT EXECUTE ON FUNCTION public.list_marketplace_listings() TO authenticated;

REVOKE ALL ON FUNCTION public.get_marketplace_listing(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_marketplace_listing(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_marketplace_listing(uuid) TO authenticated;

-- =============================================================================
-- 2) Remove marketplace cross-tenant SELECT branches from overlapping policies
--    Inspected overlapping grants (live preflight 5.4.31):
--      * properties_select (table) — sole SELECT policy on properties
--      * property_photos_select (table)
--      * property_photos_storage_select (storage.objects)
--    search_properties_for_link remains a separate utility RPC with its own
--    allowlisted return surface (not landlord marketplace browse).
-- =============================================================================

DROP POLICY IF EXISTS properties_select ON public.properties;
CREATE POLICY properties_select ON public.properties
  FOR SELECT TO authenticated
  USING (
    public.is_member_of(tenant_id)
    OR current_renter_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.rental_assignments AS ra
      WHERE ra.property_id = properties.id
        AND ra.renter_id = auth.uid()
        AND ra.tenant_id = properties.tenant_id
    )
    OR public.is_super_admin()
  );

DROP POLICY IF EXISTS property_photos_select ON public.property_photos;
CREATE POLICY property_photos_select ON public.property_photos
  FOR SELECT TO authenticated
  USING (
    public.is_member_of(tenant_id)
    OR EXISTS (
      SELECT 1
      FROM public.properties AS p
      WHERE p.id = property_photos.property_id
        AND p.tenant_id = property_photos.tenant_id
        AND p.current_renter_id = auth.uid()
    )
    OR public.is_super_admin()
  );

-- Bucket remains private. Path convention: {tenant_id}/{property_id}/{uuid}.ext
-- Keep owner/member/renter/super-admin access; drop listed+available public branch.
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
        FROM public.properties AS p
        WHERE p.id = (storage.foldername(storage.objects.name))[2]::uuid
          AND (
            p.current_renter_id = auth.uid()
            OR public.is_member_of(p.tenant_id)
          )
      )
    )
  );
