-- Allow company admins to list staff/member profiles for their own tenant only.
-- Does not expose profiles across tenants.

CREATE OR REPLACE FUNCTION public.list_company_member_profiles(p_tenant_id uuid)
RETURNS TABLE (
  membership_id uuid,
  user_id uuid,
  full_name text,
  email text,
  phone text,
  role public.app_role,
  membership_status public.membership_status,
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_type public.tenant_type;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'tenant required';
  END IF;

  SELECT t.tenant_type INTO v_type
  FROM public.tenants t
  WHERE t.id = p_tenant_id;

  IF v_type IS NULL THEN
    RAISE EXCEPTION 'tenant not found';
  END IF;

  IF NOT (
    public.is_super_admin()
    OR (
      v_type IN ('landlord', 'water_company', 'electricity_company')
      AND public.has_role(
        p_tenant_id,
        ARRAY['landlord_admin', 'utility_admin']::public.app_role[]
      )
      AND public.tenant_is_operable(p_tenant_id)
    )
  ) THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    tm.id AS membership_id,
    tm.user_id,
    p.full_name,
    p.email,
    p.phone,
    tm.role,
    tm.status AS membership_status,
    tm.created_at
  FROM public.tenant_memberships tm
  JOIN public.profiles p ON p.id = tm.user_id
  WHERE tm.tenant_id = p_tenant_id
  ORDER BY
    CASE tm.role
      WHEN 'utility_admin' THEN 0
      WHEN 'landlord_admin' THEN 0
      WHEN 'utility_staff' THEN 1
      WHEN 'landlord_staff' THEN 1
      ELSE 2
    END,
    lower(COALESCE(NULLIF(btrim(p.full_name), ''), p.email, tm.user_id::text));
END;
$$;

REVOKE ALL ON FUNCTION public.list_company_member_profiles(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_company_member_profiles(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.list_company_member_profiles(uuid) TO authenticated;
