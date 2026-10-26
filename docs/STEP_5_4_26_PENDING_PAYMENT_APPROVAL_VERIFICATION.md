# STEP 5.4.26 — Pending Payment Approval Browser Verification

**Date:** 2026-10-19  
**Builds on:** STEP 5.4.24 / 5.4.25  
**Scope:** Landlords payment-review UI only  
**App:** `http://localhost:5174` (Vite) · remote Supabase via `frontend/.env.local`  
**Hosted SQL / RLS changes:** none  
**Deployments:** none

---

## Verdict

Pending rent payment **reject** and **approve** workflows **PASS** in the browser on disposable smoke fixtures. Payment proof **PASS** after a minimal Landlords UI fix (`View proof` → signed URL). Cross-tenant review **PASS** (UI empty + API RPC denied). No false success on completed rows (approve/reject controls only for `pending`).

---

## Fixtures (disposable only)

| Item | Source |
| --- | --- |
| Landlord A / B, renter A, active assignment | STEP 5.4.25 smoke (`smoke-*-5425`) |
| Pending $15 reject + proof | `scripts/smoke-payments-5426.mjs` |
| Pending $40 approve + proof | `scripts/smoke-payments-5426-approve.mjs` |

No production financial records were targeted. Charge after approve (read-only confirm): `amount_paid=40`, `balance=210`, `status=partial`.

---

## Results

### Approve workflow — **PASS** (browser)

- Opened `/app/landlord/payments?tenant=smoke-ll-a-5425` as Landlord A.
- Pending `$40.00` / ref `SMOKE-5426-approve` shown with Approve/Reject.
- Clicked **Approve** → status badge became **`paid`**; Approve/Reject controls removed for that row.
- DB confirm: charge moved to **partial** (paid 40 / balance 210).

### Reject workflow — **PASS** (browser)

- Pending `$15.00` / ref `SMOKE-5426-reject`.
- Entered reason `SMOKE-5426 unclear proof`, clicked **Reject**.
- Status **`rejected`**; reason displayed; no Approve/Reject controls remaining.

### Payment proof visibility — **PASS** (browser, after fix)

| Before | After |
| --- | --- |
| Path-only monospace text (could not open file) | **View proof** creates a signed URL for `payment-proofs` and opens it |

Evidence: new browser tab titled the PNG object from Supabase storage signed URL (1×1 fixture image). Path still shown for audit.

### Cross-tenant authorization — **PASS**

| Check | Kind | Result |
| --- | --- | --- |
| Landlord B payments UI | Browser | **“No rent payments yet.”** — no A refs / amounts |
| Landlord B `review_rent_payment` on A’s paid/rejected IDs | API (anon client as B) | **`not authorized to review rent payments`**; SELECT of A payment id → `[]` |

### Loading / success / error / status states — **PASS**

| State | Evidence |
| --- | --- |
| Loading / busy | Approve & Reject disabled while RPC in flight; View proof showed **Opening…** |
| Success | Reject → `rejected` + reason; Approve → `paid` |
| Empty | Landlord B review page empty state |
| Error / no false success | Non-pending rows have no Approve/Reject (cannot click success path). Cross-tenant RPC returns error (API). Double-approve UI **NOT TESTED** (controls gone; API covered in 5.4.24) |

---

## Tests / actions executed

1. **Browser** — Landlord A: open review, View proof, Reject, Approve.  
2. **Browser** — Landlord B: payments list isolation.  
3. **Node (API)** — Landlord B RPC deny on A payment IDs.  
4. **Read-only SQL** — charge balance after approve.  
5. **`npm run typecheck`** — PASS after UI change.

API-only suites from 5.4.24 were **not** re-run this step.

---

## Confirmed defect and minimal fix

| ID | Defect | Fix | SQL? |
| --- | --- | --- | --- |
| P1 | Payment review showed `proof_path` text only — landlord could not open proof | `PaymentsReviewPage`: **View proof** → `storage.from('payment-proofs').createSignedUrl(...)` + `window.open` | **No** |

File: `frontend/src/pages/landlord/PaymentsReviewPage.tsx`.

---

## Remaining Landlords blockers / follow-ups

1. Hosted RPC DDL still not mirrored in repo (`list_same_tenant_member_profiles`, etc.).  
2. Optional: inline proof thumbnail vs new-tab only.  
3. Disposable smoke tenants/payments remain for reuse; not production ledgers.

---

## Next highest-priority Landlords task

Export hosted Landlords member-profile / related RPC DDL into the repo as non-`db push` documentation mirrors (hygiene from 5.4.24–5.4.25).
