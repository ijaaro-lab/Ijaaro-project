-- Water/electricity: company staff may approve or reject pending customer payments
-- (same as utility_admin). Customer submissions stay pending until approved;
-- only then is the bill balance updated via review_utility_payment.

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
      AND tm.role IN ('utility_admin', 'utility_staff')
      AND t.status = 'active'
      AND t.tenant_type IN ('water_company', 'electricity_company')
  );
$$;

COMMENT ON FUNCTION public.can_approve_utility(uuid) IS
  'True when caller is active utility_admin or utility_staff on an active water/electricity tenant.';
