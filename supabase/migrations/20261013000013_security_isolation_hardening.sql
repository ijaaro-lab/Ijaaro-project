-- IJAARO security audit remediation (2026-10-13)
-- Fixes: least-privilege grants (TRUNCATE bypass), cross-tenant utility RPCs,
-- payment-proof storage UUID cast conflicts, branding storage over-permission,
-- FORCE RLS on foundation tables, revoke unintended RPC EXECUTE.

-- =============================================================================
-- 1) Least-privilege table grants (TRUNCATE bypasses RLS)
-- =============================================================================
REVOKE ALL ON TABLE
  public.properties,
  public.property_photos,
  public.rental_assignments,
  public.rent_charges,
  public.rent_payments,
  public.utility_accounts,
  public.meters,
  public.meter_readings,
  public.utility_bills,
  public.utility_payments
FROM anon;

REVOKE ALL ON TABLE
  public.profiles,
  public.tenants,
  public.tenant_memberships,
  public.audit_logs,
  public.properties,
  public.property_photos,
  public.rental_assignments,
  public.rent_charges,
  public.rent_payments,
  public.utility_accounts,
  public.meters,
  public.meter_readings,
  public.utility_bills,
  public.utility_payments
FROM authenticated;

-- Re-grant only what PostgREST + RLS need
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.tenants TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.tenant_memberships TO authenticated;
GRANT SELECT ON public.audit_logs TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.properties TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.property_photos TO authenticated;
GRANT SELECT, UPDATE ON public.rental_assignments TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.rent_charges TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.rent_payments TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.utility_accounts TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.meters TO authenticated;
GRANT SELECT ON public.meter_readings TO authenticated;
GRANT SELECT ON public.utility_bills TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.utility_payments TO authenticated;

-- Explicitly deny TRUNCATE / REFERENCES / TRIGGER for client roles
REVOKE TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public FROM anon, authenticated;

-- =============================================================================
-- 2) FORCE RLS on foundation tables
-- =============================================================================
ALTER TABLE public.profiles FORCE ROW LEVEL SECURITY;
ALTER TABLE public.tenants FORCE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_memberships FORCE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs FORCE ROW LEVEL SECURITY;

-- =============================================================================
-- 3) Revoke unintended helper / platform RPC EXECUTE
-- =============================================================================
-- rls_auto_enable may exist only on hosted projects (advisor helper); skip if absent
-- so local disposable resets remain applicable.
DO $$
BEGIN
  IF to_regprocedure('public.rls_auto_enable()') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated';
  END IF;
  IF to_regprocedure('public.service_type_for_tenant(uuid)') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.service_type_for_tenant(uuid) FROM PUBLIC, anon';
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.tenant_is_operable(uuid) FROM PUBLIC, anon;
-- Keep authenticated EXECUTE on tenant_is_operable / service helpers used by app,
-- but they remain membership-sensitive at call sites; revoke anon only above.

-- =============================================================================
-- 4) Harden search_properties_for_link (no platform-wide occupant dump)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.search_properties_for_link(
  p_query text,
  p_limit integer DEFAULT 20
)
RETURNS TABLE (
  id uuid,
  address_line text,
  district text,
  city text,
  name text,
  status public.property_status,
  owner_id uuid,
  current_renter_id uuid,
  landlord_tenant_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_q text;
  v_limit int;
  v_uuid uuid;
  v_is_uuid boolean := false;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.tenant_memberships tm
    JOIN public.tenants t ON t.id = tm.tenant_id
    WHERE tm.user_id = auth.uid()
      AND tm.status = 'active'
      AND tm.role IN ('utility_admin', 'utility_staff')
      AND t.status = 'active'
      AND t.tenant_type IN ('water_company', 'electricity_company')
  ) THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  v_q := trim(COALESCE(p_query, ''));
  IF char_length(v_q) < 2 THEN
    RAISE EXCEPTION 'search query must be at least 2 characters';
  END IF;

  BEGIN
    v_uuid := v_q::uuid;
    v_is_uuid := true;
  EXCEPTION WHEN invalid_text_representation THEN
    v_is_uuid := false;
  END;

  v_limit := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50);

  RETURN QUERY
  SELECT
    p.id,
    p.address_line,
    p.district,
    p.city,
    p.name,
    p.status,
    -- Only expose owner_id for properties the caller's utility already owns/created
    -- or already linked; otherwise NULL. Never expose current_renter_id.
    CASE
      WHEN p.created_by_tenant_id IN (
        SELECT tm.tenant_id
        FROM public.tenant_memberships tm
        JOIN public.tenants t ON t.id = tm.tenant_id
        WHERE tm.user_id = auth.uid()
          AND tm.status = 'active'
          AND tm.role IN ('utility_admin', 'utility_staff')
          AND t.status = 'active'
          AND t.tenant_type IN ('water_company', 'electricity_company')
      )
      OR EXISTS (
        SELECT 1
        FROM public.utility_accounts ua
        JOIN public.tenant_memberships tm ON tm.tenant_id = ua.tenant_id
        WHERE ua.property_id = p.id
          AND tm.user_id = auth.uid()
          AND tm.status = 'active'
          AND tm.role IN ('utility_admin', 'utility_staff')
      )
      THEN p.owner_id
      ELSE NULL
    END AS owner_id,
    NULL::uuid AS current_renter_id,
    p.tenant_id AS landlord_tenant_id
  FROM public.properties p
  WHERE
    (
      -- Exact UUID lookup (intentional link by known property id)
      (v_is_uuid AND p.id = v_uuid)
      OR
      (
        NOT v_is_uuid
        AND (
          p.address_line ILIKE '%' || v_q || '%'
          OR COALESCE(p.name, '') ILIKE '%' || v_q || '%'
          OR COALESCE(p.district, '') ILIKE '%' || v_q || '%'
          OR COALESCE(p.city, '') ILIKE '%' || v_q || '%'
        )
        AND (
          -- Own utility-created premises
          p.created_by_tenant_id IN (
            SELECT tm.tenant_id
            FROM public.tenant_memberships tm
            JOIN public.tenants t ON t.id = tm.tenant_id
            WHERE tm.user_id = auth.uid()
              AND tm.status = 'active'
              AND tm.role IN ('utility_admin', 'utility_staff')
              AND t.status = 'active'
              AND t.tenant_type IN ('water_company', 'electricity_company')
          )
          OR EXISTS (
            SELECT 1
            FROM public.utility_accounts ua
            JOIN public.tenant_memberships tm ON tm.tenant_id = ua.tenant_id
            WHERE ua.property_id = p.id
              AND tm.user_id = auth.uid()
              AND tm.status = 'active'
              AND tm.role IN ('utility_admin', 'utility_staff')
          )
          -- Public marketplace listings only (no private occupied inventory dump)
          OR (p.is_listed = true AND p.status = 'available')
        )
      )
    )
  ORDER BY p.address_line
  LIMIT v_limit;
END;
$$;

-- =============================================================================
-- 5) create_utility_premises: never write into another landlord tenant
-- =============================================================================
CREATE OR REPLACE FUNCTION public.create_utility_premises(
  p_company_tenant_id uuid,
  p_address_line text,
  p_owner_id uuid,
  p_name text DEFAULT NULL,
  p_district text DEFAULT NULL,
  p_city text DEFAULT NULL,
  p_property_type public.property_type DEFAULT 'other',
  p_contact_phone text DEFAULT NULL,
  p_contact_email text DEFAULT NULL
)
RETURNS public.properties
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant public.tenants%ROWTYPE;
  v_property public.properties%ROWTYPE;
  v_source text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  IF NOT public.can_manage_utility_ops(p_company_tenant_id) THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_tenant FROM public.tenants WHERE id = p_company_tenant_id;
  IF NOT FOUND OR v_tenant.status <> 'active' THEN
    RAISE EXCEPTION 'utility tenant not found or inactive';
  END IF;

  IF v_tenant.tenant_type = 'water_company' THEN
    v_source := 'water_company';
  ELSIF v_tenant.tenant_type = 'electricity_company' THEN
    v_source := 'electricity_company';
  ELSE
    RAISE EXCEPTION 'tenant must be water or electricity company';
  END IF;

  IF NULLIF(trim(p_address_line), '') IS NULL THEN
    RAISE EXCEPTION 'address_line is required';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_owner_id) THEN
    RAISE EXCEPTION 'owner profile not found';
  END IF;

  PERFORM set_config('ijaaro.internal', '1', true);

  -- Always attach under the creating utility tenant — never hijack a landlord tenant_id.
  INSERT INTO public.properties (
    tenant_id,
    owner_id,
    name,
    address_line,
    district,
    city,
    property_type,
    status,
    contact_phone,
    contact_email,
    created_by_tenant_id,
    created_source,
    is_listed
  ) VALUES (
    p_company_tenant_id,
    p_owner_id,
    NULLIF(trim(COALESCE(p_name, '')), ''),
    trim(p_address_line),
    NULLIF(trim(COALESCE(p_district, '')), ''),
    NULLIF(trim(COALESCE(p_city, '')), ''),
    COALESCE(p_property_type, 'other'::public.property_type),
    'vacant'::public.property_status,
    NULLIF(trim(COALESCE(p_contact_phone, '')), ''),
    NULLIF(trim(COALESCE(p_contact_email, '')), ''),
    p_company_tenant_id,
    v_source,
    false
  )
  RETURNING * INTO v_property;

  PERFORM public._insert_audit_log(
    p_company_tenant_id,
    auth.uid(),
    'utility.premises_created',
    'property',
    v_property.id,
    jsonb_build_object(
      'created_source', v_source,
      'address_line', v_property.address_line,
      'owner_id', p_owner_id
    )
  );

  RETURN v_property;
END;
$$;

-- =============================================================================
-- 6) Payment-proof storage: rent policies must not cast 'utility' as uuid
-- =============================================================================
DROP POLICY IF EXISTS payment_proofs_storage_select ON storage.objects;
CREATE POLICY payment_proofs_storage_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'payment-proofs'
    AND (storage.foldername(name))[1] <> 'utility'
    AND (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND (
      public.can_approve_rent((storage.foldername(name))[1]::uuid)
      OR public.can_manage_landlord_ops((storage.foldername(name))[1]::uuid)
      OR public.is_assignment_renter((storage.foldername(name))[2]::uuid)
      OR public.is_super_admin()
    )
  );

DROP POLICY IF EXISTS payment_proofs_storage_insert ON storage.objects;
CREATE POLICY payment_proofs_storage_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'payment-proofs'
    AND (storage.foldername(name))[1] <> 'utility'
    AND (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND public.is_assignment_renter((storage.foldername(name))[2]::uuid)
    AND EXISTS (
      SELECT 1 FROM public.rental_assignments ra
      WHERE ra.id = (storage.foldername(name))[2]::uuid
        AND ra.tenant_id = (storage.foldername(name))[1]::uuid
        AND ra.renter_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS payment_proofs_storage_delete ON storage.objects;
CREATE POLICY payment_proofs_storage_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'payment-proofs'
    AND (storage.foldername(name))[1] <> 'utility'
    AND (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND (
      public.is_assignment_renter((storage.foldername(name))[2]::uuid)
      OR public.can_manage_landlord_ops((storage.foldername(name))[1]::uuid)
    )
  );

-- =============================================================================
-- 7) Tenant branding storage: admins only (not renters/customers)
-- =============================================================================
UPDATE storage.buckets
SET allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
WHERE id = 'tenant-branding';

DROP POLICY IF EXISTS tenant_branding_storage_insert ON storage.objects;
CREATE POLICY tenant_branding_storage_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'tenant-branding'
    AND (
      (
        (storage.foldername(name))[1] = auth.uid()::text
        AND public.is_super_admin()
      )
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
      (
        (storage.foldername(name))[1] = auth.uid()::text
        AND public.is_super_admin()
      )
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
      (
        (storage.foldername(name))[1] = auth.uid()::text
        AND public.is_super_admin()
      )
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
      (
        (storage.foldername(name))[1] = auth.uid()::text
        AND public.is_super_admin()
      )
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

-- =============================================================================
-- 8) Narrow resolve_tenant_workspace public surface (already limited fields)
--    Documented intentional: anon may resolve public branding only.
-- =============================================================================
-- No schema change; keep GRANT to anon. Ensure function never returns secrets.
-- (Existing implementation returns id, name, slug, subdomain, type, status, branding.)
