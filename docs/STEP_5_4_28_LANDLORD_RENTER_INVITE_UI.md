# STEP 5.4.28 — Landlord Renter Invite UI (FR-010)

**Date:** 2026-10-19  
**Scope:** Landlords module · FR-010 invite path only  
**Status:** Implemented and verified (UI + tests + typecheck + production build)

---

## 1. Exact FR-010 acceptance criteria used

From approved `BRD-1.md` (FR-010) and Phase 2 Landlords gap review (`docs/STEP_5_4_27_LANDLORDS_FINAL_GAP_REVIEW.md` **G2**):

| Source | Criterion |
| --- | --- |
| **BRD FR-010** | Interest, invite, and assignment — landlord invites and assigns renter; track owner, current renter, rent, due date, tenancy dates. |
| **BRD FR-010 acceptance** | Only authorized landlord assigns renters to properties they manage; assignment fields persisted. |
| **Roadmap Phase 2** | Invite / assign renter → `rental_assignments` (max 1 active per property). |
| **Gap G2 (this step)** | Provide a **minimal landlord UI** to invite / upsert **renter** memberships on the landlord’s own tenant via existing `manage_membership`. Assign UI already requires an existing `renter` membership. |

**Interpreted for this step (invite only, not assign):**

1. Accessible from the existing Landlords interface.
2. Authorized `landlord_admin` can add a registered user as `renter` on the **active** landlord tenant.
3. Uses the existing supported invitation mechanism (`manage_membership`).
4. Client validation + clear loading / success / error states; success only when the RPC succeeds.
5. Cross-tenant invite denied by existing RPC authorization (UI always scopes to `activeMembership.tenant_id`).
6. No secrets or privileged credentials exposed.
7. Does **not** implement Marketplace cutover, new tables, or new RPCs.

Assignment, rent amounts, due dates, and move-out remain on existing property/tenancy screens (already delivered).

---

## 2. Existing invitation mechanism found

| Capability | Role | Notes |
| --- | --- | --- |
| **`manage_membership(p_tenant_id, p_user_id, p_role, p_status)`** | `landlord_admin` / `utility_admin` / Super Admin | SECURITY DEFINER upsert into `tenant_memberships`; audits `membership.upserted`; rejects callers without admin role on **that** tenant; cannot grant `super_admin` unless SA. |
| **`lookup_profile_by_email`** | **Super Admin only** | Used by admin `TenantDetailPage`. **Not** usable by landlords (confirmed on hosted DB). |
| **`list_same_tenant_member_profiles`** | Landlord ops (`can_manage_landlord_ops`) | Lists **active** `renter` profiles on a landlord tenant (assign picker + invite page list). |
| **Edge `manage-membership`** | Thin wrapper | Same RPC; UI calls RPC directly (same as admin page). |

**Conclusion:** The supported landlord invite path is **`manage_membership` with an existing profile `user_id`**, role `renter`, status `active` (so the renter appears in the assign picker). Email-based resolution remains SA-only; this step did **not** widen that RPC.

---

## 3. Files changed and behavior implemented

| File | Change |
| --- | --- |
| `frontend/src/lib/inviteRenter.ts` | Client validation: active tenant, `landlord_admin` only, UUID user id, duplicate active-renter guard. |
| `frontend/src/pages/landlord/InviteRenterPage.tsx` | Invite form → `manage_membership`; lists active renters; loading / success / error UI. |
| `frontend/src/App.tsx` | Route `/app/landlord/renters`. |
| `frontend/src/components/layout/AppShell.tsx` | Nav item + page title. |
| `frontend/src/pages/landlord/LandlordDashboard.tsx` | “Invite renter” shortcut. |
| `frontend/src/pages/landlord/PropertyDetailPage.tsx` | Empty assign-picker copy links to invite page. |
| `frontend/src/pages/AccountPage.tsx` | Shows copyable **User ID** so renters can share the identifier landlords need. |
| `frontend/src/lib/inviteRenter.test.ts` | Validation unit tests. |
| `frontend/src/pages/landlord/InviteRenterPage.test.tsx` | UI validation / success / error / staff-gate tests (mocked RPC). |
| `frontend/src/test/rls.rental.test.ts` | Disposable-fixture RPC tests: own-tenant invite OK; cross-tenant invite denied. |
| `docs/STEP_5_4_28_LANDLORD_RENTER_INVITE_UI.md` | This report. |

**Behavior summary**

- Landlord navigates to **Invite renter** (`/app/landlord/renters`).
- Pastes the renter’s Account **User ID** (UUID).
- On submit (admin only): validates → `manage_membership` with `p_tenant_id = activeMembership.tenant_id`, `p_role = renter`, `p_status = active`.
- Success message only after RPC success; then refreshes active-renter list.
- Staff can open the page but cannot submit; RPC would also reject them.

---

## 4. Tests and build results

| Check | Result |
| --- | --- |
| `npm test -- src/lib/inviteRenter.test.ts src/pages/landlord/InviteRenterPage.test.tsx` | **PASS** — 10 tests |
| `npm test -- src/test/rls.rental.test.ts -t invite` | **PASS** — 2 tests (own-tenant invite; cross-tenant deny); disposable `@ijaaro.test` fixtures only |
| `npm run typecheck` | **PASS** |
| `npm run build` | **PASS** |

No real end-user invitations sent. No live business data edited for tests (same disposable-user pattern as existing RLS suites).

---

## 5. Security and tenant-isolation verification

| Control | Verification |
| --- | --- |
| Tenant scoping | UI binds `p_tenant_id` exclusively to `activeMembership.tenant_id`. |
| Authorization | RPC requires `landlord_admin` (or SA) on that tenant; UI disables submit for non-admins. |
| Cross-tenant | RLS/RPC test: landlord A `manage_membership` on landlord B tenant → error. |
| No email directory for landlords | `lookup_profile_by_email` remains SA-only; UI does not call it. |
| No secrets | Form uses user UUID only; no service-role keys or invite tokens in client. |
| Success honesty | Success banner set only after `error == null` from RPC. |

---

## 6. Remaining blockers / follow-ups

| Item | Status |
| --- | --- |
| **G1** Marketplace field-isolation live cutover | Still **BLOCKED** on explicit live approval (`docs/STEP_5.4.21_MARKETPLACE_CUTOVER_PLAN.md`). **Not** started in this step. |
| **G3** Browser move-out smoke | Still open; out of scope here. |
| Landlord email lookup | **Not** available without a new/widened RPC. Invite works via Account **User ID**. Product may later add a landlord-scoped lookup (would need explicit approval + migration deployment). |
| Interest/contact capture (FR-010 “expresses interest”) | Not a separate backend feature today (contact links / external). Out of this invite-UI scope. |

---

## 7. Confirmation — no deployment / unrelated work

- No GitHub push.
- No Vercel / VPS deployment or restart.
- No `supabase db push`, live DB reset, or migration replay.
- No Marketplace cutover SQL or frontend field-isolation changes.
- No new Supabase tables or RPCs.
- No shared RLS policy changes.

**Stop point:** STEP 5.4.28 complete. Do not begin Marketplace cutover or deployment from this step.
