-- Harden Phase 2 helpers: no anon EXECUTE on SECURITY DEFINER helpers
REVOKE ALL ON FUNCTION public.can_manage_landlord_ops(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_approve_rent(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_assignment_renter(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_manage_landlord_ops(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.can_approve_rent(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.is_assignment_renter(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.can_manage_landlord_ops(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_approve_rent(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_assignment_renter(uuid) TO authenticated;
