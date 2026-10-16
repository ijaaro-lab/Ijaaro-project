-- =============================================================================
-- Tenant member isolation hardening (2026-10-14)
-- Goal: each workspace's data is only visible/mutable to active members of
-- THAT tenant (admin, staff, renter/customer). Platform Super Admin uses
-- is_super_admin() only — never ordinary is_member_of() on workspace data.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) Membership helpers: strict tenant scope (never platform / never SA role)
-- ---------------------------------------------------------------------------
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
      AND tm.role <> 'super_admin'
      AND t.tenant_type <> 'platform'
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
      AND tm.role <> 'super_admin'
      AND t.tenant_type <> 'platform'
      AND t.status IN ('active', 'pending')
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

-- Landlord ops: only landlord_admin / landlord_staff on THIS landlord tenant
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

-- Utility ops: only utility_admin / utility_staff on THIS utility tenant
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

REVOKE ALL ON FUNCTION public.is_member_of(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_operate_in_tenant(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_manage_landlord_ops(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_approve_rent(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_manage_utility_ops(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_approve_utility(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.is_member_of(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_operate_in_tenant(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_landlord_ops(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_approve_rent(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_utility_ops(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_approve_utility(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 2) Tenants SELECT: members only see THEIR non-platform workspace(s)
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- 3) Memberships SELECT: self, SA, or admin/staff of THE SAME tenant only
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS memberships_select_self_admin_or_super ON public.tenant_memberships;
CREATE POLICY memberships_select_self_admin_or_super
  ON public.tenant_memberships FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_super_admin()
    OR public.has_role(
      tenant_id,
      ARRAY[
        'landlord_admin',
        'landlord_staff',
        'utility_admin',
        'utility_staff'
      ]::public.app_role[]
    )
  );

-- Membership writes: only admins of THAT operable tenant (or SA)
DROP POLICY IF EXISTS memberships_insert_authorized ON public.tenant_memberships;
CREATE POLICY memberships_insert_authorized
  ON public.tenant_memberships FOR INSERT TO authenticated
  WITH CHECK (
    public.is_super_admin()
    OR (
      role <> 'super_admin'
      AND public.has_role(
        tenant_id,
        ARRAY['landlord_admin', 'utility_admin']::public.app_role[]
      )
      AND public.tenant_is_operable(tenant_id)
    )
  );

DROP POLICY IF EXISTS memberships_update_authorized ON public.tenant_memberships;
CREATE POLICY memberships_update_authorized
  ON public.tenant_memberships FOR UPDATE TO authenticated
  USING (
    public.is_super_admin()
    OR (
      public.has_role(
        tenant_id,
        ARRAY['landlord_admin', 'utility_admin']::public.app_role[]
      )
      AND public.tenant_is_operable(tenant_id)
    )
  )
  WITH CHECK (
    public.is_super_admin()
    OR (
      role <> 'super_admin'
      AND public.has_role(
        tenant_id,
        ARRAY['landlord_admin', 'utility_admin']::public.app_role[]
      )
      AND public.tenant_is_operable(tenant_id)
    )
  );

-- ---------------------------------------------------------------------------
-- 4) Audit logs: tenant admins of THAT tenant only (+ SA)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS audit_logs_select_authorized ON public.audit_logs;
CREATE POLICY audit_logs_select_authorized
  ON public.audit_logs FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR (
      tenant_id IS NOT NULL
      AND public.has_role(
        tenant_id,
        ARRAY['landlord_admin', 'utility_admin']::public.app_role[]
      )
    )
  );

-- ---------------------------------------------------------------------------
-- 5) Domain SELECT policies: require membership on row.tenant_id
--     (restate key policies so helpers above are the sole gate)
-- ---------------------------------------------------------------------------

-- Properties: private inventory only for members of that landlord tenant;
-- listed+available remains intentional marketplace browse.
DROP POLICY IF EXISTS properties_select ON public.properties;
CREATE POLICY properties_select ON public.properties
  FOR SELECT TO authenticated
  USING (
    public.is_member_of(tenant_id)
    OR (is_listed = true AND status = 'available')
    OR current_renter_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.rental_assignments ra
      WHERE ra.property_id = properties.id
        AND ra.renter_id = auth.uid()
        AND ra.tenant_id = properties.tenant_id
    )
    OR public.is_super_admin()
  );

DROP POLICY IF EXISTS property_photos_select ON public.property_photos;
CREATE POLICY property_photos_select ON public.property_photos
  FOR SELECT TO authenticated
  USING (
    public.is_member_of(tenant_id)
    OR EXISTS (
      SELECT 1 FROM public.properties p
      WHERE p.id = property_photos.property_id
        AND p.tenant_id = property_photos.tenant_id
        AND (
          (p.is_listed = true AND p.status = 'available')
          OR p.current_renter_id = auth.uid()
        )
    )
    OR public.is_super_admin()
  );

-- Rent ledger: landlord ops on THIS tenant, or the renter/payer themselves
DROP POLICY IF EXISTS rent_charges_select ON public.rent_charges;
CREATE POLICY rent_charges_select ON public.rent_charges
  FOR SELECT TO authenticated
  USING (
    public.can_manage_landlord_ops(tenant_id)
    OR renter_id = auth.uid()
    OR public.is_super_admin()
  );

DROP POLICY IF EXISTS rent_payments_select ON public.rent_payments;
CREATE POLICY rent_payments_select ON public.rent_payments
  FOR SELECT TO authenticated
  USING (
    public.can_manage_landlord_ops(tenant_id)
    OR payer_id = auth.uid()
    OR public.is_super_admin()
  );

-- Utility: ops on THIS company tenant, or the customer/payer themselves
DROP POLICY IF EXISTS utility_accounts_select ON public.utility_accounts;
CREATE POLICY utility_accounts_select ON public.utility_accounts
  FOR SELECT TO authenticated
  USING (
    public.can_manage_utility_ops(tenant_id)
    OR customer_id = auth.uid()
    OR public.is_super_admin()
  );

DROP POLICY IF EXISTS meters_select ON public.meters;
CREATE POLICY meters_select ON public.meters
  FOR SELECT TO authenticated
  USING (
    public.can_manage_utility_ops(tenant_id)
    OR EXISTS (
      SELECT 1 FROM public.utility_accounts ua
      WHERE ua.id = meters.utility_account_id
        AND ua.tenant_id = meters.tenant_id
        AND ua.customer_id = auth.uid()
    )
    OR public.is_super_admin()
  );

DROP POLICY IF EXISTS meter_readings_select ON public.meter_readings;
CREATE POLICY meter_readings_select ON public.meter_readings
  FOR SELECT TO authenticated
  USING (
    public.can_manage_utility_ops(tenant_id)
    OR EXISTS (
      SELECT 1
      FROM public.meters m
      JOIN public.utility_accounts ua ON ua.id = m.utility_account_id
      WHERE m.id = meter_readings.meter_id
        AND m.tenant_id = meter_readings.tenant_id
        AND ua.tenant_id = meter_readings.tenant_id
        AND ua.customer_id = auth.uid()
    )
    OR public.is_super_admin()
  );

DROP POLICY IF EXISTS utility_bills_select ON public.utility_bills;
CREATE POLICY utility_bills_select ON public.utility_bills
  FOR SELECT TO authenticated
  USING (
    public.can_manage_utility_ops(tenant_id)
    OR responsible_party_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.utility_accounts ua
      WHERE ua.id = utility_bills.utility_account_id
        AND ua.tenant_id = utility_bills.tenant_id
        AND ua.customer_id = auth.uid()
    )
    OR public.is_super_admin()
  );

DROP POLICY IF EXISTS utility_payments_select ON public.utility_payments;
CREATE POLICY utility_payments_select ON public.utility_payments
  FOR SELECT TO authenticated
  USING (
    public.can_manage_utility_ops(tenant_id)
    OR payer_id = auth.uid()
    OR public.is_super_admin()
  );

-- Tighten utility payment insert: payer must belong to that bill's tenant
DROP POLICY IF EXISTS utility_payments_insert ON public.utility_payments;
CREATE POLICY utility_payments_insert ON public.utility_payments
  FOR INSERT TO authenticated
  WITH CHECK (
    payer_id = auth.uid()
    AND status = 'pending'
    AND reviewed_by IS NULL
    AND reviewed_at IS NULL
    AND EXISTS (
      SELECT 1 FROM public.utility_bills b
      WHERE b.id = utility_bill_id
        AND b.tenant_id = utility_payments.tenant_id
        AND (
          b.responsible_party_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.utility_accounts ua
            WHERE ua.id = b.utility_account_id
              AND ua.tenant_id = b.tenant_id
              AND ua.customer_id = auth.uid()
          )
        )
    )
  );

-- ---------------------------------------------------------------------------
-- 6) FORCE RLS on all tenant-scoped domain tables (idempotent)
-- ---------------------------------------------------------------------------
ALTER TABLE public.tenants FORCE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_memberships FORCE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs FORCE ROW LEVEL SECURITY;
ALTER TABLE public.properties FORCE ROW LEVEL SECURITY;
ALTER TABLE public.property_photos FORCE ROW LEVEL SECURITY;
ALTER TABLE public.rental_assignments FORCE ROW LEVEL SECURITY;
ALTER TABLE public.rent_charges FORCE ROW LEVEL SECURITY;
ALTER TABLE public.rent_payments FORCE ROW LEVEL SECURITY;
ALTER TABLE public.utility_accounts FORCE ROW LEVEL SECURITY;
ALTER TABLE public.meters FORCE ROW LEVEL SECURITY;
ALTER TABLE public.meter_readings FORCE ROW LEVEL SECURITY;
ALTER TABLE public.utility_bills FORCE ROW LEVEL SECURITY;
ALTER TABLE public.utility_payments FORCE ROW LEVEL SECURITY;
