# RP-1.3.27 — Shared Tenant Login Runtime Diagnostic (Landlord vs Renter)

**Date:** 2026-10-20  
**Scope:** Diagnose only — no code/env/schema/Auth/membership mutations, no deploy, no RP-1.4  
**Target:** Shared portal on `/?tenant=hodan-properties` (Live Vite `127.0.0.1:5173`)  
**Authenticated renter browser flow observed by agent:** **No**

---

## 1. Verdict (short)

| Question | Answer |
| --- | --- |
| Do landlord and renter use different privilege checks in portal destination resolution? | **No.** Same `resolveFreshPortalDestination` → `resolveTenantPortalDashboardDestination` → `workspaceAppHomePath`; only the membership **role label** changes the path. |
| Does `refreshMemberships()` return fresh rows? | **Yes (proven in code).** It awaits PostgREST, updates React state, and **returns** the array. Callers do not wait only on a fire-and-forget state update. |
| What keeps an accepted renter on / returns them to `/?tenant=hodan-properties`? | Two code branches can produce that URL; **which one runs in the browser is not proven** without an authenticated renter capture. |
| Best code-aligned failure for “signs in → brief spinner → still on public homepage”? | **Password `onSubmit` non-ok branch** (`TenantLandingPage.tsx` 217–233): after `signIn`, resolution fails → **`signOut()`** → stay on landing (“not registered”). |
| Best code-aligned failure for “briefly leaves landing then URL is again `/?tenant=…`”? | **`ProtectedRoute`** when React `session` is null on `/app/*?tenant=` (`ProtectedRoute.tsx` 21–32). |
| Live DB “no renter membership” explanation? | **Ruled out for aggregates** — see §4. |

**Root cause status:** **Suspected (code-mapped), not browser-proven.** Unit tests for RP-1.3.26 pass; authenticated renter Live verification has not succeeded and was not observed here.

---

## 2. Runtime access status

| Access | Result |
| --- | --- |
| Static code (post–RP-1.3.26) | Inspected |
| Live DB aggregates (no PII) | Queried — §4 |
| Public landing | Available in operator env (dev on 5173 Live mode) |
| Authenticated renter Portal Login → dashboard | **Not observed by agent** — no claim of browser pass/fail for that flow |

---

## 3. Inspected pipeline (exact files / lines)

### 3.1 Shared tenant login submit + loading / error

**File:** `frontend/src/pages/TenantLandingPage.tsx`

| Piece | Lines | Behavior |
| --- | --- | --- |
| Auth hooks | 50–59 | `session`, `signIn`, `signOut`, `refreshMemberships`, `setActiveMembershipId` |
| `memberMatch` (Welcome back UI) | 131–140 | Needs React `session` + active membership on slug/subdomain; **does not** require `role === "renter"` |
| `resolveFreshPortalDestination` | 148–166 | `getSession` → `refreshMemberships()` → denial checks → `resolveTenantPortalDashboardDestination` |
| `enterDashboard` | 168–197 | Requires React `session`; on ok → navigate; on fail → **keep session**, show error, **no** `signOut` |
| Password `onSubmit` | 200–242 | `signIn` → same resolver; on ok → navigate; on fail → **`signOut()`** + `"This account is not registered."` |
| Full-page load gate | 244–249 | `loading \|\| authLoading` → “Loading workspace…” |
| Enter-dashboard spinner | 401–409 | `enteringDashboard` → “Opening…” |
| Password spinner | via `LandingLoginCard` | `login.submitting` (set true at 203; cleared on error / success / not-registered) |

**Password submit failure branch (stays on public homepage):**

```217:233:frontend/src/pages/TenantLandingPage.tsx
      const resolved = await resolveFreshPortalDestination();
      if (resolved.kind === "ok") {
        setActiveMembershipId(resolved.dest.membershipId);
        setLogin((s) => ({ ...s, submitting: false, error: null }));
        setPortalOpen(false);
        navigate(resolved.dest.path, { replace: true });
        return;
      }

      // Password sign-in with no usable membership on this tenant → not registered.
      await signOut();
      setPortalOpen(true);
      setLogin((s) => ({
        ...s,
        submitting: false,
        error: "This account is not registered.",
      }));
```

**Enter dashboard failure branch (also stays on landing, but session kept):**

```173:188:frontend/src/pages/TenantLandingPage.tsx
      const result = await resolveFreshPortalDestination();
      if (result.kind === "ok") {
        setActiveMembershipId(result.dest.membershipId);
        setPortalOpen(false);
        navigate(result.dest.path, { replace: true });
        return;
      }
      // Keep a valid session: do not sign out when memberships are still empty/mismatched.
      setPortalOpen(true);
      setLogin((s) => ({
        ...s,
        error:
          result.kind === "no_session"
            ? "Your session expired. Please sign in again."
            : "Could not open the dashboard for this workspace yet. Try again in a moment, or sign out and sign back in.",
      }));
```

### 3.2 `getSession` vs AuthProvider React session

| Source | Location | Used by |
| --- | --- | --- |
| `supabase.auth.getSession()` | `resolveFreshPortalDestination` 150–153; `refreshMemberships` 63–68 | Portal destination decision |
| React `session` state | `AuthProvider.tsx` 47, 102, 113; `useAuth().session` | `memberMatch`, `enterDashboard` guard (`!session` return), **`ProtectedRoute`** |

**Proven gap:** Portal navigation is allowed based on storage `getSession` + returned memberships, while `/app/*` admission uses **React** `session`. Those can disagree briefly after password sign-in.

`signIn` (`AuthProvider.tsx` 150–153) only wraps `signInWithPassword` and returns `{ error }`. React session is updated in `onAuthStateChange` (112–122), which also awaits `refreshMemberships()` (and that helper calls `getSession()` again).

### 3.3 `refreshMemberships()` — return value and timing

```62:88:frontend/src/auth/AuthProvider.tsx
  const refreshMemberships = useCallback(async (): Promise<MembershipWithTenant[]> => {
    const {
      data: { session: current },
    } = await supabase.auth.getSession();
    if (!current?.user) {
      setMemberships([]);
      return [];
    }
    const { data } = await supabase
      .from("tenant_memberships")
      .select("*, tenant:tenants(*)")
      .eq("status", "active")
      .eq("user_id", current.user.id);
    // ... normalize tenant embed ...
    const mine = rows.filter((r) => r.tenant);
    setMemberships(mine);
    return mine;
  }, []);
```

| Fact | Status |
| --- | --- |
| Returns `Promise<MembershipWithTenant[]>` of freshly queried rows | **Proven** |
| Also writes React `memberships` via `setMemberships` | **Proven** |
| Callers (`resolveFreshPortalDestination`) use the **returned** array, not a later render | **Proven** |
| If `getSession()` has no user → returns `[]` **and clears** React memberships | **Proven** |
| Query `error` is ignored (`const { data } = …`) → failure looks like empty list | **Proven** |
| Rows with null `tenant` embed are dropped | **Proven** |

### 3.4 Destination resolution and `workspaceAppHomePath`

**Resolver:** `frontend/src/lib/myApplicationsNav.ts` 67–88  
**Path helper:** `frontend/src/lib/roles.ts` 116–130  

| Resolved membership (role label only) | `tenant_type` | Navigation target |
| --- | --- | --- |
| `renter` | `landlord` | `/app/renter?tenant=<slug>` |
| `landlord_admin` / `landlord_staff` | `landlord` | `/app/landlord?tenant=<slug>` |
| No active match for key | — | `null` → caller `no_membership` / denied |
| Landlord tenant but role not in `{renter, landlord_admin, landlord_staff}` | `landlord` | `null` |

`findActiveWorkspaceMembership` (21–40) requires `findTenantMembership` success first (`roles.ts` 89–104): active membership, non–`super_admin`, non-platform tenant, tenant status `active`|`pending`, slug/subdomain match.

### 3.5 Redirects that land on `/?tenant=…`

| Mechanism | File:lines | Produces `/?tenant=hodan-properties`? |
| --- | --- | --- |
| `ProtectedRoute` `!session` + `?tenant=` | `ProtectedRoute.tsx` 21–32 | **Yes** via `tenantWorkspacePath` |
| Catch-all `*` | `App.tsx` 209 | **`/` only** (no tenant query) — does **not** match the reported URL shape unless something else re-adds `tenant` |
| Password `onSubmit` fail + `signOut` | `TenantLandingPage.tsx` 226–233 | **Yes** — never left `/` (or returned after bounce + sign-out) |
| `HomeEntry` with `tenantSlug` | `App.tsx` 72–73 | Always renders `TenantLandingPage` for `/?tenant=` — intentional public portal |
| `RoleRoute` deny | `ProtectedRoute.tsx` 110–112 | **No** — stays on `/app/…` with “Unauthorized” |
| Explicit AppShell Sign out | operator action | Can return to tenant landing — not automatic |

---

## 4. Safe Live DB facts (no PII)

Aggregates for `tenants.slug = 'hodan-properties'` (SQL MCP; no emails / user ids / tokens):

| Fact | Value |
| --- | --- |
| Tenant status / type | `active` / `landlord` |
| Active `renter` memberships | **1** |
| Active landlord admin/staff memberships | **1** |
| Active memberships (all roles) | **2** |
| Accepted applications | **1** |
| Accepted apps missing active renter membership | **0** |

**Conclusion:** A “no active renter row in Live DB for accepted applicants on this tenant” explanation is **ruled out** at the aggregate level. Whether the **browser Auth user** is that membership’s user remains unverified without client-side checks (boolean session/role only).

---

## 5. Confirmed code paths: landlord vs renter

Shared until the last step:

```text
Portal Login (password)
  → AuthProvider.signIn (signInWithPassword)
  → resolveFreshPortalDestination
       → getSession (must have user)
       → rows = await refreshMemberships()   // returns array
       → tenantPortalAccessDenial / super-admin deny?
       → dest = resolveTenantPortalDashboardDestination(rows, key)
  → if dest: setActiveMembershipId + navigate(dest.path, { replace: true })
  → else: signOut + "This account is not registered."

Enter dashboard (already signed in / Welcome back)
  → same resolveFreshPortalDestination
  → if dest: navigate
  → else: error, keep session (no signOut)
```

| Step | Landlord | Renter |
| --- | --- | --- |
| Password / Enter dashboard handler | Same | Same |
| `refreshMemberships` query | Same (`user_id` = current user) | Same |
| Role used in path | `landlord_admin` or `landlord_staff` | `renter` |
| Target | `/app/landlord?tenant=hodan-properties` | `/app/renter?tenant=hodan-properties` |
| `ProtectedRoute` | Needs React `session` | Same |
| `RoleRoute` allow list | landlord roles on landlord tenant | includes `renter` (`App.tsx` 126–139) |

**Privileges / role resolution were not changed in this diagnostic.** Difference is only which membership row the signed-in user gets back and which path `workspaceAppHomePath` builds.

---

## 6. Failing-branch analysis (ranked)

### Branch A — Password submit: resolution non-ok → `signOut` (strongest for “signs in → spinner → still on homepage”)

**Status:** **Proven code path**; **suspected** for current UX; **not browser-proven** for the accepted renter account.

Triggers when `resolveFreshPortalDestination` returns `no_session` | `denied` | `no_membership` after a successful password Auth call.

Most likely sub-causes of `no_membership` / empty `rows`:

1. `refreshMemberships` got `getSession()` with no user → `[]` (race / timing).  
2. PostgREST error ignored → treated as `[]`.  
3. Membership row visible but `tenant` embed null → filtered out.  
4. Signed-in Auth user is not the user with the Live active renter row (account mismatch) — DB aggregates cannot disprove this.

Matches: brief `submitting` spinner, final URL `/?tenant=hodan-properties`, public landlord homepage. Operator should note whether alert text is **“This account is not registered.”**

### Branch B — Navigate to `/app/renter?tenant=…` then `ProtectedRoute` bounce

**Status:** **Proven code path** for return URL with `?tenant=`; **suspected** if URL flashes `/app/…`; **not browser-proven**.

Requires React `session === null` while `loading === false` on an `/app/*` URL that still has `?tenant=`.

RP-1.3.26 made Enter dashboard refresh-before-navigate, but **does not** guarantee React `session` is set before `navigate`. Password path can call `navigate` using storage session while `ProtectedRoute` still sees null React session.

Matches: brief “Loading session…” or flash of `/app/renter`, then `/?tenant=hodan-properties`. After bounce, Welcome back vs login form distinguishes “session kept” vs “session cleared.”

### Branch C — Wrong role path → `/app/landlord` Unauthorized

**Status:** **Unlikely** for “public landlord homepage.” `RoleRoute` shows Unauthorized **inside** AppShell; it does **not** redirect to `/?tenant=`.

### Ruled out / weak

| Idea | Why |
| --- | --- |
| Missing Live renter membership for accepted apps | Aggregate count **0** missing |
| Enter dashboard invents `/?tenant=` | It only `navigate`s `workspaceAppHomePath` / stays with error |
| Catch-all `*` alone | Goes to `/` without tenant |
| Property assignment required for `/app/renter` | `RoleRoute` does not require assignments |

---

## 7. What RP-1.3.26 changed vs what can still fail

| Item | After RP-1.3.26 |
| --- | --- |
| Enter dashboard | Awaits `getSession` + `refreshMemberships` + resolver before navigate |
| Password submit | Uses same resolver + returned memberships |
| Asymmetry left in place | Password fail still **`signOut`s**; Enter dashboard fail does **not** |
| React vs storage session for `ProtectedRoute` | **Unchanged** |
| Silent empty memberships on query error | **Unchanged** |
| Authenticated browser verification | **Still not done** (unit/typecheck/build only) |

---

## 8. Safe manual browser capture (operator)

Reproduce on Live: `http://127.0.0.1:5173/?tenant=hodan-properties`.  
**Do not** paste passwords, tokens, emails, JWTs, or raw `localStorage` values.

### 8.1 Password Portal Login (accepted renter)

1. Open Portal Login; submit credentials.  
2. Note spinner: login button submitting vs full-page “Loading workspace…”.  
3. Record **final** `location.pathname + location.search`.  
4. Record portal UI: login form vs Welcome back; any alert text (wording only).  
5. If URL ever showed `/app/…`, note whether it **flashed** before returning.

Optional console (presence only):

```js
(() => {
  const keys = Object.keys(localStorage).filter((k) => /^sb-.*-auth-token$/.test(k));
  return {
    route: location.pathname + location.search,
    sbAuthKeyPresent: keys.length > 0,
    sbAuthKeyCount: keys.length,
  };
})();
```

### 8.2 If Welcome back appears — Enter dashboard

1. Click Enter dashboard; note “Opening…”.  
2. Capture URL immediately and after settle.  
3. If AppShell visible: role **label** only (e.g. `renter`).  
4. React DevTools → AuthProvider: `session` null/non-null; `memberships.length`; role label on matching row — **do not expand tokens**.

### 8.3 Capture matrix (fill in)

| Capture | Safe value |
| --- | --- |
| Route after password submit | |
| Session present (React / boolean) | present / absent |
| Role label for hodan membership | e.g. `renter` / none |
| Membership status | e.g. `active` / none |
| `refreshMemberships` result shape | length; role labels only |
| Navigation destination attempted | `/app/renter?tenant=…` / none / other |
| Alert copy | none / “not registered” / “Could not open…” |
| Landlord control (same browser steps) | destination + role label |

Compare landlord vs renter **without** changing roles or memberships.

---

## 9. Minimal proposed fix (do not implement in this RP)

1. **Password `onSubmit`:** On non-ok resolution after successful Auth, **align with Enter dashboard** — do not `signOut` on a single empty refresh; retry `refreshMemberships` once; show a distinct “membership not ready” vs true “not registered”; only sign out when Auth failed or denial is definitive (e.g. super-admin / other-org).  
2. **`refreshMemberships`:** Prefer the `session` already known to the caller / `onAuthStateChange` `next` argument instead of nested `getSession()`; **do not** `setMemberships([])` on ambiguous null session during sign-in; surface query `error` instead of treating as `[]`.  
3. **Navigate gate:** Only navigate after React `session` is non-null (or teach `ProtectedRoute` to treat storage session consistently during the transition) so Branch B cannot bounce a valid storage session.  
4. **Do not** change role privileges, invent memberships, assign properties, or alter Live data/env.

---

## 10. Explicit confirmations

- Diagnosis only; **no code changes** applied in this RP.  
- No passwords, tokens, emails, or private records printed.  
- No role/membership/application/property mutations; no Supabase settings/env/migration/Live data writes; no deploy; RP-1.4 not started.  
- **Authenticated renter browser runtime was not tested/observed** in this session — do not treat §6 branches as Live-confirmed until §8 captures exist.
