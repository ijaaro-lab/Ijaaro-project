# RP-1.3.26 — Align Renter Dashboard Navigation with Auth State

**Date:** 2026-10-20  
**Scope:** Minimal frontend fix for tenant portal **Enter dashboard** (+ aligned password-submit membership load)  
**Out of scope:** Schema/migrations, Supabase dashboard, env files, deploy, RP-1.4, authenticated browser re-verification by agent  

---

## 1. Root cause addressed

**Enter dashboard** (`TenantLandingPage`) previously called `navigate(workspaceAppHomePath(memberMatch))` using **stale** AuthProvider memberships, with **no** `refreshMemberships`, **no** session re-check, and **no** confirmation that the row was still an active renter/landlord member for the tenant.

That diverged from the password-submit path (which reloaded memberships before navigate) and could race with auth/membership loading. Combined with `ProtectedRoute` reading React `session`, a bad navigation into `/app/*` without a stable resolved membership was the strongest code-aligned failure mode from RP-1.3.24–25.

---

## 2. Behavior now

| Flow | Behavior |
| --- | --- |
| **Enter dashboard** | `getSession()` (presence only) → `refreshMemberships()` → `resolveTenantPortalDashboardDestination` → navigate **only** if confirmed; `replace: true`. On failure: keep session, show error, **do not** `signOut`. |
| **Password portal submit** | Same resolution helper after `signIn` + `refreshMemberships()` (own rows only). No usable membership → `signOut` + “not registered” (unchanged product rule for unknown accounts). |
| **Active renter** | `/app/renter?tenant=<slug>` |
| **Landlord admin/staff** | `/app/landlord?tenant=<slug>` (preserved) |
| **Empty / mismatched / pending-style** | No navigate to private renter tools |
| **Roles / assignments** | Not created; `ProtectedRoute` unchanged |

---

## 3. Changed files

| File | Change |
| --- | --- |
| `frontend/src/lib/myApplicationsNav.ts` | Added `resolveTenantPortalDashboardDestination`; shared active-membership lookup |
| `frontend/src/lib/myApplicationsNav.test.ts` | Renter / empty race / mismatch / landlord / pending-style cases |
| `frontend/src/pages/TenantLandingPage.tsx` | `enterDashboard` + shared `resolveFreshPortalDestination`; password submit uses AuthProvider refresh |
| `frontend/src/pages/TenantLandingPage.test.tsx` | **Added** — refresh-then-navigate, empty race (no sign-out), mismatch, landlord path |

---

## 4. Test / check results (actual)

```text
npx vitest run src/lib/myApplicationsNav.test.ts src/pages/TenantLandingPage.test.tsx src/pages/MyApplicationsPage.test.tsx
→ Test Files  3 passed (3)
→ Tests       12 passed (12)

npm run typecheck
→ tsc --noEmit  (exit 0)

npm run build
→ tsc -b && vite build  (exit 0; chunk size warning only)
```

---

## 5. Remaining runtime-verification requirements

**Authenticated browser flow was not observed by the agent** (same limitation as RP-1.3.25). Operator should confirm on Live (`127.0.0.1:5173/?tenant=hodan-properties`):

1. Portal Login as accepted renter → Welcome back.  
2. Enter dashboard → URL stays `/app/renter?tenant=hodan-properties` (AppShell / renter tools).  
3. No bounce to `/?tenant=…` login; no unexpected sign-out.  
4. Record only route / session present / role label (no tokens).

Until that manual check, treat the fix as **implemented and unit-tested**, not **Live browser-verified**.

---

## 6. Explicit confirmations

- No DB/schema/migration/env/Supabase-settings/deploy changes.  
- No credentials or tokens printed.  
- RP-1.4 not started.  
- No invented authenticated runtime result.
