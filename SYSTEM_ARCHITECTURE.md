# IJAARO — System Architecture

**Version:** 1.1  
**Date:** 13 October 2026  
**Audience:** Implementers (web, Supabase, Edge Functions, QA)  
**Aligned with:** `BRD-1.md` v1.1 · `SYSTEM_DESIGN.md` · `PROJECT_ROADMAP.md` · `ijaaro-database.erd.json` · `docs/UTILITY_BILLING.md`  
**Implementation status:** Phase 1–2 rental + Phase 3–4 utility schema/RPCs/UI are live. Maintenance/notifications and API payments remain later phases.

---

## 1. Architecture Summary

IJAARO is a **multi-tenant SaaS** platform that unifies:

- Rental property management (landlords / renters)
- Water utility operations
- Electricity utility operations

on **one web client, one backend, one PostgreSQL database**, with isolation enforced by **`tenant_id` + roles + Row-Level Security (RLS)**.

```text
Property → Owner → Current Renter → Utility Account → Meter → Readings → Bills → Payments
```

---

## 2. C4 Context (Level 1)

```text
                         ┌──────────────┐
                         │ Super Admin  │
                         └──────┬───────┘
                                │
   ┌──────────┐    ┌────────────▼────────────┐    ┌─────────────────┐
   │ Landlord │───►│                         │◄───│ Water Company   │
   └──────────┘    │         IJAARO          │    └─────────────────┘
   ┌──────────┐    │  Web App + (Flutter)    │    ┌─────────────────┐
   │  Renter  │───►│  Supabase API + RLS     │◄───│ Electricity Co  │
   └──────────┘    │                         │    └─────────────────┘
                   └────────────┬────────────┘
                                │
              ┌─────────────────┼─────────────────┐
              ▼                 ▼                 ▼
        Payment Provider   Email Provider   Object Storage
        (TBD / OQ-02)      (Resend/etc.)    (Supabase)
```

---

## 3. Container Architecture (Level 2)

```text
┌─────────────────────────────────────────────────────────────────┐
│ Clients                                                         │
│  ┌──────────────────────────┐  ┌─────────────────────────────┐  │
│  │ Web (React + TS)         │  │ Mobile Flutter (Phase 5)    │  │
│  │ Vite · Tailwind · shadcn │  │ Same Supabase project       │  │
│  └────────────┬─────────────┘  └──────────────┬──────────────┘  │
└───────────────┼────────────────────────────────┼────────────────┘
                │ HTTPS · JWT (Supabase Auth)    │
                ▼                                ▼
┌─────────────────────────────────────────────────────────────────┐
│ Supabase Platform                                               │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌──────────────┐  │
│  │ Auth       │ │ PostgREST  │ │ Realtime   │ │ Storage      │  │
│  │            │ │ (RLS)      │ │ (optional) │ │ (private)    │  │
│  └─────┬──────┘ └─────┬──────┘ └────────────┘ └──────┬───────┘  │
│        │              │                              │          │
│  ┌─────▼──────────────▼──────────────────────────────▼───────┐  │
│  │ Edge Functions (Deno) — privileged / external             │  │
│  │ payments · bill generate · assign/move-out · link util    │  │
│  └───────────────────────────┬───────────────────────────────┘  │
│                              │                                  │
│  ┌───────────────────────────▼───────────────────────────────┐  │
│  │ PostgreSQL 15+ · RLS · migrations · audit_logs            │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### Design principles

1. **One platform** — not separate products per role.
2. **Security at the database** — UI hiding is not authorization.
3. **Server-side trust boundary** — payments, billing, assignment transactions via Edge Functions or tightly constrained RLS.
4. **History over overwrite** — tenancies, bills, payments, meter corrections retained.
5. **Link, don’t duplicate** — utility accounts attach to existing `properties` rows.

---

## 4. Technology Stack

| Layer | Technology | Notes |
| --- | --- | --- |
| Web | React 18+ · TypeScript · Vite · Tailwind · shadcn/ui | Brand tokens in `SYSTEM_DESIGN.md` §18 |
| Mobile | Flutter | Should Have; Phase 5 |
| Auth | Supabase Auth | `profiles.id = auth.users.id` |
| API | PostgREST + Edge Functions | Direct client reads/writes only where RLS-safe |
| DB | PostgreSQL (Supabase) | Shared schema + `tenant_id` |
| Files | Supabase Storage (private) | Signed URLs after authz |
| Email | Provider TBD | In-app + email in v1 |
| Payments | Manual first; API later | Provider = OQ-02 |
| Hosting | TBD | OQ-01 |

---

## 5. Multi-Tenancy Model

### 5.1 Pattern

**Shared database, shared schema, row isolation via `tenant_id` + RLS.**

Not used: schema-per-tenant, database-per-tenant.

### 5.2 Tenant types

| `tenant_type` | Purpose | Typical roles |
| --- | --- | --- |
| `platform` | IJAARO operators | `super_admin` |
| `landlord` | Landlord workspace | `landlord_admin`, `landlord_staff`, `renter` |
| `water_company` | Water utility | `utility_admin`, `utility_staff`, `utility_customer` |
| `electricity_company` | Electricity utility | same utility roles |

### 5.3 Tenant resolution

```text
Request → optional slug/subdomain → tenants.slug
       → authenticate user
       → require active tenant_memberships
       → set app tenant context
       → RLS filters via auth.uid() + membership helpers
```

Rules:

- Never trust client-supplied `tenant_id` alone.
- Unknown / disabled / mismatched tenant → fail closed.
- Super Admin platform actions are explicit and audited.

### 5.4 v1 working decisions

| Topic | Decision |
| --- | --- |
| Landlord grouping | One landlord = one `tenants` row |
| Property vs premises | One canonical `properties` table |
| Chat | Contact links in v1 (not in-app chat) |
| Move-out unpaid | Allow move-out; keep balances visible; no auto debt transfer |

---

## 6. Logical Modules

| Module | Responsibility | Primary tables |
| --- | --- | --- |
| Identity & Access | Auth, profiles, memberships, roles | `profiles`, `tenant_memberships` |
| Tenant Admin | Onboarding, status, branding | `tenants` |
| Property | CRUD, photos, listing status | `properties`, `property_photos` |
| Tenancy | Assign, move-out, history | `rental_assignments` |
| Rent Billing | Charges + payments | `rent_charges`, `rent_payments` |
| Utility Ops | Accounts, meters, readings, bills | `utility_accounts`, `meters`, `meter_readings`, `utility_bills` |
| Utility Payments | Manual/API approve | `utility_payments` |
| Maintenance | Requests + status | `maintenance_requests` |
| Notifications | Event fan-out | `notifications` |
| Audit | Sensitive action trail | `audit_logs` |
| Files | Private media | Storage buckets |

---

## 7. Data Model Overview

### 7.1 Entity groups (from ERD)

```text
PLATFORM & AUTH
  profiles

TENANT PROVISIONING
  tenants ──< tenant_memberships >── profiles

LANDLORD DOMAIN
  properties ──< property_photos
  properties ──< rental_assignments ──< rent_charges ──< rent_payments
  properties ──< maintenance_requests

UTILITY DOMAIN
  tenants (company) ──< utility_accounts >── properties
  utility_accounts ──< meters ──< meter_readings
  utility_accounts ──< utility_bills ──< utility_payments

CROSS-CUTTING
  notifications · audit_logs
```

### 7.2 Tables (16)

| Table | Domain |
| --- | --- |
| `profiles` | Auth |
| `tenants` | Provisioning |
| `tenant_memberships` | RBAC |
| `properties` | Rental / shared premises |
| `property_photos` | Rental |
| `rental_assignments` | Rental |
| `rent_charges` | Rent |
| `rent_payments` | Rent |
| `maintenance_requests` | Rental |
| `utility_accounts` | Utility |
| `meters` | Utility |
| `meter_readings` | Utility |
| `utility_bills` | Utility |
| `utility_payments` | Utility |
| `notifications` | Cross |
| `audit_logs` | Cross |

Source of truth for columns/relationships: `scripts/generate-erd.mjs` → `ijaaro-database.erd.json`.

### 7.3 Critical data rules

| Rule | Implementation |
| --- | --- |
| Max one active assignment per property | Unique partial index / constraint on `rental_assignments` |
| No duplicate property on utility link | Search-then-link; same `property_id` |
| Bill responsibility immutable | `utility_bills.responsible_party_id` snapshot; never rewrite on renter change |
| Manual payment starts Pending | Default `payment_status = pending` |
| Provider txn applied once | Unique `provider_transaction_id` when set |
| Payment proof ≠ confirmation | Status change only via approve / server verify |

---

## 8. Authorization Architecture

### 8.1 Layers (all must agree)

```text
1. UI          — hide unauthorized routes/actions (convenience)
2. RLS         — default-deny on every tenant-scoped table
3. Edge Fn     — privileged multi-table / secret workflows
4. Audit       — append-only sensitive events
```

### 8.2 Roles (`app_role`)

| Role | Tenant type | Must not |
| --- | --- | --- |
| `super_admin` | `platform` | Expose secrets; grant ordinary cross-tenant bypass |
| `landlord_admin` | `landlord` | Approve utility payments |
| `landlord_staff` | `landlord` | Admin memberships / approve unless granted |
| `renter` | `landlord` | Approve payments; see other renters’ data |
| `utility_admin` | water/electricity | Other companies; rent approvals |
| `utility_staff` | water/electricity | Beyond permitted_tasks |
| `utility_customer` | water/electricity | Staff ops; other customers |

### 8.3 Payment approval matrix

| Payment | Approver |
| --- | --- |
| Manual rent | Landlord of that tenancy only |
| Manual water | That water company tenant only |
| Manual electricity | That electricity company tenant only |
| API payment | Server verification only (no landlord click) |

Full capability matrix: `BRD-1.md` §7.3.

### 8.4 Recommended DB helpers

```sql
-- conceptual; implement in migrations
auth.uid()
is_member_of(tenant_id uuid) returns boolean
has_role(tenant_id uuid, roles app_role[]) returns boolean
is_super_admin() returns boolean
can_manage_property(property_id uuid) returns boolean
is_responsible_for_bill(...) returns boolean
```

---

## 9. API / Service Boundaries

### 9.1 Direct client → Supabase (RLS-protected)

Safe examples:

- Read own profile / memberships
- Landlord property CRUD within own tenant
- Renter browse Available listings
- Submit maintenance (own)
- Submit manual payment rows as `Pending` only

### 9.2 Edge Functions (required)

| Function | Purpose | Status |
| --- | --- | --- |
| `tenant-resolve` | Slug/subdomain → tenant + branding | Planned |
| `assign-renter` | Transactional assignment + property status | ✅ |
| `complete-move-out` | Close assignment; clear current renter | ✅ |
| `link-utility-account` | Search/link without duplicates | ✅ |
| `record-meter-reading` | Validated reading insert | ✅ |
| `generate-utility-bill` | Calc + responsibility snapshot | ✅ |
| `approve-payment` | Extra checks + audit (`payment_type`: rent or utility) | ✅ |
| `create-payment-intent` | Provider secrets (when API enabled) | Deferred (OQ-02) |
| `payment-webhook` | Signature verify + idempotent apply | Deferred (OQ-02) |
| `export-report` | Permission check before PDF/CSV | Planned |

### 9.3 Storage buckets (private)

| Bucket | Contents | Access |
| --- | --- | --- |
| `property-photos` | Listing images | Landlord manage; authorized viewers |
| `maintenance-photos` | Request photos | Renter + landlord of property |
| `payment-proofs` | Manual payment evidence | Payer + authorized reviewer only |

Access via **signed URLs** after authorization.

---

## 10. Core Workflows

### 10.1 Tenant onboarding

```text
Create tenant (type, slug, status)
  → owner membership (admin role)
  → optional branding/settings
  → audit_log
```

### 10.2 Rental lifecycle

```text
Create property (Available)
  → Renter browses / contacts
  → assign-renter → Occupied + active rental_assignment
  → rent_charges per period
  → complete-move-out → Available + history retained
```

### 10.3 Manual rent payment

```text
Renter: rent_payments Pending + optional proof
  → notify landlord
  → Approve → Paid + update rent_charge
     or Reject → Rejected + reason
  → audit + notify renter
```

### 10.4 Property ↔ utility link

**Path A:** Property exists → search → link account/meter to `property_id`.  
**Path B:** No match → utility creates property (`created_source`) → account/meter → later reconcile.

### 10.5 Meter → bill

```text
Record meter_reading (validate ≥ previous unless correction)
  → units = current − previous
  → total = (units × unit_price) + charges
  → snapshot responsible_party_id (renter if occupied else owner)
  → notify customer
```

### 10.6 Maintenance

```text
Renter creates Pending
  → Landlord: Pending → In Progress → Completed
  → notifications on create / status change
```

---

## 11. Payment State Machine

```text
Manual:
  Pending ──Approve──► Paid/Confirmed
     │
     └──Reject──► Rejected

API:
  Processing ──verify success──► Paid/Confirmed
       │
       ├──verify fail──► Failed
       └──cancel──► Cancelled

Refunded: only if OQ-11 enables refunds
```

Invariants:

- Proof upload never auto-confirms.
- One `provider_transaction_id` applied at most once.
- Bill/charge update in the **same DB transaction** as payment confirmation.

---

## 12. Notification Events

| Event | Recipients |
| --- | --- |
| Rent payment submitted / approved / rejected | Landlord, Renter |
| Utility bill generated / due / overdue | Responsible customer |
| Utility payment submitted / approved / rejected | Customer, company staff |
| Maintenance create / status change | Landlord, Renter |
| Invitation / assignment / move-out | Landlord, Renter |

Payloads must not leak sensitive payment details; deep-link to authenticated pages.

---

## 13. Repo Layout (Phase 1)

```text
IJaaro/
├── frontend/                # React + Vite + Tailwind + shadcn-style UI
├── backend/                 # Shared server-side TypeScript types
├── supabase/
│   ├── migrations/          # versioned SQL (authoritative)
│   ├── functions/           # Edge Function wrappers for privileged RPCs
│   ├── seed/                # one-time Super Admin bootstrap SQL
│   ├── tests/               # SQL RLS isolation checks
│   └── config.toml
├── images/brand/            # logos
├── scripts/generate-erd.mjs
├── BRD-1.md
├── SYSTEM_DESIGN.md
├── SYSTEM_ARCHITECTURE.md   # this file
├── PROJECT_ROADMAP.md
├── DATABASE_DESIGN.md
├── ijaaro-database.erd.json
└── system-design.pen
```

Phase 1 uses `frontend/` + `backend/` (per implementation plan) instead of `apps/web`.

---

## 14. Security & Cross-Cutting

| Concern | Approach |
| --- | --- |
| Isolation | RLS default-deny; membership helpers |
| Secrets | Only Edge Functions / server env |
| Validation | DB constraints + app Zod/forms |
| Transactions | Payments, assign/move-out, bill generate |
| Audit | `audit_logs` append-only |
| Rate limit | Auth + public endpoints |
| Environments | Dev / Staging / Production |
| Migrations | Versioned SQL + documented rollback |
| Testing gates | RLS isolation, role matrix, rental e2e, payment idempotency, linking, responsibility |

### Hard negatives (must fail)

- Landlord updates `utility_payments.status`
- Water Company A reads Water Company B
- Electricity staff approves water payment
- Renter B reads Renter A payments
- Client declares API payment success without server verify
- Duplicate provider callback applies twice

---

## 15. Deployment Target

```text
DNS / optional *.ijaaro.app
        │
        ▼
Web host (HTTPS) ──► Supabase cloud (Auth/API/DB/Storage/Functions)
                        │
                        ├── backups + monitoring + alerts
                        └── secrets in env (never in client)
```

Release order (must follow):

1. Security + tenant isolation  
2. Rental operations  
3. Rent payments + utility linking  
4. Meter billing + utility payments  
5. Maintenance + reports (+ mobile)  
6. Production hardening  

---

## 16. UI Architecture Notes

- Visual source: `system-design.pen`
- Tokens: navy `#0B1F3A`, green `#1FA85A`, water `#2B8CFF`, power `#F5C400`
- Typography: Montserrat (display), Inter (UI) — as documented in design
- Role dashboards: Super Admin · Landlord · Renter · Water · Electricity · Utility Customer
- Status badges: text + color (never color alone)
- Currency display: right-aligned; project uses configurable currency (default USD in ERD; SOS in UI notes — confirm per tenant)

---

## 17. Implementation Sequence (Architecture View)

| Phase | Architecture slices |
| --- | --- |
| 0 | Repo scaffold, Supabase project, brand theme shell |
| 1 | Auth, tenants, memberships, RLS skeleton, Super Admin, audit base |
| 2 | Properties, search, assignment, move-out, landlord/renter UI (**implemented**) |
| 3 | Rent ledger/payments (**manual path implemented in Prompt 02**), utility link, meters/readings, responsibility |
| 4 | Company dashboards, bill generation, utility payments, reports v1 |
| 5 | Maintenance, richer reports, audit completeness, Flutter parity |
| 6 | Hosting, subdomains, optional subscriptions, ops runbooks |

Detailed tasks and exit criteria: see `PROJECT_ROADMAP.md`.

---

## 18. Traceability

| Concern | Document |
| --- | --- |
| Business rules & FRs | `BRD-1.md` |
| Workflows & UI tokens | `SYSTEM_DESIGN.md` |
| Phases & kickoff | `PROJECT_ROADMAP.md` |
| Columns / FKs | `ijaaro-database.erd.json` |
| This file | Runtime architecture for builders |

---

*Implement against this document + RLS-first Phase 1. Do not ship payments before authorization and idempotency gates pass.*
