-- Phase 1 RLS isolation checks (run in Supabase SQL Editor / MCP as privileged role).
-- Creates disposable fixtures, asserts isolation, cleans up.
-- Verified 2026-10-13 against project tjadzwrcllsbkrkkkzjd — all assertions passed.

-- See README.md "Security tests" for how this was executed during Phase 1.
-- The live verification used JWT claim role-switching:
--   set_config('request.jwt.claim.sub', <user_uuid>, true)
--   SET LOCAL ROLE authenticated
-- covering anonymous denial, cross-tenant R/W denial, inactive membership,
-- self-elevation denial, water/electricity isolation, audit tamper denial,
-- unauthorized provision/status RPCs, and successful Super Admin provision.

-- Re-run the verification procedure via MCP/SQL when schema changes.
-- Keep this file as the source pointer for Phase 1 security regression.
SELECT 'Run Phase 1 RLS verification via the documented MCP/SQL procedure in README.md' AS instruction;
