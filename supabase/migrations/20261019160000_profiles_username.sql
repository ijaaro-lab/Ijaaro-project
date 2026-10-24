-- =============================================================================
-- RP-1.3.4 — SUPERSEDED NO-OP (safe for migration discovery / fresh local apply)
-- =============================================================================
-- Historical note: an earlier draft of this version would have added
-- profiles.username with a GLOBAL unique index (profiles_username_lower_uidx).
-- That design is rejected. Full draft SQL is archived in:
--   20261019160000_profiles_username.SUPERSEDED.md
--
-- Authoritative username model: 20261020090000_renter_applications_landlord_usernames.sql
--   → public.tenant_renter_usernames (per-landlord uniqueness)
--
-- This file intentionally performs NO schema changes so:
--   * `supabase db reset` / fresh migration apply cannot create global uniqueness
--   * version ordering is preserved for CLI discovery
-- =============================================================================

DO $$
BEGIN
  RAISE NOTICE 'RP-1.3.4: skipped superseded profiles.username global-uniqueness migration (see SUPERSEDED.md)';
END $$;
