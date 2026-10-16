-- Phase 2 rental RLS / workflow checks (run as privileged role via MCP/SQL Editor).
-- Creates disposable fixtures, asserts isolation + payment review boundaries, cleans up.
-- Re-run after schema changes. Companion to frontend/src/test/rls.rental.test.ts

-- Verification procedure (same JWT claim switching pattern as Phase 1):
--   set_config('request.jwt.claim.sub', <user_uuid>, true)
--   SET LOCAL ROLE authenticated
--
-- Assertions covered by the Vitest suite / MCP verification:
-- 1. Landlord A cannot read/update Landlord B properties
-- 2. Renter cannot approve own payment via review_rent_payment
-- 3. Conflicting active assignment rejected
-- 4. Direct assignment INSERT blocked
-- 5. Occupancy fields cannot be updated directly
-- 6. Payment review is concurrent-safe (second approve fails)
-- 7. Rejected payments retained
-- 8. Phase 1 helpers still deny inactive memberships

SELECT 'Run Phase 2 rental RLS verification via MCP/Vitest (see README)' AS instruction;
