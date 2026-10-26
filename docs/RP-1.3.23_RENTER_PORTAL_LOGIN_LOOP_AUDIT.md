# RP-1.3.23 — Renter Portal Login Loop Audit

**Date:** 2026-10-20  
**Scope:** Static diagnosis only — no code/env/DB/Auth mutations, no fix, no RP-1.4  
**Observed loop:** Welcome back → Enter dashboard → landlord public site → portal login → renter rejected  

---

## 1. Verdict

| Question | Answer |
| --- | --- |
| Where is “Welcome back” / “Enter dashboard”? | `TenantLandingPage.tsx` portal modal (`loginCard` when `memberMatch` is set) |
| What URL does Enter dashboard request? | `navigate(workspaceAppHomePath(memberMatch))` — for `role === "renter"` + landlord tenant → **`/app/renter?tenant=<slug>`** |
| Does the helper default non-renter landlord roles to landlord portal? | **Yes.** Any landlord-tenant role other than exactly `"renter"` → `/app/landlord?tenant=<slug>` (`roles.ts` 126–128) |
| What sends the browser back to the **public landlord website** (`/?tenant=…`)? | **`ProtectedRoute`** when `session` is null on an `/app/*` URL with `?tenant=` (lines 21–32). Catch-all `*` → `/` is a secondary path. Enter dashboard itself does **not** navigate to the landing. |
| Why portal login “rejects” the renter? | `TenantLandingPage` `onSubmit` **signs the user out** and sets `"This account is not registered."` when no matching active membership is found (or portal denial fires) — lines 183–218 |
| Is `/app/renter` gated on property assignment? | **No.** `RoleRoute` allows `renter` without assignments (`App.tsx` 126–139) |
| Does acceptance auto-assign property? | **No** (unchanged; see RP-1.3.21 / accept RPC) |

**Most likely loop (code-aligned):** Enter dashboard navigates into `/app/…` → guard or failed auth surface drops/`null`s the session (or user lands on Unauthorized and signs out) → redirect to tenant landing → Portal Login → `onSubmit` finds no usable membership row and rejects with “not registered.”

**Exact Live trigger for session loss** (token refresh glitch vs wrong `/app/landlord` + Sign out vs other) is **not fully proven** without a runtime Network/Auth trace — see §8.

---

## 2. “Welcome back” / Enter dashboard (exact path)

### 2.1 When the modal shows Welcome back

```131:139:frontend/src/pages/TenantLandingPage.tsx
  const memberMatch =
    key && session && !isSuperAdmin && !isPlatformSuperAdmin(memberships)
      ? memberships.find(
          (row) =>
            row.status === "active" &&
            row.role !== "super_admin" &&
            (row.tenant.slug === key || row.tenant.subdomain === key),
        ) ?? null
      : null;
```

- Requires **session** + AuthProvider **memberships** match on tenant slug/subdomain.  
- Does **not** require `role === "renter"`.  
- Does **not** require `tenant.status === "active"|"pending"` (stricter checks live in `findTenantMembership`).

Templates do **not** embed `loginCard` in the marketing page; the card is only rendered in the portal overlay (`TenantLandingPage.tsx` 496–517) via `loginCard(...)`.

### 2.2 Enter dashboard handler

```373:385:frontend/src/pages/TenantLandingPage.tsx
          <Button
            ...
            type="button"
            onClick={() => {
              setActiveMembershipId(memberMatch.id);
              setPortalOpen(false);
              navigate(workspaceAppHomePath(memberMatch));
            }}
          >
            ...
            Enter dashboard
          </Button>
```

- Closes modal, sets active membership, navigates once.  
- **No** `replace: true` (history keeps landing under the app route).  
- **No** `signOut`.  
- Target is entirely `workspaceAppHomePath(memberMatch)`.

---

## 3. `workspaceAppHomePath` and callers

```116:130:frontend/src/lib/roles.ts
export function workspaceAppHomePath(membership: WorkspaceNavMembership): string {
  ...
  if (type === "landlord") {
    if (role === "renter") return `/app/renter${q}`;
    return `/app/landlord${q}`;
  }
  return `/app${q}`;
}
```

| Caller | File | Notes |
| --- | --- | --- |
| Enter dashboard / portal `onSubmit` | `TenantLandingPage.tsx` 208, 380 | Same helper |
| Login destination | `LoginPage.tsx` 85, 90 | Tenant-scoped login |
| Home without `?tenant=` | `App.tsx` HomeEntry 79 | First membership |
| Overview single membership | `OverviewPage.tsx` 16 | Redirect to role home |
| My-applications (RP-1.3.22) | `myApplicationsNav.ts` | Only if `role === "renter"` |

**Routing default that can mis-send renters:** on a landlord tenant, **only** `role === "renter"` goes to `/app/renter`. Every other role (including unexpected/missing role values) goes to **`/app/landlord`**. That is not “unknown → renter”; it is “non-renter → landlord tools.”

If an accepted applicant’s client-side membership `role` is not exactly `"renter"`, Enter dashboard would open **landlord** routes. Those are wrapped in:

```105:124:frontend/src/App.tsx
                  <RoleRoute
                    allow={["landlord_admin", "landlord_staff"]}
                    tenantTypes={["landlord"]}
                    message="Landlord tools require an active landlord admin or staff membership."
                  />
```

A true renter then sees **Unauthorized** inside `AppShell` (not the public marketing site). Getting from there to the public landlord site requires leaving `/app` (Sign out → `tenantWorkspacePath` in `AppShell.tsx` 242–256, or a session-null `ProtectedRoute` redirect).

---

## 4. How the browser returns to the landlord **website** (public landing)

### 4.1 Verified redirect that yields `/?tenant=<slug>`

```21:33:frontend/src/auth/ProtectedRoute.tsx
  if (!session) {
    const tenantFromQuery = ...
    ...
    if (tenantFromQuery) {
      return <Navigate to={tenantWorkspacePath(tenantFromQuery)} replace />;
    }
```

`tenantWorkspacePath` → `/?tenant=<slug>` (`tenant.ts` 18–19). That is the public `TenantLandingPage` (landlord website), not `/app/landlord`.

So: **any attempt to open `/app/renter?tenant=…` (or `/app/landlord?tenant=…`) while `session` is null immediately bounces to the landlord public home.**

That matches steps 5–6 of the reported loop **if session is missing at guard time**.

### 4.2 Other returns to `/`

| Mechanism | File | Effect |
| --- | --- | --- |
| Catch-all | `App.tsx` 209 | `Navigate to="/"` (drops query; subdomain host can still resolve tenant) |
| AppShell Sign out | `AppShell.tsx` 250–256 | `tenantWorkspacePath(slug)` for non–super-admin |

Enter dashboard does **not** call these directly.

### 4.3 Is `/app/renter?tenant=` preserved?

- **If** navigation succeeds and session stays valid and `RoleRoute` passes: URL should remain `/app/renter?tenant=<slug>`; `TenantSlugSync` keeps `?tenant=` on `/app/*` (lines 35–49).  
- **If** `ProtectedRoute` redirects for `!session`: query tenant is **reused** on the landing URL, but the **`/app/renter` path is not preserved** — by design of the guard.

---

## 5. Why the landlord portal login rejects the renter

Portal sign-in is **not** limited to `landlord_admin`. It uses `hasTenantWorkspaceAccess` / `findTenantMembership`, which allow any active non–super-admin membership on that tenant (including **`renter`**).

Rejection path (after password Auth succeeds):

```183:218:frontend/src/pages/TenantLandingPage.tsx
      if (
        isPlatformSuperAdmin(rows) ||
        tenantPortalAccessDenial(rows, key, workspace?.name)
      ) {
        await signOut();
        ...
        error: "This account is not registered.",
        ...
      }
      const match = rows.find(...);
      if (match) {
        ...
        navigate(workspaceAppHomePath(match));
        return;
      }
      await signOut();
      ...
      error: "This account is not registered.",
```

`friendlyAuthError` maps those strings to the same user-visible **“This account is not registered.”** (`LandingLoginCard.tsx` 52–61).

`rows` come from `loadMembershipsNow()` (lines 141–155): `tenant_memberships` + `tenants(*)`, **status=active**, **no `user_id` filter** (RLS should still limit renters to self). Rows with **null `tenant` join** are dropped — if the tenant embed fails, the renter looks “unregistered” even though Auth succeeded.

**Asymmetry:** Welcome back can show from AuthProvider memberships while a later `loadMembershipsNow()` returns empty → reject + `signOut`. That produces: was signed in → Enter dashboard → (session loss / bounce) → login → rejected.

Bare platform `/login` (no `?tenant=`) still **signs out** non–platform-admin members (`LoginPage.tsx` 102–109) — a separate footgun; Enter dashboard does not target it.

---

## 6. Membership / RoleRoute / property assignment

| Check | Result |
| --- | --- |
| Accept creates `renter` + `active` | Yes (`review_rental_application` / prior RP-1.3.21) |
| AuthProvider loads own active memberships | `AuthProvider.tsx` 62–87 (`user_id` + `status=active`) |
| `/app/renter` RoleRoute | Allows `renter` (and landlord roles); **no** assignment check |
| `RenterDashboard` | Tolerates zero `rental_assignments` |
| Pending/rejected without membership | `RoleRoute` Unauthorized; portal `onSubmit` rejects |

Acceptance must not auto-assign property — still true; not involved in this loop.

---

## 7. Root-cause statement (static)

1. **Enter dashboard** (`TenantLandingPage.tsx` 377–380) correctly *intends* `/app/renter?tenant=<slug>` when `memberMatch.role === "renter"`, via `workspaceAppHomePath` (`roles.ts` 126–128).  
2. **Public landlord home return** is not implemented in that button; it is produced by **`ProtectedRoute` unauthenticated redirect** to `/?tenant=` (or Sign out / catch-all).  
3. **Landlord tools default** for every non-`renter` role on a landlord tenant (`roles.ts` 128) can send a mis-labeled membership to `/app/landlord`, where **`RoleRoute` denies renters** — a dead-end that often ends with Sign out → public portal login.  
4. **Portal login rejection** is explicit: `TenantLandingPage` `onSubmit` **signOut + “not registered”** when membership resolution fails — not a separate “landlord-only” password gate.  
5. Therefore the loop is a **frontend routing/session/membership-resolution loop** on the tenant landing portal, not missing accept-side membership by design, and not property-assignment gating.

---

## 8. Uncertainty (needs Live runtime, not done here)

| Item | Why |
| --- | --- |
| Whether Enter dashboard’s first navigation URL is `/app/renter` or `/app/landlord` | Requires watching the address bar / history on click |
| Why `session` becomes null (if it does) at `ProtectedRoute` | Possible auth refresh/`onAuthStateChange`+`getSession` interaction (`AuthProvider.tsx` 112–122); not reproduced statically |
| Whether `memberMatch.role` is actually `"renter"` in the browser | Live membership payload not queried (safety: no user data dump) |
| Whether `loadMembershipsNow` drops the row (`tenant` null) | Needs authenticated SELECT inspect without printing PII |
| Whether user clicked AppShell **Sign out** after Unauthorized | Behavioral |

---

## 9. Minimal fix direction (do **not** implement in this RP)

1. Enter dashboard: only navigate to `workspaceAppHomePath` when `role === "renter"` (or shared helper like `resolveMyApplicationsRenterDestination`); otherwise show a clear message.  
2. Ensure post-login navigation uses `replace: true` and awaits membership refresh before navigate (same pattern as RP-1.3.22).  
3. Align `memberMatch` with `findTenantMembership` (tenant status + role expectations).  
4. On portal `onSubmit`, filter `user_id === auth.uid()` and do not `signOut` on empty rows until session/membership reload is confirmed.  
5. Avoid sending renters through landlord `RoleRoute` or bare `/login`.  
6. Do not auto-assign property; do not grant roles in the UI.

---

## 10. Static tests this session

```text
cd frontend
npx vitest run src/lib/myApplicationsNav.test.ts src/pages/MyApplicationsPage.test.tsx src/lib/signupEmailRedirect.test.ts src/lib/supabaseEnv.test.ts
→ Test Files  4 passed (4)
→ Tests       19 passed (19)
```

No browser confirmation of the loop in this RP. No credentials/tokens/private user rows printed.

---

## 11. Explicit confirmations

- Audit only — **no fix implemented**.  
- No password/user/membership/application/role changes.  
- No Supabase settings, env files, schema, migrations, or deploys.  
- RP-1.4 not started.
