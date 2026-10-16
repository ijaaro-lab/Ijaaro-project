-- Phase 1 hardening: fixed search_path + revoke unintended EXECUTE grants

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

REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE ALL ON FUNCTION public._insert_audit_log(uuid, uuid, text, text, uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_super_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_member_of(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_tenant_admin(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.provision_tenant(text, text, public.tenant_type, public.tenant_status, uuid, public.app_role, jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_tenant_status(uuid, public.tenant_status) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.manage_membership(uuid, uuid, public.app_role, public.membership_status) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.validate_membership_role() FROM PUBLIC;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public._insert_audit_log(uuid, uuid, text, text, uuid, jsonb) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.validate_membership_role() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.set_updated_at() FROM anon, authenticated;

REVOKE ALL ON FUNCTION public.is_super_admin() FROM anon;
REVOKE ALL ON FUNCTION public.is_member_of(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role[]) FROM anon;
REVOKE ALL ON FUNCTION public.is_tenant_admin(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.provision_tenant(text, text, public.tenant_type, public.tenant_status, uuid, public.app_role, jsonb, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.set_tenant_status(uuid, public.tenant_status) FROM anon;
REVOKE ALL ON FUNCTION public.manage_membership(uuid, uuid, public.app_role, public.membership_status) FROM anon;

GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_member_of(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_tenant_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.provision_tenant(text, text, public.tenant_type, public.tenant_status, uuid, public.app_role, jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_tenant_status(uuid, public.tenant_status) TO authenticated;
GRANT EXECUTE ON FUNCTION public.manage_membership(uuid, uuid, public.app_role, public.membership_status) TO authenticated;
