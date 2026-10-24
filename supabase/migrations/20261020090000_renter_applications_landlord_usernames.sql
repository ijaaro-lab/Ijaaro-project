-- RP-1.3.2: Landlord-scoped renter usernames + rental applications + public landlord listings
--
-- Product decisions:
--   * Usernames unique per landlord tenant (NOT global profiles.username).
--   * Public visitors browse published properties via landlord-scoped allowlisted RPCs (anon OK).
--   * Applicants submit pending applications without active membership.
--   * Landlord accept → manage_membership(renter, active) + username map; NO auto-assign.
--   * Reject → no membership; username reservation released; reapply allowed.
--   * One pending application per (applicant_user_id, property_id).
--   * Marketplace RPCs/policies unchanged.
--
-- Apply via privileged SQL on isolated/local only when approved.
-- Do NOT supabase db push against hosted without explicit cutover approval.
-- Do NOT apply superseded 20261019160000_profiles_username.sql.
--
-- Username reservation rule:
--   Among pending + accepted applications for a tenant, lower(requested_username) is unique.
--   tenant_renter_usernames also enforces UNIQUE (tenant_id, lower(username)).
--   Rejected applications do not hold a reservation (partial unique excludes rejected).
--
-- Rollback considerations:
--   DROP FUNCTIONS then DROP TABLES loses application history and username maps.
--   Dropping rental_applications is irreversible for request history.

-- =============================================================================
-- 0) Enum for application status
-- =============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'rental_application_status'
  ) THEN
    CREATE TYPE public.rental_application_status AS ENUM (
      'pending',
      'accepted',
      'rejected'
    );
  END IF;
END $$;

-- =============================================================================
-- 1) Landlord-scoped usernames
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.tenant_renter_usernames (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  username text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenant_renter_usernames_format CHECK (
    username ~ '^[a-z][a-z0-9_]{2,31}$'
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS tenant_renter_usernames_tenant_username_lower_uidx
  ON public.tenant_renter_usernames (tenant_id, lower(username));

CREATE UNIQUE INDEX IF NOT EXISTS tenant_renter_usernames_tenant_user_uidx
  ON public.tenant_renter_usernames (tenant_id, user_id);

CREATE INDEX IF NOT EXISTS idx_tenant_renter_usernames_user
  ON public.tenant_renter_usernames (user_id);

DROP TRIGGER IF EXISTS tenant_renter_usernames_set_updated_at ON public.tenant_renter_usernames;
CREATE TRIGGER tenant_renter_usernames_set_updated_at
  BEFORE UPDATE ON public.tenant_renter_usernames
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.validate_tenant_renter_username_tenant()
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
  IF v_type <> 'landlord' THEN
    RAISE EXCEPTION 'renter usernames require a landlord tenant' USING ERRCODE = '23514';
  END IF;
  NEW.username := lower(btrim(NEW.username));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tenant_renter_usernames_validate_tenant ON public.tenant_renter_usernames;
CREATE TRIGGER tenant_renter_usernames_validate_tenant
  BEFORE INSERT OR UPDATE OF tenant_id, username ON public.tenant_renter_usernames
  FOR EACH ROW EXECUTE FUNCTION public.validate_tenant_renter_username_tenant();

CREATE OR REPLACE FUNCTION public.prevent_tenant_renter_username_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.username IS DISTINCT FROM NEW.username THEN
    RAISE EXCEPTION 'username is immutable once assigned for a landlord' USING ERRCODE = '42501';
  END IF;
  IF OLD.tenant_id IS DISTINCT FROM NEW.tenant_id OR OLD.user_id IS DISTINCT FROM NEW.user_id THEN
    RAISE EXCEPTION 'tenant_renter_usernames tenant_id/user_id are immutable' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tenant_renter_usernames_immutable ON public.tenant_renter_usernames;
CREATE TRIGGER tenant_renter_usernames_immutable
  BEFORE UPDATE ON public.tenant_renter_usernames
  FOR EACH ROW EXECUTE FUNCTION public.prevent_tenant_renter_username_change();

ALTER TABLE public.tenant_renter_usernames ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_renter_usernames FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_renter_usernames_select ON public.tenant_renter_usernames;
CREATE POLICY tenant_renter_usernames_select ON public.tenant_renter_usernames
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_super_admin()
    OR public.has_role(tenant_id, ARRAY['landlord_admin', 'landlord_staff']::public.app_role[])
  );

-- No direct INSERT/UPDATE/DELETE for clients — RPCs only (DEFINER).
REVOKE ALL ON TABLE public.tenant_renter_usernames FROM PUBLIC;
REVOKE ALL ON TABLE public.tenant_renter_usernames FROM anon;
GRANT SELECT ON TABLE public.tenant_renter_usernames TO authenticated;

-- =============================================================================
-- 2) Rental applications (request workflow — not a parallel tenancy model)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.rental_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  property_id uuid NOT NULL REFERENCES public.properties (id) ON DELETE RESTRICT,
  applicant_user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  requested_username text NOT NULL,
  message text,
  status public.rental_application_status NOT NULL DEFAULT 'pending',
  reviewed_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rental_applications_username_format CHECK (
    requested_username ~ '^[a-z][a-z0-9_]{2,31}$'
  ),
  CONSTRAINT rental_applications_message_len CHECK (
    message IS NULL OR char_length(message) <= 2000
  ),
  CONSTRAINT rental_applications_review_consistency CHECK (
    (status = 'pending' AND reviewed_by IS NULL AND reviewed_at IS NULL)
    OR (status IN ('accepted', 'rejected') AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS rental_applications_one_pending_per_applicant_property
  ON public.rental_applications (applicant_user_id, property_id)
  WHERE status = 'pending';

-- Reserve username among pending + accepted for the same landlord (rejected frees it).
CREATE UNIQUE INDEX IF NOT EXISTS rental_applications_tenant_username_active_uidx
  ON public.rental_applications (tenant_id, lower(requested_username))
  WHERE status IN ('pending', 'accepted');

CREATE INDEX IF NOT EXISTS idx_rental_applications_tenant_status
  ON public.rental_applications (tenant_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_rental_applications_applicant
  ON public.rental_applications (applicant_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_rental_applications_property
  ON public.rental_applications (property_id);

DROP TRIGGER IF EXISTS rental_applications_set_updated_at ON public.rental_applications;
CREATE TRIGGER rental_applications_set_updated_at
  BEFORE UPDATE ON public.rental_applications
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.validate_rental_application_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_prop public.properties%ROWTYPE;
  v_type public.tenant_type;
BEGIN
  NEW.requested_username := lower(btrim(NEW.requested_username));

  SELECT * INTO v_prop FROM public.properties WHERE id = NEW.property_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'property not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_prop.tenant_id IS DISTINCT FROM NEW.tenant_id THEN
    RAISE EXCEPTION 'property does not belong to application tenant' USING ERRCODE = '23514';
  END IF;

  SELECT tenant_type INTO v_type FROM public.tenants WHERE id = NEW.tenant_id;
  IF v_type IS NULL OR v_type <> 'landlord' THEN
    RAISE EXCEPTION 'applications require a landlord tenant' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS rental_applications_validate ON public.rental_applications;
CREATE TRIGGER rental_applications_validate
  BEFORE INSERT OR UPDATE OF tenant_id, property_id, requested_username
  ON public.rental_applications
  FOR EACH ROW EXECUTE FUNCTION public.validate_rental_application_row();

ALTER TABLE public.rental_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rental_applications FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rental_applications_select ON public.rental_applications;
CREATE POLICY rental_applications_select ON public.rental_applications
  FOR SELECT TO authenticated
  USING (
    applicant_user_id = auth.uid()
    OR public.is_super_admin()
    OR public.has_role(tenant_id, ARRAY['landlord_admin', 'landlord_staff']::public.app_role[])
  );

-- No direct client writes — RPCs only.
REVOKE ALL ON TABLE public.rental_applications FROM PUBLIC;
REVOKE ALL ON TABLE public.rental_applications FROM anon;
GRANT SELECT ON TABLE public.rental_applications TO authenticated;

-- =============================================================================
-- 3) Helpers
-- =============================================================================
CREATE OR REPLACE FUNCTION public.resolve_operable_landlord_tenant(p_key text)
RETURNS public.tenants
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
    RAISE EXCEPTION 'tenant key is required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_row
  FROM public.tenants t
  WHERE (t.slug = v_key OR t.subdomain = v_key)
    AND t.tenant_type = 'landlord'
    AND t.status = 'active'
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'landlord workspace not found or not operable' USING ERRCODE = 'P0002';
  END IF;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_operable_landlord_tenant(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resolve_operable_landlord_tenant(text) FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.landlord_username_available(
  p_tenant_id uuid,
  p_username text,
  p_exclude_user_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_username text := lower(btrim(COALESCE(p_username, '')));
BEGIN
  IF v_username = '' OR v_username !~ '^[a-z][a-z0-9_]{2,31}$' THEN
    RETURN false;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.tenant_renter_usernames u
    WHERE u.tenant_id = p_tenant_id
      AND lower(u.username) = v_username
      AND (p_exclude_user_id IS NULL OR u.user_id IS DISTINCT FROM p_exclude_user_id)
  ) THEN
    RETURN false;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.rental_applications a
    WHERE a.tenant_id = p_tenant_id
      AND lower(a.requested_username) = v_username
      AND a.status IN ('pending', 'accepted')
      AND (p_exclude_user_id IS NULL OR a.applicant_user_id IS DISTINCT FROM p_exclude_user_id)
  ) THEN
    RETURN false;
  END IF;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.landlord_username_available(uuid, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.landlord_username_available(uuid, text, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.landlord_username_available(uuid, text, uuid) TO authenticated;

-- =============================================================================
-- 4) Public landlord-scoped listing RPCs (anon + authenticated)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.list_landlord_public_listings(p_tenant_key text)
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
DECLARE
  v_tenant public.tenants%ROWTYPE;
BEGIN
  v_tenant := public.resolve_operable_landlord_tenant(p_tenant_key);

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
  WHERE p.tenant_id = v_tenant.id
    AND p.is_listed = true
    AND p.status = 'available'::public.property_status
  ORDER BY p.created_at DESC;
END;
$$;

COMMENT ON FUNCTION public.list_landlord_public_listings(text) IS
  'Anon-safe landlord public browse: allowlisted card fields for listed+available properties of one landlord.';

CREATE OR REPLACE FUNCTION public.get_landlord_public_listing(
  p_tenant_key text,
  p_property_id uuid
)
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
DECLARE
  v_tenant public.tenants%ROWTYPE;
BEGIN
  IF p_property_id IS NULL THEN
    RAISE EXCEPTION 'listing id is required' USING ERRCODE = '22023';
  END IF;

  v_tenant := public.resolve_operable_landlord_tenant(p_tenant_key);

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
  WHERE p.id = p_property_id
    AND p.tenant_id = v_tenant.id
    AND p.is_listed = true
    AND p.status = 'available'::public.property_status;
END;
$$;

COMMENT ON FUNCTION public.get_landlord_public_listing(text, uuid) IS
  'Anon-safe landlord public detail: allowlisted fields for one listed+available property of the resolved landlord.';

REVOKE ALL ON FUNCTION public.list_landlord_public_listings(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_landlord_public_listing(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_landlord_public_listings(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_landlord_public_listing(text, uuid) TO anon, authenticated;

-- =============================================================================
-- 5) Application submit + list (authenticated applicant)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.submit_rental_application(
  p_tenant_key text,
  p_property_id uuid,
  p_requested_username text,
  p_message text DEFAULT NULL
)
RETURNS public.rental_applications
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant public.tenants%ROWTYPE;
  v_prop public.properties%ROWTYPE;
  v_username text := lower(btrim(COALESCE(p_requested_username, '')));
  v_message text := NULLIF(btrim(COALESCE(p_message, '')), '');
  v_row public.rental_applications%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  IF p_property_id IS NULL THEN
    RAISE EXCEPTION 'property id is required' USING ERRCODE = '22023';
  END IF;

  IF v_username = '' OR v_username !~ '^[a-z][a-z0-9_]{2,31}$' THEN
    RAISE EXCEPTION 'invalid username' USING ERRCODE = '22023';
  END IF;

  IF v_message IS NOT NULL AND char_length(v_message) > 2000 THEN
    RAISE EXCEPTION 'message too long' USING ERRCODE = '22023';
  END IF;

  v_tenant := public.resolve_operable_landlord_tenant(p_tenant_key);

  SELECT * INTO v_prop
  FROM public.properties p
  WHERE p.id = p_property_id
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'property not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_prop.tenant_id IS DISTINCT FROM v_tenant.id THEN
    RAISE EXCEPTION 'property does not belong to this landlord' USING ERRCODE = '42501';
  END IF;

  IF v_prop.is_listed IS NOT TRUE
     OR v_prop.status IS DISTINCT FROM 'available'::public.property_status THEN
    RAISE EXCEPTION 'property is not available for applications' USING ERRCODE = 'P0001';
  END IF;

  IF NOT public.landlord_username_available(v_tenant.id, v_username, v_uid) THEN
    RAISE EXCEPTION 'username is not available for this landlord' USING ERRCODE = '23505';
  END IF;

  -- Same user reusing their own reserved pending/accepted username is allowed by
  -- landlord_username_available exclude; still block if they already hold a different map.
  IF EXISTS (
    SELECT 1
    FROM public.tenant_renter_usernames u
    WHERE u.tenant_id = v_tenant.id
      AND u.user_id = v_uid
      AND lower(u.username) IS DISTINCT FROM v_username
  ) THEN
    RAISE EXCEPTION 'you already have a username on this landlord workspace' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.rental_applications (
    tenant_id,
    property_id,
    applicant_user_id,
    requested_username,
    message,
    status
  )
  VALUES (
    v_tenant.id,
    v_prop.id,
    v_uid,
    v_username,
    v_message,
    'pending'::public.rental_application_status
  )
  RETURNING * INTO v_row;

  PERFORM public._insert_audit_log(
    v_tenant.id,
    v_uid,
    'rental_application.submitted',
    'rental_application',
    v_row.id,
    jsonb_build_object(
      'property_id', v_prop.id,
      'requested_username', v_username
    )
  );

  RETURN v_row;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'duplicate pending application or username conflict' USING ERRCODE = '23505';
END;
$$;

CREATE OR REPLACE FUNCTION public.list_my_rental_applications(p_tenant_key text DEFAULT NULL)
RETURNS TABLE (
  id uuid,
  tenant_id uuid,
  property_id uuid,
  requested_username text,
  message text,
  status public.rental_application_status,
  reviewed_at timestamptz,
  created_at timestamptz,
  property_name text,
  property_district text,
  property_city text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant_id uuid := NULL;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  IF p_tenant_key IS NOT NULL AND btrim(p_tenant_key) <> '' THEN
    v_tenant_id := (public.resolve_operable_landlord_tenant(p_tenant_key)).id;
  END IF;

  RETURN QUERY
  SELECT
    a.id,
    a.tenant_id,
    a.property_id,
    a.requested_username,
    a.message,
    a.status,
    a.reviewed_at,
    a.created_at,
    p.name,
    p.district,
    p.city
  FROM public.rental_applications a
  JOIN public.properties p ON p.id = a.property_id
  WHERE a.applicant_user_id = v_uid
    AND (v_tenant_id IS NULL OR a.tenant_id = v_tenant_id)
  ORDER BY a.created_at DESC;
END;
$$;

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
      OR public.has_role(a.tenant_id, ARRAY['landlord_admin', 'landlord_staff']::public.app_role[])
    )
    AND (p_status IS NULL OR a.status = p_status)
  ORDER BY a.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_rental_application(text, uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_rental_application(text, uuid, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.submit_rental_application(text, uuid, text, text) TO authenticated;

REVOKE ALL ON FUNCTION public.list_my_rental_applications(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_my_rental_applications(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.list_my_rental_applications(text) TO authenticated;

REVOKE ALL ON FUNCTION public.list_landlord_rental_applications(public.rental_application_status) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_landlord_rental_applications(public.rental_application_status) FROM anon;
GRANT EXECUTE ON FUNCTION public.list_landlord_rental_applications(public.rental_application_status) TO authenticated;

-- =============================================================================
-- 6) Landlord review (accept / reject)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.review_rental_application(
  p_application_id uuid,
  p_decision text
)
RETURNS public.rental_applications
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_decision text := lower(btrim(COALESCE(p_decision, '')));
  v_app public.rental_applications%ROWTYPE;
  v_membership public.tenant_memberships%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  IF p_application_id IS NULL THEN
    RAISE EXCEPTION 'application id is required' USING ERRCODE = '22023';
  END IF;

  IF v_decision NOT IN ('accept', 'reject') THEN
    RAISE EXCEPTION 'decision must be accept or reject' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_app
  FROM public.rental_applications
  WHERE id = p_application_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'application not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_app.applicant_user_id = v_uid AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'applicants cannot review their own application' USING ERRCODE = '42501';
  END IF;

  IF NOT (
    public.is_super_admin()
    OR public.has_role(v_app.tenant_id, ARRAY['landlord_admin']::public.app_role[])
  ) THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  IF NOT public.tenant_is_operable(v_app.tenant_id) AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'landlord workspace is not operable' USING ERRCODE = 'P0001';
  END IF;

  IF v_app.status IS DISTINCT FROM 'pending'::public.rental_application_status THEN
    RAISE EXCEPTION 'application is not pending' USING ERRCODE = 'P0001';
  END IF;

  IF v_decision = 'reject' THEN
    UPDATE public.rental_applications
    SET
      status = 'rejected'::public.rental_application_status,
      reviewed_by = v_uid,
      reviewed_at = now(),
      updated_at = now()
    WHERE id = v_app.id
    RETURNING * INTO v_app;

    PERFORM public._insert_audit_log(
      v_app.tenant_id,
      v_uid,
      'rental_application.rejected',
      'rental_application',
      v_app.id,
      jsonb_build_object('applicant_user_id', v_app.applicant_user_id)
    );

    RETURN v_app;
  END IF;

  -- Accept: username map + active renter membership + mark accepted (same transaction).
  -- Username is immutable per (tenant, user); only insert when absent.
  IF EXISTS (
    SELECT 1
    FROM public.tenant_renter_usernames u
    WHERE u.tenant_id = v_app.tenant_id
      AND u.user_id = v_app.applicant_user_id
      AND lower(u.username) IS DISTINCT FROM lower(v_app.requested_username)
  ) THEN
    RAISE EXCEPTION 'username conflict with existing landlord mapping' USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.tenant_renter_usernames (tenant_id, user_id, username)
  VALUES (v_app.tenant_id, v_app.applicant_user_id, v_app.requested_username)
  ON CONFLICT (tenant_id, user_id) DO NOTHING;

  -- manage_membership uses auth.uid() for authorization (caller's JWT remains landlord).
  v_membership := public.manage_membership(
    v_app.tenant_id,
    v_app.applicant_user_id,
    'renter'::public.app_role,
    'active'::public.membership_status
  );

  UPDATE public.rental_applications
  SET
    status = 'accepted'::public.rental_application_status,
    reviewed_by = v_uid,
    reviewed_at = now(),
    updated_at = now()
  WHERE id = v_app.id
  RETURNING * INTO v_app;

  PERFORM public._insert_audit_log(
    v_app.tenant_id,
    v_uid,
    'rental_application.accepted',
    'rental_application',
    v_app.id,
    jsonb_build_object(
      'applicant_user_id', v_app.applicant_user_id,
      'membership_id', v_membership.id,
      'requested_username', v_app.requested_username,
      'auto_assigned', false
    )
  );

  RETURN v_app;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'username already taken for this landlord' USING ERRCODE = '23505';
END;
$$;

REVOKE ALL ON FUNCTION public.review_rental_application(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.review_rental_application(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.review_rental_application(uuid, text) TO authenticated;

-- Availability check by tenant key (for apply form UX)
CREATE OR REPLACE FUNCTION public.check_landlord_username_available(
  p_tenant_key text,
  p_username text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant public.tenants%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;
  v_tenant := public.resolve_operable_landlord_tenant(p_tenant_key);
  RETURN public.landlord_username_available(v_tenant.id, p_username, auth.uid());
END;
$$;

REVOKE ALL ON FUNCTION public.check_landlord_username_available(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.check_landlord_username_available(text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.check_landlord_username_available(text, text) TO authenticated;
