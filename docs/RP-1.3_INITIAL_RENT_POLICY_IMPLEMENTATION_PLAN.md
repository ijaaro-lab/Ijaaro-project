# RP-1.3 — Initial Rent Policy Implementation Plan (Revised)

**Date:** 2026-10-21  
**Status:** Planning only — **do not implement in this document’s PR/session.**  
**Approved policy (revised by product owner):**  
- Move-in **days 1–14:** creating an **initial** (move-in-month) rent charge in IJAARO is **optional** — landlord chooses at assignment.  
- Move-in **day 15 or later:** remaining-days amount is collected **manually outside IJAARO**; IJAARO must **not** create an initial move-in-month charge, payment, or unpaid balance (“debt”).  
- Initial charge (when created) stays **separate** from the next normal monthly rent charge.  
- Next normal monthly rent follows the **existing approved billing policy** (documented in §5) — **no** automatic recurring billing.  
- Actual tenancy start date is **preserved**.  
**Supersedes for implementation intent:**  
- Prior “Option A” body of this same file (move-in-month always outside IJAARO; first system charge = full next calendar month due on the 1st).  
- `docs/RP-1.3_INITIAL_RENT_PRORATION_IMPLEMENTATION_PLAN.md` (day-1–10 / proration rules). That plan must **not** be implemented as written.  
**Basis:** Code inspection of assign UI + `assign_renter` + `docs/RP-1.3_RENT_CHARGE_CALCULATION_AUDIT.md` (audit still describes *current* SQL; its *recommended* proration algorithm remains obsolete under this revised policy).  
**Constraints:** No application code/test edits here; no Live Supabase writes; no migrations applied; no RLS/env/deploy/push; no RP-1.4.

---

## 1. Objective

Change assignment so UI + `assign_renter` agree on **when** an initial move-in-month charge may exist, without introducing recurring billing or rewriting Live history.

| Rule | Behavior |
| --- | --- |
| Move-in date | Allowed any calendar day; stored as `rental_assignments.start_date` (**unchanged** — preserve actual start) |
| Day of month `d = EXTRACT(DAY FROM start_date)` | Gate for initial charge eligibility |
| Days **1–14** | Landlord **may** choose to create one initial move-in-month `rent_charges` row during assign |
| Days **15–last** | Landlord **must not** create an initial move-in-month charge; remaining-days money is **outside** IJAARO |
| Initial charge (when created) | One row for the **move-in month** only; **never** fold next month’s full rent into the same row |
| Next normal monthly charge | **Not** created by `assign_renter`; follows existing approved billing (§5) via manual Add Rent Charge |
| Payments / debt for day ≥ 15 stub | **None** in IJAARO for the move-in month |
| Recurring billing | **Do not introduce**; RP-1.4 remains separate |

### 1.1 Product examples

| Move-in | Monthly rent | Initial charge in IJAARO | Next normal month |
| --- | --- | --- | --- |
| 2026-10-01 (day 1) | $260 | **Optional** — landlord yes → one Oct stub charge; landlord no → no Oct charge | Separate Nov charge per §5 (manual) |
| 2026-10-10 (day 10) | $260 | **Optional** (same) | Same |
| 2026-10-14 (day 14) | $260 | **Optional** (last eligible day) | Same |
| 2026-10-15 (day 15) | $260 | **Forbidden** — remaining-days collected outside IJAARO; no charge / payment / balance | Same |
| 2026-10-20 (day 20) | $260 | **Forbidden** | Same |
| 2026-10-31 (last day) | $260 | **Forbidden** | Same |

---

## 2. Inspection summary (what actually exists today)

Confirmed present; no later migration redefines these after the listed files.

| Area | Path / object | Status |
| --- | --- | --- |
| Base assign / move-out RPCs | `supabase/migrations/20261013000003_phase2_properties_tenancy.sql` | Present |
| Ledger + upgraded `assign_renter` / `create_rent_charge` | `supabase/migrations/20261013000004_phase2_rent_ledger.sql` | **Authoritative current bodies** |
| Later migrations redefining `assign_renter` | None after `20261013000004` | Confirmed via migration grep |
| Edge wrapper | `supabase/functions/assign-renter/index.ts` | Thin RPC proxy; passes `create_initial_charge` through (default `true`) |
| Assign UI | `frontend/src/pages/landlord/PropertyDetailPage.tsx` | `Start date`, `Due day (1–28)` default `"1"`; **always** `p_create_initial_charge: true`; **no** checkbox / day-based gate |
| Manual charge UI | `frontend/src/pages/landlord/TenancyDetailPage.tsx` | Free-form Add Rent Charge |
| Types | `frontend/src/types/database.ts` | `assign_renter` already has optional `p_create_initial_charge?: boolean` |
| Isolation / workflow tests | `frontend/src/test/rls.rental.test.ts` | Assign + charge id; second assign blocked; create charge; cross-tenant; pay/approve; move-out retention |
| Related UI tests | `TenancyDetailPage.test.tsx`, `PropertyDetailPage.moveOut.test.tsx` | Display / move-out; **no** day-gate or optional-charge UX |
| Automatic recurring rent generation | — | **Not present** |
| Separate “debt” table | — | **Not present**; unpaid `rent_charges.balance` is the ledger debt |

---

## 3. Current behavior (`assign_renter` today)

When a landlord calls `assign_renter` (UI always passes `p_create_initial_charge: true`):

1. Auth: `auth.uid()` required; `can_manage_landlord_ops(property.tenant_id)`.
2. Locks property `FOR UPDATE`; rejects if occupied / open `invited|active` assignment.
3. Validates rent ≥ 0, `due_day` in 1–28 if provided, renter has active renter membership on tenant.
4. Inserts `rental_assignments` with `start_date`, `rent_amount`, `due_day`, status `active`.
5. Updates property → `occupied`, `current_renter_id`, unlisted.
6. **If `p_create_initial_charge`:** inserts one `rent_charges` row:
   - `period_start` = assignment `start_date` (move-in day)
   - `period_end` = last calendar day of the **move-in** month
   - `due_date` = next occurrence of `due_day` in the start month (or next month if that day is before start)
   - `amount_due` / `balance` = **full** `rent_amount`
   - `amount_paid` = 0; status `due` / `overdue` vs `CURRENT_DATE`
7. Writes audit `rental.assign` with `initial_charge_id`.
8. Returns `{ assignment, initial_charge_id }`.

**Mismatch with revised policy:**

| Gap | Today | Required |
| --- | --- | --- |
| Days 1–14 choice | UI hard-codes `true`; landlord cannot opt out | Optional control |
| Days ≥ 15 | Still creates move-in-month full-rent stub if `true` | Must refuse / force no charge |
| Server enforcement | Accepts `true` on any start day | Must reject `true` when day ≥ 15 |
| Next month | Not created (OK) | Remain not created; document §5 |

`complete_move_out` only closes the assignment and frees the property; it does **not** delete charges or payments (history preserved).

---

## 4. Minimal safe design (optional on 1–14; unavailable on 15+)

### 4.1 Why this is the smallest safe surface

The RPC **already** accepts `p_create_initial_charge` (default `true`). The bug relative to the revised rule is:

1. **UI** never exposes the flag and always sends `true`.  
2. **SQL** never validates the flag against the move-in day.

No new RPC parameter is required for the gate. Do **not** change `start_date` storage. Do **not** auto-insert a next-month charge.

### 4.2 Recommended change surface (future implementation PR)

| Item | Action |
| --- | --- |
| **Primary (SQL)** | New **forward** migration: `CREATE OR REPLACE FUNCTION public.assign_renter(...)` — add day-gate **before** / around the existing `IF p_create_initial_charge THEN` block |
| **Primary (UI)** | `PropertyDetailPage.tsx`: derive eligibility from `assignForm.start_date`; show optional control only when day ∈ 1–14; force `false` and hide/disable when day ≥ 15 |
| **Do not** edit in place | `20261013000003` / `20261013000004` historical files |
| **Unchanged** | Auth, occupancy locks, assignment insert (incl. `start_date`), property update, audit return shape |
| **Unchanged** | `create_rent_charge`, `review_rent_payment`, protect triggers, RLS, grants |
| **Unchanged** | Automatic recurring generation (still absent) |
| **Unchanged this PR (data)** | Any existing Live / Hodan ledger rows |

Optional: thin SQL helper e.g. `initial_charge_allowed(p_start_date date) RETURNS boolean` (`EXTRACT(DAY FROM p_start_date) BETWEEN 1 AND 14`) for shared UI/docs/tests. Prefer **no client GRANT** if added as SECURITY DEFINER helper; or keep as `IMMUTABLE` SQL usable in tests only.

### 4.3 Proposed server gate (authoritative)

```
v_move_in_day := EXTRACT(DAY FROM v_assignment.start_date)::int

IF p_create_initial_charge AND v_move_in_day >= 15 THEN
  RAISE EXCEPTION 'initial charge not allowed for move-in on day 15 or later'
    -- stable SQLSTATE TBD (see OQ-6); do not insert charge
END IF

IF p_create_initial_charge THEN
  -- existing stub-period insert (period/amount/due math unchanged unless product decides otherwise — see OQ-1)
END IF
```

**Plan default for days 1–14 when landlord opts in:** keep **today’s** initial-charge math (full `rent_amount`, period `start_date` → move-in month-end, `due_date` from `due_day` algorithm) so the coding PR stays a **gate + UI** change. Amount/due redesign is **out of minimal scope** unless product answers OQ-1.

**Days ≥ 15:** even if a buggy client sends `true`, SQL rejects **before** insert. Prefer failing the whole assign (transaction rolls back) so UI and DB cannot disagree on whether a charge was created — see §7.

### 4.4 Proposed UI behavior (`PropertyDetailPage.tsx`)

| Start-date day | Control | Value sent as `p_create_initial_charge` |
| --- | --- | --- |
| 1–14 | Visible checkbox / toggle, e.g. “Create initial rent charge for move-in month” | Landlord choice (`true`/`false`) |
| ≥ 15 | Control **hidden or disabled**; helper: remaining-days rent is collected outside IJAARO | Always `false` |
| Date cleared / invalid | Do not submit | Client validation |

Defaults for days 1–14: **plan default = unchecked (`false`)** so landlords explicitly opt in (safer than today’s always-on). Product may override to checked — see OQ-2.

Success copy:

- Charge created: keep/adjust “Renter assigned and initial rent charge created”.  
- No charge (opt-out or day ≥ 15): “Renter assigned” (do not claim a charge was created).

Edge `assign-renter` / `database.ts`: no signature change required.

### 4.5 Explicit non-goals for the implementation PR

- Proration / `/ 30` / day-1–10 rules from the superseded proration plan.  
- Option A “first charge = next calendar month due on the 1st”.  
- Auto-creating the next normal monthly charge at assign time.  
- Recording outside remaining-days collections as charges or payments.  
- Changing RLS, env, VPS, or Live rows.  
- Hard-coding a global due day of 5.

---

## 5. Existing approved billing policy (next normal monthly rent)

Documented here so implementers **do not** invent automatic recurring billing.

| Aspect | Approved / current product behavior |
| --- | --- |
| Who creates the next month’s charge | Landlord, via **Add Rent Charge** on tenancy detail → RPC `create_rent_charge` |
| When | After assignment, when the landlord chooses — **not** inside `assign_renter` |
| Amount | Landlord-entered, or defaults to full `assignment.rent_amount` if amount omitted |
| Period | Landlord-entered `period_start` / `period_end` (typically the next calendar month) |
| Due date | Landlord-entered; operators should use the assignment’s configured **`due_day`** (1–28) within that month (e.g. `due_day = 5` → due on the 5th of that month). This is **operator procedure**, not enforced math in `create_rent_charge` today |
| Separation | Must be a **separate** `rent_charges` row from any initial move-in-month charge |
| Uniqueness | Unique `(assignment_id, period_start, period_end)` blocks identical period re-insert |
| Automatic recurring generation | **Absent** — do **not** add in this RP-1.3 change; RP-1.4 is a separate epic |
| Assignment `due_day` | Stored at assign for documentation and for guiding later / future recurring charges; UI default remains `"1"` unless product asks otherwise |

**Implication for this plan:** fixing initial-charge eligibility must **not** silently start creating November (or “first of next month”) charges at assign time. That would contradict both current code and this revised policy.

---

## 6. Start date vs billing periods

| Concept | Storage / rule |
| --- | --- |
| Actual move-in | `rental_assignments.start_date` = landlord-entered start (**preserve**; never rewrite to month-start or next month) |
| Move-in month eligibility | `EXTRACT(DAY FROM start_date)` ∈ 1–14 → optional; ≥ 15 → forbidden |
| Initial charge period (if created) | Plan default: `period_start = start_date`, `period_end =` last day of move-in month (current SQL) |
| Next normal period | Separate row, landlord-created per §5; must not merge amounts into the initial row |
| Tenancy identity | Unchanged: one active assignment; charges keyed by `assignment_id` |

Day-boundary examples (October 2026):

| `start_date` | Day | Initial charge allowed? |
| --- | --- | --- |
| 2026-10-01 | 1 | Yes, optional |
| 2026-10-10 | 10 | Yes, optional |
| 2026-10-14 | 14 | Yes, optional |
| 2026-10-15 | 15 | No |
| 2026-10-20 | 20 | No |
| 2026-10-31 | 31 | No |
| 2026-02-28 (non-leap last day) | 28 | No |
| 2024-02-29 (leap last day) | 29 | No |

---

## 7. Validation rules (UI and database must not disagree)

Single source of truth: **calendar day of `start_date` on the assignment row that was just inserted** (same value the landlord entered).

| Layer | Rule |
| --- | --- |
| **UI (client)** | If day ≥ 15 → do not offer the option; always send `p_create_initial_charge: false`. If day ≤ 14 → send the landlord’s explicit boolean. |
| **SQL (authoritative)** | If `p_create_initial_charge = true` AND day ≥ 15 → **raise** and abort assign (no assignment, no charge). If `false` → never insert initial charge, any day. |
| **SQL (days 1–14)** | Honor `true`/`false` exactly; do not coerce `false` → `true`. |
| **Edge wrapper** | Pass flag through; do not default day ≥ 15 requests back to `true`. Today’s `create_initial_charge ?? true` is OK only if the UI always sends an explicit boolean after the change. |
| **Disagreement prevention** | Client may be buggy or bypassed; SQL gate is mandatory. Prefer hard fail over “silently ignore `true` and still assign” so callers cannot believe a charge was requested when none was allowed (see OQ-3 for soft-coerce alternative). |
| **Manual Add Rent Charge** | Still free-form today; does **not** re-check the day-1–14 gate. Soft operational guidance: do not backfill move-in-month remaining-days for day ≥ 15 if product wants purity (enforcement = OQ-4). |

Error message should be stable and human-readable so the UI can surface it if a stale client sends `true` on day ≥ 15.

---

## 8. Idempotency and duplicate prevention

| Mechanism | Keep / note |
| --- | --- |
| Property `FOR UPDATE` + occupied / open-assignment checks | **Keep** — primary guard against double assign |
| Unique index `uq_rent_charges_assignment_period (assignment_id, period_start, period_end)` | **Keep** |
| Days 1–14 + `true` | Exactly **one** initial stub row on success |
| Days 1–14 + `false` | **Zero** initial rows; landlord may add later via §5 / manual charge |
| Days ≥ 15 + `false` | Success with **zero** initial rows |
| Days ≥ 15 + `true` | Error; **no** assignment / charge |
| Re-assign after move-out | New assignment; day-gate applies to the **new** `start_date`; old charges retained |
| Assign UI double-submit | Second call fails on occupancy; optional UX debounce later |

---

## 9. Tenant isolation

Preserve unchanged:

- `can_manage_landlord_ops` on assign / create charge / move-out  
- `can_approve_rent` on payment review  
- `rent_charges` / payments SELECT policies  
- SECURITY DEFINER + `ijaaro.internal` only inside trusted RPCs  
- Existing cross-tenant denials in `rls.rental.test.ts`  

Day-gate math must not weaken or reorder auth checks; keep the authorization block byte-for-byte ahead of inserts.

---

## 10. Existing Live Hodan charge (review separately — do not modify now)

Snapshot from prior audit (2026-10-21), reference fixture only:

| Field | Live today | Under **revised** policy |
| --- | --- | --- |
| Tenant | `hodan-properties` | — |
| Start | **2026-10-21** (day **21** ≥ 15) | Keep as move-in |
| Rent / `due_day` | 260.00 / 1 | — |
| Charge period | 2026-10-21 → 2026-10-31 | **Should not exist** as an initial assign charge (remaining-days outside IJAARO) |
| `due_date` / amount | 2026-11-01 / 260.00 | N/A if no initial charge |
| Payments | 0 | — |

**Implementation PR rule:** leave the Live row **unchanged**. Code/UI fix applies to **new** assignments only.

**Separate review / approval process (ops, not this plan’s execution):**

1. Product + ops confirm whether the existing Hodan charge should be corrected, cancelled, or left as historical.  
2. Prefer a written SOP before any UPDATE/DELETE/cancel of Live ledger rows.  
3. Options to evaluate later (none approved here): leave as-is; cancel/reverse the move-in-month stub (payments = 0 today → simpler); or other controlled correction.  
4. **Do not** prescribe destructive Live SQL in the coding PR.  
5. **Do not** modify the Hodan charge while implementing the day-gate.

---

## 11. History preservation

| Asset | Requirement |
| --- | --- |
| Existing `rent_charges` / `rent_payments` | No migration rewrite; FKs `ON DELETE RESTRICT`; no-delete RLS |
| Move-out history | `complete_move_out` must remain non-destructive to ledger |
| Audit logs | Continue `rental.assign` / `rental.move_out`; do not purge |
| Financial protect trigger | Unchanged — paid/balance/status only via review RPC |
| Prior Option A / proration plan docs | Retain as historical; **this revised plan** is the implementation authority |

---

## 12. Manual collections outside IJAARO (day ≥ 15)

Explicit confirmation for implementers and operators:

- For move-in day **15 or later**, remaining-days money for the move-in month is **outside** the product.  
- `assign_renter` must **not** create a charge for that month.  
- Landlords must **not** be instructed to enter that money as a `rent_payment` or move-in-month `rent_charge` for policy compliance.  
- Because no charge exists for that month, no unpaid balance (“debt”) exists for it in IJAARO.  
- For days **1–14**, if the landlord opts **out**, the same “outside / later manual” outcome applies until they create a charge deliberately.  
- Manual Add Rent Charge remains an override tool (see OQ-4).

---

## 13. Tests (for the future implementation PR — not added now)

Prefer **local** isolated Vitest/RPC tests; **no Live writes**. Claim pass only when actually run.

### 13.1 Day-gate matrix (rent = $260; assert charge presence/absence)

| Move-in | Day | `p_create_initial_charge` | Expect |
| --- | --- | --- | --- |
| 2026-10-01 | 1 | `true` | Assign OK; **one** initial charge; `start_date` preserved `2026-10-01` |
| 2026-10-01 | 1 | `false` | Assign OK; **no** initial charge; `start_date` preserved |
| 2026-10-10 | 10 | `true` | One initial charge |
| 2026-10-10 | 10 | `false` | No initial charge |
| 2026-10-14 | 14 | `true` | One initial charge (last eligible day) |
| 2026-10-14 | 14 | `false` | No initial charge |
| 2026-10-15 | 15 | `false` | Assign OK; **no** initial charge |
| 2026-10-15 | 15 | `true` | **Error**; no assignment; no charge |
| 2026-10-20 | 20 | `false` | Assign OK; no charge |
| 2026-10-20 | 20 | `true` | **Error**; no assignment; no charge |
| 2026-10-31 | 31 (last day) | `false` | Assign OK; no charge |
| 2026-10-31 | 31 | `true` | **Error**; no assignment; no charge |

Also assert for any successful **with-charge** case (plan default math): period stays move-in stub (`period_start = start_date`, `period_end` = month-end); amount = full rent unless OQ-1 changes; **no** second “next month” row created by `assign_renter`.

### 13.2 Optional selected vs not selected (UI contract)

| Case | Expect |
| --- | --- |
| Day 10, checkbox on | RPC called with `true`; success message mentions charge |
| Day 10, checkbox off | RPC called with `false`; success message does **not** claim charge |
| Day 20 | Control unavailable; RPC called with `false` |
| Change start date from 10 → 20 | Control clears to unavailable; flag forced false before submit |
| Change start date from 20 → 10 | Control appears; uses default (OQ-2) |

### 13.3 Month boundaries / last day of month

| Move-in | Expect |
| --- | --- |
| 2026-11-30 | Day 30 ≥ 15 → `true` rejected; `false` OK, no charge |
| 2026-02-28 | Day 28 ≥ 15 → same |
| 2024-02-29 | Day 29 ≥ 15 → same |
| 2026-12-14 | Day 14 → optional charge allowed |
| 2026-12-15 | Day 15 → forbidden |

### 13.4 Next-month separation + `due_day`

| Case | Expect |
| --- | --- |
| Assign day 10 with charge | Exactly one charge; period in move-in month only |
| Then manual `create_rent_charge` for next calendar month | Second row; distinct period; amounts not combined |
| `p_due_day = 5` stored on assignment | Still stored; used as operator guide for **manual** next charge, not to invent auto billing |
| Assign does **not** insert next-month row | Regardless of day or flag |

### 13.5 Retry / idempotency

| Case | Expect |
| --- | --- |
| Second `assign_renter` after success | Error; no second assignment/charge |
| Day ≥ 15 + `true` then retry with `false` | First failed; second can succeed if property still free |
| Duplicate `create_rent_charge` same period tuple | Unique violation |

### 13.6 Tenant isolation + payment / move-out / history regression

| Case | Expect |
| --- | --- |
| Cross-tenant assign / create charge / review | Denied |
| Approve payment on a **new** initial charge (day ≤ 14, opted in) | Balance updates |
| `complete_move_out` | Charges/payments retained |
| Existing fixtures that assign with initial charge | Still valid when start day ≤ 14 and flag `true`; update any fixture that used mid/late-month starts if tests assumed a charge |
| Live Hodan row | **Not** touched by tests |

### 13.7 Placement

- Extend `rls.rental.test.ts` for day-gate happy/deny paths + keep isolation/payment/move-out.  
- Add focused local matrix coverage for days 1 / 10 / 14 / 15 / 20 / last-day without bloating RLS workflow.  
- Optional lightweight UI test for checkbox visibility vs start-date day.

---

## 14. UI impact (recommendation only)

| Control | Keep? | Clarification |
| --- | --- | --- |
| **Start date** | Yes | Actual move-in / tenancy start. Changing it drives charge eligibility. |
| **Due day (1–28)** | Yes | Stored for later / manual charges per §5; not a substitute for the initial-charge checkbox. |
| **Create initial charge** | **Add** (days 1–14 only) | Label e.g. “Create initial rent charge for the move-in month”. Helper on days ≥ 15: “Remaining-days rent for this month is collected outside IJAARO; no initial charge will be created.” |
| Success message | Adjust | Branch on whether a charge was requested/created. |
| Default `due_day = "1"` | Leave unless product asks | Unrelated to the day-14 gate. |

Smallest safe UI change: start-date-driven optional control + success string + always send an explicit boolean.

---

## 15. Open questions / unresolved decisions

| ID | Question | Plan default if forced |
| --- | --- | --- |
| OQ-1 | For days 1–14 when the landlord opts **in**, keep today’s full-rent stub + `due_day` due algorithm, or change amount/due (e.g. immediate due, different amount)? | **Keep today’s math** in the minimal PR (gate only) |
| OQ-2 | Default checkbox state for days 1–14? | **Unchecked (`false`)** — explicit opt-in |
| OQ-3 | On day ≥ 15 with `p_create_initial_charge=true`: hard-fail assign, or coerce to `false` and succeed? | **Hard-fail** (prevents UI/DB disagreement about intent) |
| OQ-4 | Enforce server-side rejection of **manual** move-in-month charges when start day ≥ 15? | **No** in minimal PR |
| OQ-5 | When does RP-1.4 (auto recurring) start? | Separate epic; not this change |
| OQ-6 | Exact SQLSTATE / error text for the day ≥ 15 rejection? | Human-readable message; pick a stable non-auth errcode in implementation |
| OQ-7 | Hodan Live correction SOP for the existing day-21 charge? | Leave unchanged until explicit approval |
| OQ-8 | Should days 1–14 opt-out copy tell landlords to collect move-in-month rent outside IJAARO the same way as day ≥ 15? | Yes, soft copy; confirm with product |

---

## 16. Risks and rollout

| Risk | Mitigation |
| --- | --- |
| Operators still expect Option A (always skip move-in month; auto first-of-next-month charge) | This plan supersedes Option A; train on optional 1–14 / forbidden 15+ |
| Operators expect proration from the older plan | Mark proration plan superseded |
| Operators expect next months auto-created | Document §5; manual Add Rent Charge only |
| UI always-on `true` ships without SQL gate | **Ship SQL gate in same release** as UI |
| Soft-coerce on day ≥ 15 hides client bugs | Prefer hard-fail (OQ-3) |
| Existing tests assume charge on late-month starts | Update fixtures / expectations |
| Live Hodan “fixed” during deploy | Checklist: **no** data migration in coding PR |
| Rollback | `CREATE OR REPLACE` prior `assign_renter` body from `20261013000004`; revert UI checkbox |

### 16.1 Migration / verification sequence (when approved)

1. Add forward migration: day-gate in `assign_renter` only (plus optional helper).  
2. Apply **local** only; run matrix §13.  
3. Update assign UI to optional control + forced `false` for day ≥ 15.  
4. Update tests; smoke days 1, 14, 15, last day; opt-in and opt-out.  
5. Confirm manual Add Rent Charge, payment approve, and move-out regressions.  
6. Deploy only after local sign-off.  
7. **Do not** alter Hodan rows without separate written approval.  
8. **Do not** start RP-1.4.

### 16.2 Production risks

- New assignments after deploy follow the day gate; historical rows (incl. Hodan) may still show old move-in-month charges for day ≥ 15 starts — communicate to landlords.  
- Hodan fixture remains non-compliant with the revised rule until a separate data SOP.  
- No RLS change → isolation regression risk is low if auth block is copied carefully.

---

## 17. Proposed algorithm (for the future coding PR)

```
-- Inside assign_renter, after assignment insert / property update:

v_move_in_day := EXTRACT(DAY FROM v_assignment.start_date)::int

IF p_create_initial_charge AND v_move_in_day >= 15 THEN
  RAISE EXCEPTION 'initial charge not allowed for move-in on day 15 or later'
END IF

IF p_create_initial_charge THEN
  -- KEEP current stub logic unless OQ-1 says otherwise:
  v_period_end := (date_trunc('month', start_date) + interval '1 month - 1 day')::date
  v_due        := <existing due_day occurrence algorithm>
  v_amount     := rent_amount   -- full monthly rent

  INSERT rent_charges (
    period_start := start_date,
    period_end   := v_period_end,
    due_date     := v_due,
    amount_due   := v_amount,
    ...
  )
END IF

-- Do NOT insert a next-month / "first normal" charge here.
```

UI:

```
day = dayOfMonth(start_date)
if day >= 15:
  createInitial = false   // control hidden/disabled
else:
  createInitial = checkboxValue   // default false per OQ-2

rpc assign_renter(..., p_create_initial_charge: createInitial)
```

---

## 18. Deliverable summary

| Topic | Proposal |
| --- | --- |
| Document | This revised plan — sole deliverable of the planning step |
| Change surface | Forward migration day-gate in `assign_renter` + Property Detail optional control |
| Days 1–14 | Initial move-in-month charge **optional** (landlord choice) |
| Days ≥ 15 | Initial charge **unavailable**; remaining-days outside IJAARO; SQL rejects `true` |
| Next normal month | Existing approved policy §5 — manual Add Rent Charge; **no** auto recurring |
| `start_date` | Preserved as entered |
| Separation | Initial ≠ next month; never combined |
| Hodan Live | Separate review; do not modify in implementation PR |
| Prior Option A / proration plans | Superseded for implementation intent |

---

## 19. Safety confirmation (this planning step)

**Only `docs/RP-1.3_INITIAL_RENT_POLICY_IMPLEMENTATION_PLAN.md` was modified.**  
**No application code or tests were edited.**  
**No migrations were created or applied.**  
**No Live / local SQL writes, RLS/RPC/env/Supabase setting changes, deploys, VPS changes, or Git pushes were performed.**  
**RP-1.4 was not started.**  
**Existing Live charges and payments (including Hodan) were not modified.**

**Stop condition:** Wait for explicit approval before any implementation.
