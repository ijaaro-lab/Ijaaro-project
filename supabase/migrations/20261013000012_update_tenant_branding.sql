-- Allow tenant admins to update branding (logo, display name, accent, tagline)

CREATE OR REPLACE FUNCTION public.update_tenant_branding(
  p_tenant_id uuid,
  p_branding jsonb
)
RETURNS public.tenants
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.tenants%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  IF NOT (
    public.is_super_admin()
    OR public.has_role(
      p_tenant_id,
      ARRAY['landlord_admin', 'utility_admin']::public.app_role[]
    )
  ) THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  UPDATE public.tenants t
  SET
    branding = COALESCE(t.branding, '{}'::jsonb) || COALESCE(p_branding, '{}'::jsonb),
    updated_at = now()
  WHERE t.id = p_tenant_id
    AND t.tenant_type <> 'platform'
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'tenant not found' USING ERRCODE = 'P0002';
  END IF;

  PERFORM public._insert_audit_log(
    v_row.id,
    auth.uid(),
    'tenant.branding_updated',
    'tenant',
    v_row.id,
    COALESCE(p_branding, '{}'::jsonb)
  );

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.update_tenant_branding(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_tenant_branding(uuid, jsonb) TO authenticated;
