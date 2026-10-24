-- =============================================================================
-- Landlord staff: properties-only authorization (Phase A)
-- =============================================================================
-- Local-repo migration only. Do not auto-apply to hosted/Live without approval.
--
-- Goals:
--   * landlord_staff may create/read/update/publish properties (+ photo upload)
--   * landlord_staff may NOT delete properties/photos or run landlord ops
--   * Narrow can_manage_landlord_ops → active landlord_admin only
--   * New can_manage_landlord_properties → landlord_admin OR landlord_staff
--   * Harden manage_membership for landlord admins (staff|renter only)
--   * Landlord-admin email lookup + staff membership list RPCs
--   * owner_id immutable on client updates (create-time attribution proxy)
--   * Public listing RPCs / allowlists unchanged
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) Property-scoped helper (admin + staff)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_manage_landlord_properties(p_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tenant_memberships tm
    JOIN public.tenants t ON t.id = tm.tenant_id
    WHERE tm.tenant_id = p_tenant_id
      AND tm.user_id = auth.uid()
      AND tm.status = 'active'
      AND tm.role IN ('landlord_admin', 'landlord_staff')
      AND t.status = 'active'
      AND t.tenant_type = 'landlord'
  );
$$;

COMMENT ON FUNCTION public.can_manage_landlord_properties(uuid) IS
  'Active landlord_admin or landlord_staff on an active landlord tenant — property CRUD (not delete) and photo upload.';

REVOKE ALL ON FUNCTION public.can_manage_landlord_properties(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_landlord_properties(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 2) Retarget property INSERT/UPDATE to properties helper
--    DELETE stays landlord_admin-only (unchanged policy body).
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS properties_insert ON public.properties;
CREATE POLICY properties_insert ON public.properties
  FOR INSERT TO authenticated
  WITH CHECK (
    public.can_manage_landlord_properties(tenant_id)
    AND owner_id = auth.uid()
    AND current_renter_id IS NULL
    AND status IN ('available', 'vacant')
  );

DROP POLICY IF EXISTS properties_update ON public.properties;
CREATE POLICY properties_update ON public.properties
  FOR UPDATE TO authenticated
  USING (public.can_manage_landlord_properties(tenant_id))
  WITH CHECK (public.can_manage_landlord_properties(tenant_id));

-- Explicitly restate delete so intent is clear in this migration (no staff).
DROP POLICY IF EXISTS properties_delete ON public.properties;
CREATE POLICY properties_delete ON public.properties
  FOR DELETE TO authenticated
  USING (
    public.has_role(tenant_id, ARRAY['landlord_admin']::public.app_role[])
    AND status <> 'occupied'
    AND current_renter_id IS NULL
  );

-- ---------------------------------------------------------------------------
-- 3) Property photos: staff upload/update metadata; admin-only delete
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS property_photos_insert ON public.property_photos;
CREATE POLICY property_photos_insert ON public.property_photos
  FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_landlord_properties(tenant_id));

DROP POLICY IF EXISTS property_photos_update ON public.property_photos;
CREATE POLICY property_photos_update ON public.property_photos
  FOR UPDATE TO authenticated
  USING (public.can_manage_landlord_properties(tenant_id))
  WITH CHECK (public.can_manage_landlord_properties(tenant_id));

DROP POLICY IF EXISTS property_photos_delete ON public.property_photos;
CREATE POLICY property_photos_delete ON public.property_photos
  FOR DELETE TO authenticated
  USING (
    public.has_role(tenant_id, ARRAY['landlord_admin']::public.app_role[])
  );

-- ---------------------------------------------------------------------------
-- 4) Storage property-photos: staff insert/select; admin update/delete
--    Path: {tenant_id}/{property_id}/{uuid}.ext
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS property_photos_storage_select ON storage.objects;
CREATE POLICY property_photos_storage_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'property-photos'
    AND (
      public.can_manage_landlord_properties(
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

DROP POLICY IF EXISTS property_photos_storage_insert ON storage.objects;
CREATE POLICY property_photos_storage_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'property-photos'
    AND public.can_manage_landlord_properties(
      (storage.foldername(storage.objects.name))[1]::uuid
    )
    AND EXISTS (
      SELECT 1
      FROM public.properties AS p
      WHERE p.id = (storage.foldername(storage.objects.name))[2]::uuid
        AND p.tenant_id = (storage.foldername(storage.objects.name))[1]::uuid
    )
  );

DROP POLICY IF EXISTS property_photos_storage_update ON storage.objects;
CREATE POLICY property_photos_storage_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'property-photos'
    AND public.has_role(
      (storage.foldername(storage.objects.name))[1]::uuid,
      ARRAY['landlord_admin']::public.app_role[]
    )
  )
  WITH CHECK (
    bucket_id = 'property-photos'
    AND public.has_role(
      (storage.foldername(storage.objects.name))[1]::uuid,
      ARRAY['landlord_admin']::public.app_role[]
    )
  );

DROP POLICY IF EXISTS property_photos_storage_delete ON storage.objects;
CREATE POLICY property_photos_storage_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'property-photos'
    AND public.has_role(
      (storage.foldername(storage.objects.name))[1]::uuid,
      ARRAY['landlord_admin']::public.app_role[]
    )
  );

-- ---------------------------------------------------------------------------
-- 5) Narrow landlord ops helper → landlord_admin only
--    Automatically restricts tenancy/rent/payment-proof/list_same_tenant RPCs
--    and policies that already call can_manage_landlord_ops.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_manage_landlord_ops(p_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tenant_memberships tm
    JOIN public.tenants t ON t.id = tm.tenant_id
    WHERE tm.tenant_id = p_tenant_id
      AND tm.user_id = auth.uid()
      AND tm.status = 'active'
      AND tm.role = 'landlord_admin'
      AND t.status = 'active'
      AND t.tenant_type = 'landlord'
  );
$$;

COMMENT ON FUNCTION public.can_manage_landlord_ops(uuid) IS
  'Active landlord_admin on an active landlord tenant — tenancy, rent, payments, and other landlord ops (not staff).';

REVOKE ALL ON FUNCTION public.can_manage_landlord_ops(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_landlord_ops(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 6) Rental applications: drop staff SELECT / list access
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS rental_applications_select ON public.rental_applications;
CREATE POLICY rental_applications_select ON public.rental_applications
  FOR SELECT TO authenticated
  USING (
    applicant_user_id = auth.uid()
    OR public.is_super_admin()
    OR public.has_role(tenant_id, ARRAY['landlord_admin']::public.app_role[])
  );

CREATE OR REPLACE FUNCTION public.list_landlord_rental_applications(
  p_status public.rental_application_status DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  tenant_id uuid,
  property_id uuid,
  applicant_user_id uuid,
  requested_username text,
  message text,
  status public.rental_application_status,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz,
  property_name text,
  property_district text,
  property_city text,
  applicant_full_name text,
  applicant_email text,
  applicant_phone text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    a.id,
    a.tenant_id,
    a.property_id,
    a.applicant_user_id,
    a.requested_username,
    a.message,
    a.status,
    a.reviewed_by,
    a.reviewed_at,
    a.created_at,
    p.name,
    p.district,
    p.city,
    pr.full_name,
    pr.email,
    pr.phone
  FROM public.rental_applications a
  JOIN public.properties p ON p.id = a.property_id AND p.tenant_id = a.tenant_id
  JOIN public.profiles pr ON pr.id = a.applicant_user_id
  WHERE (
      public.is_super_admin()
      OR public.has_role(a.tenant_id, ARRAY['landlord_admin']::public.app_role[])
    )
    AND (p_status IS NULL OR a.status = p_status)
  ORDER BY a.created_at DESC;
END;
$$;

COMMENT ON FUNCTION public.list_landlord_rental_applications(public.rental_application_status) IS
  'Landlord admin (or SA) list of rental applications; landlord_staff excluded.';

REVOKE ALL ON FUNCTION public.list_landlord_rental_applications(public.rental_application_status)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_landlord_rental_applications(public.rental_application_status)
  FROM anon;
GRANT EXECUTE ON FUNCTION public.list_landlord_rental_applications(public.rental_application_status)
  TO authenticated;

-- ---------------------------------------------------------------------------
-- 7) Harden manage_membership: landlord admins → staff|renter only
--    Super Admin and utility_admin paths preserved.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.manage_membership(
  p_tenant_id uuid,
  p_user_id uuid,
  p_role public.app_role,
  p_status public.membership_status DEFAULT 'active'
)
RETURNS public.tenant_memberships
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_type public.tenant_type;
  v_row public.tenant_memberships%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT tenant_type INTO v_type FROM public.tenants WHERE id = p_tenant_id;
  IF v_type IS NULL THEN
    RAISE EXCEPTION 'tenant not found';
  END IF;

  -- Only super_admin may grant/manage super_admin or platform memberships
  IF p_role = 'super_admin' OR v_type = 'platform' THEN
    IF NOT public.is_super_admin() THEN
      RAISE EXCEPTION 'not authorized to manage platform memberships' USING ERRCODE = '42501';
    END IF;
  ELSIF NOT (
    public.is_super_admin()
    OR public.has_role(p_tenant_id, ARRAY['landlord_admin', 'utility_admin']::public.app_role[])
  ) THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  -- Prevent non-super-admin from elevating anyone to super_admin
  IF p_role = 'super_admin' AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'cannot grant super_admin' USING ERRCODE = '42501';
  END IF;

  -- Landlord admins (non-SA) may only grant landlord_staff or renter on landlord tenants
  IF NOT public.is_super_admin()
     AND v_type = 'landlord'
     AND public.has_role(
       p_tenant_id,
       ARRAY['landlord_admin']::public.app_role[]
     )
  THEN
    IF p_role IS DISTINCT FROM 'landlord_staff'::public.app_role
       AND p_role IS DISTINCT FROM 'renter'::public.app_role
    THEN
      RAISE EXCEPTION 'landlord admins may only grant landlord_staff or renter'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  INSERT INTO public.tenant_memberships (tenant_id, user_id, role, status, invited_by)
  VALUES (p_tenant_id, p_user_id, p_role, p_status, auth.uid())
  ON CONFLICT (tenant_id, user_id) DO UPDATE
    SET role = EXCLUDED.role,
        status = EXCLUDED.status,
        updated_at = now()
  RETURNING * INTO v_row;

  PERFORM public._insert_audit_log(
    p_tenant_id,
    auth.uid(),
    'membership.upserted',
    'tenant_membership',
    v_row.id,
    jsonb_build_object(
      'user_id', p_user_id,
      'role', p_role,
      'status', p_status
    )
  );

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.manage_membership(uuid, uuid, public.app_role, public.membership_status)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.manage_membership(uuid, uuid, public.app_role, public.membership_status)
  FROM anon;
GRANT EXECUTE ON FUNCTION public.manage_membership(uuid, uuid, public.app_role, public.membership_status)
  TO authenticated;

-- ---------------------------------------------------------------------------
-- 8) Landlord-admin email lookup (separate from SA-only lookup_profile_by_email)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.lookup_profile_by_email_for_landlord_admin(
  p_email text,
  p_tenant_id uuid
)
RETURNS TABLE (
  id uuid,
  full_name text,
  email text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text := lower(btrim(COALESCE(p_email, '')));
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'tenant id is required' USING ERRCODE = '22023';
  END IF;

  IF v_email = '' OR position('@' IN v_email) = 0 THEN
    RAISE EXCEPTION 'valid email is required' USING ERRCODE = '22023';
  END IF;

  IF NOT (
    public.has_role(p_tenant_id, ARRAY['landlord_admin']::public.app_role[])
    AND EXISTS (
      SELECT 1
      FROM public.tenants t
      WHERE t.id = p_tenant_id
        AND t.tenant_type = 'landlord'
        AND t.status = 'active'
    )
  ) THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT p.id, p.full_name, p.email
  FROM public.profiles p
  WHERE lower(btrim(COALESCE(p.email, ''))) = v_email
  LIMIT 5;
END;
$$;

COMMENT ON FUNCTION public.lookup_profile_by_email_for_landlord_admin(text, uuid) IS
  'Landlord-admin-only profile email lookup for staff/renter linking. Does not broaden SA lookup_profile_by_email.';

REVOKE ALL ON FUNCTION public.lookup_profile_by_email_for_landlord_admin(text, uuid)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.lookup_profile_by_email_for_landlord_admin(text, uuid)
  FROM anon;
GRANT EXECUTE ON FUNCTION public.lookup_profile_by_email_for_landlord_admin(text, uuid)
  TO authenticated;

-- ---------------------------------------------------------------------------
-- 9) List landlord_staff memberships (active + disabled) for admin staff UI
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_landlord_staff_profiles(p_tenant_id uuid)
RETURNS TABLE (
  user_id uuid,
  full_name text,
  email text,
  role public.app_role,
  membership_status public.membership_status
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

  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'tenant id is required' USING ERRCODE = '22023';
  END IF;

  IF NOT (
    public.has_role(p_tenant_id, ARRAY['landlord_admin']::public.app_role[])
    AND EXISTS (
      SELECT 1
      FROM public.tenants t
      WHERE t.id = p_tenant_id
        AND t.tenant_type = 'landlord'
        AND t.status = 'active'
    )
  ) THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    tm.user_id,
    p.full_name,
    p.email,
    tm.role,
    tm.status AS membership_status
  FROM public.tenant_memberships tm
  JOIN public.profiles p ON p.id = tm.user_id
  WHERE tm.tenant_id = p_tenant_id
    AND tm.role = 'landlord_staff'::public.app_role
    AND tm.status IN (
      'active'::public.membership_status,
      'disabled'::public.membership_status
    )
  ORDER BY lower(COALESCE(p.full_name, p.email, tm.user_id::text));
END;
$$;

COMMENT ON FUNCTION public.list_landlord_staff_profiles(uuid) IS
  'Landlord admin: list landlord_staff profiles (active/disabled) for staff management UI. No credentials.';

REVOKE ALL ON FUNCTION public.list_landlord_staff_profiles(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_landlord_staff_profiles(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.list_landlord_staff_profiles(uuid) TO authenticated;

-- Keep renter-list comment accurate after ops narrow
COMMENT ON FUNCTION public.list_same_tenant_member_profiles(uuid) IS
  'Landlord admin ops: list active renter profiles on a landlord tenant for invite/assign UI. Gated by can_manage_landlord_ops (admin-only).';

-- ---------------------------------------------------------------------------
-- 10) owner_id immutable on client UPDATE (ijaaro.internal bypass for trusted RPCs)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.protect_property_occupancy()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_setting('ijaaro.internal', true) = '1' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.current_renter_id IS DISTINCT FROM OLD.current_renter_id THEN
      RAISE EXCEPTION 'current_renter_id may only change via assign/move-out workflows'
        USING ERRCODE = '42501';
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status
       AND (NEW.status = 'occupied' OR OLD.status = 'occupied') THEN
      RAISE EXCEPTION 'occupied status may only change via assign/move-out workflows'
        USING ERRCODE = '42501';
    END IF;
    IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
      RAISE EXCEPTION 'property tenant_id is immutable' USING ERRCODE = '42501';
    END IF;
    IF NEW.owner_id IS DISTINCT FROM OLD.owner_id THEN
      RAISE EXCEPTION 'property owner_id is immutable'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.protect_property_occupancy() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.protect_property_occupancy() FROM anon, authenticated;
