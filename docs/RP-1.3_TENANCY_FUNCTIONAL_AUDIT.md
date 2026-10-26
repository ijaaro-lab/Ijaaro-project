# RP-1.3 — Tenancy Functional Audit (Read-only)

**Date:** 2026-10-21  
**Tenant under audit:** `hodan-properties` (Live Supabase; approved Live-data tenancy fixture)  
**Mode:** READ-ONLY audit and reporting only  
**Deliverable:** this document only  

---

## 1. Executive summary

Landlord tenancy data for the Hodan Live fixture is **correctly linked** in the database (assignment → property → renter → initial rent charge). Manual UI observations (rent $260, period 2026-10-21→2026-10-31, due 2026-11-01, paid $0, balance $260, no payments) match Live rows and the `assign_renter` initial-charge algorithm.

The **abbreviated tenancy/property IDs on the Tenancies list** (and missing renter/property names on tenancy detail) are a **confirmed UI display gap**, not a broken relationship in storage. The **11-day first period is intentional** in code (start date through month-end). The charge amount is the **full monthly rent** for that stub calendar window (no proration) — a **product concern**, not a calculation bug relative to current SQL.

Payment submit → pending → landlord `review_rent_payment` → balance update, and `complete_move_out` history retention, are implemented at the RPC/RLS boundary and covered by existing isolated tests / prior Landlords verification docs. This audit did **not** mutate Live payments or move-out.

---

## 2. Scope and safety confirmation

| Constraint | Status |
| --- | --- |
| Audit existing functionality only | Confirmed |
| No application / test / migration / env edits | Confirmed (except this report) |
| No payments, reviews, charges, move-out, or other writes | Confirmed |
| No `supabase db push`, reset, deploy | Confirmed |
| No RP-1.4 / new features | Confirmed |
| Live DB claims only via authorized read-only SQL | Confirmed (`user-supabase` `execute_sql` SELECTs / `pg_get_functiondef`) |

---

## 3. Architecture map (code → data)

### 3.1 Pages / routes

| Surface | Route | File |
| --- | --- | --- |
| Tenancy list | `/app/landlord/tenancies` | `frontend/src/pages/landlord/TenanciesPage.tsx` |
| Tenancy detail + manual charge form | `/app/landlord/tenancies/:id` | `frontend/src/pages/landlord/TenancyDetailPage.tsx` |
| Assign + Complete move-out | `/app/landlord/properties/:id` | `frontend/src/pages/landlord/PropertyDetailPage.tsx` |
| Rent payment review | `/app/landlord/payments` | `frontend/src/pages/landlord/PaymentsReviewPage.tsx` |
| Renter tenancy | `/app/renter/tenancies/:id` (via dashboard links) | `frontend/src/pages/renter/RenterTenancyPage.tsx` |
| Renter payment submit | `/app/renter/payments` | `frontend/src/pages/renter/RenterPaymentsPage.tsx` |
| Route wiring | — | `frontend/src/App.tsx` |

There is **no dedicated tenancy service/hook layer**: pages call `supabase.from(...)` / `supabase.rpc(...)` directly.

### 3.2 Tables

| Table | Role |
| --- | --- |
| `public.rental_assignments` | Tenancy record: `tenant_id`, `property_id`, `renter_id`, `landlord_id`, rent, `due_day`, dates, `status` |
| `public.properties` | Occupancy: `status`, `current_renter_id`, `is_listed` |
| `public.rent_charges` | Period ledger: period, due date, `amount_due` / `amount_paid` / `balance`, status |
| `public.rent_payments` | Manual submissions; start `pending`; reviewed to `paid` / `rejected` |
| `public.profiles` | Renter/landlord display names (not joined by tenancy list/detail UI) |

Schema / RPC origins:  
`supabase/migrations/20261013000003_phase2_properties_tenancy.sql`,  
`supabase/migrations/20261013000004_phase2_rent_ledger.sql`,  
RLS hardening: `20261014000014_tenant_member_isolation.sql`.

### 3.3 RPCs / triggers

| RPC / mechanism | Purpose | Auth gate |
| --- | --- | --- |
| `assign_renter` | Create active assignment, occupy property, optional initial charge | `can_manage_landlord_ops(property.tenant_id)` |
| `create_rent_charge` | Manual subsequent charges | `can_manage_landlord_ops(assignment.tenant_id)`; assignment must be `active` |
| `review_rent_payment` | Approve/reject pending payment; update charge paid/balance | `can_approve_rent(payment.tenant_id)` |
| `complete_move_out` | Complete assignment; free property | `can_manage_landlord_ops(assignment.tenant_id)` |
| `enforce_rent_payment_submit` (trigger) | Force payer/tenant linkage, `pending`, amount ≤ balance | Renter = charge renter |
| Edge `complete-move-out` | Thin wrapper around RPC | Same as RPC; **UI calls RPC directly**, not the edge function |

---

## 4. Finding: renter & property linkage vs display

### 4.1 Storage / linkage — **OK (confirmed)**

`rental_assignments` stores `property_id` and `renter_id`. Assign path requires an active `renter` membership on the same landlord tenant. Charges denormalize `property_id` + `renter_id` from the assignment.

**Live read-only verify (`hodan-properties`, active assignment):**

| Field | Live value |
| --- | --- |
| Assignment status | `active` |
| Rent / currency | `260.00` / `USD` |
| `due_day` | `1` |
| Start | `2026-10-21` |
| Property | `b507f6d1-…` · name **Daarusalaam Villa – Block 1, Unit 4-A** · status `occupied` |
| Renter | `678a3c6b-…` · name **Som Via** · matches `properties.current_renter_id` |
| Charge period | `2026-10-21` → `2026-10-31` |
| Due date | `2026-11-01` |
| Due / paid / balance | `260.00` / `0.00` / `260.00` · status `due` |
| Payments on assignment | `0` |

Relationships are loaded correctly when queried; the UI simply does not render names.

### 4.2 Display — **confirmed defect (UX)**

| Page | What is shown | What is available but unused |
| --- | --- | --- |
| `TenanciesPage` | First 8 chars of assignment id; “Property” + first 8 chars of `property_id` | No join to `properties` / profiles; no `list_same_tenant_member_profiles` |
| `TenancyDetailPage` | Status, dates, rent, due day, “Open property” link by UUID | No property name; **no renter name/id label** |
| `PropertyDetailPage` (assigned) | Rent / due day / start; link to tenancy | Assign picker shows names; post-assign block does not re-show renter name |
| `RenterTenancyPage` | Loads property by id and shows name/address | Better than landlord tenancy pages for property display |

**Risk:** Medium (ops usability). Landlords cannot identify tenancies without memorizing UUIDs. **Data integrity risk: Low** — FKs and Live rows are coherent.

---

## 5. Billing period & due-date rules

### 5.1 Initial charge (`assign_renter`, `p_create_initial_charge = true`)

From migration + Live `pg_get_functiondef`:

1. `period_start` = assignment `start_date`
2. `period_end` = last calendar day of the start month  
   (`date_trunc('month', start) + 1 month - 1 day`)
3. Due day = `LEAST(COALESCE(due_day, day-of-start), 28)`
4. Candidate due = that day in the start month; if `< start_date`, add one month
5. `amount_due` = **full** `assignment.rent_amount` (not day-prorated)
6. `amount_paid = 0`, `balance = amount_due`
7. Status `overdue` if `due_date < CURRENT_DATE`, else `due`

**Hodan fixture walkthrough (`due_day=1`, start `2026-10-21`):**

- Period end → `2026-10-31` → **11 days** (21–31 inclusive) — **intentional stub-month window**
- Due candidate `2026-10-01` `< start` → roll to **`2026-11-01`** — **intentional**
- Amount **$260.00** full rent for stub window — **intentional relative to current code**; **not prorated**

### 5.2 Manual charges (`create_rent_charge` / TenancyDetailPage)

Landlord supplies `period_start`, `period_end`, `due_date`, optional `amount_due` (defaults to assignment rent). No server-side “next calendar month” helper; no overlap check beyond unique `(assignment_id, period_start, period_end)`.

### 5.3 Classification

| Topic | Verdict |
| --- | --- |
| 11-day period display | **Not a defect** — matches designed stub-month period |
| Due date 2026-11-01 | **Not a defect** — next occurrence of due day 1 after mid-month start |
| Full rent on stub period | **Possible product concern** — BRD FR-048 requires period tracking/consistency, not explicit proration. Flag before treating billing as “finished.” |

---

## 6. Payments & balance calculations

### 6.1 Flow

```
RenterPaymentsPage
  → optional upload to storage.payment-proofs
  → INSERT rent_payments (pending; trigger rewrites tenant/payer/status)
  → balance unchanged while pending

PaymentsReviewPage
  → SELECT rent_payments WHERE tenant_id = active membership
  → RPC review_rent_payment(approve|reject)
      approve: payment→paid; charge amount_paid += amount; balance = due−paid;
               status paid|partial|due|overdue
      reject: payment→rejected; charge unchanged; history retained; resubmit allowed
```

Balance math is constrained by `rent_charges_balance_math` (`balance = round(amount_due - amount_paid, 2)`). Financial field updates are blocked outside the review RPC (`protect_rent_charge_financials`).

### 6.2 UI notes (not Live-mutated)

- Review UI does not show property/renter names (same class of display gap as tenancies).
- Staff without `approve_rent` see a banner and no approve/reject controls; RPC still enforces `can_approve_rent`.
- Pending submissions do not reduce balance until approve (by design).

### 6.3 Evidence

| Source | Coverage |
| --- | --- |
| Code | `RenterPaymentsPage.tsx`, `PaymentsReviewPage.tsx`, `20261013000004_phase2_rent_ledger.sql` |
| Prior docs | `docs/STEP_5_4_26_PENDING_PAYMENT_APPROVAL_VERIFICATION.md`, `docs/STEP_5_4_24_LANDLORDS_WORKFLOW_VERIFICATION.md` |
| Tests (not re-run; mutating) | `frontend/src/test/rls.rental.test.ts` approve/reject/balance/isolation cases |

**This audit:** Live payment path **not** re-executed (non-mutating constraint). Fixture shows `payment_count = 0`, consistent with UI.

---

## 7. Complete move-out & history preservation

### 7.1 Behavior (`complete_move_out`)

When authorized on an `active` assignment:

1. Assignment → `completed`; `end_date` set (default `CURRENT_DATE`); optional notes append
2. Property → `status = available`, `current_renter_id = NULL`
3. **Does not** delete assignment / charges / payments
4. **Does not** cancel open charges or zero balances (product OQ-08 / STEP 5.4.29)
5. **Does not** set `is_listed = true` (property stays unlisted after assign-time `is_listed = false`)

UI: `PropertyDetailPage` button → RPC (with `movingOut` double-submit guard). Edge function exists but is unused by this page.

### 7.2 Preservation mechanisms

| Mechanism | Effect |
| --- | --- |
| Soft-complete (status update), not DELETE | Rows remain selectable |
| FK `ON DELETE RESTRICT` on charges/payments → assignment/property | Live catalog confirmed (`delete_action = r`) |
| `rent_payments_no_delete` / `rent_charges_no_delete` RLS | Clients cannot delete ledger rows |
| Tenancies list orders all statuses | Historical `completed` rows remain visible (as UUID stubs today) |

### 7.3 Evidence

| Source | Result |
| --- | --- |
| SQL definition | Preserves rows; updates status/occupancy only |
| `rls.rental.test.ts` “move-out … keeps charge history” | Asserts charges remain (mutating; not re-run here) |
| `docs/STEP_5_4_29_LANDLORDS_MOVE_OUT_BROWSER_VERIFICATION.md` | Browser PASS: completed assignment + charge retained |
| Unit test this audit | `PropertyDetailPage.moveOut.test.tsx` — **2 passed** (mocked RPC; no DB writes) |

**Verdict:** History preservation is **confirmed by design + prior verification**. Live Hodan move-out was **not** exercised in this audit.

---

## 8. Authorization & tenant isolation

### 8.1 Server boundary (primary)

| Resource | SELECT | Mutate |
| --- | --- | --- |
| `rental_assignments` | Landlord ops on `tenant_id` **or** `renter_id = auth.uid()` **or** SA | Create/close via RPCs only; direct INSERT/DELETE blocked |
| `rent_charges` | Landlord ops **or** `renter_id = auth.uid()` **or** SA | Insert gated; financials via review RPC |
| `rent_payments` | Landlord ops **or** `payer_id = auth.uid()` **or** SA | Insert as payer pending; review via RPC |
| Cross-tenant RPC | Denied when caller lacks ops/approve on **that** row’s `tenant_id` | Covered in `rls.rental.test.ts` |

### 8.2 Client patterns

| Page | Client tenant filter | Relies on RLS |
| --- | --- | --- |
| `TenanciesPage` / dashboard / payments review | Yes (`eq tenant_id`) | Yes |
| `TenancyDetailPage` | **No** — load by assignment id only | Yes (foreign UUID should return empty / unauthorized copy) |
| Renter pages | Filter by `user.id` / `renter_id` | Yes |

**Possible concern (Low):** Detail-by-id without client `tenant_id` filter is acceptable **if** RLS remains correct; defense-in-depth would add an explicit tenant check. Not classified as a confirmed defect without a failing cross-tenant case.

### 8.3 Profiles isolation

Landlords cannot freely `select *` other profiles; assign UI uses `list_same_tenant_member_profiles` (`20261020110000_list_same_tenant_member_profiles.sql`). Tenancy list/detail never call that RPC — contributing to the name-display gap.

---

## 9. Tests & gaps

### 9.1 Existing coverage

| Asset | What it covers | Mutating? |
| --- | --- | --- |
| `frontend/src/test/rls.rental.test.ts` | Assign, charge, pay, approve/reject, isolation, move-out history | Yes — **isolated local only** |
| `frontend/src/pages/landlord/PropertyDetailPage.moveOut.test.tsx` | Double-submit guard / error path | No (mocks) |
| `supabase/tests/phase2_rental_rls_sql_checks.sql` | Pointer to Vitest/MCP (not a self-contained suite) | N/A |
| Prior STEP 5.4.24–5.4.29 docs | Workflow + browser payment/move-out | Historical |

### 9.2 Gaps

| Gap | Severity |
| --- | --- |
| No unit/UI test that Tenancies list/detail show property + renter **names** | Medium (matches confirmed UX defect) |
| No automated assertion of stub-month period/due/full-amount algorithm | Medium (product clarity) |
| No non-mutating Live smoke for tenancy display joins | Low |
| `rls.rental.test.ts` not run in this audit (would mutate isolated DB) | Process — intentional |

### 9.3 Tests executed this audit (safe)

```
npx vitest run src/pages/landlord/PropertyDetailPage.moveOut.test.tsx
→ 2 passed (disable while in-flight; error without success copy)
```

**Not run:** `rls.rental.test.ts`, smoke payment/move-out scripts, any Live writes.

### 9.4 Live read-only checks this audit

1. Active Hodan assignment + charge + payment count (section 4.1)  
2. Live `assign_renter` function body matches migration period/due logic  
3. FK delete actions on rent tables = restrict (`r`) except `reviewed_by` set null  

---

## 10. Defects vs concerns vs unverified

### Confirmed defects

| ID | Finding | Risk | Evidence |
| --- | --- | --- | --- |
| D1 | Tenancy **list** shows truncated assignment/property UUIDs instead of renter + property names | Medium (UX/ops) | `TenanciesPage.tsx` lines rendering `r.id.slice(0,8)` / `r.property_id.slice(0,8)`; Live has usable names |
| D2 | Tenancy **detail** omits renter identity and property name (link-only to property) | Medium (UX/ops) | `TenancyDetailPage.tsx`; contrast with Live profile/property names |

### Possible concerns (not proven wrong)

| ID | Finding | Risk | Notes |
| --- | --- | --- | --- |
| C1 | Initial stub-month charge bills **full** rent for a partial calendar window | Medium (product/finance) | Matches SQL; needs product decision (prorate vs full) |
| C2 | No automatic recurring monthly charges after initial | Low–Med | Manual `create_rent_charge` only; may be intentional MVP |
| C3 | Move-out leaves open balances / does not re-list | Low | Documented product choice (OQ-08 / 5.4.29) |
| C4 | Payment review / tenancy list lack human-readable party labels | Low–Med | Same class as D1/D2 |
| C5 | Detail page loads by id without client tenant filter | Low | RLS should deny; defense-in-depth optional |

### Unverified in this audit (do not claim Live)

| ID | Topic | Why unverified |
| --- | --- | --- |
| U1 | Live payment submit / approve / balance update for Hodan | Would mutate Live |
| U2 | Live Complete move-out on Hodan fixture | Would mutate Live |
| U3 | Fresh isolated `rls.rental.test.ts` green on current schema | Mutating; skipped by safety rules |
| U4 | Cross-tenant browser denial against Live foreign assignment URL | Not exercised this session |

---

## 11. Recommended minimal next steps

1. **Approve a minimal UX fix (D1/D2 only):** On landlord tenancy list/detail, load and show property name (and address) plus renter display name via existing gated RPC or constrained joins — no billing/RPC changes.  
2. **Product decision on C1** before any “billing correctness” fix: keep full first-period rent, or introduce explicit proration. Do not silently change Live Hodan amounts without approval.  
3. **Defer** payment/move-out “fixes” until (1)–(2) are decided; those paths already have prior PASS evidence.  
4. After UX change: add a small component/query test for name display; optionally re-run **isolated** `rls.rental.test.ts` locally (never against Live).  
5. Do **not** start RP-1.4 feature work from this audit.

---

## 12. Bottom line

Hodan’s Live active tenancy is **data-correct** and matches designed billing rules; the user-visible **UUID-only tenancy list/detail** is the primary confirmed functional-UX defect. The 11-day period is **by design**; full $260 on that stub window is **by design in code** pending a product call on proration. Payment review and move-out history behavior are implemented and previously tested; they were not re-mutated here.
