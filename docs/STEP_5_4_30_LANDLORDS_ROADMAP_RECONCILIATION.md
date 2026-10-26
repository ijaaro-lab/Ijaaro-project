# STEP 5.4.30 — Landlords Roadmap Reconciliation

**Date:** 2026-10-19  
**Scope:** Landlords module status only (documentation / roadmap reconciliation)  
**Authoritative roadmap:** `PROJECT_ROADMAP.md` (Phase 2 + Prompt 02 rent items + marketplace STEPS 5.4.18–5.4.21)  
**Requirements source:** `BRD-1.md` FR-006–016 (Landlords-relevant); FR-010 acceptance as used in STEP 5.4.28  
**Prior status document:** `docs/STEP_5_4_27_LANDLORDS_FINAL_GAP_REVIEW.md` (superseded for *current* status by this report)  
**Code / schema / deploy this step:** none

---

## Verdict

**Landlords under the approved roadmap: INCOMPLETE**

Core rental operations, FR-010 invite UI, browser move-out, and payment-review paths are implemented and verified through STEP 5.4.29. The approved Phase 2 Landlords track is **not** complete while marketplace field-isolation live cutover remains **BLOCKED / PENDING** explicit live approval (STEPS 5.4.18–5.4.21).

---

## 1. Sources reconciled

| Document | Role |
| --- | --- |
| `PROJECT_ROADMAP.md` | Authoritative approved Landlords / Phase 2 roadmap (updated this step) |
| `BRD-1.md` FR-010 | Invite + assign acceptance (“only authorized landlord assigns…; assignment fields persisted”) |
| `docs/STEP_5_4_24_LANDLORDS_WORKFLOW_VERIFICATION.md` | API/RLS verification |
| `docs/STEP_5_4_25_LANDLORDS_BROWSER_SMOKE_TEST.md` | Browser property / assign smoke |
| `docs/STEP_5_4_26_PENDING_PAYMENT_APPROVAL_VERIFICATION.md` | Browser payment approve/reject + proof |
| `docs/STEP_5_4_27_LANDLORDS_FINAL_GAP_REVIEW.md` | Pre–5.4.28 gap baseline (G1–G4) |
| `docs/STEP_5_4_28_LANDLORD_RENTER_INVITE_UI.md` | FR-010 invite UI |
| `docs/STEP_5_4_29_LANDLORDS_MOVE_OUT_BROWSER_VERIFICATION.md` | Browser move-out + double-submit fix |

No new features were implemented in this step. Marketplace cutover was **not** executed.

---

## 2. Roadmap items — before vs after reconciliation

Statuses: **COMPLETE** · **INCOMPLETE** · **BLOCKED** · **NOT VERIFIED** · **HYGIENE** · **DEFERRED (Phase 5+)**

### 2.1 Phase 2 — Rental property & tenancy

| Requirement | Before (STEP 5.4.27) | After (through 5.4.29) | Evidence |
| --- | --- | --- | --- |
| Property CRUD (publish/update) | COMPLETE | **COMPLETE** | API 5.4.24; browser 5.4.25 |
| Property photos (private storage) | COMPLETE | **COMPLETE** | API 5.4.24; browser 5.4.25 |
| Status Available / Occupied / Vacant | COMPLETE | **COMPLETE** | Assign→occupied (5.4.24/25); move-out→available API + browser (5.4.24, 5.4.29) |
| Assign renter (authorized only) | COMPLETE | **COMPLETE** | API 5.4.24; browser 5.4.25 |
| Max one active assignment / FR-012 | COMPLETE | **COMPLETE** | API 5.4.24 |
| Move-out → Available; history retained (FR-011) | COMPLETE (API) / **NOT VERIFIED** (browser) | **COMPLETE** (API + browser) | API 5.4.24; browser 5.4.29 |
| Move-out double-submit prevention | *(defect found in 5.4.29)* | **COMPLETE** | Client `movingOut` guard + unit tests (5.4.29) |
| Invite renter onto landlord tenant (FR-010 UI) | **INCOMPLETE** (G2) | **COMPLETE** | 5.4.28 UI + unit/RLS invite tests; assign remains separate |
| Landlord dashboard (tenant-scoped core) | COMPLETE (core) | **COMPLETE** (core) | 5.4.25; invite shortcut added 5.4.28 |
| Dashboard due/overdue + reports depth (FR-013 / FR-032) | INCOMPLETE | **INCOMPLETE** — **DEFERRED Phase 5** per prior gap review | Not required to close Prompt 02 core ops; reports remain Phase 5 |
| Renter browse Available (FR-008) | COMPLETE (current live path) | **COMPLETE** (current live path) | Pre-isolation SELECT still live; cutover not applied |
| Conflicting assignment prevention | COMPLETE | **COMPLETE** | 5.4.24 |

### 2.2 Marketplace field isolation (roadmap STEPS 5.4.18–5.4.21)

| Requirement | Before | After | Evidence |
| --- | --- | --- | --- |
| Local implementation + review + cutover plan | COMPLETE | **COMPLETE** | Roadmap [x]; STEPS 5.4.18–5.4.21 docs |
| Explicit live approval + execute cutover | **BLOCKED** (G1) | **BLOCKED / PENDING** | No approval; not executed this step |
| Post-deploy smoke | **BLOCKED** | **BLOCKED** | Depends on cutover |
| Hygiene: export hosted-only member-profile RPCs | INCOMPLETE (non-blocking) | **HYGIENE** (non-blocking) | Runtime OK; DDL not in repo migrations |
| Marketplace photos | Deferred | **DEFERRED** | Roadmap explicitly deferred |

### 2.3 Prompt 02 / rent ledger (Landlords-facing)

| Requirement | Before | After | Evidence |
| --- | --- | --- | --- |
| `rent_charges` + create charge | COMPLETE | **COMPLETE** | API 5.4.24; browser screens 5.4.25 |
| Manual `rent_payments` Pending → Approve/Reject | COMPLETE | **COMPLETE** | API 5.4.24; browser 5.4.26 |
| Payment proof upload + landlord access | COMPLETE | **COMPLETE** | API storage 5.4.24; browser View proof 5.4.26 |
| Isolation (cross-tenant rent review / property ops) | COMPLETE | **COMPLETE** | 5.4.24 / 5.4.25 / 5.4.26 / 5.4.29 |
| API payment provider (OQ-02) | Out of Landlords v1 | Unchanged — deferred | Not a Landlords core gap |

### 2.4 Gap IDs from STEP 5.4.27

| ID | Before | After |
| --- | --- | --- |
| **G1** Marketplace cutover not on hosted | BLOCKED | **BLOCKED / PENDING** separate approval |
| **G2** Landlord renter-invite UI (FR-010) | INCOMPLETE | **COMPLETE** (5.4.28) |
| **G3** Browser move-out | NOT VERIFIED | **COMPLETE** (5.4.29) |
| **G4** Hosted RPC DDL missing from repo | Hygiene | **HYGIENE** (non-blocking) |

---

## 3. Verified completed requirements (with report references)

| Area | What was verified | Kind | Reports |
| --- | --- | --- | --- |
| Properties / photos | Create, edit, upload, signed display; cross-tenant edit/photo deny | API + browser | 5.4.24, 5.4.25 |
| Assignment | Picker RPC, assign, conflict reject, unauthorized deny | API + browser | 5.4.24, 5.4.25 |
| Charges | Create charge on active assignment; unauthorized deny | API (+ UI screens) | 5.4.24, 5.4.25 |
| Payment approval/rejection | Approve/reject pending; View proof; no false success on non-pending; B cannot review A | API + browser | 5.4.24, 5.4.26 |
| Tenant isolation | Cross-tenant property/assignment/charge/payment/move-out denials; membership switcher own-rows | API + browser | 5.4.24–5.4.26, 5.4.29 |
| FR-010 invite UI | Landlord admin invite via `manage_membership`; own-tenant OK; cross-tenant deny; staff cannot submit | UI + unit + RLS | 5.4.28 |
| FR-011 move-out (browser) | Complete move-out → available; history retained; open charges kept; no auto-relist; cross-tenant deny | Browser (+ API support) | 5.4.29 (API prior: 5.4.24) |
| Double-submit prevention | In-flight disable; single RPC; error path without false-only success | Browser + unit | 5.4.29 |

**Evidence distinction preserved**

- **API/RLS:** primary proof in 5.4.24 (and invite RPC cases in 5.4.28; move-out cross-tenant RPC in 5.4.29).
- **Browser:** 5.4.25 (CRUD/assign), 5.4.26 (approve/reject/proof), 5.4.29 (move-out).
- **Not one continuous browser session:** program DoD rental e2e is marked satisfied by **chained** disposable-fixture browser evidence across 5.4.25 → 5.4.26 → 5.4.29, not a single uninterrupted UI run.

---

## 4. Remaining incomplete, blocked, and unverified

### Blocks Landlords Phase 2 track completion

| Item | Status | Notes |
| --- | --- | --- |
| Marketplace field-isolation **live cutover** + post-deploy smoke | **BLOCKED / PENDING** | Awaits explicit human approval; plan at `docs/STEP_5.4.21_MARKETPLACE_CUTOVER_PLAN.md`. Must not be executed or claimed complete without that approval. Live still uses interim listed+available `properties` SELECT (audit M1). |

### Non-blocking / hygiene

| Item | Status | Notes |
| --- | --- | --- |
| Hosted `list_same_tenant_member_profiles` / `list_company_member_profiles` DDL not in repo migrations | **HYGIENE** | Runtime OK for Landlords; rebuild/drift risk only. Not treated as a functional Landlords workflow blocker. |
| Repo vs hosted migration ID mismatch / orphan migration notes | **HYGIENE** | Process risk if someone runs blind `db push` (`db push` remains forbidden). |

### Deferred (approved Phase 5+ / out of Landlords core close)

| Item | Status | Notes |
| --- | --- | --- |
| FR-013 due/overdue ledger summary + landlord reports (FR-032 depth) | **DEFERRED Phase 5** | Core tenant-scoped dashboard ops verified; reporting depth remains Phase 5 per 5.4.27. |
| Maintenance (FR-029–030), notifications (FR-031), Flutter (FR-036) | Phase 5+ | Explicitly out of Landlords Phase 2 / Prompt 02 close. |
| Marketplace photos | Deferred | Roadmap deferred. |
| Landlord email lookup for invite | Product follow-up | Invite works via Account User ID (5.4.28); widening `lookup_profile_by_email` needs separate approval. |
| FR-010 “expresses interest” capture | External / contact links | Not a separate backend feature; out of invite-UI scope (5.4.28). |

### Unverified (none remaining for prior High/Medium Landlords gaps)

| Item | Status |
| --- | --- |
| Browser move-out (former G3) | Closed — **COMPLETE** (5.4.29) |
| Browser payment approve/reject | Closed — **COMPLETE** (5.4.26) |

Optional UX (inline proof thumbnail, move-out confirmation dialog) remains optional — not required by FR-011 / FR-016.

---

## 5. Landlords COMPLETE or INCOMPLETE?

| Question | Answer |
| --- | --- |
| Are core Landlords workflows implemented and verified (API + browser)? | **Yes** — properties, photos, invite, assign, charges, payment review, move-out, isolation. |
| Is the **approved Landlords Phase 2 roadmap track** complete? | **No** — marketplace field-isolation cutover still **BLOCKED / PENDING** approval. |
| Module / track status for planning | **INCOMPLETE** |

Do **not** claim full Landlords completion from STEPS 5.4.24–5.4.29 alone.

---

## 6. Single next required Landlords task

**Obtain explicit live approval, then execute** `docs/STEP_5.4.21_MARKETPLACE_CUTOVER_PLAN.md` (manual SQL → frontend in one window; **no** `supabase db push`), followed by the plan’s post-deploy smoke.

Until that approval exists, leave cutover **BLOCKED / PENDING**. Do not treat hygiene RPC export or Phase 5 reporting as a substitute for this task.

---

## 7. Updates made this step (docs only)

| File | Change |
| --- | --- |
| `PROJECT_ROADMAP.md` | Landlords verification checklist through 5.4.29; marketplace cutover marked BLOCKED/PENDING; status/verdict/next-action aligned; rental e2e DoD noted as chained browser evidence |
| `docs/STEP_5_4_27_LANDLORDS_FINAL_GAP_REVIEW.md` | Supersession banner → this report (G2/G3 closed later; G1 still blocked) |
| `docs/STEP_5_4_30_LANDLORDS_ROADMAP_RECONCILIATION.md` | This reconciliation |

**Not done (by design):** application code, live schema/RLS, `db push`, Marketplace cutover, GitHub push, Vercel/VPS deploy.

---

## 8. Confirmation

- Landlords-only documentation reconciliation.
- No competing roadmap created; `PROJECT_ROADMAP.md` remains authoritative.
- Marketplace cutover remains **BLOCKED / PENDING** separate approval.
- Hosted RPC / migration-history discrepancies recorded as **hygiene**, not Landlords workflow blockers.
- Stopped after producing this report.
