-- IJAARO Phase 1: Platform Foundation & Multi-Tenant Security
-- profiles, tenants, tenant_memberships, audit_logs, helpers, RLS, privileged RPCs

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
CREATE TYPE public.tenant_type AS ENUM (
  'platform',
  'landlord',
  'water_company',
  'electricity_company'
);

CREATE TYPE public.tenant_status AS ENUM (
  'pending',
  'active',
  'suspended',
  'disabled'
);

CREATE TYPE public.membership_status AS ENUM (
  'invited',
  'active',
  'disabled'
);

CREATE TYPE public.app_role AS ENUM (
  'super_admin',
  'landlord_admin',
  'landlord_staff',
  'renter',
  'utility_admin',
  'utility_staff',
  'utility_customer'
);

-- ---------------------------------------------------------------------------
-- updated_at helper
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  full_name text NOT NULL DEFAULT '',
  phone text,
  email text,
  avatar_url text,
  preferred_language text NOT NULL DEFAULT 'so',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER profiles_set_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Idempotent profile provisioning from auth.users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(COALESCE(NEW.email, ''), '@', 1), ''),
    NEW.email
  )
  ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        full_name = CASE
          WHEN public.profiles.full_name = '' THEN EXCLUDED.full_name
          ELSE public.profiles.full_name
        END,
        updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ---------------------------------------------------------------------------
-- tenants
-- ---------------------------------------------------------------------------
CREATE TABLE public.tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL,
  tenant_type public.tenant_type NOT NULL,
  status public.tenant_status NOT NULL DEFAULT 'pending',
  branding jsonb NOT NULL DEFAULT '{}'::jsonb,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenants_slug_format CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  CONSTRAINT tenants_slug_unique UNIQUE (slug)
);

CREATE INDEX idx_tenants_type_status ON public.tenants (tenant_type, status);

CREATE TRIGGER tenants_set_updated_at
  BEFORE UPDATE ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- tenant_memberships
-- ---------------------------------------------------------------------------
CREATE TABLE public.tenant_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  status public.membership_status NOT NULL DEFAULT 'invited',
  permissions jsonb NOT NULL DEFAULT '{}'::jsonb,
  invited_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_tenant_memberships_tenant_user UNIQUE (tenant_id, user_id)
);

CREATE INDEX idx_tenant_memberships_user_status
  ON public.tenant_memberships (user_id, status);
CREATE INDEX idx_tenant_memberships_tenant_role_status
  ON public.tenant_memberships (tenant_id, role, status);

CREATE TRIGGER tenant_memberships_set_updated_at
  BEFORE UPDATE ON public.tenant_memberships
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Role must match tenant type
CREATE OR REPLACE FUNCTION public.validate_membership_role()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_type public.tenant_type;
BEGIN
  SELECT tenant_type INTO v_type FROM public.tenants WHERE id = NEW.tenant_id;
  IF v_type IS NULL THEN
    RAISE EXCEPTION 'tenant not found';
  END IF;

  IF NEW.role = 'super_admin' AND v_type <> 'platform' THEN
    RAISE EXCEPTION 'super_admin role requires platform tenant';
  END IF;

  IF NEW.role IN ('landlord_admin', 'landlord_staff', 'renter') AND v_type <> 'landlord' THEN
    RAISE EXCEPTION 'landlord roles require landlord tenant';
  END IF;

  IF NEW.role IN ('utility_admin', 'utility_staff', 'utility_customer')
     AND v_type NOT IN ('water_company', 'electricity_company') THEN
    RAISE EXCEPTION 'utility roles require water_company or electricity_company tenant';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER tenant_memberships_validate_role
  BEFORE INSERT OR UPDATE OF role, tenant_id ON public.tenant_memberships
  FOR EACH ROW EXECUTE FUNCTION public.validate_membership_role();

-- ---------------------------------------------------------------------------
-- audit_logs (append-only)
-- ---------------------------------------------------------------------------
CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants (id) ON DELETE SET NULL,
  actor_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_logs_tenant_created
  ON public.audit_logs (tenant_id, created_at DESC);
CREATE INDEX idx_audit_logs_entity
  ON public.audit_logs (entity_type, entity_id);

-- ---------------------------------------------------------------------------
-- Authorization helpers (SECURITY DEFINER, fixed search_path)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_super_admin()
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
    WHERE tm.user_id = auth.uid()
      AND tm.role = 'super_admin'
      AND tm.status = 'active'
      AND t.tenant_type = 'platform'
      AND t.status = 'active'
  );
$$;

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

CREATE OR REPLACE FUNCTION public.is_tenant_admin(p_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(
    p_tenant_id,
    ARRAY['landlord_admin', 'utility_admin']::public.app_role[]
  ) OR public.is_super_admin();
$$;

REVOKE ALL ON FUNCTION public.is_super_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_member_of(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_tenant_admin(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_member_of(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_tenant_admin(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Internal audit writer (used by RPCs)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._insert_audit_log(
  p_tenant_id uuid,
  p_actor_id uuid,
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.audit_logs (tenant_id, actor_id, action, entity_type, entity_id, metadata)
  VALUES (p_tenant_id, p_actor_id, p_action, p_entity_type, p_entity_id, COALESCE(p_metadata, '{}'::jsonb))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public._insert_audit_log(uuid, uuid, text, text, uuid, jsonb) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- Privileged RPCs
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.provision_tenant(
  p_name text,
  p_slug text,
  p_tenant_type public.tenant_type,
  p_status public.tenant_status DEFAULT 'pending',
  p_owner_user_id uuid DEFAULT NULL,
  p_owner_role public.app_role DEFAULT NULL,
  p_branding jsonb DEFAULT '{}'::jsonb,
  p_settings jsonb DEFAULT '{}'::jsonb
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
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  IF p_tenant_type = 'platform' THEN
    RAISE EXCEPTION 'platform tenant cannot be provisioned via this RPC';
  END IF;

  IF p_owner_user_id IS NOT NULL THEN
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
  END IF;

  INSERT INTO public.tenants (name, slug, tenant_type, status, branding, settings)
  VALUES (
    trim(p_name),
    lower(trim(p_slug)),
    p_tenant_type,
    COALESCE(p_status, 'pending'),
    COALESCE(p_branding, '{}'::jsonb),
    COALESCE(p_settings, '{}'::jsonb)
  )
  RETURNING * INTO v_tenant;

  IF p_owner_user_id IS NOT NULL THEN
    INSERT INTO public.tenant_memberships (tenant_id, user_id, role, status, invited_by)
    VALUES (v_tenant.id, p_owner_user_id, v_owner_role, 'active', auth.uid())
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
      'tenant_type', v_tenant.tenant_type,
      'status', v_tenant.status,
      'owner_user_id', p_owner_user_id,
      'owner_role', v_owner_role
    )
  );

  RETURN jsonb_build_object(
    'tenant', to_jsonb(v_tenant),
    'membership', CASE WHEN v_membership.id IS NULL THEN NULL ELSE to_jsonb(v_membership) END
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.set_tenant_status(
  p_tenant_id uuid,
  p_status public.tenant_status
)
RETURNS public.tenants
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_before public.tenant_status;
  v_tenant public.tenants%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT status INTO v_before FROM public.tenants WHERE id = p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'tenant not found';
  END IF;

  UPDATE public.tenants
  SET status = p_status
  WHERE id = p_tenant_id
  RETURNING * INTO v_tenant;

  PERFORM public._insert_audit_log(
    v_tenant.id,
    auth.uid(),
    'tenant.status_changed',
    'tenant',
    v_tenant.id,
    jsonb_build_object('from', v_before, 'to', p_status)
  );

  RETURN v_tenant;
END;
$$;

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

  -- Prevent non-super-admin from elevating anyone to super_admin (belt + suspenders)
  IF p_role = 'super_admin' AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'cannot grant super_admin' USING ERRCODE = '42501';
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

REVOKE ALL ON FUNCTION public.provision_tenant(text, text, public.tenant_type, public.tenant_status, uuid, public.app_role, jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_tenant_status(uuid, public.tenant_status) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.manage_membership(uuid, uuid, public.app_role, public.membership_status) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.provision_tenant(text, text, public.tenant_type, public.tenant_status, uuid, public.app_role, jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_tenant_status(uuid, public.tenant_status) TO authenticated;
GRANT EXECUTE ON FUNCTION public.manage_membership(uuid, uuid, public.app_role, public.membership_status) TO authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- profiles
CREATE POLICY profiles_select_own_or_admin
  ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.is_super_admin());

CREATE POLICY profiles_insert_own
  ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());

CREATE POLICY profiles_update_own
  ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid() OR public.is_super_admin())
  WITH CHECK (id = auth.uid() OR public.is_super_admin());

-- tenants
CREATE POLICY tenants_select_member_or_admin
  ON public.tenants FOR SELECT TO authenticated
  USING (public.is_super_admin() OR public.is_member_of(id));

CREATE POLICY tenants_insert_super_admin
  ON public.tenants FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin());

CREATE POLICY tenants_update_super_admin
  ON public.tenants FOR UPDATE TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- no DELETE policy on tenants (soft status only)

-- tenant_memberships
CREATE POLICY memberships_select_self_admin_or_super
  ON public.tenant_memberships FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_super_admin()
    OR public.has_role(tenant_id, ARRAY['landlord_admin', 'utility_admin']::public.app_role[])
  );

CREATE POLICY memberships_insert_authorized
  ON public.tenant_memberships FOR INSERT TO authenticated
  WITH CHECK (
    public.is_super_admin()
    OR (
      role <> 'super_admin'
      AND public.has_role(tenant_id, ARRAY['landlord_admin', 'utility_admin']::public.app_role[])
    )
  );

CREATE POLICY memberships_update_authorized
  ON public.tenant_memberships FOR UPDATE TO authenticated
  USING (
    public.is_super_admin()
    OR public.has_role(tenant_id, ARRAY['landlord_admin', 'utility_admin']::public.app_role[])
  )
  WITH CHECK (
    public.is_super_admin()
    OR (
      role <> 'super_admin'
      AND public.has_role(tenant_id, ARRAY['landlord_admin', 'utility_admin']::public.app_role[])
    )
  );

-- audit_logs: SELECT for super_admin and tenant admins of that tenant; no client INSERT/UPDATE/DELETE
CREATE POLICY audit_logs_select_authorized
  ON public.audit_logs FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR (
      tenant_id IS NOT NULL
      AND public.has_role(tenant_id, ARRAY['landlord_admin', 'utility_admin']::public.app_role[])
    )
  );

-- Grants: tables to authenticated (RLS still applies). No grants to anon.
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, UPDATE ON public.profiles TO authenticated;
GRANT INSERT ON public.profiles TO authenticated;
GRANT SELECT ON public.tenants TO authenticated;
GRANT SELECT ON public.tenant_memberships TO authenticated;
GRANT SELECT ON public.audit_logs TO authenticated;

-- Direct inserts/updates on tenants/memberships restricted to policies;
-- Super Admin / admins may still need INSERT/UPDATE privileges for RLS WITH CHECK to run.
GRANT INSERT, UPDATE ON public.tenants TO authenticated;
GRANT INSERT, UPDATE ON public.tenant_memberships TO authenticated;

-- Explicitly no INSERT/UPDATE/DELETE on audit_logs for authenticated (writes via SECURITY DEFINER only)
REVOKE INSERT, UPDATE, DELETE ON public.audit_logs FROM authenticated;
REVOKE ALL ON public.profiles FROM anon;
REVOKE ALL ON public.tenants FROM anon;
REVOKE ALL ON public.tenant_memberships FROM anon;
REVOKE ALL ON public.audit_logs FROM anon;
