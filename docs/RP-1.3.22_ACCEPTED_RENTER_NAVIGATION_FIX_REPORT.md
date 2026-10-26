# RP-1.3.22 — Accepted Renter Navigation Fix

**Date:** 2026-10-20  
**Scope:** Minimal frontend navigation fix for `/my-applications` + tests + this report  
**Out of scope:** Supabase settings, env files, DB/schema/migrations, Live records, deploy, RP-1.4, new dashboards/routes  

---

## 1. Summary

Accepted renters who sign in on `/my-applications?tenant=<slug>` are now routed to `/app/renter?tenant=<slug>` when they have an **active renter** membership. The accepted “Open portal” CTA uses the same destination (`workspaceAppHomePath`). Pending/rejected applicants (no matching membership) stay on the applications page. No roles, memberships, or property assignments are created during navigation.

---

## 2. Changed files

| File | Change |
| --- | --- |
| `frontend/src/lib/myApplicationsNav.ts` | **Added** — `resolveMyApplicationsRenterDestination` (active renter + landlord tenant only) |
| `frontend/src/lib/myApplicationsNav.test.ts` | **Added** — unit coverage for destination / denial / landlord+admin paths |
| `frontend/src/pages/MyApplicationsPage.tsx` | Post–sign-in navigate; Open portal CTA → renter home; copy tweak |
| `frontend/src/pages/MyApplicationsPage.test.tsx` | **Added** — sign-in navigate, pending stay, CTA href |
| `frontend/src/auth/AuthProvider.tsx` | `refreshMemberships()` now returns the loaded membership rows (for post-sign-in routing without stale React state) |

Unchanged: LoginPage platform-admin sign-out behavior, landlord/portal routes, accept RPC, invite/provision/assign/move-out.

---

## 3. Behavior

### 3.1 Sign-in on `/my-applications`

1. `signIn(email, password)` (unchanged Auth API).  
2. On error → show friendly error; no navigate.  
3. On success → `refreshMemberships()` → `resolveMyApplicationsRenterDestination(rows, tenantKey)`.  
4. If active **renter** on that landlord tenant → `setActiveMembershipId` + `navigate(path, { replace: true })` where `path` is `workspaceAppHomePath` (`/app/renter?tenant=<slug>`).  
5. If no matching renter membership → **stay** on `/my-applications` (pending/rejected / other roles).  

Does **not** use bare `/login`.

### 3.2 Accepted “Open portal” CTA

Shown only when `status === "accepted"` **and** `resolveMyApplicationsRenterDestination` finds an active renter membership for the page `tenant` query. Link `to` is that path (same as `workspaceAppHomePath`).

### 3.3 Security preserved

- Navigation checks existing memberships only; no role/membership writes.  
- No property auto-assign.  
- Pending/rejected without active renter membership cannot reach private renter tools via this page’s auto-navigate or CTA.  
- Landlord / platform-admin home helpers unchanged (`workspaceAppHomePath` still returns `/app/landlord?…` for landlord admins).

---

## 4. Test / check results (actual)

```text
npx vitest run src/lib/myApplicationsNav.test.ts src/pages/MyApplicationsPage.test.tsx src/lib/signupEmailRedirect.test.ts src/pages/SetPasswordPage.test.tsx
→ Test Files  4 passed (4)
→ Tests       17 passed (17)

npm run typecheck
→ tsc --noEmit  (exit 0)

npm run build
→ tsc -b && vite build  (exit 0; chunk size warning only)
```

---

## 5. Remaining limitations

| Limitation | Note |
| --- | --- |
| Accepted CTA hidden until membership is in Auth context | If Auth memberships have not loaded yet, CTA waits; after load it appears. Sign-in path refreshes memberships before navigate. |
| No tenant query on `/my-applications` | Without `?tenant=`, post-sign-in destination is null (stay on page) — same as before for tenant-less URL. |
| Bare `/login` renter sign-out | Unchanged from RP-1.3.21; this fix does not route renters there. |
| Live browser smoke | Not re-run in this RP; verify manually: accept → my-applications sign-in → `/app/renter?tenant=…`. |

---

## 6. Explicit confirmations

- No Supabase dashboard / env / DB / Live record changes.  
- No deploy.  
- RP-1.4 not started.  
- No credentials or tokens printed.
