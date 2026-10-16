# IJAARO — Project Roadmap (Phased Delivery)

**Version:** 1.0  
**Date:** 13 October 2026  
**Status:** Phase 1–2 complete · Phase 3–4 utility (Prompt 03) implemented · Phase 5+ pending  
**Sources:** `BRD-1.md` v1.1 · `SYSTEM_DESIGN.md` · `ijaaro-database.erd.json` · `system-design.pen`

---

## 0. Current Project State (Scan Result)

| Area | Status | Notes |
| --- | --- | --- |
| Business requirements | ✅ Done | `BRD-1.md` — roles, FRs, NFRs, ACs, open questions |
| System design | ✅ Done | `SYSTEM_DESIGN.md` — multi-tenant model, workflows, UI tokens |
| Visual ERD | ✅ Done | `ijaaro-database.erd.json` (16 tables) |
| UI design board | ✅ Done | `system-design.pen` + brand assets |
| Database design doc | ✅ Updated | `DATABASE_DESIGN.md` reflects Phase 1–2 implementation |
| Application code | ✅ Phase 1–4 | Auth/tenants + rental + utility accounts/meters/bills/payments |
| Mobile app | ❌ Not started | Flutter deferred (Should Have / Phase 5) |

**Verdict:** Phase 1–2 rental and Phase 3–4 utility modules are implemented. Maintenance/notifications remain Phase 5. Vitest utility isolation suite requires `SUPABASE_SERVICE_ROLE_KEY` (currently skipped without it).

---

## 1. Where Work Starts (Kickoff Order)

```text
TODAY
  │
  ▼
Phase 0 — Project Bootstrap          ← START HERE
  │  scaffold web app + Supabase + repo layout
  ▼
Phase 1 — Platform Foundation        ← FIRST FEATURE WORK
  │  Auth · Tenants · Memberships · RLS · Super Admin
  ▼
Phase 2 — Rental Property & Tenancy
  ▼
Phase 3 — Rent Payments + Utility Linking
  ▼
Phase 4 — Utility Billing & Company Ops
  ▼
Phase 5 — Maintenance, Reports, Mobile
  ▼
Phase 6 — Production Hardening
```

### First concrete tasks (Week 1)

1. Scaffold **React + TypeScript + Vite + Tailwind + shadcn/ui**.
2. Create **Supabase** project (dev) and local CLI (`supabase init`).
3. Write first SQL migration from ERD: enums → `profiles` → `tenants` → `tenant_memberships` → RLS helpers.
4. Wire Auth (sign up / sign in / session) + protected app shell.
5. Super Admin: create/list tenants; seed platform tenant + `super_admin` membership.
6. Isolation tests: Tenant A cannot read Tenant B (must pass before Phase 2).

---

## 2. Confirmed Stack

| Layer | Choice | Status |
| --- | --- | --- |
| Web | React.js + TypeScript + Tailwind CSS + shadcn/ui | Confirmed |
| Backend | Supabase (Auth, Postgres+RLS, Storage, Edge Functions) | Confirmed |
| Mobile | Flutter (same backend) | Should Have — Phase 5 |
| Payments | Manual first; API provider TBD (OQ-02) | Manual in Phases 3–4 |
| Notifications | In-app + Email v1 | SMS/WhatsApp deferred (OQ-09) |
| Hosting | TBD (OQ-01 remainder) | Phase 6 |

---

## 3. Phase Details

### Phase 0 — Project Bootstrap *(pre-feature)*

| Item | Detail |
| --- | --- |
| **Goal** | Runnable empty product shell so Phase 1 can land on real infra |
| **Deliverables** | `apps/web` (or root Vite app); Supabase folder; env templates; CI lint/typecheck; README runbook |
| **Exit criteria** | `npm run dev` works; Supabase local or cloud linked; empty authenticated layout renders |
| **Est.** | 3–5 days |

**Tasks**
- [ ] Init Vite React-TS + Tailwind + shadcn/ui
- [ ] Apply brand tokens from `SYSTEM_DESIGN.md` §18
- [ ] `supabase init` + environments (dev)
- [ ] Folder layout: `src/features`, `src/components`, `src/lib/supabase`, `supabase/migrations`, `supabase/functions`
- [ ] Draft `DATABASE_DESIGN.md` from ERD (tables, indexes, RLS outline)
- [ ] Git ignore secrets; `.env.example` only

---

### Phase 1 — Platform Foundation & Multi-Tenant Security

| Item | Detail |
| --- | --- |
| **Goal** | One secure platform with tenant isolation before any business data |
| **Maps to** | BR-001, BR-002 · FR-001–005, FR-038–044 · AC-014, AC-027 |
| **Est.** | 2–3 weeks |

**Scope**
- Auth sessions via Supabase Auth; `profiles` 1:1 with `auth.users`
- `tenants` + `tenant_memberships` + roles (`app_role`)
- RLS helpers: `is_member_of`, `has_role`, `is_super_admin`
- Super Admin console: onboard tenants, status, basic settings
- Registration paths: landlord / renter / water / electricity (minimal)
- `audit_logs` base table + write on tenant/membership changes
- Role-aware app shell (sidebar routes by membership)

**Exit criteria**
- [ ] Users only see role-permitted dashboards
- [ ] Water Co A cannot access Water Co B (automated test)
- [ ] Unauthorized cross-tenant R/W fail
- [ ] Super Admin actions audited

**Do not start Phase 2 until isolation tests pass.**

---

### Phase 2 — Rental Property & Tenancy Operations

| Item | Detail |
| --- | --- |
| **Goal** | Landlords publish properties; renters browse; assign / move-out works |
| **Maps to** | BR-003 · FR-006–013, FR-045–047 · AC-001–003, AC-019 |
| **Est.** | 2–3 weeks |

**Scope**
- Property CRUD + photos (private Storage)
- Status: Available / Occupied / Vacant
- Renter search/filter + detail + contact (phone/email links — OQ-03)
- Invite / assign renter → `rental_assignments` (max 1 active per property)
- Move-out → property Available; history retained
- Landlord + Renter dashboards (properties, renters, tenancy)

**Exit criteria**
- [x] Landlord publishes/updates property
- [x] Renter browses/filters Available listings
- [x] Only authorized landlord assigns
- [x] Conflicting active assignments rejected
- [x] Move-out returns property to Available

**Prompt 02 note:** Manual rent ledger/payments (normally Phase 3) were implemented with Phase 2 because Prompt 02 required them. Utility linking remains Phase 3.

---

### Phase 3 — Rent Payments, Utility Linking & Metering

| Item | Detail |
| --- | --- |
| **Goal** | Rent ledger + manual rent approval; link utilities without duplicate properties |
| **Maps to** | BR-004–006 · FR-014–016, FR-020–025 · AC-004–005, AC-009–010, AC-021 |
| **Est.** | 3–4 weeks |

**Scope**
- [x] `rent_charges` ledger + `rent_payments` (Pending → landlord Approve/Reject) — delivered in Prompt 02
- [x] Payment proof upload (private bucket) — delivered in Prompt 02
- [x] Utility: search property → link `utility_accounts` + `meters` (no duplicate property)
- [x] Premises create path when no match (`created_source` = utility)
- [x] Readings + unit price + bill generation; `responsible_party_id` snapshot rule
- [x] Customer views of own accounts/bills
- [x] Edge Functions: `link-utility-account`, `record-meter-reading`, `generate-utility-bill`; `approve-payment` supports rent + utility

**Exit criteria**
- [x] Manual rent stays Pending until landlord review
- [x] Link existing property without second property row
- [x] Consumption = current − previous; totals use rates
- [x] Historic bills keep original responsible party after renter change (snapshot fields immutable)

**Note:** API payment provider can wait (OQ-02); **manual** rent + utility paths shipped.

---

### Phase 4 — Utility Billing, Payments & Company Operations

| Item | Detail |
| --- | --- |
| **Goal** | Full water/electricity company ops + utility payments |
| **Maps to** | BR-007 · FR-023–028, FR-051–053 · AC-006–008, AC-016–017, AC-022–023 |
| **Est.** | 3–4 weeks |

**Scope**
- [x] Separate Water / Electricity dashboards (tenant_type scoped)
- [x] Customers, meters, readings, bill generation Edge Function / RPC
- [x] Manual utility payments → company Approve/Reject only
- [ ] API payment path **if** provider confirmed (webhook + idempotency) — deferred (OQ-02)
- [ ] In-app + email notifications for bill/payment events — deferred Phase 5 / OQ-09
- [x] Company reports v1 (collections, arrears) — basic UI from stored bills/payments

**Exit criteria**
- [x] Water vs electricity isolation enforced in RLS/RPCs (Vitest suite authored; needs service-role key to execute)
- [x] Bills link to correct account/property/responsible party
- [x] Landlord cannot approve utility payments (`review_utility_payment` company-only)
- [ ] Duplicate provider callback does not double-apply (if API enabled) — N/A until OQ-02
- [x] Reports read stored bills/payments (tenant-scoped)

**Manual utility payments** shipped with company-only review; API path still gated on OQ-02.

---

### Phase 5 — Maintenance, Reporting & Auditability (+ Mobile)

| Item | Detail |
| --- | --- |
| **Goal** | Complete rental support ops; harden reporting/audit; optional Flutter |
| **Maps to** | BR-008 · FR-029–036, FR-061–072 · AC-011–013, AC-025 |
| **Est.** | 2–3 weeks (web) + Flutter parallel if capacity |

**Scope**
- Maintenance requests + landlord status workflow
- Landlord / utility / Super Admin reports
- Audit completeness for payments, corrections, assignments, permissions
- Responsive polish vs `system-design.pen`
- Flutter app scaffold + role-aware nav (Should Have)

**Exit criteria**
- [ ] Renter submits/tracks maintenance; landlord updates status
- [ ] Reports respect role + tenant
- [ ] Sensitive actions leave audit rows

---

### Phase 6 — Deployment, Subscriptions & Release Readiness

| Item | Detail |
| --- | --- |
| **Goal** | Secure production release |
| **Maps to** | BR-009–010 · FR-037, FR-043 · AC-026, AC-028 · NFRs |
| **Est.** | 2–3 weeks |

**Scope**
- Production hosting + HTTPS + secrets
- Optional tenant subdomains (OQ-12)
- Optional subscriptions only if OQ-04 confirmed
- Backups, monitoring, migrations runbook
- Full release test suite: isolation, roles, rental e2e, payments, linking, responsibility

**Exit criteria**
- [ ] HTTPS; no secrets in client
- [ ] Tenant resolution safe for invalid/disabled
- [ ] Backup/deploy docs tested
- [ ] Critical test gates green

---

## 4. Suggested Calendar (Graduation-Paced)

| Phase | Focus | Suggested window |
| --- | --- | --- |
| 0 | Bootstrap | Week 1 |
| 1 | Foundation + RLS | Weeks 2–4 |
| 2 | Rental | Weeks 5–7 |
| 3 | Rent + linking | Weeks 8–11 |
| 4 | Utility ops | Weeks 12–15 |
| 5 | Maintenance + reports (+ mobile) | Weeks 16–18 |
| 6 | Production | Weeks 19–21 |

Adjust for team size. **Never reorder Phase 1 after Phase 2–4.**

---

## 5. Dependency Graph

```text
Phase 0 ──► Phase 1 ──► Phase 2 ──► Phase 3 ──► Phase 4 ──► Phase 5 ──► Phase 6
                 │            │           │           │
                 │            │           ├─ manual rent
                 │            │           └─ utility link
                 │            └─ properties / assignments
                 └─ Auth + RLS gate (hard block)

OQ-02 (payment provider) ──► optional API path in Phase 3–4
OQ-04 (subscriptions) ────► optional work in Phase 6
OQ-03 / OQ-09 ────────────► contact vs chat; notification channels
```

---

## 6. Open Questions That Block or Shape Work

| ID | Topic | Blocks |
| --- | --- | --- |
| OQ-01 | Hosting vendor | Phase 6 deploy |
| OQ-02 | Payment provider | API payments (manual OK without it) |
| OQ-03 | Chat vs contact links | Phase 2 contact UX |
| OQ-04 | Subscriptions in v1? | Phase 6 optional scope |
| OQ-07 | Billing policy details | Phase 4 bill engine edge cases |
| OQ-08 | Move-out unpaid balances | Phase 2–3 move-out rules |
| OQ-09 | SMS/WhatsApp | Phase 4–5 notifications |
| OQ-11 | Refunds | Payment state machine |
| OQ-12 | Subdomains | Phase 6 routing |

Working decisions already set: OQ-05 (one landlord = one tenant), OQ-06 (one `properties` table), OQ-10 (roles/matrix closed).

---

## 7. Definition of Done (Program)

- [ ] One web app + one Supabase backend + one DB
- [ ] RLS isolation tests green
- [ ] Rental e2e: publish → assign → rent pay → move-out
- [ ] Utility e2e: link → read → bill → pay (company approve)
- [ ] Responsibility snapshot verified after renter change
- [ ] Payment approval boundaries enforced (rent ≠ water ≠ electricity)
- [ ] Production checklist (Phase 6) complete

---

## 8. Related Documents

| Document | Role |
| --- | --- |
| [BRD-1.md](./BRD-1.md) | What to build (requirements) |
| [SYSTEM_DESIGN.md](./SYSTEM_DESIGN.md) | How the system is designed |
| [SYSTEM_ARCHITECTURE.md](./SYSTEM_ARCHITECTURE.md) | Technical architecture for implementers |
| [ijaaro-database.erd.json](./ijaaro-database.erd.json) | Visual schema |
| [system-design.pen](./system-design.pen) | UI board |

---

*Next action: Phase 5 — maintenance requests, notifications, and fuller reporting; enable Vitest with service-role key for continuous isolation gates.*
