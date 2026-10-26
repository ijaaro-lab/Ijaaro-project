# STEP 5.4.27 — Landlords Final Gap Review

> **Superseded for current Landlords status:** After STEPS 5.4.28–5.4.29, use `docs/STEP_5_4_30_LANDLORDS_ROADMAP_RECONCILIATION.md` and the Landlords sections of `PROJECT_ROADMAP.md`. This document remains the gap review as of STEP 5.4.26 evidence only. **G2** (invite UI) and **G3** (browser move-out) were closed later; **G1** (marketplace cutover) remains **BLOCKED**.

**Date:** 2026-10-19  
**Scope:** Landlords module only  
**Primary roadmap source:** `PROJECT_ROADMAP.md` (Phase 2 + Prompt 02 rent items; Phase 2 marketplace cutover STEPS 5.4.18–5.4.21)  
**Requirements source:** `BRD-1.md` FR-006–016, FR-034 (Landlords-relevant); BR-003 / BR-004  
**Evidence sources:** `docs/STEP_5_4_24_*`, `STEP_5_4_25_*`, `STEP_5_4_26_*`; `SECURITY_AUDIT_REPORT.md`; `TENANT_ISOLATION_MATRIX.md`; `docs/STEP_5.4.19`–`5.4.21`; landlord pages under `frontend/src/pages/landlord/`  
**Live SQL / deploys this step:** none  
**Code changes this step:** none

---

## Verdict

**INCOMPLETE** *(as of this step — see STEP 5.4.30 for post–5.4.29 reconciliation)*

Core Landlords rental ops (property CRUD/photos, assign, charges, manual rent approve/reject, isolation) are implemented and verified by API + browser evidence through STEP 5.4.26. The approved Phase 2 Landlords track is **not** finished until marketplace field-isolation cutover is explicitly approved and executed, and FR-010’s landlord-side **invite** path remains without a landlord UI (assign-only if a renter membership already exists).

---

## 1. Approved Landlords checklist

Statuses: **COMPLETE** · **INCOMPLETE** · **BLOCKED** · **NOT VERIFIED**

### 1.1 Phase 2 — Rental property & tenancy (`PROJECT_ROADMAP` §Phase 2 + BRD FR-006–013)

| Requirement | Status | Evidence |
| --- | --- | --- |
| Property CRUD (publish/update) | **COMPLETE** | Roadmap exit [x]; 5.4.24 API; 5.4.25 browser create/edit |
| Property photos (private storage) | **COMPLETE** | 5.4.24 storage tests; 5.4.25 display + upload |
| Status Available / Occupied / Vacant | **COMPLETE** | Schema + occupancy RPCs; assign→occupied; move-out→available (API) |
| Assign renter (authorized only) | **COMPLETE** | 5.4.24 RPC + integrity; 5.4.25 browser assign + picker via `list_same_tenant_member_profiles` |
| Max one active assignment / conflict reject | **COMPLETE** | 5.4.24 |
| Move-out → Available; history retained | **COMPLETE** (API) / **NOT VERIFIED** (browser) | 5.4.24 `complete_move_out`; UI button exists; browser smoke did not click move-out |
| Landlord dashboard (tenant-scoped) | **COMPLETE** (core) | Properties / available / occupied / tenancies / pending payments (5.4.25) |
| Dashboard “rent due/overdue + reports” (FR-013 / FR-032 depth) | **INCOMPLETE** | No due/overdue ledger summary or landlord reports UI (reports are Phase 5) |
| Invite renter onto landlord tenant (FR-010) | **INCOMPLETE** | Assign UI requires existing `renter` membership; copy says invite first; **no** landlord `manage_membership` / invite screen (admin-only today) |
| Renter browse/filter Available listings (FR-008) | **COMPLETE** (current live path) | Pre-isolation table SELECT still live; marketplace RPC cutover **not** applied |
| Conflicting assignment prevention (FR-012) | **COMPLETE** | 5.4.24 |

### 1.2 Phase 2 — Marketplace field isolation (roadmap Landlords STEPS 5.4.18–5.4.21)

| Requirement | Status | Evidence |
| --- | --- | --- |
| Local implementation | **COMPLETE** | Roadmap [x]; migration file in repo |
| Migration review + history reconciliation + cutover plan | **COMPLETE** | STEPS 5.4.19–5.4.21 docs |
| Explicit live approval + execute cutover | **BLOCKED** | Awaits human approval; no `db push`; hosted has **no** `list_marketplace_*` / marketplace migration |
| Post-deploy smoke | **BLOCKED** | Depends on cutover |
| Hygiene: export hosted-only RPCs | **INCOMPLETE** (non-blocking runtime) | `list_same_tenant_member_profiles` / `list_company_member_profiles` live but absent from repo migrations |
| Marketplace photos deferred | **NOT VERIFIED** / deferred | Roadmap explicitly deferred |

### 1.3 Prompt 02 / Phase 3 rent ledger (Landlords-facing only)

| Requirement | Status | Evidence |
| --- | --- | --- |
| `rent_charges` + create charge | **COMPLETE** | 5.4.24 API; 5.4.25 tenancy UI |
| Manual `rent_payments` Pending → Approve/Reject | **COMPLETE** | 5.4.24 API; 5.4.26 browser approve + reject |
| Payment proof upload (renter) + landlord access | **COMPLETE** | 5.4.24 storage; 5.4.26 **View proof** signed URL |
| Isolation: landlord cannot approve utility; cross-tenant rent review denied | **COMPLETE** | Security audit + 5.4.24/26; utility boundary out of this module but rent side verified |
| API payment provider (OQ-02) | Out of Landlords v1 manual path | Deferred — not a Landlords core gap |

### 1.4 Security / isolation (Landlords)

| Requirement | Status | Evidence |
| --- | --- | --- |
| Cross-tenant property/assignment/charge/payment denial | **COMPLETE** | 5.4.24 suite; 5.4.25 foreign edit; 5.4.26 B empty + RPC deny |
| Assign picker not using blocked `profiles` SELECT | **COMPLETE** | Fixed → RPC (5.4.24) |
| Membership switcher only own rows | **COMPLETE** | AuthProvider filter (5.4.25) |
| Listed+available full-row marketplace SELECT | **INCOMPLETE** vs isolation hardening | Accepted interim (audit M1); cutover plan ready, **not live** |

### 1.5 Explicitly out of this Landlords “core module” completion (Phase 5+)

| Item | Status for Landlords core | Notes |
| --- | --- | --- |
| Maintenance requests (FR-029–030) | Phase 5 — not required to close Phase 2/Prompt 02 Landlords | Separate track |
| Landlord reports suite (FR-032) | Phase 5 | Dashboard is v1 ops only |
| Notifications (FR-031) | Phase 5 / OQ-09 | Optional Should Have |
| Flutter (FR-036) | Phase 5 Should Have | Out of scope |

---

## 2. Evidence reused (not re-run)

| Step | What it proved |
| --- | --- |
| **5.4.24** | `rls.rental.test.ts` 21/21 PASS; properties, assign, charges, payments, proofs, isolation; typecheck/build |
| **5.4.25** | Browser: sign-in, list/detail, create/edit, photos, assign picker, charges/payments screens, cross-tenant edit deny; AuthProvider membership fix |
| **5.4.26** | Browser reject + approve; View proof; B cannot see/review A payments |
| **Security audit** | H2–H4 remediations affecting landlord inventory/proofs implemented historically |
| **5.4.21** | Marketplace cutover ready for **explicit** live approval only |

This step did **not** re-execute those suites.

---

## 3. Remaining confirmed gaps (ranked)

### High (blocks “Landlords Phase 2 / roadmap complete”)

| ID | Gap | Type | Notes |
| --- | --- | --- | --- |
| **G1** | Marketplace field-isolation **not applied** on hosted | Roadmap **BLOCKED** on approval | Live still allows authenticated `properties` SELECT for listed+available (audit M1). Cutover SQL + frontend exist; execution forbidden without explicit approval. Affects privacy of landlord listing fields and renter browse path. |
| **G2** | No landlord UI to **invite / upsert renter memberships** | **INCOMPLETE** FR-010 | Assign works only for existing renters; Super Admin / SQL / scripts used in tests. Backend `manage_membership` exists. |

### Medium

| ID | Gap | Type | Notes |
| --- | --- | --- | --- |
| **G3** | Browser **move-out** not exercised | **NOT VERIFIED** | API PASS; UI present. Residual risk low; still open for program DoD “rental e2e … move-out”. |
| **G4** | Hosted RPC DDL not in repo (`list_same_tenant_member_profiles`, `list_company_member_profiles`) | Hygiene | **Runtime OK** for Landlords; not a functional blocker. Risk is rebuild/drift, not live ops. |

### Low / product decisions (not defects)

| ID | Item | Classification |
| --- | --- | --- |
| **O1** | Move-out does not cancel open charges / force re-list (`is_listed`) | Product / **OQ-08** — not proven wrong vs requirements |
| **O2** | Inline proof thumbnail vs new-tab | Optional UX |
| **O3** | Landlord staff permission matrix UI | Role exists; no dedicated staff admin UI — enhancement unless product requires it for v1 |
| **O4** | Dashboard due/overdue reports | Phase 5 reporting |

---

## 4. Minimal fixes this step

**None.** No new confirmed high-impact defect was found that was small, reversible, and unfixed. Prior fixes (assign RPC, membership filter, View proof) remain in code.

---

## 5. Migration / RPC discrepancies vs Landlords risk

| Item | Affects live Landlords ops? | Treat as Landlords blocker? |
| --- | --- | --- |
| Repo vs hosted migration ID mismatch | Only if someone runs blind `db push` | Process risk — `db push` already forbidden |
| Marketplace isolation not on hosted | Yes — listing privacy / browse contract | **Yes** as G1 (await approval) |
| `list_same_tenant_*` missing from repo | No (RPC live) | **No** — hygiene G4 |
| `20261016000016` orphan | No | No |

---

## 6. Shared objects

| Object | Landlords use | Change stance |
| --- | --- | --- |
| `properties` RLS / marketplace SELECT | Shared with renter browse | Cutover **must** stay coordinated (5.4.21); do not solo-edit |
| `AuthProvider` membership filter | Shared | Already fixed; keep user_id filter |
| `profiles` RLS | Shared | Keep own-row; use RPCs for peer names |
| `payment-proofs` bucket | Shared with utility paths | Rent policies already path-scoped; no change needed |

No shared-policy change proposed in this review.

---

## 7. Optional ideas (not required)

- Inline payment-proof preview  
- Landlord staff invite + `approve_rent` permission editor  
- Due/overdue widgets on dashboard  
- Native OS file-picker E2E beyond DataTransfer  
- Re-list toggle prompt on move-out (after OQ-08)

---

## 8. Conclusion

| Question | Answer |
| --- | --- |
| Are core Landlords workflows implemented and verified? | **Yes** for property, assign, charges, manual rent review, isolation (API + browser). |
| Is the **approved Landlords Phase 2 roadmap track** complete? | **No** — G1 cutover still **BLOCKED** on explicit live approval; G2 invite UI **INCOMPLETE**. |
| Module status | **INCOMPLETE** |

### Next required Landlords task

1. **Obtain explicit live approval**, then execute `docs/STEP_5.4.21_MARKETPLACE_CUTOVER_PLAN.md` (manual SQL → frontend in one window; **no** `db push`), followed by post-deploy smoke.  
2. In parallel or immediately after: add a **minimal landlord renter-invite / membership** UI on top of existing `manage_membership` (FR-010), then a short browser move-out smoke to close G3.

Do not claim full Landlords completion from STEPS 5.4.24–5.4.26 alone.
