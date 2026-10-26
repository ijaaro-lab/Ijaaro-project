# RP-1.3 — Initial Rent Proration Implementation Plan

**Date:** 2026-10-21  
**Status:** Planning only — **do not implement in this document’s PR/session.**  
**Basis:** Confirmed landlord billing policy + audit `docs/RP-1.3_RENT_CHARGE_CALCULATION_AUDIT.md`.  
**Constraints:** No application code/test edits here; no Live Supabase writes; no migrations applied in this step; no RLS/env/deploy/push; no RP-1.4.

---

## 1. Objective

Implement the **minimal** change so that `assign_renter`’s optional initial rent charge matches the confirmed policy:

| Rule | Behavior |
| --- | --- |
| Daily rate | `monthly_rent / 30` |
| Move-in days **1–10** | Charge **full** monthly rent |
| Move-in **after day 10** | Charge `monthly_rent / 30 * remaining_days` |
| Initial due | **Immediately** on move-in (`due_date = start_date`) |
| Next month | Full rent charged **separately** on configured `due_day` — **not** combined into the initial row |
| `due_day` | Preserve tenant/assignment config; **do not** hard-code November 5 |
| Retries | No duplicate charges on retries / repeated assign attempts |

---

## 2. Exact change surface (safest minimal)

### 2.1 Single source of truth (recommended)

| Item | Path / object | Role |
| --- | --- | --- |
| **Primary change** | New migration replacing `public.assign_renter` (current body from `supabase/migrations/20261013000004_phase2_rent_ledger.sql` ~L557–703) | Adjust **only** the `IF p_create_initial_charge THEN` block: amount + `due_date` |
| **Optional helper** | New pure SQL function e.g. `public.compute_initial_rent_amount(p_start_date date, p_rent_amount numeric) RETURNS numeric` | Keeps proration math testable and avoids burying formula only inside a large SECURITY DEFINER RPC |
| **Unchanged** | `public.create_rent_charge` | Manual Add Rent Charge remains landlord override (no policy enforcement in this minimal PR) |
| **Unchanged** | RLS policies, `review_rent_payment`, protect triggers, frontend assign form defaults | Isolation and payment flows stay as-is; UI already passes `p_create_initial_charge: true` |
| **Unchanged (this PR)** | Auto-creation of next-month full charge | Remains **manual** via Add Rent Charge until RP-1.4 (see §5) |

**Do not** edit the historical migration file in place; add a **new** forward migration that `CREATE OR REPLACE FUNCTION public.assign_renter(...)`.

### 2.2 Current vs proposed (initial-charge block only)

**Today** (`20261013000004`):

- `period_start` = `start_date`
- `period_end` = last calendar day of start month
- `due_date` = next occurrence of `due_day` (often rolled to next month)
- `amount_due` = full `rent_amount`

**Proposed:**

- `period_start` / `period_end` — **unchanged** (stub month: start → calendar month-end)
- `due_date` = `v_assignment.start_date` (immediate)
- `amount_due` / `balance` — per §3–4
- `amount_paid` = `0`; status = `overdue` if `due_date < CURRENT_DATE` else `due` (same pattern as today)
- Still gated by `p_create_initial_charge`

### 2.3 Frontend

| File | Action in minimal PR |
| --- | --- |
| `frontend/src/pages/landlord/PropertyDetailPage.tsx` | **No change required** for calculator correctness (already calls `assign_renter` with landlord-entered `due_day` and `p_create_initial_charge: true`) |
| Assign form default `due_day: "1"` | **Out of scope** unless product separately asks to change default; must not hard-code “5” / Nov 5 |

### 2.4 Types

| File | Action |
| --- | --- |
| `frontend/src/types/database.ts` | No RPC signature change expected; regenerate only if a new helper is exposed to clients (prefer **internal/SQL-only** helper — no client grant) |

---

## 3. Remaining-days convention (resolved)

Product examples for **$260** in **October** fix the formula:

| Move-in | Stated remaining days | Amount check |
| --- | --- | --- |
| Oct 15 | 15 | `260/30*15 = 130` ✓ |
| Oct 20 | 10 | `260/30*10 = 86.666… → 86.67` ✓ |
| Oct 25 | 5 | `260/30*5 = 43.333… → 43.33` ✓ |

**Resolved definition (use consistently):**

```
day := EXTRACT(DAY FROM start_date)::int   -- 1..31

IF day <= 10 THEN
  remaining_days := N/A
  amount := rent_amount                    -- full month
ELSE
  remaining_days := 30 - day
  amount := round(rent_amount / 30 * remaining_days, 2)
END IF
```

**Implications:**

- Uses a **fixed 30-day month divisor**, not calendar-inclusive day counts (Oct 15–31 inclusive = 17 would **not** match $130).
- For day **d > 10**, remaining is `30 - d` (day 11 → 19; day 21 → 9; day 25 → 5).
- Calendar length of the month (28/29/30/31) does **not** change the amount formula; `period_end` still ends on the real calendar month-end for ledger labeling.
- Day **30**: `remaining_days = 0` → amount **0.00** (edge; see open questions §10).
- Day **31**: `remaining_days = -1` — **invalid**; must clamp or reject (see §10). Prefer `GREATEST(30 - day, 0)` only if product accepts $0 for day 30/31; otherwise raise on day > 30.

**Rejected alternatives (do not use):**

- Inclusive calendar days in month (`month_end - start + 1`)
- `31 - day`, `days_in_month - day + 1`, etc.

---

## 4. Currency rounding (resolved for implementation)

| Rule | Decision |
| --- | --- |
| Storage | `numeric(12, 2)` on `rent_charges.amount_due` / `balance` (existing) |
| Computation | `round((p_rent_amount / 30) * remaining_days, 2)` as a single expression on `numeric` |
| Intermediate | Prefer one `round(..., 2)` on the final product; avoid truncating daily rate to 2 dp first (that would skew totals) |
| Half cases | Use PostgreSQL `round(numeric, integer)` — round **half away from zero** for positive amounts (matches product examples: `86.666… → 86.67`, `43.333… → 43.33`) |
| Full-month path | No division; store `rent_amount` as already provided (assume assign validation keeps ≥ 0; existing CHECK) |
| Balance | `balance = amount_due` at insert (`amount_paid = 0`); existing constraint `balance = round(amount_due - amount_paid, 2)` |

**Reference expected amounts @ $260 (October):**

| Day | Formula | Expected `amount_due` |
| --- | --- | --- |
| 1, 5, 10 | full | `260.00` |
| 11 | `260/30*19` | `164.67` |
| 15 | `260/30*15` | `130.00` |
| 20 | `260/30*10` | `86.67` |
| 25 | `260/30*5` | `43.33` |
| 21 (Hodan scenario) | `260/30*9` | `78.00` |

---

## 5. Immediate initial charge vs next month’s rent

| Concern | Plan |
| --- | --- |
| Initial charge due | Always `due_date = start_date` when creating the initial row |
| Assignment `due_day` | Stored unchanged on `rental_assignments`; **not** used to compute initial `due_date` |
| Next full month | **Not** auto-inserted by `assign_renter` in this minimal PR |
| How next month is billed today | Landlord uses **Add Rent Charge** → `create_rent_charge` with period = next calendar month, `due_date` = that month’s day matching assignment `due_day` (e.g. if `due_day = 5`, Nov charge due **2026-11-05**; if `due_day = 1`, due **2026-11-01**) |
| Do not combine | Initial row must never include next month’s full rent in `amount_due`; next month is a **separate** `rent_charges` row |
| RP-1.4 | Recurring generation is explicitly **out of scope**; document for operators that post–day-10 move-ins still need a manual next-month charge until automation exists |

**UI note:** Product narrative “November 5” means an assignment with `due_day = 5`, not a global constant. Hodan Live fixture currently has `due_day = 1`.

---

## 6. Duplicate prevention / idempotency

| Mechanism | Behavior | Plan action |
| --- | --- | --- |
| Property occupied / open assignment checks + `FOR UPDATE` | Second `assign_renter` after success fails | **Keep** — primary retry guard |
| Unique index `uq_rent_charges_assignment_period (assignment_id, period_start, period_end)` | Blocks identical period re-insert on same assignment | **Keep** |
| `p_create_initial_charge = false` then manual charge | One charge if landlord careful | Unchanged |
| Re-assign after move-out | New assignment → new initial charge (intended) | Unchanged; history retained |
| Manual charges with different period bounds for same conceptual month | Still possible | Out of scope for this PR (audit already flagged) |
| Assign UI double-click | Relies on DB; second call errors | Optional UX debounce later — not required for billing correctness |

**Implementation note:** Changing amount/due logic does not require new uniqueness keys; do **not** insert a second charge from `assign_renter`.

---

## 7. Proposed algorithm (pseudocode)

```
-- Inside assign_renter, when p_create_initial_charge is true:

v_period_end := last_day_of_month(start_date)   -- unchanged
v_move_day   := EXTRACT(DAY FROM start_date)::int

IF v_move_day <= 10 THEN
  v_amount := rent_amount
ELSE
  v_remaining := 30 - v_move_day
  -- Resolve day 30/31 before ship (OQ-A); interim proposal: GREATEST(v_remaining, 0)
  v_amount := round(rent_amount / 30 * v_remaining, 2)
END IF

v_due := start_date   -- immediate; ignore due_day for this row

INSERT rent_charges (
  ...,
  period_start := start_date,
  period_end   := v_period_end,
  due_date     := v_due,
  amount_due   := v_amount,
  amount_paid  := 0,
  balance      := v_amount,
  status       := CASE WHEN v_due < CURRENT_DATE THEN overdue ELSE due END
)
```

Remove the current block that computes `v_due` from `due_day` / month roll-forward **for the initial charge only**.

---

## 8. Test matrix

Prefer **local** Vitest/RPC tests (isolated Supabase); **no Live writes**.

### 8.1 Amount + initial due (rent = $260, October 2026)

| Move-in | Day | Expected `amount_due` | Expected `due_date` | Expected `period_end` |
| --- | --- | --- | --- | --- |
| 2026-10-01 | 1 | 260.00 | 2026-10-01 | 2026-10-31 |
| 2026-10-05 | 5 | 260.00 | 2026-10-05 | 2026-10-31 |
| 2026-10-10 | 10 | 260.00 | 2026-10-10 | 2026-10-31 |
| 2026-10-11 | 11 | 164.67 | 2026-10-11 | 2026-10-31 |
| 2026-10-15 | 15 | 130.00 | 2026-10-15 | 2026-10-31 |
| 2026-10-20 | 20 | 86.67 | 2026-10-20 | 2026-10-31 |
| 2026-10-25 | 25 | 43.33 | 2026-10-25 | 2026-10-31 |

### 8.2 Due-day isolation

| Case | Expect |
| --- | --- |
| Assign with `p_due_day = 1`, start 2026-10-15 | Initial `due_date = 2026-10-15` (not Nov 1) |
| Assign with `p_due_day = 5`, start 2026-10-15 | Initial `due_date = 2026-10-15` (not Oct 5 or Nov 5) |
| Assignment row still stores provided `due_day` | Unchanged for future/manual charges |

### 8.3 Retry / idempotency

| Case | Expect |
| --- | --- |
| Successful assign then second `assign_renter` on same property | Error (occupied / open assignment); **no** second charge |
| Concurrent assign (if testable) | One wins; other fails |
| Duplicate `create_rent_charge` with same period tuple | Unique violation |

### 8.4 Tenant isolation (regression)

| Case | Expect |
| --- | --- |
| Landlord B `assign_renter` on A’s property | Denied |
| Landlord B `create_rent_charge` on A’s assignment | Denied |
| Existing `rls.rental.test.ts` cross-tenant cases | Still pass |

### 8.5 Payment / history regression

| Case | Expect |
| --- | --- |
| Renter submit + landlord `review_rent_payment` approve | `amount_paid` / `balance` / status update correctly on **new** charges |
| `complete_move_out` | Charges/payments retained; no delete |
| Existing test assign at `2026-10-01` / rent 100 / `due_day` 5 | Update assertions: initial due **2026-10-01**, amount **100.00** (day ≤ 10 full); do not expect due 2026-10-05 |

### 8.6 Suggested test file placement

| Approach | Notes |
| --- | --- |
| Extend `frontend/src/test/rls.rental.test.ts` | Good for isolation + one happy-path amount assert; keep suite lean |
| Add focused helper/RPC math tests (local only) | Better for the full day 1/5/10/11/15/20/25 matrix without bloating RLS workflow |
| Pure SQL unit of `compute_initial_rent_amount` (if helper added) | Fastest matrix; call via `rpc` or SQL in local test DB |

---

## 9. Live charge reconciliation (identify only — do not modify)

**Fixture:** Hodan Properties active assignment (snapshot from audit, 2026-10-21).

| Field | Live today | Expected under this plan |
| --- | --- | --- |
| Start | 2026-10-21 | — |
| Rent / `due_day` | 260.00 / **1** | — |
| Period | 2026-10-21 → 2026-10-31 | Same bounds OK |
| `amount_due` | **260.00** | **78.00** (`260/30*(30-21)`) |
| `due_date` | **2026-11-01** | **2026-10-21** |
| Payments | 0 | — |

**Decision for implementation PR:** **Leave the Live row unchanged.** Code fix applies to **new** assignments only.

**Separate, later SOP (not this plan’s execution):** product/ops choose leave-as-history vs reverse+reissue vs in-place correction — requires explicit approval; payments currently 0 so correction is simpler than after payment, but still out of scope here.

---

## 10. Risks

| Risk | Mitigation |
| --- | --- |
| Day 30/31 produce 0 or negative remaining under `30 - day` | Confirm with product before ship; add guard + test |
| Operators expect next month auto-created at assign | Document gap; keep manual Add Rent Charge; schedule RP-1.4 separately |
| Existing tests assume initial due = `due_day` | Update expected `due_date` when asserting charge fields |
| Someone “fixes” Live Hodan during deploy | Explicitly exclude data migration from PR; checklist item |
| Manual Add Rent Charge still allows non-policy amounts | Accepted for minimal PR; optional later validation |
| Short months (Feb) with day ≤ 10 still full rent | Matches day-of-month rule; document; no special case unless product asks |
| Rounding divergence if daily rate pre-rounded | Single final `round(..., 2)` only |

---

## 11. Unresolved / confirm-before-code questions

Resolved by this plan from confirmed examples: **remaining_days = 30 − day**; **round half-away-from-zero to 2 dp**; **initial due = start_date**; **do not hard-code Nov 5**; **do not auto-create next month in this PR**.

Still open (do not invent in code):

| ID | Question | Suggested default if forced |
| --- | --- | --- |
| OQ-A | Move-in on day **30** or **31**: charge $0, reject assign, or special case? | `GREATEST(30-day, 0)` + document; prefer product confirm |
| OQ-B | Should `period_end` stay calendar month-end for prorated rows? | **Yes** (minimal; matches current stub) |
| OQ-C | After fix, Hodan Live correction SOP? | Leave unchanged until explicit approval |
| OQ-D | Change Property Detail default `due_day` from `1` → `5`? | **No** in this PR |
| OQ-E | Enforce same proration on `create_rent_charge`? | **No** in this PR (override) |
| OQ-F | When should RP-1.4 create the next full-month charge automatically? | Separate epic |

---

## 12. Implementation checklist (for the future coding PR — not now)

1. Add forward migration: optional `compute_initial_rent_amount` + `CREATE OR REPLACE assign_renter` with §7 logic.  
2. Apply migration **local only**; verify with matrix §8.1–8.5.  
3. Update/extend tests; keep Live untouched.  
4. Smoke: assign day ≤ 10 and day > 10; confirm `due_day` still stored; manual next-month charge still works.  
5. Do **not** start RP-1.4; do **not** rewrite Live Hodan charge.

---

## 13. Deliverable summary

| Topic | Proposal |
| --- | --- |
| Files / functions | New migration replacing `assign_renter` initial-charge block; optional SQL helper; no `create_rent_charge` / RLS / UI default changes |
| Calculation | Days 1–10 full; else `round(rent/30*(30-day), 2)` |
| Rounding | Final `round(..., 2)` half away from zero; matches $86.67 / $43.33 |
| Due dates | Initial = move-in; recurring `due_day` preserved for separate later charges |
| Duplicates | Existing property locks + period unique index; no second auto charge |
| Tests | Matrix days 1,5,10,11,15,20,25 + due_day isolation + retry + isolation + payment/history |
| Live | Hodan $260 / due Nov 1 identified as non-compliant; **manual reconciliation later; do not modify now** |
| Out of scope | RP-1.4, Live data fix, env/RLS, hard-coded Nov 5 |

---

## 14. Safety confirmation (this planning step)

**No application code or tests were edited.**  
**No Live Supabase writes, migrations, RLS/RPC/env/Supabase setting changes, deploys, or Git pushes were performed.**  
**RP-1.4 was not started.**  
This document is the only deliverable of this step.
