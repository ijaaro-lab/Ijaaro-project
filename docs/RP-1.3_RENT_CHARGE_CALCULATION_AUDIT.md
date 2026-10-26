# RP-1.3 — Initial Rent Charge Calculation Audit

**Date:** 2026-10-21  
**Scope:** Audit-only comparison of current initial rent charge + manual Add Rent Charge behavior against the product owner’s confirmed rental policy.  
**Constraints honored:** No application code/test edits; no DB writes / migrations / RLS / env / deploy / push; no RP-1.4 implementation. Read-only SQL used only to confirm Live function bodies and the Hodan fixture snapshot.

---

## 1. Executive summary

Current `assign_renter` always bills **full monthly rent** for a stub period from move-in through calendar month-end, with **due date = next occurrence of assignment `due_day`** (often rolled into the following month). That **does not** match the confirmed policy (days 1–10 full; after day 10 prorate `monthly_rent / 30 * remaining_days`; initial due **immediately** on move-in; next full month as a **separate** charge on the configured due day).

**Hodan Live example (start 2026-10-21, $260, `due_day=1`):** stored charge is period `2026-10-21→2026-10-31`, amount **$260.00**, due **2026-11-01** — mismatches confirmed policy on amount and initial due date.

---

## 2. Files / functions inspected

| Area | Path / object |
| --- | --- |
| Schema + initial charge upgrade | `supabase/migrations/20261013000004_phase2_rent_ledger.sql` — `rent_charges`, `create_rent_charge`, upgraded `assign_renter` |
| Base assign RPC (pre-charge) | `supabase/migrations/20261013000003_phase2_properties_tenancy.sql` — original `assign_renter` / `complete_move_out` |
| Tenant isolation SELECT policies | `supabase/migrations/20261014000014_tenant_member_isolation.sql` — `rent_charges_select` |
| Live RPC bodies (read-only) | `pg_get_functiondef` for `public.assign_renter`, `public.create_rent_charge` — **match migration** |
| Assign UI | `frontend/src/pages/landlord/PropertyDetailPage.tsx` |
| Add charge UI | `frontend/src/pages/landlord/TenancyDetailPage.tsx` |
| Types | `frontend/src/types/database.ts` — `RentCharge`, RPC args |
| RLS / workflow tests | `frontend/src/test/rls.rental.test.ts` |
| Related UI tests | `TenancyDetailPage.test.tsx`, `PropertyDetailPage.moveOut.test.tsx` (display/move-out; not amount math) |
| Prior tenancy audit | `docs/RP-1.3_TENANCY_FUNCTIONAL_AUDIT.md` (C1 full-rent stub flagged as product concern) |

No later migration redefines `assign_renter` or `create_rent_charge` after `20261013000004`.

---

## 3. Where policy is configured today

| Setting | Where | Notes |
| --- | --- | --- |
| Monthly rent | `assign_renter.p_rent_amount` → `rental_assignments.rent_amount`; copied to initial `rent_charges.amount_due` | UI prefill from `properties.rent_amount` |
| Recurring due day | `assign_renter.p_due_day` → `rental_assignments.due_day` (nullable, CHECK 1–28) | **UI default `"1"`** on Property Detail assign form |
| Initial charge on/off | `p_create_initial_charge` (default `true`) | Landlord UI always passes `true` |
| Initial period end | Hard-coded in SQL: last calendar day of start month | Not configurable |
| Initial due date | Hard-coded in SQL from `due_day` (+ roll forward if `< start_date`) | **Not** “due on move-in” |
| Initial amount | Hard-coded: full `rent_amount` | **No** `/ 30` proration |
| Manual charge fields | Landlord-entered via `create_rent_charge` | Amount defaults to full `rent_amount` if omitted |
| Day-1–10 / day-11+ rule | **Not present** in code | Confirmed product rule only |

**Product narrative “November 5”** is not a global constant. It corresponds to an assignment with **`due_day = 5`**. Hodan’s Live active assignment has **`due_day = 1`**, so the *configured* recurring due day for that fixture is the 1st, not the 5th.

---

## 4. Current behavior and calculations

### 4.1 `assign_renter` (initial charge)

When `p_create_initial_charge = true`:

1. **`period_start`** = `assignment.start_date`  
2. **`period_end`** = last day of that calendar month  
   `(date_trunc('month', start) + 1 month - 1 day)`  
3. **`due_day` effective** = `LEAST(COALESCE(due_day, day-of-start), 28)`  
4. **`due_date`** = that day in the start month; if `due_date < start_date`, add one month  
5. **`amount_due`** = full `assignment.rent_amount`  
6. **`amount_paid`** = `0`; **`balance`** = `amount_due`  
7. **`status`** = `overdue` if `due_date < CURRENT_DATE`, else `due`  

No second charge (next calendar month) is created.

### 4.2 Manual `create_rent_charge` / Add Rent Charge UI

**Server (`create_rent_charge`):**

- Auth + `can_manage_landlord_ops(assignment.tenant_id)`  
- Assignment must be `active`  
- `amount_due` = `COALESCE(p_amount_due, assignment.rent_amount)`; must be ≥ 0  
- `period_end >= period_start`  
- Inserts with `amount_paid = 0`, `balance = amount_due`, status `due`/`overdue` from due vs `CURRENT_DATE`  
- **No** proration helper, **no** overlap check beyond unique `(assignment_id, period_start, period_end)`, **no** validation that amount matches policy  

**UI (`TenancyDetailPage`):**

- Required dates: period start/end, due date  
- Amount optional in practice (empty → `null` → server uses full rent); prefilled with `rent_amount`  
- HTML `min="0" step="0.01"` only; no day-1–10 / proration / “immediate due” rules  

### 4.3 Field storage summary

| Field | Set by initial assign | Set by manual add | Later mutation |
| --- | --- | --- | --- |
| `period_start` / `period_end` | start → month-end | Landlord input | Immutable identity (protect trigger) |
| `due_date` | due_day algorithm | Landlord input | Not financial-protected as amount/status, but identity-adjacent; financial trigger focuses paid/balance/status |
| `amount_due` | full rent | Input or full rent | Financial fields gated; review RPC updates paid/balance/status |
| `amount_paid` / `balance` | 0 / amount_due | 0 / amount_due | `review_rent_payment` only (`protect_rent_charge_financials`) |
| `status` | due/overdue | due/overdue | Review → paid/partial/due/overdue |

Balance invariant: `balance = round(amount_due - amount_paid, 2)`.

### 4.4 Live read-only Hodan snapshot (2026-10-21)

| Field | Value |
| --- | --- |
| Tenant | `hodan-properties` |
| Assignment start | `2026-10-21` |
| `rent_amount` / `due_day` | `260.00` / `1` |
| Charge period | `2026-10-21` → `2026-10-31` |
| `due_date` | `2026-11-01` |
| `amount_due` / paid / balance | `260.00` / `0.00` / `260.00` |
| Status / payments | `due` / `0` |

Matches SQL algorithm; does **not** match confirmed product policy (below).

---

## 5. Confirmed product rules vs current behavior

| # | Confirmed rule | Current behavior | Verdict |
| --- | --- | --- | --- |
| P1 | Move-in days **1–10**: charge **full** monthly rent | Always full rent for any start day | **Partial** — correct only for days 1–10; wrong for day ≥ 11 |
| P2 | Move-in **after day 10**: `monthly_rent / 30 * remaining_days` | Always full rent; no `/ 30` | **Mismatch** |
| P3 | Example: Oct 15 @ $260 → immediate **$130** | Would create full $260, due rolled by `due_day` | **Mismatch** |
| P4 | Prorated initial charge **due immediately** on move-in | Due = next `due_day` occurrence (often next month) | **Mismatch** |
| P5 | Next month’s full rent due on due day (e.g. Nov 5 if `due_day=5`) | **Not auto-created**; manual Add Rent Charge only | **Gap** (separate charge path exists; not generated at assign) |
| P6 | Do **not** combine initial prorate + next month into one charge | Only one charge created (full stub); does not combine two months’ amounts into one row | **OK on separation**; **wrong amount/due** on the single row |
| P7 | Do not assume a different due-day rule; inspect config | Due day is per-assignment `due_day` (UI default 1) | **Config found**; Hodan=1 ≠ product story’s “5” |

### 5.1 October 21 example (confirmed policy vs Live)

Assumptions for “expected” column use the confirmed formula and the Oct 15 example’s implication that **`remaining_days = 30 - day`** (day 15 → 15 → $130). Calendar-day inclusive counts for October do **not** reproduce $130; see open questions.

| Aspect | Live / current code | Expected under confirmed policy (assuming `remaining = 30 - day`) |
| --- | --- | --- |
| Day of month | 21 (> 10) | Prorate |
| Amount | **$260.00** | `260/30 * (30-21) = 260/30 * 9` → **$78.00** (before any rounding policy beyond 2 dp) |
| Initial due | **2026-11-01** (`due_day=1` rolled) | **2026-10-21** (move-in / immediate) |
| Period | 2026-10-21 → 2026-10-31 | Period bounds **not fully specified** by product (likely still stub month; confirm) |
| Next month $260 due Nov 5 | **Missing** as a second charge; fixture `due_day=1` would imply Nov **1** if created with current due-day config | Separate charge; due day **5** only if assignment `due_day=5` |

---

## 6. Duplicate-charge and retry risks

| Scenario | Risk | Mitigation today |
| --- | --- | --- |
| Double-submit / retry `assign_renter` after success | Low for second assignment | Property `occupied` / open assignment checks; `FOR UPDATE` on property |
| Concurrent two assigns on same property | Low | Same locks; second fails |
| Re-assign after move-out | New assignment can create a **new** initial charge (intended) | History of old charges retained (`ON DELETE RESTRICT`, no-delete RLS) |
| `assign_renter` with `p_create_initial_charge=false` then manual charge | One charge if landlord careful | No auto uniqueness beyond period tuple |
| Manual Add Rent Charge twice with **same** period dates | Duplicate blocked | Unique index `uq_rent_charges_assignment_period (assignment_id, period_start, period_end)` |
| Manual charges with **different** period bounds for same conceptual month | **Duplicate billing possible** | No overlap / month-key constraint |
| Manual amount free entry | Can over/under-bill vs policy | No server policy check |
| Assign UI double-click | No client debounce (unlike move-out `movingOut` flag) | Relies on DB lock; UX may show error on second |

**Conclusion:** Exact-period duplicates are guarded; **policy-duplicate / conceptual-month duplicates via manual entry are not**. Assign retries after success are largely safe.

---

## 7. Tenant isolation and payment / history preservation

### 7.1 Isolation (adequate for ledger create/read)

- `create_rent_charge` / `assign_renter`: `can_manage_landlord_ops` on the row’s `tenant_id`  
- Cross-tenant denial covered in `rls.rental.test.ts` (assign, create charge, review)  
- `rent_charges_select`: landlord ops on tenant **or** `renter_id = auth.uid()` **or** super admin  
- Charges denormalize `tenant_id` from assignment at insert  

Changing amount/due logic inside `assign_renter` does not inherently weaken isolation if auth checks remain unchanged.

### 7.2 Payment / history preservation (do not break)

- `complete_move_out` does **not** delete or cancel charges/payments  
- `rent_charges_no_delete` / `rent_payments_no_delete`  
- FK `ON DELETE RESTRICT`  
- Financial updates only via `review_rent_payment` + `ijaaro.internal`  
- Existing Live Hodan charge/payments must **not** be silently rewritten in a billing fix without an explicit data-migration decision  

---

## 8. Existing test coverage

| Asset | Covers | Gaps vs this audit |
| --- | --- | --- |
| `rls.rental.test.ts` | Assign + initial charge id exists; second assign blocked; create_rent_charge; cross-tenant deny; pay/approve/balance; move-out keeps charges | **No** assert on initial `amount_due`, `due_date`, period end, or proration |
| Assign test uses `p_start_date: 2026-10-01`, `p_due_day: 5`, rent 100 | Would create full $100, due 2026-10-05 under current rules | Would need expected values updated when policy lands |
| Manual charge test | Nov period + due 2026-11-05 amount 100 | Validates RPC plumbing only |
| UI unit tests | Display / move-out mocks | No calculation tests |
| Prior docs STEP 5.4.24–29 | Workflow smoke | Not policy math |

**No automated coverage** of move-in days 1 / 5 / 10 / 11 / 15 / 20.

---

## 9. Minimal safe implementation plan (recommendation only — not started)

Goal: smallest change that implements confirmed initial-charge rules without RP-1.4 recurring billing and without mutating existing Live ledger rows unless separately approved.

### 9.1 Recommended change surface

1. **Single source of truth in SQL** inside `assign_renter` initial-charge block (and optionally a small pure helper function e.g. `compute_initial_rent_charge(start_date, rent_amount, due_day)` used only by that RPC).  
2. **Do not** change `create_rent_charge` semantics in the first pass except optional shared validation later — keep manual entry as landlord override.  
3. **Do not** auto-insert next-month full rent in the same PR unless product confirms assign-time creation of charge #2 (see open questions). Document that November full rent remains **manual** Add Rent Charge until recurring billing.  
4. **Frontend:** optionally default assign `due_day` to product preference (e.g. 5) — **only if** product confirms; today default `1` is a product/config issue, not a calculator bug. Prefer not to hard-code Nov 5.  
5. **Existing rows:** leave Hodan Live charge as-is pending an explicit correction SOP (audit-only here).

### 9.2 Proposed initial-charge algorithm (pending open questions)

```
day := EXTRACT(DAY FROM start_date)

IF day <= 10 THEN
  amount := rent_amount
ELSE
  remaining_days := <CONFIRMED FORMULA — see OQ-1>
  amount := round(rent_amount / 30 * remaining_days, 2)
END IF

period_start := start_date
period_end   := last day of start month   -- unless product changes (OQ-2)
due_date     := start_date                -- immediate (P4)
amount_paid  := 0
balance      := amount
status       := due/overdue vs CURRENT_DATE
```

Recurring due day (`assignment.due_day`) remains the config for **subsequent** full-month charges, not for the initial immediate charge.

### 9.3 Test matrix (add in implementation PR; not added in this audit)

| Move-in date | Day | Expected amount @ $260 | Expected initial `due_date` | Notes |
| --- | --- | --- | --- | --- |
| 2026-10-01 | 1 | 260.00 | 2026-10-01 | Full |
| 2026-10-05 | 5 | 260.00 | 2026-10-05 | Full |
| 2026-10-10 | 10 | 260.00 | 2026-10-10 | Boundary full |
| 2026-10-11 | 11 | per OQ-1 | 2026-10-11 | First prorate day |
| 2026-10-15 | 15 | **130.00** | 2026-10-15 | Product example |
| 2026-10-20 | 20 | per OQ-1 | 2026-10-20 | Mid/late month |
| 2026-10-21 | 21 | per OQ-1 (≠ 260) | 2026-10-21 | Hodan fixture scenario |

Also test:

- `due_day` 1 vs 5 does **not** change initial due (still start_date)  
- Second `assign_renter` still blocked  
- Unique period still blocks duplicate identical periods  
- Cross-tenant `create_rent_charge` / assign still denied  
- Approve payment still updates balance; move-out still retains charges  
- Rounding cases (non-terminating `rent/30*days`) once OQ-3 answered  

Prefer isolated local Vitest/RPC tests; no Live writes.

### 9.4 Out of scope for that minimal PR

- Automatic monthly charge generation (RP-1.4)  
- Rewriting existing Live Hodan amounts without approval  
- Changing RLS, env, or payment review flows  

---

## 10. Open questions (do not infer)

1. **Exact `remaining_days` definition**  
   - Product example: Oct 15 → $130 ⇒ `260/30*15` ⇒ remaining **15**.  
   - Candidate matching example: `30 - day` (day 15 → 15; day 21 → 9 → $78).  
   - Calendar inclusive Oct 15–31 = 17 does **not** match $130.  
   - Confirm before coding day 11 / 20 / 21 expectations.

2. **`period_end` for prorated initial charge**  
   - Keep calendar month-end (current), or set `period_end = period_start`, or something else?

3. **Rounding**  
   - Always `round(..., 2)` banker’s vs half-up? Intermediate precision?

4. **Should `assign_renter` also create the next full-month charge** (e.g. Nov 1–30 due on `due_day`), or only the immediate initial charge with next month still manual?

5. **Days 1–10 in short months / Feb**  
   - Rule is by day-of-month number only? Any exception for Feb 28/29?

6. **Hodan Live correction**  
   - After code fix, leave historical $260/Nov-1 row, adjust in place, or reverse + re-issue? (Requires separate approval; payments currently 0.)

7. **UI default `due_day`**  
   - Should Property Detail default change from `1` to `5`, or remain landlord-entered with no product default?

8. **Manual Add Rent Charge**  
   - Remain free-form override, or enforce the same proration/due rules server-side?

---

## 11. Safety confirmation

**This audit made no application code changes, no test changes, no migrations, no RLS/RPC/env/Supabase setting changes, no deploys, and no GitHub pushes.**  

Database access was **read-only**: `pg_get_functiondef` for `assign_renter` / `create_rent_charge`, and a SELECT snapshot of the active Hodan assignment + charge. **No INSERT/UPDATE/DELETE** and no Live data creation or correction were performed. **RP-1.4 was not started.**
