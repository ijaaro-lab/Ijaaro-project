# IJAARO

Multi-tenant rental property and utility management platform for landlords, renters, water companies, and electricity companies.

**Current status:** Phase 1–2 rental + Phase 3–4 utility (accounts, meters, readings, bills, company-only payment review). Maintenance/notifications remain Phase 5.

## Stack

- **Frontend:** React + TypeScript + Vite + Tailwind CSS (`frontend/`)
- **Backend helpers:** shared types (`backend/`)
- **Database / Auth / Storage:** Supabase PostgreSQL + Auth + RLS + private Storage (`supabase/`)

## Documentation

| Document | Purpose |
| --- | --- |
| [BRD-1.md](./BRD-1.md) | Business requirements |
| [SYSTEM_DESIGN.md](./SYSTEM_DESIGN.md) | System design and UI tokens |
| [SYSTEM_ARCHITECTURE.md](./SYSTEM_ARCHITECTURE.md) | Technical architecture |
| [PROJECT_ROADMAP.md](./PROJECT_ROADMAP.md) | Phased delivery plan |
| [DATABASE_DESIGN.md](./DATABASE_DESIGN.md) | Schema, RLS, Phase 1–4 implementation |
| [docs/UTILITY_BILLING.md](./docs/UTILITY_BILLING.md) | Utility billing formula, payments, OQ-07 defaults |
| [docs/SAAS_PLATFORM.md](./docs/SAAS_PLATFORM.md) | Landing pages, dark mode, branding, five templates |
| [ijaaro-database.erd.json](./ijaaro-database.erd.json) | Visual ERD |
| [system-design.pen](./system-design.pen) | Pencil design board |

## Repo layout

```text
frontend/                 # Vite React app
backend/                  # Shared server-side types
supabase/
  migrations/             # Authoritative SQL migrations
  functions/              # Edge Function wrappers
  seed/                   # One-time Super Admin bootstrap SQL
  tests/                  # SQL RLS check scripts
```

## Local setup

1. Copy env templates (never commit real secrets):

```bash
cp .env.example .env.local
cp frontend/.env.example frontend/.env.local
```

2. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (publishable/anon only in the frontend).

3. Install and run the web app:

```bash
cd frontend
npm install
npm run dev
```

4. Apply migrations to your Supabase project (CLI if available, or Supabase SQL / MCP):

- `supabase/migrations/20261013000001_phase1_foundation.sql`
- `supabase/migrations/20261013000002_phase1_security_hardening.sql`
- `supabase/migrations/20261013000003_phase2_properties_tenancy.sql`
- `supabase/migrations/20261013000004_phase2_rent_ledger.sql`
- `supabase/migrations/20261013000005_phase2_revoke_anon_helpers.sql`
- `supabase/migrations/20261013000006_phase3_utilities_schema.sql`
- `supabase/migrations/20261013000007_phase3_utilities_rpcs.sql`

### Bootstrap the first Super Admin (one-time)

Public signup **cannot** grant `super_admin`.

1. Create a user via Auth (signup UI or Dashboard → Authentication).
2. Open `supabase/seed/bootstrap_super_admin.sql`.
3. Paste that user’s UUID into `v_user_id`.
4. Run the script in the Supabase SQL Editor (privileged).
5. Sign in — you should see Super Admin tenant tools.

### Landlord / renter smoke path

1. Super Admin provisions a `landlord` tenant and owner membership.
2. Invite/add a `renter` membership on that landlord tenant.
3. Landlord creates a property, optionally uploads photos, assigns the renter (`assign_renter` RPC).
4. Renter submits a pending rent payment (optional proof in `payment-proofs`).
5. Landlord admin reviews via `review_rent_payment` (approve/reject).
6. Move-out via `complete_move_out` returns the property to `available` and keeps rent history.

### Utility company smoke path

1. Super Admin provisions a `water_company` or `electricity_company` tenant + `utility_admin` membership.
2. Staff searches an existing property (`search_properties_for_link`) and links an account + meter (`link_utility_account`), or creates premises (`create_utility_premises`).
3. Staff records readings (`record_meter_reading`) then generates a bill (`generate_utility_bill`).
4. Customer / responsible party submits a pending utility payment.
5. Company staff reviews via `review_utility_payment` (**not** the landlord).

Billing rules: see `docs/UTILITY_BILLING.md`.

## Security tests

### SQL isolation suites

- Phase 1: `supabase/tests/phase1_rls_sql_checks.sql`
- Phase 2: `supabase/tests/phase2_rental_rls_sql_checks.sql`
- Phase 3–4: `supabase/tests/phase3_utility_rls_sql_checks.sql`

Run via Supabase SQL Editor / MCP with JWT claim role-switching (documented in those files / Phase 1 README notes).

**Phase 2 MCP verification (2026-10-13):** cross-tenant property denial, conflicting assignment rejection, renter self-approve denial, approve + balance update, double-approve rejection, move-out + history retention — passed.

**Phase 3–4 MCP verification (2026-10-13):** utility tables + FORCE RLS enabled; FR-054 formula check `(130−100)×0.50 = 15.00` passed via SQL; Vitest isolation suite authored but **skipped** without `SUPABASE_SERVICE_ROLE_KEY`.

### Client Vitest suites

```bash
cd frontend
# Required for Auth Admin fixtures (do not commit the service-role key):
# SUPABASE_SERVICE_ROLE_KEY=... in frontend/.env.local or repo .env.local
npm test -- src/test/rls.security.test.ts
npm test -- src/test/rls.rental.test.ts
npm test -- src/test/rls.utility.test.ts
```

Without `SUPABASE_SERVICE_ROLE_KEY`, Vitest suites are skipped (reported as not-run / skipped).

## Quality checks

```bash
cd frontend
npm run typecheck
npm run build
```

## Phase 1 scope (done)

- `profiles`, `tenants`, `tenant_memberships`, `audit_logs`
- Helpers: `is_super_admin`, `is_member_of`, `has_role`
- RPCs: `provision_tenant`, `set_tenant_status`, `manage_membership`
- Auth UI, protected routes, role-aware shell, Super Admin tenant + audit UI

## Phase 2 scope (done for Prompt 02)

- Property CRUD + private photos
- Rental assignments / move-out (trusted RPCs)
- Rent charges + manual rent payment submit/review
- Landlord and renter rental dashboards/UI
- Storage policies for `property-photos` and `payment-proofs`

## Phase 3–4 scope (done for Prompt 03)

- `utility_accounts`, `meters`, `meter_readings`, `utility_bills`, `utility_payments`
- Trusted RPCs + Edge Functions for link / reading / bill / utility payment review
- Water and electricity company + customer UI (`frontend/src/pages/utility/`)
- Company-only utility payment approval (landlord cannot approve)

## Next

Phase 5 — maintenance requests, notifications, fuller reports (`PROJECT_ROADMAP.md`).
