-- IJAARO Phase 3–4 utility RLS / billing SQL procedure checks (Prompt 03)
-- Run in SQL editor after seeding JWT-role test users, OR use:
--   frontend/: npm test -- src/test/rls.utility.test.ts
-- (requires SUPABASE_SERVICE_ROLE_KEY)
--
-- This file documents expected assertions; Vitest is the executable suite.

-- Billing formula helper
-- SELECT public.compute_extra_charges('{"fixed_amount": 2.5}'::jsonb);  -- expect 2.5
-- SELECT public.compute_extra_charges('{"items":[{"amount":1},{"amount":2}]}'::jsonb); -- expect 3

-- Isolation expectations (must hold under authenticated JWT of Water Co A):
-- 1. SELECT utility_accounts WHERE tenant_id = WaterB → 0 rows
-- 2. INSERT utility_accounts with tenant_id = WaterB → denied
-- 3. UPDATE/DELETE utility_bills of WaterB → denied / no effect
-- 4. Electricity A ≠ Electricity B → denied
-- 5. Water A ↛ Electricity A private rows → denied
-- 6. Customer B cannot SELECT Customer A bills
-- 7. Customer cannot UPDATE account.tenant_id
-- 8. Outsider / landlord cannot record_meter_reading
-- 9. Decreasing reading without corrected/reset → exception
-- 10. Second generate_utility_bill same account+period → unique violation
-- 11. 100→130 @ 0.50 → total_amount 15.00
-- 12. Changing account.unit_price does not alter existing bill.unit_price/total
-- 13. Payment insert on another customer's bill → denied
-- 14. Second pending payment same bill+payer → unique violation
-- 15. Approve approval updates amount_paid/balance/status once
-- 16. Landlord review_utility_payment → not authorized
-- 17. Landlord SELECT utility_accounts → 0 rows; own properties still visible
-- 18. Phase 1–2 rental isolation tests still pass

SELECT 'phase3_utility_rls_sql_checks loaded (see comments; run Vitest for execution)' AS note;
