-- Phase SaaS hardening: subdomain, tenant independence, stronger RLS helpers,
-- provision-with-admin-email, and immutable tenant_id on domain tables.

-- ---------------------------------------------------------------------------
-- tenants.subdomain (SaaS workspace host key; defaults to slug)
-- ---------------------------------------------------------------------------
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS subdomain text;

UPDATE public.tenants
SET subdomain = slug
WHERE subdomain IS NULL;

ALTER TABLE public.tenants
  ALTER COLUMN subdomain SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'tenants_subdomain_format'
      AND conrelid = 'public.tenants'::regclass
  ) THEN
    ALTER TABLE public.tenants
      ADD CONSTRAINT tenants_subdomain_format
      CHECK (subdomain ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$');
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS tenants_subdomain_unique
  ON public.tenants (subdomain);

CREATE OR REPLACE FUNCTION public.sync_tenant_subdomain()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.subdomain IS NULL OR btrim(NEW.subdomain) = '' THEN
    NEW.subdomain := NEW.slug;
  ELSE
    NEW.subdomain := lower(btrim(NEW.subdomain));
  END IF;
  NEW.slug := lower(btrim(NEW.slug));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tenants_sync_subdomain ON public.tenants;
CREATE TRIGGER tenants_sync_subdomain
  BEFORE INSERT OR UPDATE OF slug, subdomain ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.sync_tenant_subdomain();

REVOKE ALL ON FUNCTION public.sync_tenant_subdomain() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_tenant_subdomain() FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- Stronger membership / operability helpers (tenant independence)
-- ---------------------------------------------------------------------------
-- Membership visibility: active membership + tenant not suspended/disabled
CREATE OR REPLACE FUNCTION public.is_member_of(p_tenant_id uuid)
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
      AND t.status IN ('active', 'pending')
  );
$$;

CREATE OR REPLACE FUNCTION public.has_role(p_tenant_id uuid, p_roles public.app_role[])
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
      AND tm.role = ANY (p_roles)
      AND t.status IN ('active', 'pending')
  );
$$;

-- Writes / ops require an ACTIVE tenant (pending workspaces cannot mutate data)
CREATE OR REPLACE FUNCTION public.tenant_is_operable(p_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tenants t
    WHERE t.id = p_tenant_id
      AND t.status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION public.can_operate_in_tenant(p_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_member_of(p_tenant_id)
    AND public.tenant_is_operable(p_tenant_id);
$$;

-- Landlord writes: role + active tenant only
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
      AND tm.role IN ('landlord_admin', 'landlord_staff')
      AND t.status = 'active'
      AND t.tenant_type = 'landlord'
  );
$$;

CREATE OR REPLACE FUNCTION public.can_approve_rent(p_tenant_id uuid)
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

-- Utility helpers already require active; reaffirm type isolation
CREATE OR REPLACE FUNCTION public.can_manage_utility_ops(p_tenant_id uuid)
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
      AND tm.role IN ('utility_admin', 'utility_staff')
      AND t.status = 'active'
      AND t.tenant_type IN ('water_company', 'electricity_company')
  );
$$;

CREATE OR REPLACE FUNCTION public.can_approve_utility(p_tenant_id uuid)
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
      AND tm.role = 'utility_admin'
      AND t.status = 'active'
      AND t.tenant_type IN ('water_company', 'electricity_company')
  );
$$;

REVOKE ALL ON FUNCTION public.tenant_is_operable(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_operate_in_tenant(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tenant_is_operable(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.can_operate_in_tenant(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.tenant_is_operable(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_operate_in_tenant(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Immutable tenant_id on domain tables (prevents cross-tenant row moves)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.prevent_tenant_id_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
    RAISE EXCEPTION 'tenant_id is immutable' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.prevent_tenant_id_change() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.prevent_tenant_id_change() FROM anon, authenticated;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'property_photos',
    'rent_charges',
    'rent_payments',
    'utility_accounts',
    'meters',
    'meter_readings',
    'utility_bills',
    'utility_payments'
  ]
  LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format(
        'DROP TRIGGER IF EXISTS %I_prevent_tenant_id_change ON public.%I',
        t, t
      );
      EXECUTE format(
        'CREATE TRIGGER %I_prevent_tenant_id_change
           BEFORE UPDATE OF tenant_id ON public.%I
           FOR EACH ROW EXECUTE FUNCTION public.prevent_tenant_id_change()',
        t, t
      );
    END IF;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- Super Admin: lookup profile by email (for assign-admin during provision)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.lookup_profile_by_email(p_email text)
RETURNS TABLE (
  id uuid,
  full_name text,
  email text,
  phone text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT p.id, p.full_name, p.email, p.phone
  FROM public.profiles p
  WHERE lower(btrim(p.email)) = lower(btrim(p_email))
  LIMIT 5;
END;
$$;

REVOKE ALL ON FUNCTION public.lookup_profile_by_email(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.lookup_profile_by_email(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.lookup_profile_by_email(text) TO authenticated;

-- ---------------------------------------------------------------------------
-- Resolve workspace by slug/subdomain (limited public fields for entry UX)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resolve_tenant_workspace(p_key text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key text := lower(btrim(COALESCE(p_key, '')));
  v_row public.tenants%ROWTYPE;
BEGIN
  IF v_key = '' THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_row
  FROM public.tenants t
  WHERE (t.slug = v_key OR t.subdomain = v_key)
    AND t.tenant_type <> 'platform'
    AND t.status IN ('active', 'pending')
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'id', v_row.id,
    'name', v_row.name,
    'slug', v_row.slug,
    'subdomain', v_row.subdomain,
    'tenant_type', v_row.tenant_type,
    'status', v_row.status,
    'branding', v_row.branding
  );
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_tenant_workspace(text) FROM PUBLIC;
-- Allow authenticated + anon to resolve branding for login entry (no secrets)
GRANT EXECUTE ON FUNCTION public.resolve_tenant_workspace(text) TO authenticated, anon;

-- ---------------------------------------------------------------------------
-- Enhanced provision_tenant: subdomain + optional owner email + unique slug
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.provision_tenant(
  text, text, public.tenant_type, public.tenant_status, uuid, public.app_role, jsonb, jsonb
);

CREATE OR REPLACE FUNCTION public.provision_tenant(
  p_name text,
  p_slug text,
  p_tenant_type public.tenant_type,
  p_status public.tenant_status DEFAULT 'pending',
  p_owner_user_id uuid DEFAULT NULL,
  p_owner_role public.app_role DEFAULT NULL,
  p_branding jsonb DEFAULT '{}'::jsonb,
  p_settings jsonb DEFAULT '{}'::jsonb,
  p_owner_email text DEFAULT NULL,
  p_subdomain text DEFAULT NULL,
  p_activate boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant public.tenants%ROWTYPE;
  v_membership public.tenant_memberships%ROWTYPE;
  v_owner_role public.app_role;
  v_owner_id uuid := p_owner_user_id;
  v_base_slug text;
  v_slug text;
  v_subdomain text;
  v_status public.tenant_status;
  v_n int := 0;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  IF p_tenant_type = 'platform' THEN
    RAISE EXCEPTION 'platform tenant cannot be provisioned via this RPC';
  END IF;

  IF p_owner_email IS NOT NULL AND btrim(p_owner_email) <> '' THEN
    SELECT p.id INTO v_owner_id
    FROM public.profiles p
    WHERE lower(btrim(p.email)) = lower(btrim(p_owner_email))
    LIMIT 1;

    IF v_owner_id IS NULL THEN
      RAISE EXCEPTION 'owner email not found: %', p_owner_email
        USING ERRCODE = 'P0002';
    END IF;
  END IF;

  IF v_owner_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_owner_id) THEN
      RAISE EXCEPTION 'owner user not found' USING ERRCODE = 'P0002';
    END IF;

    v_owner_role := COALESCE(
      p_owner_role,
      CASE p_tenant_type
        WHEN 'landlord' THEN 'landlord_admin'::public.app_role
        ELSE 'utility_admin'::public.app_role
      END
    );

    IF v_owner_role = 'super_admin' THEN
      RAISE EXCEPTION 'cannot assign super_admin via tenant provisioning';
    END IF;

    IF p_tenant_type = 'landlord'
       AND v_owner_role NOT IN ('landlord_admin', 'landlord_staff') THEN
      RAISE EXCEPTION 'invalid owner role for landlord tenant';
    END IF;

    IF p_tenant_type IN ('water_company', 'electricity_company')
       AND v_owner_role NOT IN ('utility_admin', 'utility_staff') THEN
      RAISE EXCEPTION 'invalid owner role for utility tenant';
    END IF;
  END IF;

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

  -- Prefer activate when an owner is assigned and caller requested it
  v_status := COALESCE(p_status, 'pending');
  IF COALESCE(p_activate, false) AND v_owner_id IS NOT NULL THEN
    v_status := 'active';
  END IF;

  INSERT INTO public.tenants (name, slug, subdomain, tenant_type, status, branding, settings)
  VALUES (
    trim(p_name),
    v_slug,
    v_subdomain,
    p_tenant_type,
    v_status,
    COALESCE(p_branding, '{}'::jsonb),
    COALESCE(p_settings, '{}'::jsonb)
  )
  RETURNING * INTO v_tenant;

  IF v_owner_id IS NOT NULL THEN
    INSERT INTO public.tenant_memberships (tenant_id, user_id, role, status, invited_by)
    VALUES (v_tenant.id, v_owner_id, v_owner_role, 'active', auth.uid())
    RETURNING * INTO v_membership;
  END IF;

  PERFORM public._insert_audit_log(
    v_tenant.id,
    auth.uid(),
    'tenant.provisioned',
    'tenant',
    v_tenant.id,
    jsonb_build_object(
      'slug', v_tenant.slug,
      'subdomain', v_tenant.subdomain,
      'tenant_type', v_tenant.tenant_type,
      'status', v_tenant.status,
      'owner_user_id', v_owner_id,
      'owner_role', v_owner_role,
      'owner_email', NULLIF(btrim(COALESCE(p_owner_email, '')), '')
    )
  );

  RETURN jsonb_build_object(
    'tenant', to_jsonb(v_tenant),
    'membership', CASE WHEN v_membership.id IS NULL THEN NULL ELSE to_jsonb(v_membership) END,
    'workspace', jsonb_build_object(
      'slug', v_tenant.slug,
      'subdomain', v_tenant.subdomain,
      'path', '/?tenant=' || v_tenant.slug
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.provision_tenant(
  text, text, public.tenant_type, public.tenant_status, uuid, public.app_role, jsonb, jsonb, text, text, boolean
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.provision_tenant(
  text, text, public.tenant_type, public.tenant_status, uuid, public.app_role, jsonb, jsonb, text, text, boolean
) TO authenticated;

-- ---------------------------------------------------------------------------
-- Membership writes require operable tenant (except super_admin)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS memberships_insert_authorized ON public.tenant_memberships;
CREATE POLICY memberships_insert_authorized
  ON public.tenant_memberships FOR INSERT TO authenticated
  WITH CHECK (
    public.is_super_admin()
    OR (
      role <> 'super_admin'
      AND public.has_role(tenant_id, ARRAY['landlord_admin', 'utility_admin']::public.app_role[])
      AND public.tenant_is_operable(tenant_id)
    )
  );

DROP POLICY IF EXISTS memberships_update_authorized ON public.tenant_memberships;
CREATE POLICY memberships_update_authorized
  ON public.tenant_memberships FOR UPDATE TO authenticated
  USING (
    public.is_super_admin()
    OR (
      public.has_role(tenant_id, ARRAY['landlord_admin', 'utility_admin']::public.app_role[])
      AND public.tenant_is_operable(tenant_id)
    )
  )
  WITH CHECK (
    public.is_super_admin()
    OR (
      role <> 'super_admin'
      AND public.has_role(tenant_id, ARRAY['landlord_admin', 'utility_admin']::public.app_role[])
      AND public.tenant_is_operable(tenant_id)
    )
  );

-- Tenants: members may only see non-platform tenants they belong to;
-- super_admin sees all. Fail closed for suspended/disabled for non-admins.
DROP POLICY IF EXISTS tenants_select_member_or_admin ON public.tenants;
CREATE POLICY tenants_select_member_or_admin
  ON public.tenants FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR (
      tenant_type <> 'platform'
      AND public.is_member_of(id)
    )
  );

-- Index for email lookups used during provision
CREATE INDEX IF NOT EXISTS idx_profiles_email_lower
  ON public.profiles (lower(email));
