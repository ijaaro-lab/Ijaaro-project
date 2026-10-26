# RP-1.3 — Rent Payment Review UX & Rejection Reason Implementation Plan

**Date:** 2026-10-21 (updated same day — mandatory rejection reason at UI + RPC)  
**Status:** Planning only — **do not implement until explicit approval.**  
**Surfaces:** Landlord `/app/landlord/payments`, renter `/app/renter/payments`  
**Basis:** Read-only inspection of schema, RPCs, frontend pages, types, and tests.  
**Product decision (confirmed):** A non-empty rejection reason is **mandatory** at both the landlord UI and the trusted `review_rent_payment` RPC. UI validation alone is insufficient.  
**Constraints honored this session:** no application/code/test edits; no migrations created or applied; no DB writes; no approve/reject/upload; no RLS/env/Live/VPS/deploy/push; no RP-1.4.

---

## 1. Objective

Improve landlord payment-review clarity (renter name, property name/image) and ensure rejection reasons are **required at UI and database/RPC layers**, persisted on the existing `rejection_reason` column, visible to the affected renter, and retained in history — with **minimal** UI/query changes, a **minimal** `CREATE OR REPLACE FUNCTION` migration for `review_rent_payment`, and **no** new columns or RLS weakening.

---

## 2. Current behavior (with evidence)

### 2.1 Data model — how a payment connects to renter / property / tenancy / charge

Authoritative migration: `supabase/migrations/20261013000004_phase2_rent_ledger.sql`.

| Entity | Key fields linking the payment |
| --- | --- |
| `rent_payments` | `tenant_id`, `rent_charge_id`, `property_id`, `assignment_id`, `payer_id`, `amount`, `method`, `reference`, `proof_path`, `status`, `rejection_reason`, `submitted_at`, `reviewed_by`, `reviewed_at` |
| `rent_charges` | Same `tenant_id` / `property_id` / `assignment_id`; `renter_id` (must match payer on insert) |
| `rental_assignments` | Tenancy row; payment insert trigger copies ids from charge |
| `properties` | Via `property_id` (`name`, `address_line`, …) |
| `property_photos` | Via `property_id` + `storage_path` (bucket `property-photos`) |
| `profiles` | Via `payer_id` / `renter_id` (`full_name`, `email`) |

Insert trigger `enforce_rent_payment_submit` (same migration):

- Copies `tenant_id`, `property_id`, `assignment_id` from the charge.
- Forces `payer_id = auth.uid()`, `status = 'pending'`, clears review fields / `rejection_reason`.
- Requires payer = charge `renter_id` and `is_assignment_renter(assignment_id)`.
- Rejects amount > charge `balance` and cancelled charges.

Partial unique index (explicitly designed for resubmit):

```sql
-- One open pending submission per charge+payer (rejected history retained; can resubmit)
CREATE UNIQUE INDEX uq_rent_payments_one_pending
  ON public.rent_payments (rent_charge_id, payer_id)
  WHERE status = 'pending';
```

Types mirror the table: `frontend/src/types/database.ts` (`RentPayment`, `RentCharge`, `Property`, `PropertyPhoto`).

### 2.2 Landlord review UI today

File: `frontend/src/pages/landlord/PaymentsReviewPage.tsx`  
Route: `App.tsx` → `landlord/payments`; nav label “Rent review” in `AppShell.tsx`.

**Load:**

```ts
.from("rent_payments").select("*")
.eq("tenant_id", activeMembership.tenant_id)
.order("submitted_at", { ascending: false })
```

**Rendered per card (pending and historical):** amount, method, reference, submitted time, status badge, raw `proof_path` monospace text + “View proof”, rejection reason if present, Approve/Reject only when `status === "pending"` and role allows.

**Not rendered:** renter name, property name, property image.

**Reject reason UI:** placeholder `"Rejection reason (optional)"`; passes `reasons[paymentId] || null` into RPC — empty string becomes null via `||`.

**Approve permission (client gate):** `landlord_admin` or `landlord_staff` with `permissions.approve_rent`. Server gate is `can_approve_rent(tenant_id)` inside `review_rent_payment`.

### 2.3 Renter payment UI today

File: `frontend/src/pages/renter/RenterPaymentsPage.tsx`

**Charges:** `rent_charges` where `renter_id = user.id` and `balance > 0`.  
**History:** `rent_payments` where `payer_id = user.id`, newest first.  
**Submit:** optional proof upload to `payment-proofs` at `{tenant_id}/{assignment_id}/{uuid}.{ext}`, then insert into `rent_payments` (trigger enforces identity/status).  
**Rejection display:** `{p.rejection_reason && <div>Rejected: {p.rejection_reason}</div>}` — only when non-null.  
**Does not show:** method/reference/proof in history list (amount + timestamp + status + reason only).

### 2.4 Proof storage and open path

| Step | Evidence |
| --- | --- |
| Bucket | Private `payment-proofs` (5MB; jpeg/png/webp/pdf) — phase2 rent ledger migration |
| Path shape | `{tenant_id}/{assignment_id}/{payment_or_uuid}.ext` |
| Storage RLS | SELECT: `can_approve_rent` / `can_manage_landlord_ops` on folder[1], or `is_assignment_renter` on folder[2] |
| Landlord open | `createSignedUrl(proof_path, 10 * 60)` then `window.open` |
| UI issue | Full `proof_path` string shown next to the button (matches user observation of long storage id) |

Browser verification of signed-URL open: `docs/STEP_5_4_26_PENDING_PAYMENT_APPROVAL_VERIFICATION.md` (path still shown “for audit” after that fix).

### 2.5 Approve path — status, amounts, charge

RPC: `public.review_rent_payment(p_payment_id, p_decision, p_rejection_reason)` in `20261013000004_phase2_rent_ledger.sql`.

On **approve** (decision must be pending; amount ≤ charge balance):

| Field | Result |
| --- | --- |
| Payment `status` | `'paid'` |
| Payment `reviewed_by` / `reviewed_at` | set |
| Payment `rejection_reason` | cleared to `NULL` |
| Charge `amount_paid` | `round(old + payment.amount, 2)` |
| Charge `balance` | `round(amount_due - amount_paid, 2)` |
| Charge `status` | `'paid'` if balance 0; else `'partial'` if amount_paid > 0; else overdue/due by due_date |
| Audit | `rent.payment_approved` |

Charge financial columns are otherwise protected by `protect_rent_charge_financials` (only internal review path may change them).

Test evidence: `frontend/src/test/rls.rental.test.ts` — “landlord approves payment and updates charge balance” (`amount_paid` 40, `balance` 60; re-approve fails).

### 2.6 Reject path — current `rejection_reason` field and RPC behavior

**Column (existing, keep):** `rent_payments.rejection_reason text` — nullable today; no CHECK constraint requiring non-null on `status = 'rejected'`. Cleared to `NULL` on payment insert (`enforce_rent_payment_submit`) and on approve.

**RPC signature (existing, keep):**

```sql
public.review_rent_payment(
  p_payment_id uuid,
  p_decision text,
  p_rejection_reason text DEFAULT NULL
)
```

On **reject** today (`20261013000004_phase2_rent_ledger.sql`):

| Field | Result |
| --- | --- |
| Payment `status` | `'rejected'` |
| Payment `reviewed_by` / `reviewed_at` | set |
| Payment `rejection_reason` | `NULLIF(trim(COALESCE(p_rejection_reason, '')), '')` — empty / whitespace / omitted → **NULL**; payment still becomes `rejected` |
| Charge | **unchanged** (balance / amount_paid / status untouched) |
| Audit | `rent.payment_rejected` with `rejection_reason` in metadata (may be null) |
| Row retention | No delete policy on `rent_payments` (`USING (false)`); rejected rows remain |

**Gap vs product decision:** RPC and UI both allow reject without a valid reason. Direct clients (edge function `approve-payment`, smoke scripts, PostgREST) can bypass UI. Server-side enforcement is required.

### 2.7 Renter visibility & resubmission

| Question | Finding |
| --- | --- |
| Can renter see rejection reason? | **Yes, when persisted** — history renders `Rejected: {reason}` (`RenterPaymentsPage.tsx`) for the payer’s own rows. Today empty-reason rejects show status only; after dual-layer enforcement, new rejects always persist a non-empty reason for that renter. |
| Can renter resubmit after reject? | **Schema allows it** — unique pending index is partial; rejected rows do not block a new pending insert for same charge+payer. Insert trigger still enforces amount ≤ current balance. |
| Are rejected records kept? | **Yes** — no client delete; landlord/renter SELECT policies still return own/tenant rows. |
| Test coverage of resubmit | **Incomplete** — test titled “rejected payment retains history and allows later resubmit” asserts reject + row still `rejected`, but **does not insert a second payment** (`rls.rental.test.ts` ~491–524). |

Concurrent pending: second pending for same charge+payer fails on `uq_rent_payments_one_pending`.

### 2.8 Tenant isolation (existing)

| Guard | Evidence |
| --- | --- |
| Payment SELECT | Landlord ops of `tenant_id` **or** `payer_id = auth.uid()` |
| Review RPC | `can_approve_rent(v_payment.tenant_id)` |
| Cross-tenant review denied | `rls.rental.test.ts` “landlord B cannot review landlord A payment”; STEP 5.4.26 browser/API |
| Renter A cannot read renter B payment | `rls.rental.test.ts` |
| Profiles not directly readable cross-user | `profiles_select_own_or_admin` — landlords **cannot** `select` other profiles via table RLS |
| Safe renter name source | `list_same_tenant_member_profiles(p_tenant_id)` — SECURITY DEFINER, gated by `can_manage_landlord_ops`, returns only **active** renters on that tenant (`20261020110000_list_same_tenant_member_profiles.sql`) |
| Properties / photos | Tenant membership SELECT; client should still `.eq("tenant_id", …)` as Tenancies pages do |

Proof storage folder[1] = tenant_id; wrong-tenant reviewers lack `can_approve_rent` / ops on that uuid.

### 2.9 Availability of display fields without new columns

| Field | Available today? | How (no new columns / no RLS weaken) |
| --- | --- | --- |
| Renter name | Yes (for active renters) | Same pattern as Tenancies: RPC `list_same_tenant_member_profiles` + map by `payer_id`; labels via `renterLabel` in `frontend/src/lib/tenancyDisplay.ts` |
| Property name | Yes | Tenant-scoped `properties` select `id, name, address_line`; `propertyLabel` |
| Property image | Yes when photos exist | Tenant-scoped `property_photos` for payment `property_id`s; lowest `sort_order`; signed URL from `property-photos` (pattern in `PropertyDetailPage.tsx`) |
| Amount / method / ref / time / status / proof | Already on `rent_payments` | Keep current fields; stop rendering raw `proof_path` as primary text |

**Gap / fallback:** inactive or non-renter memberships are omitted by the RPC → UI should fall back to “Unknown renter” (same as tenancy display). Properties without photos → omit image or show muted placeholder without inventing assets.

---

## 3. Audit checklist answers (1–10)

1. **Linkage:** Payment → charge → assignment/property/renter via FKs + insert trigger; `payer_id` = charge `renter_id`.  
2. **Name / property / image available:** Yes via existing tenant-scoped queries/RPC + photos table (see §2.9).  
3. **Landlord page can show them without new columns / RLS weaken:** Yes — mirror Tenancies enrichment; do not join `profiles` directly.  
4. **Proof:** Stored in private bucket; open via signed URL; replace raw path label with “View proof” (optional secondary short filename only if needed).  
5. **Approve:** payment `paid`; charge `amount_paid`/`balance`/`status` updated as §2.5.  
6. **Reject (today):** payment `rejected`; reason stored only when non-empty after trim; charge unchanged. Reason **not** required by RPC/UI today — **must change** per §4.3 / §4.3.1.  
7. **Renter sees reason:** when non-null (history already renders it); after dual-layer require, every new reject stores a non-empty reason for the payer. Resubmit after reject remains allowed by `uq_rent_payments_one_pending`.  
8. **Rejected history retained:** yes.  
9. **Pending uniqueness:** one pending per `(rent_charge_id, payer_id)`; rejected/paid do not block new pending.  
10. **Cross-tenant exposure risk if joining carelessly:** Direct `profiles` select fails RLS; using RPC + `.eq("tenant_id", activeMembership.tenant_id)` on properties/photos/payments avoids cross-tenant rows. Do not query by bare `property_id`/`payer_id` without tenant filter. Embedding PostgREST joins across tenants is unnecessary and riskier than the established parallel-fetch pattern.

---

## 4. Proposed minimal UI — landlord payment review

Reuse card layout and existing actions; enrich the **header** of each payment card.

### 4.1 Layout (pending and historical)

```
┌─────────────────────────────────────────────────────────────┐
│ [thumb 56×56]  Renter name                                  │
│                Property name (or address fallback)          │
│                $amount · method · ref · submitted           │
│                [View proof]     (no raw storage path)       │
│                                           [status badge]    │
│                Reason: … (rejected rows; required for new)  │
│ ─────────────────────────────────────────────────────────── │
│  [Rejection reason *required] [Approve] [Reject] ← pending  │
└─────────────────────────────────────────────────────────────┘
```

**Fields required in the proposal:**

| Element | Source |
| --- | --- |
| Renter name | `renterLabel(profilesByPayerId[p.payer_id])` |
| Property name | `propertyLabel(propertiesById[p.property_id])` |
| Property image | First photo for `property_id` via signed URL; hide if none / load error |
| Amount, method, reference, submitted time, status | Existing `RentPayment` fields |
| Proof action | Existing `openProof`; label only “View proof” / “Opening…” |
| Rejection reason (display) | Existing `p.rejection_reason` |

Keep permission banner and error banner as today.

### 4.2 Hide raw storage identifiers

- Remove the monospace `{p.proof_path}` span from ordinary UI.  
- Keep `proof_path` in memory for `createSignedUrl` only.  
- Optional (nice-to-have, not required): `aria-label` or title “Open payment proof” without exposing path.  
- Do **not** log full signed URLs or paths into user-visible toasts.

### 4.3 Rejection reason requirements (product — dual-layer, confirmed)

| Rule | Implementation intent |
| --- | --- |
| **UI mandatory** | Landlord cannot submit Reject unless `trim(reasons[id])` is non-empty. Trim before validation. Disable Reject and/or block `review(..., "reject")` with an inline error. Placeholder: “Rejection reason (required)”. |
| **RPC mandatory** | Inside `review_rent_payment`, when `v_decision = 'reject'`, compute `v_reason := NULLIF(trim(COALESCE(p_rejection_reason, '')), '')`. If `v_reason IS NULL`, **RAISE** before updating the payment (payment stays `pending`; charge untouched). On success, store `rejection_reason = v_reason`. |
| Persisted | Existing column `rent_payments.rejection_reason` via existing param `p_rejection_reason` — **no new column**. |
| Visible to correct renter | Renter history already shows `Rejected: {reason}` for rows where `payer_id = auth.uid()`; RLS prevents other renters from reading the payment. After enforcement, every newly rejected row has a non-empty reason. |
| Charge unchanged on reject | Confirmed: reject branch does not UPDATE `rent_charges`; balance / `amount_paid` / status unchanged. |
| Row retained + resubmit | Rejected row kept; `uq_rent_payments_one_pending` allows a new `pending` insert for same charge+payer. |
| Auth / isolation / audit | Preserve `can_approve_rent`, pending-only review, cross-tenant deny, and `_insert_audit_log` for `rent.payment_rejected` (metadata includes the stored reason). |
| Approve | Unchanged: send `p_rejection_reason: null`; RPC clears reason on approve. |

#### 4.3.1 Minimal safe server-side enforcement

**Preserve RPC contract:** Keep the same function name, argument list, defaults, return shape `jsonb_build_object('payment', …, 'charge', …)`, grants (`authenticated` execute; revoke from anon/PUBLIC), and approve branch behavior.

**Minimal reject-branch change (conceptual):**

```sql
-- Before UPDATE … status = 'rejected'
v_reason := NULLIF(trim(COALESCE(p_rejection_reason, '')), '');
IF v_reason IS NULL THEN
  RAISE EXCEPTION 'rejection reason is required'
    USING ERRCODE = '22023';  -- or project-consistent check_violation / custom message
END IF;
-- then SET rejection_reason = v_reason (not NULLIF of raw input again)
```

| Choice | Recommendation |
| --- | --- |
| Signature | Keep `p_rejection_reason text DEFAULT NULL` so approve callers and typed clients need not change |
| Column nullability | Leave `rejection_reason text` nullable (approve clears it; pending rows have null) — do **not** add a table CHECK unless product later wants historical backfill; new rejects are enforced in the RPC |
| CHECK on table | **Not recommended for minimal change** — would fail historical rows that were rejected with null reason, or require a data migration |
| Direct table UPDATE | Already blocked for review fields by `enforce_rent_payment_submit` (clients cannot set status to rejected outside the RPC) |
| Edge function | `supabase/functions/approve-payment` already forwards `rejection_reason`; no signature change; will start receiving RPC errors when reason missing — optional message pass-through only if needed |

**Migration needed:** **Yes** — a new tracked migration that `CREATE OR REPLACE FUNCTION public.review_rent_payment(...)` with the reject-reason guard (and re-asserts existing REVOKE/GRANT). **Do not create or apply that migration in this planning step.** Apply to local first, then Live only under a later approved execution step.

**Not needed:** new RPC name, new columns, RLS changes, storage policy changes.

### 4.4 Approval / rejection balance & status expectations (backend unchanged except reason guard)

| Action | Payment | Charge |
| --- | --- | --- |
| Approve | `paid`; `rejection_reason` cleared | `amount_paid` ↑, `balance` ↓, status paid/partial/(due\|overdue) |
| Reject with valid reason | `rejected` + non-empty trimmed reason | **unchanged** |
| Reject without valid reason | **No update** — RPC error; stays `pending` | **unchanged** |
| Resubmit after successful reject | new `pending` row | unchanged until a later approve |

No charge math changes in this UX work.

### 4.5 Tenant isolation requirements

- Always filter payments/properties/photos by `activeMembership.tenant_id`.  
- Renter names only via `list_same_tenant_member_profiles({ p_tenant_id })` — never open `profiles` for other users.  
- Pass the same tenant id used for the active workspace (query param `?tenant=…` is already resolved by auth membership switching; do not trust client-supplied foreign tenant ids in queries).  
- Signed proof URLs remain short-lived (keep ~10 minutes).  
- Do not add policies or widen SELECT.

---

## 5. Minimal files / functions to change (when approved)

| File | Change |
| --- | --- |
| `frontend/src/pages/landlord/PaymentsReviewPage.tsx` | Parallel-load properties + renter RPC (+ photos); render enriched card; hide `proof_path` text; **trim + require** rejection reason before Reject |
| `frontend/src/lib/tenancyDisplay.ts` | **Reuse** `propertyLabel` / `renterLabel` (prefer reuse; no change unless needed) |
| `frontend/src/pages/landlord/PaymentsReviewPage.test.tsx` | **New** UI tests: enrichment, proof label, reject blocked for empty/whitespace reason, reject allowed with trimmed reason |
| `frontend/src/test/rls.rental.test.ts` | Extend: reject with reason persists + renter can read it; charge balance unchanged; resubmit after reject; **direct RPC reject with null / `''` / whitespace fails** and payment stays pending |
| `frontend/scripts/smoke-payments-5426.mjs` (and similar) | Ensure any reject fixture passes a non-empty `p_rejection_reason` (already does for some paths; audit on implement) |
| `supabase/migrations/<new>_review_rent_payment_require_rejection_reason.sql` | **New migration (create only when implementing):** `CREATE OR REPLACE FUNCTION public.review_rent_payment` with reject-reason guard; re-GRANT/REVOKE. **Not created in this planning update.** |
| `frontend/src/pages/renter/RenterPaymentsPage.tsx` | **No change required** for mandatory reason (already displays stored reason) |
| RLS / storage / new columns | **None** |
| Utility `review_utility_payment` | Out of scope unless product expands the same rule later |

**Not in scope yet:** applying the migration to Live, edge-function rewrites, RP-1.4, backfilling historical null-reason rejects.

---

## 6. Regression tests to add / extend

| Case | Layer | Assertion |
| --- | --- | --- |
| Approve | Existing RLS + optional UI | Payment `paid`; charge amounts/status updated; controls gone for that id |
| Reject with valid reason | RLS + UI | Status `rejected`; `rejection_reason` equals **trimmed** text; charge `amount_paid`/`balance`/`status` unchanged vs pre-reject snapshot |
| UI — empty reason | UI | Reject does **not** call RPC (input `""`) |
| UI — whitespace-only reason | UI | Reject does **not** call RPC (e.g. `"   "`); trim before validate |
| UI — missing / unset reason | UI | Reject does **not** call RPC when `reasons[id]` is undefined |
| RPC — null reason | Direct `review_rent_payment` | `p_decision: "reject"`, `p_rejection_reason: null` → error; payment remains `pending`; charge unchanged |
| RPC — empty string | Direct RPC | `p_rejection_reason: ""` → error; stays pending |
| RPC — whitespace-only | Direct RPC | `p_rejection_reason: "  \t  "` → error; stays pending |
| RPC — omitted param | Direct RPC | Call with only payment id + `"reject"` (default null) → error; stays pending |
| Renter visibility | RLS / read after reject | Payer SELECT sees `rejection_reason`; other renter SELECT returns empty for that id |
| Resubmit after rejection | RLS (**gap today**) | After successful reject, second pending insert for same charge succeeds; old row remains `rejected` with reason |
| Proof access | UI | Signed URL uses stored path; UI does not render path string |
| Tenant isolation | Existing + UI | Landlord B empty list / RPC deny; tenant-scoped queries + RPC `p_tenant_id` |
| Audit | Optional read | `rent.payment_rejected` audit payload includes non-null reason after successful reject |

Suggested local commands after implementation (not run in this planning session):

```bash
npx vitest run src/pages/landlord/PaymentsReviewPage.test.tsx src/lib/tenancyDisplay.test.ts
npx vitest run src/test/rls.rental.test.ts   # isolated local only — after migration applied locally
npm run typecheck
```

---

## 7. Risks, dependencies, verification

### Risks

| Risk | Mitigation |
| --- | --- |
| Inactive renter → “Unknown renter” | Acceptable fallback; same as Tenancies |
| Many photos → N signed URL calls | Load one photo per distinct `property_id` (min `sort_order`); lazy-sign in a small thumb component |
| RPC require breaks callers that reject without reason | Update smoke scripts / any cleanup that uses empty reason; edge function already accepts optional reason — callers must supply it on reject |
| Historical rejected rows with `rejection_reason IS NULL` | Leave as-is (no backfill required for RPC guard); UI still shows status `rejected` without a reason line |
| Applying migration only to one env | Local apply + Vitest first; Live apply only in an approved migration execution step |
| Embedding FK joins leak / fail under RLS | Prefer Tenancies-style parallel maps |
| Scope creep into utility `review_utility_payment` | Keep rent-only unless product expands |
| CHECK constraint on table vs historical nulls | Prefer RPC-only enforcement; avoid table CHECK without backfill |

### Dependencies

- Existing `list_same_tenant_member_profiles` on target env.  
- **New migration** replacing `review_rent_payment` body must be applied to the env under test before RLS tests for missing-reason can pass.  
- Property photos optional; UX must tolerate zero photos.  
- Active landlord membership with ops role for name RPC.

### Safe verification steps (post-approval implementation)

1. Local or Live **read-only** browse of existing pending Hodan fixture: confirm names/image/proof without approving/rejecting.  
2. Apply new RPC migration to **isolated local** only first; run Vitest reject/approve/resubmit suites.  
3. Disposable smoke tenant for UI reject-with-reason + confirm renter history — never production Hodan money rows unless product explicitly requests.  
4. Attempt Reject with empty/whitespace in UI (blocked); attempt direct RPC without reason (error, still pending).  
5. As Landlord B, confirm empty/isolated review list.  
6. Confirm charge balance/`amount_paid` unchanged after reject; resubmit creates a new pending row.  
7. Confirm raw `proof_path` not visible in ordinary UI.

---

## 8. Gaps not fully confirmable from repository alone

| Gap | Notes |
| --- | --- |
| Live Hodan pending row’s actual `payer_id` / property photo presence | UI observations confirm pending $260 / ref `1234`; DB row contents not queried this session. |
| Whether Live already has `list_same_tenant_member_profiles` | Migration exists in repo; Tenancies UI already depends on it — assume present where Tenancies names work. |
| Full resubmit behavior under Live constraints | Schema + comments support it; Vitest title claims it but does not execute second insert. |
| Browser pixel layout for property thumb | Design proposed; not implemented. |
| Count of historical Live rejects with null reason | Not queried; RPC guard does not rewrite them. |
| Exact exception `ERRCODE` / message string for missing reason | Choose during implementation to match project style; tests should assert error truthy + payment still pending. |

**Resolved by product decision:** RPC-level required reason is **in scope** (no longer optional).

Claims of “verified in browser” for approve/reject/proof refer to prior docs (`STEP_5_4_26_…`) and code paths above — **not** re-verified in this planning session.

---

## 9. Stop / wait

This planning update only modified `docs/RP-1.3_RENT_PAYMENT_REVIEW_UX_IMPLEMENTATION_PLAN.md`.

**Confirmation:** No application code, tests, migrations (none created), database records, RLS, permissions, environment settings, Supabase configuration, VPS, or Git remotes were changed.

**Next step:** Await explicit approval before implementing UI enrichment, UI reason validation, the `review_rent_payment` replacement migration, and regression tests (§4–§6).
