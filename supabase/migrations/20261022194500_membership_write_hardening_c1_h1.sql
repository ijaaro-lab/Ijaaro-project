-- =============================================================================
-- Membership write hardening (Phase A security fixes C1 + H1)
-- =============================================================================
-- Local-repo migration only. Do not auto-apply to hosted/Live without approval.
--
-- C1: Non-Super-Admin clients cannot INSERT/UPDATE tenant_memberships directly.
--     Authorized mutations continue via SECURITY DEFINER manage_membership (and
--     other DEFINER provision/review RPCs that insert as table owner / bypass RLS).
-- H1: Non-SA landlord admins cannot demote/disable/overwrite an existing
--     landlord_admin membership via manage_membership.
--     Concurrency: non-SA landlord path uses ON CONFLICT DO UPDATE ... WHERE
--     role IS DISTINCT FROM landlord_admin (evaluated under conflict-row lock).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- C1: Direct client membership writes — Super Admin only
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS memberships_insert_authorized ON public.tenant_memberships;
CREATE POLICY memberships_insert_authorized
  ON public.tenant_memberships FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS memberships_update_authorized ON public.tenant_memberships;
CREATE POLICY memberships_update_authorized
  ON public.tenant_memberships FOR UPDATE TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

COMMENT ON POLICY memberships_insert_authorized ON public.tenant_memberships IS
  'C1: Direct INSERT only for Super Admin. Landlord/utility admins must use manage_membership RPC.';

COMMENT ON POLICY memberships_update_authorized ON public.tenant_memberships IS
  'C1: Direct UPDATE only for Super Admin. Prevents role/tenant field bypass of manage_membership.';

-- ---------------------------------------------------------------------------
-- H1 (+ retain Phase A landlord grant allowlist): manage_membership
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
  v_existing_role public.app_role;
  v_landlord_admin_path boolean := false;
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

  -- Landlord admins (non-SA): staff|renter only; conflict-time guard vs landlord_admin
  IF NOT public.is_super_admin()
     AND v_type = 'landlord'
     AND public.has_role(
       p_tenant_id,
       ARRAY['landlord_admin']::public.app_role[]
     )
  THEN
    v_landlord_admin_path := true;

    IF p_role IS DISTINCT FROM 'landlord_staff'::public.app_role
       AND p_role IS DISTINCT FROM 'renter'::public.app_role
    THEN
      RAISE EXCEPTION 'landlord admins may only grant landlord_staff or renter'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF v_landlord_admin_path THEN
    -- H1 (concurrency-safe): DO UPDATE WHERE runs under the conflict-row lock.
    INSERT INTO public.tenant_memberships (tenant_id, user_id, role, status, invited_by)
    VALUES (p_tenant_id, p_user_id, p_role, p_status, auth.uid())
    ON CONFLICT (tenant_id, user_id) DO UPDATE
      SET role = EXCLUDED.role,
          status = EXCLUDED.status,
          updated_at = now()
      WHERE public.tenant_memberships.role
            IS DISTINCT FROM 'landlord_admin'::public.app_role
    RETURNING * INTO v_row;

    IF NOT FOUND THEN
      SELECT tm.role INTO v_existing_role
      FROM public.tenant_memberships tm
      WHERE tm.tenant_id = p_tenant_id
        AND tm.user_id = p_user_id;

      IF FOUND AND v_existing_role = 'landlord_admin'::public.app_role THEN
        RAISE EXCEPTION 'cannot modify an existing landlord_admin membership'
          USING ERRCODE = '42501';
      END IF;

      RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
    END IF;
  ELSE
    -- Super Admin, utility_admin, and other authorized callers: unrestricted upsert
    INSERT INTO public.tenant_memberships (tenant_id, user_id, role, status, invited_by)
    VALUES (p_tenant_id, p_user_id, p_role, p_status, auth.uid())
    ON CONFLICT (tenant_id, user_id) DO UPDATE
      SET role = EXCLUDED.role,
          status = EXCLUDED.status,
          updated_at = now()
    RETURNING * INTO v_row;
  END IF;

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

COMMENT ON FUNCTION public.manage_membership(uuid, uuid, public.app_role, public.membership_status) IS
  'Upsert membership. Non-SA landlord admins: grant staff|renter only; cannot modify existing landlord_admin (conflict-time WHERE guard). SA/utility paths preserved. Bypasses RLS as DEFINER.';

REVOKE ALL ON FUNCTION public.manage_membership(uuid, uuid, public.app_role, public.membership_status)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.manage_membership(uuid, uuid, public.app_role, public.membership_status)
  FROM anon;
GRANT EXECUTE ON FUNCTION public.manage_membership(uuid, uuid, public.app_role, public.membership_status)
  TO authenticated;
