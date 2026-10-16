-- Public self-serve workspace onboarding.
-- Authenticated users may create one active tenant of a given type for themselves.
-- Super Admin provision_tenant remains unchanged.

CREATE OR REPLACE FUNCTION public.self_provision_tenant(
  p_name text,
  p_slug text,
  p_tenant_type public.tenant_type,
  p_subdomain text DEFAULT NULL,
  p_branding jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant public.tenants%ROWTYPE;
  v_membership public.tenant_memberships%ROWTYPE;
  v_owner_role public.app_role;
  v_base_slug text;
  v_slug text;
  v_subdomain text;
  v_n int := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  IF p_tenant_type IS NULL OR p_tenant_type = 'platform' THEN
    RAISE EXCEPTION 'invalid tenant type for self-provision'
      USING ERRCODE = '22023';
  END IF;

  IF p_tenant_type NOT IN ('landlord', 'water_company', 'electricity_company') THEN
    RAISE EXCEPTION 'unsupported tenant type: %', p_tenant_type
      USING ERRCODE = '22023';
  END IF;

  IF p_name IS NULL OR btrim(p_name) = '' THEN
    RAISE EXCEPTION 'name is required' USING ERRCODE = '22023';
  END IF;

  -- One active admin-owned workspace per tenant type (spam guard)
  IF EXISTS (
    SELECT 1
    FROM public.tenant_memberships tm
    JOIN public.tenants t ON t.id = tm.tenant_id
    WHERE tm.user_id = v_uid
      AND tm.status = 'active'
      AND tm.role IN ('landlord_admin', 'utility_admin')
      AND t.tenant_type = p_tenant_type
      AND t.status IN ('active', 'pending')
  ) THEN
    RAISE EXCEPTION 'you already have an active % workspace', p_tenant_type
      USING ERRCODE = '23505';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_uid) THEN
    RAISE EXCEPTION 'profile not found for current user' USING ERRCODE = 'P0002';
  END IF;

  v_owner_role := CASE p_tenant_type
    WHEN 'landlord' THEN 'landlord_admin'::public.app_role
    ELSE 'utility_admin'::public.app_role
  END;

  v_base_slug := lower(btrim(COALESCE(NULLIF(p_slug, ''), NULLIF(p_subdomain, ''), 'tenant')));
  v_base_slug := regexp_replace(v_base_slug, '[^a-z0-9]+', '-', 'g');
  v_base_slug := regexp_replace(v_base_slug, '^-+|-+$', '', 'g');
  IF v_base_slug = '' THEN
    v_base_slug := 'tenant';
  END IF;
  v_base_slug := left(v_base_slug, 48);

  v_slug := v_base_slug;
  WHILE EXISTS (
    SELECT 1 FROM public.tenants t WHERE t.slug = v_slug OR t.subdomain = v_slug
  ) LOOP
    v_n := v_n + 1;
    v_slug := left(v_base_slug, 40) || '-' || v_n::text;
  END LOOP;

  v_subdomain := lower(btrim(COALESCE(NULLIF(p_subdomain, ''), v_slug)));
  v_subdomain := regexp_replace(v_subdomain, '[^a-z0-9]+', '-', 'g');
  v_subdomain := regexp_replace(v_subdomain, '^-+|-+$', '', 'g');
  IF v_subdomain = '' THEN
    v_subdomain := v_slug;
  END IF;

  WHILE EXISTS (
    SELECT 1 FROM public.tenants t
    WHERE t.subdomain = v_subdomain AND t.slug <> v_slug
  ) OR (
    EXISTS (SELECT 1 FROM public.tenants t WHERE t.slug = v_subdomain AND t.slug <> v_slug)
  ) LOOP
    v_n := v_n + 1;
    v_subdomain := left(v_base_slug, 40) || '-' || v_n::text;
  END LOOP;

  INSERT INTO public.tenants (name, slug, subdomain, tenant_type, status, branding, settings)
  VALUES (
    trim(p_name),
    v_slug,
    v_subdomain,
    p_tenant_type,
    'active',
    COALESCE(p_branding, '{}'::jsonb),
    '{}'::jsonb
  )
  RETURNING * INTO v_tenant;

  INSERT INTO public.tenant_memberships (tenant_id, user_id, role, status, invited_by)
  VALUES (v_tenant.id, v_uid, v_owner_role, 'active', v_uid)
  RETURNING * INTO v_membership;

  PERFORM public._insert_audit_log(
    v_tenant.id,
    v_uid,
    'tenant.self_provisioned',
    'tenant',
    v_tenant.id,
    jsonb_build_object(
      'slug', v_tenant.slug,
      'subdomain', v_tenant.subdomain,
      'tenant_type', v_tenant.tenant_type,
      'status', v_tenant.status,
      'owner_user_id', v_uid,
      'owner_role', v_owner_role
    )
  );

  RETURN jsonb_build_object(
    'tenant', to_jsonb(v_tenant),
    'membership', to_jsonb(v_membership),
    'workspace', jsonb_build_object(
      'slug', v_tenant.slug,
      'subdomain', v_tenant.subdomain,
      'path', '/?tenant=' || v_tenant.slug
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.self_provision_tenant(
  text, text, public.tenant_type, text, jsonb
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.self_provision_tenant(
  text, text, public.tenant_type, text, jsonb
) TO authenticated;
