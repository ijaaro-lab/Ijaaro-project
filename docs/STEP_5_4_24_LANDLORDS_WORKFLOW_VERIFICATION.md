# STEP 5.4.24 — Landlords Core Workflow Verification

**Date:** 2026-10-19  
**Scope:** Landlords module only  
**Hosted Supabase mutations this step:** none  
**Deployments:** none (no GitHub push, Vercel, or VPS)

---

## Verdict

Landlords core workflows are verified **PASS** against the configured remote Supabase project via disposable Vitest fixtures (`frontend/src/test/rls.rental.test.ts`: **21/21 PASS**). Typecheck and production build **PASS**.

One high-impact Landlords UI defect (assign-renter picker using blocked `profiles` SELECT) was already fixed in-session by calling hosted `list_same_tenant_member_profiles`; this step confirmed that RPC and wired coverage in tests.

Browser click-through E2E was **NOT TESTED** (no interactive UI session in this step).

---

## Method

1. Inspected landlord pages (`PropertyFormPage`, `PropertyDetailPage`, `TenancyDetailPage`, `PaymentsReviewPage`) and existing rental RLS suite.
2. Extended `rls.rental.test.ts` with Landlords-focused cases (create/edit, photos, assign picker RPC, charges, proofs, cross-tenant denials).
3. Ran tests against `frontend/.env.local` (remote project). Suite creates/uses disposable `*.ijaaro.test` users and tenants only — no edits to unrelated production business records by hand.
4. Ran `npm run typecheck` and `npm run build`.
5. No `supabase db push`, no migration replay, no shared RLS weakening.

---

## Workflow results

| Workflow | Result | Evidence |
| --- | --- | --- |
| 1 — Properties | **PASS** | Automated + code review (see below) |
| 2 — Assign / move-out | **PASS** | Automated + UI wiring review |
| 3 — Rent charges / payments | **PASS** | Automated (proof storage included) |
| 4 — Tenant isolation | **PASS** | Automated cross-tenant denials |

### Workflow 1 — Properties

| Check | Result | Evidence |
| --- | --- | --- |
| Create property (landlord client) | **PASS** | `landlord A can create and edit own-tenant property` |
| Edit property (own tenant) | **PASS** | same test; UI uses `.eq("tenant_id", …).select().maybeSingle()` and errors if zero rows (`PropertyFormPage`) |
| Ownership / tenant scoping | **PASS** | insert requires `can_manage_landlord_ops`; edit filters by active tenant |
| Property details load | **PASS** (API) | suite reads own property after create; UI `PropertyDetailPage` loads via RLS `select` |
| Photo upload / signed URL | **PASS** | `landlord A can upload and read own property photo object` |
| Cross-tenant photo upload denied | **PASS** | `landlord B cannot upload photo under landlord A property path` |
| Cross-tenant update rejected (no false success) | **PASS** | `landlord A cannot update landlord B property` (0 rows); UI shows unauthorized if `!updated` |
| Browser UI create/edit/photos | **NOT TESTED** | no interactive browser session |

### Workflow 2 — Renter assignment and move-out

| Check | Result | Evidence |
| --- | --- | --- |
| Assign picker uses `list_same_tenant_member_profiles` | **PASS** | `PropertyDetailPage.tsx` calls RPC; typecheck clean |
| Only active renters on active tenant | **PASS** | `list_same_tenant_member_profiles returns only active renters…` (includes rA/rB, excludes landlord admin role) |
| Cross-tenant picker denied | **PASS** | `landlord B cannot list landlord A renters via list_same_tenant_member_profiles` |
| `assign_renter` succeeds + integrity | **PASS** | creates assignment + initial charge; second active assign fails |
| Unauthorized assign denied | **PASS** | `landlord B cannot assign_renter on landlord A property`; direct table insert blocked |
| `complete_move_out` per existing rules | **PASS** | property → `available`, `current_renter_id` null; charge history retained (billing/listing behavior **unchanged**) |
| Unauthorized move-out denied | **PASS** | `landlord B cannot complete_move_out on landlord A assignment` |

### Workflow 3 — Rent charges and payments

| Check | Result | Evidence |
| --- | --- | --- |
| Create rent charge | **PASS** | `create_rent_charge works for landlord on active assignment` |
| Unauthorized charge create | **PASS** | `landlord B cannot create_rent_charge…` |
| Payment record (pending) | **PASS** | renter insert + approve/reject flows |
| Proof upload (payment-proofs) | **PASS** | `renter can upload rent payment proof; landlord B cannot` + landlord A signed URL |
| Authorized review | **PASS** | approve updates charge paid/balance; reject retains history; double-approve fails |
| Unauthorized review | **PASS** | renter cannot approve; landlord B cannot review A’s payment |
| Real money / mutating prod ledgers | **N/A** | disposable fixture payments only |

### Workflow 4 — Tenant isolation

| Check | Result | Evidence |
| --- | --- | --- |
| A cannot read B private property | **PASS** | `landlord A cannot read landlord B private property` |
| A cannot update B property | **PASS** | update returns 0 rows |
| B cannot assign / charge / move-out / review A | **PASS** | dedicated denial tests |
| Renter B cannot read renter A payment | **PASS** | existing isolation case |
| Personal data exposure in report | **PASS** | no PII dumped; fixture emails only in test process |

---

## Tests executed

```text
cd frontend
npm test -- src/test/rls.rental.test.ts
# → Test Files 1 passed | Tests 21 passed

npm run typecheck   # PASS (after annotating RPC map callback)
npm run build       # PASS
```

**Environment:** remote Supabase via `VITE_SUPABASE_URL` / anon / service role in `frontend/.env.local`.

**Suite note:** The prior marketplace-RPC browse assertion was removed from this Landlords-focused suite so verification does not depend on undeployed marketplace cutover (`list_marketplace_listings` is not required for Landlords). Marketplace remains out of scope for this step.

---

## Defects found and fixes

| ID | Defect | Severity | Fix | Live SQL? |
| --- | --- | --- | --- | --- |
| L1 | Assign-renter UI queried `profiles` directly; RLS is own-row only → empty picker | High | Call hosted `list_same_tenant_member_profiles` in `PropertyDetailPage`; add Database type; explicit map typing for `tsc` | **No** (RPC already lived) |
| — | Gaps in automated Landlords coverage (create/edit, photos, picker RPC, proofs, cross-tenant RPC denials) | Test hygiene | Extended `rls.rental.test.ts` | **No** |

No other confirmed high-impact Landlords product defects requiring code or SQL changes were found in this step.

---

## Live Supabase changes

**None** this step.

Read-only confirmation that Landlords RPCs/buckets used by tests exist and behave as exercised by the suite.

---

## Remaining Landlords blockers / gaps

1. **Browser E2E not run** — automated API/RLS PASS does not replace a manual UI smoke of create → photo → assign → charge → review → move-out.
2. **`list_same_tenant_member_profiles` DDL not in repo migrations** — hosted-only (same class as `list_company_member_profiles`). Runtime OK; repo hygiene still open.
3. **Move-out billing / re-list behavior** — intentionally unchanged (`is_listed` not forced true; open charges not auto-cancelled). No Landlords requirement proved this incorrect.
4. **Landlord payment review UI** shows `proof_path` text only (no signed-url open). Storage access for landlords **PASS**es in tests; richer UI is optional product work, not a confirmed blocker.

---

## Next highest-priority Landlords task

**Capture hosted Landlords member-profile RPCs into the repo as non-`db push` mirrors** (`list_same_tenant_member_profiles`, and hygiene for `list_company_member_profiles`), then optional short browser smoke of the landlord property → assign → payment-review path on a disposable tenant.

Do **not** conflate with marketplace isolation cutover (STEP 5.4.21) unless product prioritizes that separately.
