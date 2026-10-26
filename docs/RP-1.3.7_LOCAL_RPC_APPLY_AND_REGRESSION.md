# RP-1.3.7 — Local Apply of `list_same_tenant_member_profiles` + Regression

**Date:** 2026-10-20  
**Builds on:** RP-1.3.6 (migration authored, not applied)  
**Scope:** Apply `supabase/migrations/20261020110000_list_same_tenant_member_profiles.sql` to **verified local Postgres only**, then verify function/grants/PostgREST, Vitest regressions, and `dev:local` browser invite/assign.  
**Hosted Supabase / Edge deployments / secrets / GitHub / Vercel / production:** **untouched**

---

## Verdict

Local apply **succeeded**. The RPC now exists on loopback with the established contract. Invite “Active renters” and property assign picker load same-tenant active renters. Cross-tenant access is denied. Core RP-1.3 / rental / marketplace / application Vitest suites: **94 passed / 0 failed / 0 skipped**. `npm run typecheck`: **exit 0**.

**Not declared fully closed for all of Landlords UI:** one **unrelated** unit flake remains in `PropertyDetailPage.moveOut.test.tsx` (disable-in-flight assertion). It is outside the RPC migration contract and was **not** muted.

**RP-1.4 was not started.**

---

## Phase A — Target verification and SQL preflight

### Local target (immediately before apply / reconfirmed after)

| Check | Result |
| --- | --- |
| `supabase status` API | `http://127.0.0.1:54321` |
| `supabase status` DB | `127.0.0.1:54322` (password redacted in tooling) |
| `linked_project` | `null` (not linked to hosted) |
| Apply method | `docker exec … psql` into `supabase_db_Ijaaro-project-main` only |
| Forbidden CLIs | **Not used:** `supabase db push`, `supabase migration up`, `db reset`, repair |

### Migration SQL contract (`20261020110000_list_same_tenant_member_profiles.sql`)

| Aspect | Expected | Present in file |
| --- | --- | --- |
| Argument | `p_tenant_id uuid` | Yes |
| Returns | `user_id`, `full_name`, `email`, `role`, `membership_status` | Yes |
| Auth gate | `can_manage_landlord_ops(p_tenant_id)` | Yes |
| Result filter | active + `role = renter` on that tenant | Yes |
| Denial | `not authorized` / `42501` (also `not authenticated` when no uid) | Yes |
| Security | `SECURITY DEFINER`, `SET search_path = public` | Yes |
| Grants | `REVOKE` PUBLIC/anon; `GRANT EXECUTE` authenticated | Yes |

Preflight conclusion: SQL matches the RP-1.3.6 contract; target unambiguous local → proceed.

---

## Phase B — Apply (local only)

### Command pattern used

```text
Get-Content supabase/migrations/20261020110000_list_same_tenant_member_profiles.sql |
  docker exec -i supabase_db_Ijaaro-project-main psql -U postgres -d postgres -v ON_ERROR_STOP=1
```

- **Exit status:** `0`
- **No** hosted write; **no** `db push` / `migration up` / reset.

### Post-apply verification (re-checked this session)

| Check | Result |
| --- | --- |
| `supabase_migrations.schema_migrations` version `20261020110000` | Present |
| Signature | `list_same_tenant_member_profiles(p_tenant_id uuid)` → TABLE(`user_id uuid`, `full_name text`, `email text`, `role app_role`, `membership_status membership_status`) |
| `prosecdef` | `true` (SECURITY DEFINER) |
| `proconfig` | `{search_path=public}` |
| EXECUTE grants | `authenticated` (and default owner/`service_role`); **anon EXECUTE = false** |
| PostgREST discovery | `http://127.0.0.1:54321/rest/v1/rpc/list_same_tenant_member_profiles` reachable from `dev:local` |
| Authz probe | Authorized landlord → active same-tenant renters only; cross-tenant → `not authorized` |

---

## Phase C — Security and regression tests

Environment: frontend Vitest against **local** API (`127.0.0.1:54321`) via isolated env sync. No expectation edits.

### Aggregate (critical RP-1.3.7 set)

Command (representative):

```text
npx vitest run
  src/lib/inviteRenter.test.ts
  src/lib/listSameTenantMemberProfiles.migration.test.ts
  src/lib/provisionRenter.authz.test.ts
  src/lib/provisionRenter.test.ts
  src/lib/provisionRenter.usernameScope.test.ts
  src/lib/supabaseEnv.test.ts
  src/lib/username.landlordScope.test.ts
  src/lib/username.test.ts
  src/pages/landlord/InviteRenterPage.test.tsx
  src/test/rls.rental.test.ts
  src/test/rls.marketplace.test.ts
  src/test/rls.renterApplications.test.ts
```

| Result | Count |
| --- | --- |
| **Passed** | **94** |
| **Failed** | **0** |
| **Skipped** | **0** |

Notable inclusions:

| Suite | Passed | Failed | Skipped |
| --- | --- | --- | --- |
| `listSameTenantMemberProfiles.migration.test.ts` | 5 | 0 | 0 |
| `rls.rental.test.ts` (incl. same-tenant + cross-tenant RPC) | **23** | 0 | 0 |
| `rls.renterApplications.test.ts` | 12 | 0 | 0 |
| `rls.marketplace.test.ts` | 9 | 0 | 0 |
| Invite / provision / username / supabaseEnv units + Invite page | (remainder of 94) | 0 | 0 |

### Typecheck

```text
npm run typecheck   # exit 0
```

### Non-blocking residual (recorded, not muted)

| Suite | Passed | Failed | Skipped | Notes |
| --- | --- | --- | --- | --- |
| `PropertyDetailPage.moveOut.test.tsx` | 1 | **1** | 0 | Timing: expects Complete move-out button disabled while RPC in flight (`toBeDisabled`); unrelated to member-profile RPC |

---

## Phase D — Browser verification (`npm run dev:local` only)

| Check | Result |
| --- | --- |
| Frontend | `http://127.0.0.1:5174` (`dev:local`; **not** Vite `:5173`) |
| API host from page resources | **`127.0.0.1:54321` only** (no `supabase.co`) |
| Invite → “Active renters on this workspace” | **PASS** — row `RP135 Renter Accept` / `rp135_renter_accept@ijaaro.local` / `active`; RPC called successfully |
| Property assign “Renter member” picker | **PASS** — options: placeholder + same renter only (no foreign tenants) |
| Applications list | **PASS** — pending application for Flat B loads with Accept/Reject |
| Public Apply to Rent | **PASS** — `/apply?tenant=hodan-properties&property=…` form loads (“Apply to rent”, username + submit) |
| Cross-tenant exposure in UI | **PASS** (picker/list show only Hodan active renter); Vitest covers cross-tenant RPC denial |

---

## Untouched systems (explicit)

| Surface | Touched? |
| --- | --- |
| Hosted Supabase project / remote DB | **No** |
| Edge Function deploy | **No** |
| Secrets / env vault changes | **No** |
| GitHub push | **No** |
| Vercel / production deploy or restart | **No** |
| `db reset` / migration repair / unrelated replay | **No** |

---

## Remaining failures / blockers

1. **Unit flake:** `PropertyDetailPage.moveOut.test.tsx` — “disables Complete move-out while the RPC is in flight…” (`toBeDisabled` race). Not caused by this migration; do not treat as RPC apply failure.
2. **RP-1.3 product close:** Invite/assign member-list local gap from RP-1.3.5/1.3.6 is **resolved**. Broader roadmap items outside this RPC (e.g. hosted marketplace cutover STEP 5.4.31) remain separate.

---

## Exact next action

Stabilize or triage the flaky move-out disable-in-flight unit test if a clean green on that file is required for a full Landlords UI unit sweep — **do not start RP-1.4**.
