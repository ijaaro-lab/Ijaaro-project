# IJAARO — System Design Document

**Integrated Rental Property and Utility Management System**  
Version 1.0 | Derived from BRD-1, Technical Architecture v1.0, Project Roadmap v1.0

---

## 1. Purpose of This Document

This document explains **how IJAARO is structured as a system**: components, data flow, multi-tenancy, authorization, and core workflows.

It is the bridge between:

| Document | Role |
| --- | --- |
| BRD-1.md | *What* the business needs |
| TECHNICAL ARCHITECTURE | Constraints and proposed stack |
| PROJECT ROADMAP | *When* features are built |
| **This document** | *How* the system is designed |
| DATABASE_DESIGN.md | *How* data is stored and secured |

---

## 2. System Vision (One Sentence)

IJAARO is **one multi-tenant SaaS platform** where landlords, renters, water companies, and electricity companies share **one web app, one mobile app, one backend, and one database**, with access controlled by **tenant membership + role + PostgreSQL RLS**.

### Core relationship chain

```text
Property → Owner → Current Renter → Utility Account → Meter → Readings → Bills → Payments
```

---

## 3. High-Level Architecture

```text
┌──────────────────┐     ┌──────────────────┐
│  Web App         │     │  Mobile App      │
│  React + TS      │     │  Flutter         │
│  (Vite/Next.js)  │     │  (Android/iOS)   │
└────────┬─────────┘     └────────┬─────────┘
         │                        │
         │   HTTPS + Auth JWT     │
         └───────────┬────────────┘
                     │
         ┌───────────▼────────────┐
         │  Supabase Platform     │
         │  ┌──────────────────┐  │
         │  │ Auth             │  │
         │  │ PostgREST API    │  │
         │  │ Realtime (opt)   │  │
         │  │ Storage (private)│  │
         │  │ Edge Functions   │  │
         │  └────────┬─────────┘  │
         │           │            │
         │  ┌────────▼─────────┐  │
         │  │ PostgreSQL       │  │
         │  │ + RLS policies   │  │
         │  └──────────────────┘  │
         └────────────────────────┘
                     │
         ┌───────────▼────────────┐
         │ External services      │
         │ • Payment provider     │
         │ • Email (notifications)│
         │ • SMS/WhatsApp (opt)   │
         └────────────────────────┘
```

### Design principles

1. **One platform** — not separate systems for landlords vs utilities.
2. **Security at the database** — RLS is the last line of defense; UI hiding is not security.
3. **Server-side trust boundary** — payments, approvals, billing, and privileged writes go through Edge Functions or constrained RLS policies.
4. **History over overwrite** — tenancies, bills, payments, and meter corrections are retained.
5. **Link, don’t duplicate** — utility accounts attach to existing properties when a match exists.

---

## 4. Technology Decisions (for v1)

Status: **Confirmed** in BRD-1 v1.1 for web/backend (hosting vendor + payment provider still open).

| Layer | Decision | Rationale |
| --- | --- | --- |
| Web | **React.js + TypeScript + Tailwind CSS + shadcn/ui** | Confirmed client stack for role dashboards |
| Mobile | Flutter (Should Have) | Same Supabase backend; role-aware navigation |
| Backend | **Supabase** (Auth, Postgres, Storage, Edge Functions) | Auth + RLS + private storage for multi-tenant SaaS |
| DB | **PostgreSQL + RLS**; ERD = `ijaaro-database.erd.json` | Tenant isolation + visual schema in ERD Editor |
| Payments | Confirm Somalia provider later; Manual + API design | Manual path ships first; API path is pluggable |
| Notifications | In-app + Email in v1 | SMS/WhatsApp deferred (OQ-09) |
| Hosting | React host + Supabase cloud | Confirm vendor before production (OQ-01 remainder) |

---

## 5. Multi-Tenancy Model

### 5.1 Model choice

**Shared database, shared schema, `tenant_id` isolation + RLS.**

Not used: schema-per-tenant, database-per-tenant.

### 5.2 Tenant types

| `tenant_type` | Meaning | Typical roles inside tenant |
| --- | --- | --- |
| `platform` | Internal IJAARO operator workspace | `super_admin` |
| `landlord` | Landlord / property-manager workspace | `landlord_admin`, `landlord_staff` (optional) |
| `water_company` | Water utility company | `utility_admin`, `utility_staff` |
| `electricity_company` | Electricity utility company | `utility_admin`, `utility_staff` |

### 5.3 Recommended decision for open questions

| Open Q | Recommendation for v1 design | Why |
| --- | --- | --- |
| OQ-05 Landlord grouping | **One landlord = one tenant workspace** | Simple membership and RLS; owners are not mixed |
| OQ-06 Property vs premises | **One canonical `properties` table** | Utility staff can create or link the same entity; no parallel premises table |
| OQ-03 Chat | **Contact links / phone / email in v1** | Defer in-app chat |
| OQ-04 Subscriptions | **Schema-ready, feature optional** | Tables exist; UI/billing can wait for Phase 6 confirmation |
| OQ-08 Move-out unpaid | **Allow move-out; keep balances visible; do not auto-transfer debt** | Matches BR-018; policy flag can tighten later |

### 5.4 Tenant resolution

```text
Request → (optional subdomain/slug) → resolve tenants.slug
       → user authenticates
       → verify active tenant_memberships row
       → set app tenant context
       → all queries filtered by RLS using auth.uid() + membership
```

Rules:

- Unknown / disabled / mismatched tenant → fail safely.
- Never trust client-supplied `tenant_id` alone.
- Super Admin platform actions are explicitly scoped and audited.

---

## 6. Logical Components

| Component | Responsibility |
| --- | --- |
| **Identity & Access** | Auth sessions, profiles, memberships, roles, permission checks |
| **Tenant Admin** | Onboarding, status, branding/settings, staff invites |
| **Property Module** | Property CRUD, photos, search, status (Available / Occupied / Vacant) |
| **Tenancy Module** | Invite, assign, active tenancy, move-out, history |
| **Rent Billing** | Rent charges/ledger, due/overdue, balances |
| **Utility Ops** | Accounts, meters, readings, unit rates, bill generation |
| **Payments** | Manual + API attempts, approve/reject, idempotent apply |
| **Maintenance** | Requests + landlord status workflow |
| **Notifications** | Event fan-out (in-app/email) |
| **Files** | Private storage for photos and payment proof |
| **Reports** | Role/tenant-scoped aggregates |
| **Audit** | Immutable-ish trail for sensitive actions |
| **Platform Billing (optional)** | Plans, subscriptions, platform fees |

---

## 7. Role → Dashboard Map

| Role | Primary dashboard | Key actions |
| --- | --- | --- |
| Super Admin | Platform console | Tenants, users, global settings, optional subscriptions |
| Landlord | Properties & rent | Properties, renters, rent review, maintenance, reports |
| Renter | My housing | Browse listings, tenancy, rent/utility bills, pay, maintenance |
| Water Admin/Staff | Water ops | Customers, meters, readings, bills, water payments, staff, reports |
| Electricity Admin/Staff | Electricity ops | Same as water, scoped to electricity tenant |
| Utility Customer | My utilities | Own accounts, readings, bills, payments |

### Critical approval boundaries (non-negotiable)

| Payment type | Approver |
| --- | --- |
| Manual rent | Landlord of that tenancy/property only |
| Manual water | Authorized users of **that** water company tenant |
| Manual electricity | Authorized users of **that** electricity company tenant |
| API payment | Server verification only (not a landlord/UI click) |

---

## 8. Core Workflows

### 8.1 Tenant onboarding

```text
Register / Super Admin create tenant
  → create tenants row (type, slug, status)
  → create owner membership (admin role)
  → optional branding/settings
  → audit_log
```

### 8.2 Rental lifecycle

```text
Landlord creates property (Available)
  → Renter browses/filters → views detail → expresses interest / contacts
  → Landlord invites / assigns renter
  → Create rental_assignment (active)
  → Set property.current_renter_id, status = Occupied
  → Generate rent_charges per period
  → Move-out completed
  → Close assignment, clear current_renter_id, status = Available
  → History retained
```

**Constraint:** At most one *active* assignment per property (v1).

### 8.3 Rent payment (manual)

```text
Renter submits rent_payment (Pending) + optional proof
  → Notify landlord
  → Landlord Approve → Paid/Confirmed + update rent_charge
     or Reject → Rejected + reason
  → Audit + notify renter
```

### 8.4 Rent/utility payment (API)

```text
Client creates payment_attempt (Processing)
  → Edge Function calls provider (secrets server-side)
  → Provider webhook / verify response
  → Idempotency key / provider_txn_id unique check
  → Transaction: mark payment Paid + update charge/bill once
  → Notify user
```

### 8.5 Property ↔ utility linking

**Path A — rental property exists first**

```text
Utility staff search property (id/address/district)
  → Match found → create utility_account + meter linked to property_id
  → Do NOT create a second property
```

**Path B — utility registers premises first**

```text
No match → authorized staff creates property (source = utility)
  → Create utility_account + meter
  → Later landlord claim/reconcile via authorized link (same property_id)
```

### 8.6 Metering & billing

```text
Staff records meter_reading
  → Validate >= previous (unless correction/reset workflow)
  → Units = current − previous
  → Bill total = (units × unit_price) + charges
  → Snapshot responsible_party_id on utility_bills
     (current renter if occupied, else owner)
  → Notify customer
```

**Responsibility rule:** Changing renters later does **not** rewrite old bills.

### 8.7 Maintenance

```text
Renter creates request (Pending) + optional photo
  → Landlord: Pending → In Progress → Completed
  → Notifications on create/status change
```

---

## 9. API / Service Boundaries

### 9.1 Direct client → Supabase (RLS-protected)

Safe for:

- Read own profile, memberships, permitted properties/bills
- Create maintenance requests (own)
- Submit manual payment rows (Pending only)
- Landlord property CRUD within own tenant

### 9.2 Edge Functions (privileged / external)

Must use Edge Functions for:

| Function | Why |
| --- | --- |
| `create-payment-intent` | Provider secrets |
| `payment-webhook` | Signature verify + idempotent apply |
| `generate-utility-bill` | Consistent calculation + responsibility snapshot |
| `assign-renter` / `complete-move-out` | Multi-table transactional state |
| `link-utility-account` | Search/link without duplicates |
| `approve-payment` | Extra server checks beyond RLS (optional hardening) |
| `export-report` | Permission check before PDF/CSV |
| `tenant-resolve` | Subdomain/slug resolution helpers |

### 9.3 Storage

Private buckets:

- `property-photos`
- `maintenance-photos`
- `payment-proofs`

Access via signed URLs after authorization check. Payment proof: payer + authorized reviewer only.

---

## 10. Authorization Model

```text
auth.users (Supabase)
    └── profiles (1:1)
            └── tenant_memberships (N)
                    ├── tenant_id
                    ├── role
                    ├── status (active/invited/disabled)
                    └── permissions (JSONB or role defaults)
```

### Helper functions (DB)

- `auth.uid()` — current user
- `is_member_of(tenant_id)` — active membership
- `has_role(tenant_id, roles[])` — role check
- `is_super_admin()` — platform role
- `can_manage_property(property_id)` — landlord ownership/membership
- `is_responsible_for_bill(...)` — customer access

UI role menus are **convenience only**. RLS + Edge Function checks are mandatory.

---

## 11. Payment State Machine

```text
Pending ──Approve──► Paid/Confirmed
   │
   └──Reject──► Rejected

API path:
Processing ──verify success──► Paid/Confirmed
     │
     ├──verify fail──► Failed
     └──cancel──► Cancelled

Refunded: only if refunds are later enabled (OQ-11)
```

Rules:

- Manual proof ≠ automatic confirmation.
- One `provider_transaction_id` applied at most once.
- Bill/charge updates happen in the same DB transaction as payment confirmation.

---

## 12. Notification Events

| Event | Recipients |
| --- | --- |
| Rent payment submitted / approved / rejected | Landlord, Renter |
| Utility bill generated / due / overdue | Responsible customer |
| Utility payment submitted / approved / rejected | Customer, company staff |
| Maintenance created / status changed | Landlord, Renter |
| Invitation / assignment / move-out | Landlord, Renter |
| Subscription events | If feature enabled |

Payloads must avoid leaking sensitive payment details; deep-link to authenticated pages.

---

## 13. Cross-Cutting Concerns

| Concern | Approach |
| --- | --- |
| Validation | DB constraints + app validation (readings, amounts, uploads) |
| Transactions | Payment apply, assign/move-out, bill generation |
| Audit | `audit_logs` for payments, corrections, assignments, permissions, tenant changes |
| Rate limiting | Auth + public endpoints |
| Environments | Dev / Staging / Production with separate secrets |
| Migrations | Versioned SQL migrations; documented rollback |
| Testing gates | RLS isolation, role matrix, rental e2e, payments idempotency, linking, responsibility |

---

## 14. Deployment Architecture (target)

```text
[DNS / optional *.ijaaro.app subdomains]
        │
        ▼
[Web host — HTTPS]
        │
        ▼
[Supabase project — Auth/API/DB/Storage/Functions]
        │
        ├── Backups + monitoring + error alerts
        └── Secrets in env (never in client)
```

Release order (from roadmap):

1. Security + tenant isolation  
2. Rental operations  
3. Rent payments + utility linking  
4. Meter billing + utility payments  
5. Maintenance + reports  
6. Production hardening (+ optional subscriptions)

**Do not launch payments** until authorization, provider verification, duplicate protection, and audit logs pass tests.

---

## 15. System Context Diagram (C4 Level 1)

```text
                    ┌────────────┐
                    │ Super Admin│
                    └─────┬──────┘
                          │
┌──────────┐   ┌──────────▼──────────┐   ┌────────────────┐
│ Landlord │──►│                      │◄──│ Water Company  │
└──────────┘   │      IJAARO          │   └────────────────┘
┌──────────┐   │  Web + Mobile + API  │   ┌────────────────┐
│  Renter  │──►│  + PostgreSQL/RLS    │◄──│ Electricity Co │
└──────────┘   │                      │   └────────────────┘
               └──────────┬───────────┘
                          │
              ┌───────────┼───────────┐
              ▼           ▼           ▼
         Payment       Email       Object
         Provider      Provider    Storage
```

---

## 16. What Gets Built Per Phase (design view)

| Phase | System slices to build |
| --- | --- |
| 1 | Auth, tenants, memberships, RLS skeleton, Super Admin, audit base |
| 2 | Properties, search, assignment, move-out, landlord/renter dashboards |
| 3 | Rent ledger/payments, utility link, meters/readings, bill responsibility |
| 4 | Company ops dashboards, bill generation, utility payments, reports v1 |
| 5 | Maintenance, richer reports, audit completeness, mobile parity |
| 6 | Prod hosting, subdomains, optional subscriptions, ops runbooks |

---

## 17. Alignment Checklist

- [x] One platform / one backend / one DB  
- [x] `tenant_id` + roles + RLS  
- [x] Property → utility link without duplicates  
- [x] Historical responsible party on bills  
- [x] Role-specific payment approvals  
- [x] Server-side API payment verification + idempotency  
- [x] Open questions called out with v1 recommendations  
- [x] Matches 6-phase delivery order  

---

## 18. UI Design System (implementation map)

Visual source of truth: `system-design.pen` (Pencil.dev board).  
Brand assets: `images/brand/` (SVG lockup + on-dark variant) and `images/prepared/`.

### 18.1 Brand primitives (from official logo)

| Token | Value | Meaning |
| --- | --- | --- |
| `--brand-navy` | `#0B1F3A` | Trust, primary chrome, wordmark |
| `--brand-green` | `#1FA85A` | Property / growth / success |
| `--brand-water` | `#2B8CFF` | Water service accent / focus ring |
| `--brand-power` | `#F5C400` | Electricity indicator (restrained) |
| `--brand-blue` | `#1677C8` | Informational / links |

Surfaces stay neutral. Brand color is for hierarchy, actions, and meaning—not every UI element.

### 18.2 Semantic tokens → CSS / Tailwind / shadcn

Map Pencil variables to CSS custom properties consumed by shadcn/ui themes (`:root` / `.dark`):

| Semantic | Light | Dark | Typical use |
| --- | --- | --- | --- |
| `--background` | `#F5F8FC` | `#0A1524` | App canvas |
| `--foreground` | `#0B1F3A` | `#E8F0F8` | Primary text |
| `--card` | `#FFFFFF` | `#122033` | Cards, panels, tables |
| `--muted` | `#EEF3F8` | `#1A2B40` | Subtle surfaces |
| `--muted-foreground` | `#5B6B7C` | `#94A3B8` | Secondary text |
| `--border` / `--input` | `#D0DCE8` / `#FFFFFF` | `#243548` / `#0F1C2E` | Dividers, fields |
| `--primary` | `#0B1F3A` | `#3B8FD9` | Primary buttons / emphasis |
| `--secondary` | `#1FA85A` | `#2BB86A` | Positive / secondary brand actions |
| `--destructive` | `#DC2626` | `#EF4444` | Reject / delete |
| `--warning` | `#D97706` | `#F59E0B` | Pending / attention |
| `--info` | `#1677C8` | `#3B8FD9` | Processing / info |
| `--ring` | `#2B8CFF` | `#4DA3FF` | Focus ring |
| `--sidebar` | `#0B1F3A` | `#07101C` | App navigation |

Typography: **Montserrat** (display / brand), **Inter** (UI). Radius scale: 6 / 8 / 12. Spacing base: 4px. Sidebar width: 264px (72px compact). Header: 64px.

### 18.3 Component conventions

- **Buttons:** Primary / Secondary / Outline / Ghost / Destructive / Disabled; one primary action per section; confirm destructive actions.
- **Status badges:** Text + color (never color alone). Shared meanings: Active/Available/Paid/Completed = success; Pending = warning; Processing/In Progress = info; Rejected/Failed/Overdue = destructive; Inactive/Vacant = neutral.
- **Tables:** Compact operational density; currency right-aligned (`SOS`); toolbar search + filters + primary action; empty/loading/error required.
- **Approval UI:** Landlord approves rent only; water/electricity staff approve only their tenant/service; API payments are server-verified (no landlord click).

### 18.4 Logo usage

| Context | Asset |
| --- | --- |
| Light surfaces / docs | `images/brand/ijaaro-logo-horizontal.svg` (or `.png`) |
| Dark sidebar / navy chrome | `images/brand/ijaaro-logo-horizontal-on-dark.svg` (or `.png`) |
| Compact / collapsed nav | `images/brand/ijaaro-logo-mark.png` or prepared mark |
| Do not | Redraw emblem; use full tagline at unreadably small sizes |

---

*Next: see `DATABASE_DESIGN.md` for tables, relationships, constraints, indexes, and RLS policy design. Implement UI against `system-design.pen` + §18 tokens.*
