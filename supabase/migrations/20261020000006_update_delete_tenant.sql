-- Super Admin: update tenant fields + hard-delete tenant with owned data cascade

CREATE OR REPLACE FUNCTION public.update_tenant(
  p_tenant_id uuid,
  p_name text DEFAULT NULL,
  p_slug text DEFAULT NULL,
  p_subdomain text DEFAULT NULL,
  p_status public.tenant_status DEFAULT NULL
)
RETURNS public.tenants
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_before public.tenants%ROWTYPE;
  v_tenant public.tenants%ROWTYPE;
  v_name text;
  v_slug text;
  v_subdomain text;
  v_status public.tenant_status;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_before
  FROM public.tenants
  WHERE id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'tenant not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_before.tenant_type = 'platform' THEN
    RAISE EXCEPTION 'platform tenant cannot be updated via this RPC';
  END IF;

  v_name := COALESCE(NULLIF(btrim(p_name), ''), v_before.name);
  v_status := COALESCE(p_status, v_before.status);

  v_slug := lower(btrim(COALESCE(NULLIF(p_slug, ''), v_before.slug)));
  v_slug := regexp_replace(v_slug, '[^a-z0-9]+', '-', 'g');
  v_slug := regexp_replace(v_slug, '^-+|-+$', '', 'g');
  IF v_slug = '' THEN
    RAISE EXCEPTION 'slug is required';
  END IF;
  v_slug := left(v_slug, 48);

  v_subdomain := lower(btrim(COALESCE(NULLIF(p_subdomain, ''), v_before.subdomain, v_slug)));
  v_subdomain := regexp_replace(v_subdomain, '[^a-z0-9]+', '-', 'g');
  v_subdomain := regexp_replace(v_subdomain, '^-+|-+$', '', 'g');
  IF v_subdomain = '' THEN
    v_subdomain := v_slug;
  END IF;
  v_subdomain := left(v_subdomain, 48);

  IF EXISTS (
    SELECT 1 FROM public.tenants t
    WHERE t.id <> p_tenant_id
      AND (t.slug = v_slug OR t.subdomain = v_slug OR t.slug = v_subdomain OR t.subdomain = v_subdomain)
  ) THEN
    RAISE EXCEPTION 'slug or subdomain already in use';
  END IF;

  UPDATE public.tenants
  SET
    name = v_name,
    slug = v_slug,
    subdomain = v_subdomain,
    status = v_status,
    updated_at = now()
  WHERE id = p_tenant_id
  RETURNING * INTO v_tenant;

  PERFORM public._insert_audit_log(
    v_tenant.id,
    auth.uid(),
    'tenant.updated',
    'tenant',
    v_tenant.id,
    jsonb_build_object(
      'from', jsonb_build_object(
        'name', v_before.name,
        'slug', v_before.slug,
        'subdomain', v_before.subdomain,
        'status', v_before.status
      ),
      'to', jsonb_build_object(
        'name', v_tenant.name,
        'slug', v_tenant.slug,
        'subdomain', v_tenant.subdomain,
        'status', v_tenant.status
      )
    )
  );

  RETURN v_tenant;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_tenant(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant public.tenants%ROWTYPE;
  v_counts jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_tenant
  FROM public.tenants
  WHERE id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'tenant not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_tenant.tenant_type = 'platform' THEN
    RAISE EXCEPTION 'platform tenant cannot be deleted';
  END IF;

  -- Other companies may still bill properties owned by this landlord tenant
  IF EXISTS (
    SELECT 1
    FROM public.utility_accounts ua
    JOIN public.properties p ON p.id = ua.property_id
    WHERE p.tenant_id = p_tenant_id
      AND ua.tenant_id <> p_tenant_id
  ) THEN
    RAISE EXCEPTION
      'cannot delete: other utility companies still have accounts linked to this tenant''s properties. Close or reassign those accounts first.';
  END IF;

  -- Break self-FK on meter reading corrections
  UPDATE public.meter_readings
  SET correction_of_id = NULL
  WHERE tenant_id = p_tenant_id
    AND correction_of_id IS NOT NULL;

  DELETE FROM public.utility_payments WHERE tenant_id = p_tenant_id;
  DELETE FROM public.utility_bills WHERE tenant_id = p_tenant_id;
  DELETE FROM public.meter_readings WHERE tenant_id = p_tenant_id;
  DELETE FROM public.meters WHERE tenant_id = p_tenant_id;
  DELETE FROM public.utility_accounts WHERE tenant_id = p_tenant_id;

  DELETE FROM public.rent_payments WHERE tenant_id = p_tenant_id;
  DELETE FROM public.rent_charges WHERE tenant_id = p_tenant_id;
  DELETE FROM public.rental_assignments WHERE tenant_id = p_tenant_id;
  DELETE FROM public.rental_applications WHERE tenant_id = p_tenant_id;
  DELETE FROM public.property_photos WHERE tenant_id = p_tenant_id;
  DELETE FROM public.properties WHERE tenant_id = p_tenant_id;

  -- memberships + tenant_renter_usernames cascade; audit_logs tenant_id SET NULL
  DELETE FROM public.tenants WHERE id = p_tenant_id;

  v_counts := jsonb_build_object(
    'id', v_tenant.id,
    'name', v_tenant.name,
    'slug', v_tenant.slug,
    'tenant_type', v_tenant.tenant_type
  );

  PERFORM public._insert_audit_log(
    NULL,
    auth.uid(),
    'tenant.deleted',
    'tenant',
    p_tenant_id,
    v_counts
  );

  RETURN v_counts;
END;
$$;

REVOKE ALL ON FUNCTION public.update_tenant(
  uuid, text, text, text, public.tenant_status
) FROM PUBLIC, anon;

REVOKE ALL ON FUNCTION public.delete_tenant(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.update_tenant(
  uuid, text, text, text, public.tenant_status
) TO authenticated;

GRANT EXECUTE ON FUNCTION public.delete_tenant(uuid) TO authenticated;
