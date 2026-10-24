-- =============================================================================
-- RP-1.3.6 — list_same_tenant_member_profiles (repo hygiene mirror)
-- =============================================================================
-- Historical note: this SECURITY DEFINER RPC previously existed only on hosted
-- Supabase (applied outside tracked migrations). Local rebuilds therefore lacked
-- the function used by landlord Invite + Property assign pickers.
--
-- Contract derived from repository callers / types / tests (not invented):
--   * Args: p_tenant_id uuid
--   * Returns rows: user_id, full_name, email, role, membership_status
--   * Authorization: public.can_manage_landlord_ops(p_tenant_id)
--     (active landlord_admin or landlord_staff on an operable landlord tenant)
--   * Result set: only active memberships with role = renter on that tenant
--   * Cross-tenant / unauthorized callers: RAISE 'not authorized' (42501)
--
-- DO NOT auto-apply to hosted. Local apply is a separate approved step.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.list_same_tenant_member_profiles(p_tenant_id uuid)
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

  IF NOT public.can_manage_landlord_ops(p_tenant_id) THEN
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
    AND tm.status = 'active'
    AND tm.role = 'renter'::public.app_role
  ORDER BY lower(COALESCE(p.full_name, p.email, tm.user_id::text));
END;
$$;

COMMENT ON FUNCTION public.list_same_tenant_member_profiles(uuid) IS
  'Landlord ops: list active renter profiles on a landlord tenant for invite/assign UI. Gated by can_manage_landlord_ops.';

REVOKE ALL ON FUNCTION public.list_same_tenant_member_profiles(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_same_tenant_member_profiles(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.list_same_tenant_member_profiles(uuid) TO authenticated;
