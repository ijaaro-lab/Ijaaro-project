# Water Company Admin Dashboard

Status: implemented on top of Phase 3–4 utility ops (2026-10-19 houses + flat monthly bills).

## Pages & routes (`/app/water/*`)

| Route | Page | Access |
|-------|------|--------|
| `/app/water` | Overview KPIs + charts | admin/staff/customer |
| `/app/water/customers` | Customers & Accounts (advanced link) | staff |
| `/app/water/connections` | **Houses** — save house + monthly fee + issue bill | staff |
| `/app/water/meters` | Water Meters | staff |
| `/app/water/readings` | Meter Readings | staff |
| `/app/water/bills` | Bills from meter readings | staff |
| `/app/water/payments` | Payments & Verification | staff (approve = admin) |
| `/app/water/staff` | Staff & Permissions | admin |
| `/app/water/reports` | Reports | staff |
| `/app/water/notifications` | Operational alerts | staff |
| `/app/water/settings` | Company Settings (branding) | admin |
| `/app/water/my-bills` | Customer bills | customer |
| `/app/water/my-payments` | Customer payments | customer |

Electricity mirrors the same routes under `/app/electricity/*` and uses the same
simplified finance-first sidebar (Overview, Customers, Finance & Payments, Reports,
Staff, Company Settings) with electricity branding (`#F5C400` / Zap iconography).
Meter routes remain registered for future use but are not primary nav items.

## Primary ops flow (flat monthly)

1. **Houses** → Add house (address, account number, monthly water fee).
2. **Issue bill** on that row (current calendar month) via `generate_flat_utility_bill`.
3. Customer submits payment on **My payments** (if linked by email), or admin tracks issued bills.
4. **Payments** → Admin **Approve**.

Meter-based billing (readings → `generate_utility_bill`) remains available on Readings / Bills pages.

## Houses vs landlord Properties

- UI speaks **Houses** for the water company — not landlord marketplace Properties.
- Storage still uses `properties` rows with `created_source = water_company` and `created_by_tenant_id` = the utility tenant (existing one-table architecture).
- RPCs: `register_utility_house`, `generate_flat_utility_bill` (`20261019000001_register_utility_house.sql`).

## Sidebar

Sectioned navigation (Workspace / Water Operations / Management) with Lucide icons, active route highlight, mobile drawer, tenant logo + company name, and theme toggle (persisted `ijaaro-theme`).

## Data & charts

Overview and reports use tenant-scoped PostgREST queries only:

- Collections bar chart from approved `utility_payments`
- Payment / bill status donuts
- Consumption bars from `meter_readings.units_consumed` (missing readings omitted, not treated as zero)

## Database

- `list_company_member_profiles(tenant_id)` — company admin member list.
- `register_utility_house` — create house + account with `extra_charges_config.fixed_amount`.
- `generate_flat_utility_bill` — monthly bill without meter reading (`meter_reading_id` nullable).
- `lookup_profile_by_email` — callable by `utility_admin` / `landlord_admin` / super admin.

## Authorization notes

- Payment approve/reject UI and RPC: **`utility_admin` only** (`can_approve_utility`).
- Staff cannot elevate themselves beyond what `manage_membership` allows (admin-gated).
- RLS FORCE remains on utility tables; landlords isolated by omission.

## Known limitations

- Notifications are operational alerts derived from bills/payments — not a push/email inbox (Phase 5).
- Commission / platform payout not implemented.
- Tariff schedules / GIS / work orders not in scope.
