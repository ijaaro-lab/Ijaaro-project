# RP-1.3.6 — Local Member-Profile RPC Hygiene

**Date:** 2026-10-20  
**Builds on:** RP-1.3.4 / RP-1.3.5  
**Scope:** Repository mirror of `list_same_tenant_member_profiles` (not applied)  
**Hosted Supabase / Edge deploy / secrets / GitHub / Vercel / production:** untouched  

---

## Verdict

Root cause confirmed: the RPC is a **hosted-only function omitted from `supabase/migrations/`**, not an obsolete caller. A timestamped migration was added that encodes the contract derived from existing types, UI callers, docs, and rental tests.

**Migration was not applied.** Local runtime remains **blocked** (`PGRST202`). RP-1.3 is **not** fully closed for invite/assign member-list UX until a separate approved local apply step.

---

## Phase A — Findings

### Root cause

| Finding | Detail |
| --- | --- |
| Callers | Active: `InviteRenterPage.tsx`, `PropertyDetailPage.tsx` |
| Types | `frontend/src/types/database.ts` |
| Tests | `rls.rental.test.ts` (same-tenant active renters; cross-tenant denial) |
| Repo SQL | **No** prior definition of `list_same_tenant_member_profiles` under `supabase/migrations/` |
| Docs | STEP 5.4.24–5.4.30 / roadmap: “hosted-only hygiene export” |
| Equivalent in migrations | None — `can_manage_landlord_ops` exists and is the intended gate |

### Derived RPC contract (from repository only)

| Aspect | Contract |
| --- | --- |
| Signature | `list_same_tenant_member_profiles(p_tenant_id uuid)` |
| Returns | `user_id`, `full_name`, `email`, `role`, `membership_status` |
| Auth | Caller must satisfy `public.can_manage_landlord_ops(p_tenant_id)` (active `landlord_admin` / `landlord_staff` on operable landlord tenant) |
| Result filter | Memberships on **that** `tenant_id` with `status = 'active'` and `role = 'renter'` only |
| Denial | Unauthorized / cross-tenant → exception `not authorized` (`42501`); tests expect error + null data |
| Grants | `REVOKE` from `PUBLIC`/`anon`; `GRANT EXECUTE` to `authenticated` |
| Why SECURITY DEFINER | `profiles` RLS is own-row; landlords cannot SELECT peer profiles directly |

### Safest minimal correction

Add a **new** migration file mirroring the above contract. Do **not** rewrite historical migrations. Do **not** apply in this task. Do **not** invent `list_company_member_profiles` here (orthogonal utility hygiene).

---

## Phase B — Files changed

| File | Change |
| --- | --- |
| `supabase/migrations/20261020110000_list_same_tenant_member_profiles.sql` | **Created** — function + grants |
| `frontend/src/types/database.ts` | Comment updated (hosted → RP-1.3.6 migration mirror) |
| `frontend/src/lib/listSameTenantMemberProfiles.migration.test.ts` | **Created** — static contract tests |
| `docs/RP-1.3.6_MEMBER_PROFILE_RPC_HYGIENE.md` | This report |

**Applied to any database:** **No** (confirmed local probe still returns `PGRST202`).

---

## Phase C — Tests actually executed

| Suite | Passed | Failed | Skipped | Notes |
| --- | --- | --- | --- | --- |
| `listSameTenantMemberProfiles.migration.test.ts` | **5** | 0 | 0 | Static SQL contract |
| `inviteRenter.test.ts` | **6** | 0 | 0 | Unchanged |
| `InviteRenterPage.test.tsx` | **7** | 0 | 0 | Unchanged (mocked RPC) |
| `rls.rental.test.ts` filter `list_same_tenant_member_profiles` | **1** | **1** | 21 | Same-tenant assert still **FAIL** (function missing). Cross-tenant “expects error” can appear to pass because missing-RPC also errors — **not** treated as resolved |
| Local RPC probe (`127.0.0.1`) | — | — | — | `PGRST202` → **not applied** |

TypeScript build alone was **not** used as proof of resolution.

---

## Remaining blockers

1. **Approved local apply** of `20261020110000_list_same_tenant_member_profiles.sql` (or equivalent CLI migration path) on isolated `127.0.0.1` only — out of scope for this task’s “do not apply” rule.
2. After apply: re-run full `rls.rental.test.ts` and browser invite/assign picker on `dev:local`.
3. Optional follow-up: mirror `list_company_member_profiles` similarly (not required for landlord invite/assign).

---

## Untouched systems (explicit)

- No hosted Supabase access or schema change  
- No migration apply / reset / repair / replay  
- No Edge deploy / secrets change  
- No GitHub push / Vercel / production restart  
- No RLS weakening or anonymous grants beyond existing authenticated EXECUTE pattern  

---

## Exact next action

Run a **separate approved local-only maintenance step** to apply `20261020110000_list_same_tenant_member_profiles.sql` against `127.0.0.1:54321`, then re-verify rental RPC tests and landlord Invite/Assign UI. Do **not** start RP-1.4 or hosted cutover until that local runtime gap is closed or explicitly accepted.
