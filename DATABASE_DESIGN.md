# IJAARO — Database Design Document

**Integrated Rental Property and Utility Management System**  
Version 1.2 | Companion to SYSTEM_DESIGN.md + BRD-1.md v1.1  
**Stack:** React.js · Tailwind CSS · shadcn/ui · **Supabase PostgreSQL + RLS**  
**Visual ERD:** open `ijaaro-database.erd.json` with **ERD Editor** (`dineug.vuerd-vscode`)  
**Phase status:** Phase 1 foundation + Phase 2 rental + Phase 3–4 utility (accounts, meters, readings, bills, payments) are implemented in `supabase/migrations/`. Maintenance/notifications remain Phase 5.

---

## 0. Secure design summary (v1)

| Principle | How |
| --- | --- |
| Multi-tenant SaaS | One shared schema; `tenant_id` on scoped tables |
| Isolation | PostgreSQL **RLS default-deny** + membership helpers |
| Auth | Supabase Auth; `profiles.id` = `auth.users.id` |
| RBAC | `tenant_memberships.role` — see BRD §7.2–7.3 |
| Approvals | Rent → landlord; water/electricity → same company tenant only |
| No duplicate premises | Single `properties` table; utility **search-then-link** |
| Historic debt | `utility_bills.responsible_party_id` immutable snapshot |
| Payments | Manual starts `pending`; API verified in Edge Functions; unique provider txn id |
| Audit | Append-only `audit_logs` |

**Canonical chain:** `properties` → `rental_assignments` → `rent_charges` → `rent_payments`  
and `properties` → `utility_accounts` → `meters` → `meter_readings` → `utility_bills` → `utility_payments`.

---

## 0.1 Phase 1 implemented foundation

| Object | Purpose |
| --- | --- |
| Enums | `tenant_type`, `tenant_status`, `membership_status`, `app_role` |
| `profiles` | 1:1 with `auth.users`; created by trigger; users cannot set privileged roles here |
| `tenants` | `platform` \| `landlord` \| `water_company` \| `electricity_company` |
| `tenant_memberships` | User ↔ tenant ↔ role ↔ status; unique `(tenant_id, user_id)` |
| Helpers | `is_super_admin()`, `is_member_of(uuid)`, `has_role(uuid, app_role[])` |
| `audit_logs` | Append-only; no UPDATE/DELETE for client roles |
| RPCs | `provision_tenant`, `set_tenant_status`, `manage_membership`, `write_audit_log` |

**Migration file:** `supabase/migrations/20261013000001_phase1_foundation.sql`

**Bootstrap:** first Super Admin is created via documented one-time SQL (see README) — never via public signup.

---

## 0.2 Phase 2 implemented rental module

| Object | Purpose |
| --- | --- |
| Enums | `property_status`, `property_type`, `assignment_status`, `charge_status`, `payment_status`, `payment_method` |
| `properties` | Landlord-owned premises; listing + occupancy |
| `property_photos` | Private storage path metadata (`property-photos` bucket) |
| `rental_assignments` | Tenancy history; partial unique index: one `invited`/`active` per property |
| `rent_charges` | Period rent ledger (`numeric(12,2)`); balance = amount_due − amount_paid |
| `rent_payments` | Manual submissions; start `pending`; landlord review only |
| Helpers | `can_manage_landlord_ops`, `can_approve_rent`, `is_assignment_renter` |
| RPCs | `assign_renter`, `complete_move_out`, `create_rent_charge`, `review_rent_payment` |
| Storage | Private buckets `property-photos`, `payment-proofs` (path-scoped policies) |

**Migration files:**
- `20261013000003_phase2_properties_tenancy.sql`
- `20261013000004_phase2_rent_ledger.sql`
- `20261013000005_phase2_revoke_anon_helpers.sql`

**Assumptions (documented):**
1. Prompt 02 includes manual rent ledger/payments (roadmap Phase 3 rent slice) without utility linking.
2. `landlord_staff` may approve rent only when `permissions.approve_rent = true`.
3. At most one pending payment per `(rent_charge_id, payer_id)`; rejected rows are retained so a new pending may be submitted later.
4. Occupancy (`current_renter_id`, occupied status) and assignment status changes only via trusted RPCs (`ijaaro.internal` session flag).
5. Manual approval does **not** prove bank/mobile money was received outside IJAARO.

---

## 1. Design Goals

1. One shared schema for all tenants.
2. Every tenant-scoped row is isolatable via `tenant_id` (direct or through a secured parent).
3. Enforce business rules with constraints + transactions, not only application code.
4. Preserve history (tenancies, readings, bills, payments, audits).
5. Support Property ↔ Utility linking **without duplicate properties**.
6. Snapshot bill responsibility so new renters do not inherit old debt.

---

## 2. Conventions

| Convention | Value |
| --- | --- |
| Primary keys | `uuid` default `gen_random_uuid()` |
| Timestamps | `created_at`, `updated_at` (`timestamptz`) |
| Soft status | Prefer `status` enums over hard deletes for financial/history rows |
| Money | `numeric(12,2)` + `currency` (`text`, default `'USD'` or local) |
| Auth link | `profiles.id` = `auth.users.id` |
| Naming | `snake_case` tables/columns |
| Tenant column | `tenant_id uuid not null references tenants(id)` on scoped tables |

### Enum-style domains (PostgreSQL enums or check constraints)

```text
tenant_type:        platform | landlord | water_company | electricity_company
tenant_status:      pending | active | suspended | disabled
membership_status:  invited | active | disabled
app_role:           super_admin | landlord_admin | landlord_staff |
                    renter | utility_admin | utility_staff | utility_customer
property_status:    available | occupied | vacant
property_type:      apartment | house | shop | office | other
service_type:       water | electricity
assignment_status:  invited | active | completed | cancelled
charge_status:      due | partial | paid | overdue | cancelled
payment_status:     pending | processing | paid | rejected | failed | cancelled | refunded
payment_method:     cash | bank_transfer | mobile_money | card | other | api_provider
reading_status:     valid | estimated | corrected | reset | disputed
bill_status:        draft | issued | partial | paid | overdue | cancelled | disputed
maintenance_status: pending | in_progress | completed | cancelled
urgency:            low | medium | high
notification_channel: in_app | email | sms | whatsapp
delivery_status:    pending | sent | failed | read
```

---

## 3. Entity Relationship Overview

```text
auth.users ──1:1── profiles
                      │
                      │ N
                      ▼
                   tenant_memberships ──► tenants
                      │
properties ◄──────────┘ (landlord tenant owns properties)
    │
    ├── owner_profile_id (landlord user)
    ├── current_renter_id (profile, nullable)
    │
    ├── rental_assignments ──► renter profile
    │         │
    │         └── rent_charges ──► rent_payments
    │
    ├── maintenance_requests
    │
    └── utility_accounts (company tenant) ──► meters
                               │                 │
                               │                 └── meter_readings
                               │
                               └── utility_bills ──► utility_payments
                                      │
                                      └── responsible_party_id (profile snapshot)

notifications → recipient profile + tenant
audit_logs → actor + tenant + entity
```

### Canonical chain

```text
properties
  → rental_assignments (history of occupancy)
  → utility_accounts (water/electricity company tenants)
      → meters
          → meter_readings
      → utility_bills (responsible_party snapshot)
          → utility_payments
```

---

## 4. Table Specifications

### 4.1 Identity & tenancy (Phase 1 — implemented)

#### `profiles`
| Column | Type | Notes |
| --- | --- | --- |
| id | uuid PK | = `auth.users.id` |
| full_name | text | |
| phone | text | |
| email | text | denormalized for convenience |
| avatar_url | text | nullable |
| preferred_language | text | e.g. `so`, `en` |
| created_at / updated_at | timestamptz | |

**Security:** no role column on profiles. Roles live only in `tenant_memberships`.

#### `tenants`
| Column | Type | Notes |
| --- | --- | --- |
| id | uuid PK | |
| name | text not null | |
| slug | text unique not null | subdomain / path key |
| tenant_type | tenant_type not null | |
| status | tenant_status not null default `pending` | |
| branding | jsonb | logo, colors, display name |
| settings | jsonb | due-day defaults, etc. |
| created_at / updated_at | timestamptz | |

#### `tenant_memberships`
| Column | Type | Notes |
| --- | --- | --- |
| id | uuid PK | |
| tenant_id | uuid FK → tenants | |
| user_id | uuid FK → profiles | |
| role | app_role not null | |
| status | membership_status not null | |
| permissions | jsonb | optional overrides |
| invited_by | uuid FK → profiles | nullable |
| created_at / updated_at | timestamptz | |

**Constraints**

- `unique(tenant_id, user_id)`
- Role compatibility: `super_admin` only on `platform`; landlord roles only on `landlord`; utility roles only on water/electricity tenants
- A user may belong to multiple tenants (e.g. renter + utility customer)

#### `audit_logs`
| Column | Type | Notes |
| --- | --- | --- |
| id | uuid PK | |
| tenant_id | uuid FK | nullable for platform-wide |
| actor_id | uuid FK → profiles | |
| action | text not null | |
| entity_type | text not null | |
| entity_id | uuid | |
| metadata | jsonb | server-authored only |
| created_at | timestamptz | |

Prefer **no UPDATE/DELETE** grants on `audit_logs` for ordinary roles.

### 4.2 Rental domain (Phase 2 — implemented)

Column sets match `ijaaro-database.erd.json` / `scripts/generate-erd.mjs`:

- `properties` — `tenant_id`, `owner_id`, `current_renter_id`, listing fields, `rent_amount numeric(12,2)`, `status`, `is_listed`, `created_source`
- `property_photos` — `property_id`, denormalized `tenant_id`, `storage_path`, `sort_order`
- `rental_assignments` — property + landlord + renter, `rent_amount`, `due_day` (1–28), dates, `assignment_status`
- `rent_charges` — period ledger with immutable identity fields; financial fields updated only by `review_rent_payment`
- `rent_payments` — pending→paid/rejected via `review_rent_payment`; review metadata server-set

### 4.3 Utility domain (Phase 3–4 — implemented)

See also `docs/UTILITY_BILLING.md`.

| Table | Notes |
| --- | --- |
| `utility_accounts` | Company `tenant_id`; unique `(tenant_id, account_number)`; unique active `(tenant_id, property_id, service_type)`; `unit_price numeric(12,4)`; `extra_charges_config jsonb` |
| `meters` | Belongs to account; unique `(tenant_id, meter_number)`; `service_type` must match account |
| `meter_readings` | Created only via `record_meter_reading`; decreasing values rejected unless `corrected`/`reset` + reason; one `valid` reading per meter/day |
| `utility_bills` | Immutable responsibility + tariff snapshot; formula `(units × unit_price) + extra_charges`; unique active `(utility_account_id, period_start, period_end)` |
| `utility_payments` | Manual pending → company `review_utility_payment` only (not landlord); idempotency + one pending per bill+payer |

**Helpers:** `can_manage_utility_ops`, `can_approve_utility`, `is_utility_customer_of`, `service_type_for_tenant`, `compute_extra_charges`.

**RPCs:** `search_properties_for_link`, `create_utility_premises`, `link_utility_account`, `record_meter_reading`, `generate_utility_bill`, `review_utility_payment`.

### 4.4–4.5 Later phases (not migrated)

Maintenance requests and notifications remain for Phase 5.

---

## 5. Indexes (Phase 1)

| Table | Index |
| --- | --- |
| `tenants` | unique `slug`; `(tenant_type, status)` |
| `tenant_memberships` | unique `(tenant_id, user_id)`; `(user_id, status)`; `(tenant_id, role, status)` |
| `audit_logs` | `(tenant_id, created_at desc)`; `(entity_type, entity_id)` |

---

## 6. Authorization helpers (Phase 1)

```sql
-- SECURITY DEFINER, search_path = public, granted to authenticated
is_super_admin() returns boolean
is_member_of(p_tenant_id uuid) returns boolean  -- active membership only
has_role(p_tenant_id uuid, p_roles app_role[]) returns boolean
```

Inactive (`disabled` / `invited`) memberships do **not** grant access via helpers.

---

## 7. RLS Design (Phase 1)

### 7.1 Principles

1. Enable RLS on **all** Phase 1 tables.
2. Default deny (no policy ⇒ no access).
3. Policies for SELECT / INSERT / UPDATE / DELETE as applicable.
4. Super Admin policies are narrow and audited.
5. Never trust client-supplied `tenant_id` alone for privilege.

### 7.2 Policy summary

| Table | SELECT | INSERT | UPDATE | DELETE |
| --- | --- | --- | --- | --- |
| profiles | self; super_admin | trigger / self (id = auth.uid()) | self (non-id fields); super_admin | deny |
| tenants | members of tenant; super_admin | via RPC / super_admin | super_admin | deny |
| tenant_memberships | self; tenant admins; super_admin | RPC / admins (not self-grant super_admin) | same | prefer status disable |
| audit_logs | super_admin; limited tenant admin | trusted RPC only | **none** | **none** |

### 7.3 Isolation rules enforced

1. Anonymous users cannot read/write protected tables.
2. Non-members cannot access another tenant’s rows.
3. Tenant A cannot read/insert/update/delete Tenant B.
4. Inactive membership does not grant access.
5. Users cannot promote themselves to `super_admin`.
6. Ordinary tenant admins cannot grant platform privileges.
7. Water Company A ≠ Water Company B (membership/tenant isolation).
8. Electricity Company A ≠ Electricity Company B.
9. Audit logs are not tamperable by ordinary users.

---

## 8. Privileged RPCs / Edge workflows

| Operation | Mechanism | Notes |
| --- | --- | --- |
| Create tenant + initial admin | `provision_tenant` RPC / Edge Function | transactional; audited |
| Activate / suspend tenant | `set_tenant_status` | super_admin only; audited |
| Membership changes | `manage_membership` | role validation; audited |
| Audit write | `write_audit_log` | server-side actor; rejects client spoofing of actor |

---

## 9. Migration package

| Migration | Phase | Contents |
| --- | --- | --- |
| `20261013000001_phase1_foundation` | 1 | enums, profiles, tenants, memberships, helpers, RLS, audit_logs, RPCs |
| `20261013000002_phase1_security_hardening` | 1 | revoke/grant hardening |
| `20261013000003_phase2_properties_tenancy` | 2 | properties, photos, assignments, storage, assign/move-out |
| `20261013000004_phase2_rent_ledger` | 2* | rent_charges, rent_payments, review RPCs, proof storage (*roadmap Phase 3 rent slice pulled into Prompt 02) |
| `20261013000005_phase2_revoke_anon_helpers` | 2 | revoke anon EXECUTE on helpers |
| `20261013000006_phase3_utilities_schema` | 3–4 | enums, utility tables, RLS, storage policies, helpers |
| `20261013000007_phase3_utilities_rpcs` | 3–4 | link/search/premises/reading/bill/payment RPCs |
| `006_maintenance_notify` | 5 | maintenance_requests, notifications |
| `007_subscriptions_optional` | 6 | if confirmed |
| `008_hardening` | 6 | extra indexes, monitoring |

---

## 10. Isolation test cases (Phase 1 gate)

1. Anonymous access denied.
2. Authenticated non-member cannot access tenant records.
3. Tenant A cannot read Tenant B.
4. Tenant A cannot insert for Tenant B.
5. Tenant A cannot update Tenant B.
6. Tenant A cannot delete Tenant B.
7. Inactive membership does not grant access.
8. User cannot self-promote to super_admin.
9. Tenant admin cannot grant platform privileges.
10. Water Co A cannot access Water Co B.
11. Electricity Co A cannot access Electricity Co B.
12. Landlord access limited to landlord tenant.
13. Unauthorized tenant creation rejected.
14. Unauthorized tenant status change rejected.
15. Ordinary users cannot tamper with audit_logs.
16. Profile provisioning is idempotent and tied to `auth.uid()`.

---

## 11. What to implement next (SQL)

1. Maintenance + notifications (Phase 5).
2. Optional API payment provider path when OQ-02 is confirmed.
3. Confirm remaining OQ-07 billing policy edge cases (late fees, estimated-bill rules).

Do **not** weaken rental or utility RLS. Keep separate approval paths (rent ≠ water ≠ electricity).

---

*This database design implements BRD-1 v1.1 (rules BR-011–BR-026, permission matrix §7.3) and Architecture §3–§9. Phase 1–4 utility subset is implemented. Open the visual model in ERD Editor via `ijaaro-database.erd.json`. Regenerate with `node scripts/generate-erd.mjs`. Pair with SYSTEM_DESIGN.md and `docs/UTILITY_BILLING.md`.*
