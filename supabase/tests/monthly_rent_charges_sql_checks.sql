-- Monthly rent charge generation checks (run after applying
-- 20261024120000_generate_monthly_rent_charges.sql on isolated local DB).
-- Companion to frontend/src/lib/monthlyRentPeriod.test.ts

-- Covered assertions (manual / Vitest isolated):
-- 1. assign_renter with p_create_initial_charge creates first charge (existing).
-- 2. generate_monthly_rent_charges creates next calendar month when as_of reaches it.
-- 3. Second run for same as_of creates 0 rows (ON CONFLICT / skipped_duplicate).
-- 4. completed / end_date assignments do not receive further charges.
-- 5. February leap / short months: period_end correct; due_day 1–28 valid.
-- 6. period_end < period_start rejected (invalid period) by generator + CHECK.
-- 7. Existing rent_payments / amount_paid untouched by generator.
-- 8. Authenticated (non-service) callers receive 42501.

SELECT 'Apply migration on isolated local Supabase, then invoke generate_monthly_rent_charges as service_role' AS instruction;
