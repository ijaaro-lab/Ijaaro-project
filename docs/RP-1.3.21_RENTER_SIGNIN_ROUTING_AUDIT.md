# RP-1.3.21 — Accepted Renter Sign-In and Dashboard Routing Audit

**Date:** 2026-10-20  
**Scope:** Static diagnosis only — no code/env/DB/Auth mutations, no fix, no RP-1.4  
**Observed symptom:** After landlord acceptance, renter opens `/my-applications?tenant=hodan-properties`, sees “Sign in to view your application status,” and after signing in is **not** taken into the renter workspace/dashboard.

---

## 1. Verdict

| Question | Answer |
| --- | --- |
| Verified root cause (frontend routing/UX) | **Yes.** `/my-applications` signs in via shared `signIn` but **never navigates** to the renter home. “Open portal” goes to the **public** landlord landing (`/?tenant=`), not `/app/renter?tenant=`. |
| Auth/`signInWithPassword` broken? | **Not indicated in code.** Same `AuthProvider.signIn` used by tenant portal / apply. Session should update via `onAuthStateChange`. |
| Accept fails to create membership? | **Not indicated by schema/RPC.** `review_rental_application` accept → `manage_membership(..., 'renter', 'active')` with `auto_assigned: false`. Covered by RLS tests. |
| Dashboard gated on property assignment? | **No.** `RoleRoute` allows `renter` membership; `RenterDashboard` loads with zero assignments. |
| Wrong surface = platform admin? | **Only if** the renter uses bare `/login` (no `?tenant=`). That page **signs out** non–platform-admin members. `/my-applications` itself is not platform login. |
| Intended destination | `/app/renter?tenant=<slug>` via `workspaceAppHomePath` |

---

## 2. Sign-in on `/my-applications` (area 1–2)

### 2.1 Form → Supabase

```47:54:frontend/src/pages/MyApplicationsPage.tsx
  const onSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setSigningIn(true);
    const { error: err } = await signIn(email.trim(), password);
    setSigningIn(false);
    if (err) setAuthError(friendlyAuthError(err));
  };
```

- Uses `useAuth().signIn` → `supabase.auth.signInWithPassword` (`AuthProvider.tsx` 148–150).  
- **No** `navigate`, **no** `refreshMemberships` await, **no** `setActiveMembershipId`, **no** `workspaceAppHomePath`.  
- On success: only relies on React re-render when context `session` becomes non-null.

### 2.2 Session / AuthProvider

```110:119:frontend/src/auth/AuthProvider.tsx
    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, next) => {
      setSession(next);
      if (next?.user) {
        await Promise.all([loadProfile(next.user.id), refreshMemberships()]);
      } else {
        setProfile(null);
        setMemberships([]);
        setActiveMembershipId(null);
      }
      setLoading(false);
    });
```

Memberships load:

```73:77:frontend/src/auth/AuthProvider.tsx
    const { data } = await supabase
      .from("tenant_memberships")
      .select("*, tenant:tenants(*)")
      .eq("status", "active")
      .eq("user_id", current.user.id);
```

RLS allows self-SELECT (`memberships_select_self_admin_or_super`, `user_id = auth.uid()` — `20261014000014_tenant_member_isolation.sql` ~179–193).

**Finding:** Successful password sign-in should set `session` and load active memberships. The my-applications UI then swaps the sign-in form for the application list (`MyApplicationsPage.tsx` 81–109 vs 111–163). It does **not** enter `/app/*`.

**If the sign-in form remains after a credential attempt:** treat as Auth error / wrong password / unconfirmed email (surface `authError`), or a live session issue — **not** as missing post-login navigation. This audit did not exercise Live Auth.

---

## 3. Membership and role resolution (areas 3–4, 8)

### 3.1 Accept → active renter membership (no property assign)

```742:786:supabase/migrations/20261020090000_renter_applications_landlord_usernames.sql
  -- Accept: username map + active renter membership + mark accepted (same transaction).
  ...
  v_membership := public.manage_membership(
    v_app.tenant_id,
    v_app.applicant_user_id,
    'renter'::public.app_role,
    'active'::public.membership_status
  );
  ...
      'auto_assigned', false
```

RLS coverage (`frontend/src/test/rls.renterApplications.test.ts` ~322–360): accept → `role=renter`, `status=active`, **zero** active `rental_assignments`.

Browser contract (prior): `docs/RP-1.3.5_FINAL_BROWSER_VERIFICATION.md` Phase C — pending `/app/renter` Unauthorized; accept creates membership without auto-assign.

### 3.2 Authorization for `/app/renter`

| Layer | Behavior |
| --- | --- |
| `ProtectedRoute` | Requires any session; unauthenticated + `?tenant=` → tenant landing (`ProtectedRoute.tsx` 21–33) |
| `RoleRoute` for renter tools | Active membership with role in `renter` \| landlord roles and `tenant_type === "landlord"` (`App.tsx` 126–133; `ProtectedRoute.tsx` 100–108) |
| Property / assignment | **Not** required for route access |
| `RenterDashboard` | Queries assignments/charges; empty lists are OK (`RenterDashboard.tsx` 19–43) |

Pending/rejected applicants without an active membership: `RoleRoute` shows Unauthorized; tenant portal sign-in denies (“not registered”) — **correct**.

Renters do **not** match `hasPlatformAdminAccess` / platform Super Admin paths.

---

## 4. Post-login navigation and tenant context (areas 5–7)

### 4.1 Intended renter destination (existing helper)

```116:128:frontend/src/lib/roles.ts
export function workspaceAppHomePath(membership: WorkspaceNavMembership): string {
  ...
  if (type === "landlord") {
    if (role === "renter") return `/app/renter${q}`;
    return `/app/landlord${q}`;
  }
```

For `hodan-properties`: **`/app/renter?tenant=hodan-properties`**.

### 4.2 Paths that already navigate correctly

| Entry | Behavior |
| --- | --- |
| Tenant landing portal sign-in | After membership match → `navigate(workspaceAppHomePath(match))` (`TenantLandingPage.tsx` 198–208) |
| Already signed-in on landing | “Enter dashboard” → same helper (`TenantLandingPage.tsx` 373–380) |
| `/login?tenant=<slug>` | `destinationAfterAuth` → `workspaceAppHomePath` (`LoginPage.tsx` 69–86, 200, 207–208) |
| `/app` overview, single membership | `Navigate` to `workspaceAppHomePath` (`OverviewPage.tsx` 14–16) |

### 4.3 `/my-applications` gaps (verified)

| Issue | Evidence |
| --- | --- |
| No post-sign-in redirect to dashboard | `onSignIn` ends after `signIn` (`MyApplicationsPage.tsx` 47–54) |
| Copy points users at “landlord portal” | Lines 71–74 |
| Accepted CTA “Open portal” | Link to `/?tenant=…` only (150–155) — **not** `/app/renter?tenant=…`, **not** `/login?tenant=…` |
| Tenant query preserved on this page | Yes — `tenantKey` from search params (15–16); list RPC passes `p_tenant_key` (30–32) |
| After sign-in, tenant context for `/app` | Not applied until user reaches a path that sets active membership / navigates with `?tenant=` (`TenantSlugSync.tsx` 24–33) |

So even a **successful** my-applications sign-in leaves the renter on a public status page. Reaching the dashboard requires a second manual step (open portal → Enter dashboard, or use `/login?tenant=`).

### 4.4 Platform-admin trap (secondary)

Bare `/login` (`isPlatformLogin = !tenantSlug`, `LoginPage.tsx` 40–41):

- Labels UI “Platform admin sign in” (279–282).  
- If session exists and memberships are non-empty but lack platform-admin access → **`signOut()`** (102–109).  

An accepted renter who hits `/login` without `?tenant=` can be signed out and bounced — which can look like “sign-in never sticks” if they then return to `/my-applications`. This is **not** the my-applications form’s own logic, but a related footgun.

---

## 5. Root cause statement (verified)

The accepted-renter failure to “complete sign-in into the renter experience” from `/my-applications?tenant=…` is a **frontend routing/UX gap**, not missing accept-side membership or property-assignment gating:

1. **Primary:** `MyApplicationsPage` authenticates but does not route to `workspaceAppHomePath` / `/app/renter?tenant=…` when the user has an active renter membership for that tenant.  
2. **Contributing:** Accepted-row CTA and copy send users to the public landing instead of the renter app home (or tenant-scoped `/login`).  
3. **Not the cause (by design/tests):** Landlord accept already activates `renter`/`active` without assigning a property; `/app/renter` does not require an assignment.

---

## 6. Minimal proposed fix (do not implement in this RP)

Keep invite/provision/assign/move-out untouched.

1. After successful `signIn` on `MyApplicationsPage`:  
   - `await refreshMemberships()` (or wait for memberships).  
   - If an **active** membership matches `tenantKey` with role `renter` (or any allowed workspace role for that tenant), `setActiveMembershipId` + `navigate(workspaceAppHomePath(match))`.  
   - If session OK but **no** active membership for that tenant: stay on the page and show applications (pending/rejected applicants).  
2. Change accepted “Open portal” (when already signed in with membership) to link/navigate to `workspaceAppHomePath` (or `/app/renter?tenant=…`), not only `/?tenant=`.  
3. Optional: deep-link helper ` /login?tenant=…&next=/app/renter?tenant=…` for unauthenticated accepted users — only if keeping password entry on LoginPage is preferred over in-page sign-in.  
4. Do **not** grant access without active membership; do **not** auto-assign property; do **not** use platform `/login` without tenant for renters.

---

## 7. Regression tests needed

| Test | Intent |
| --- | --- |
| Unit: `workspaceAppHomePath` for landlord + `renter` | Returns `/app/renter?tenant=<slug>` |
| Unit/integration (MyApplications wiring): after sign-in mock with active renter membership for `tenant` | Navigates to that path |
| Same with pending-only (no membership) | Stays on `/my-applications`; no `/app/renter` |
| Rejected applicant | No private renter access |
| Accepted + no assignment | Still allowed into `/app/renter` (RoleRoute); dashboard empty OK |
| Platform `/login` without tenant as renter | Remains denied / signed out (existing contract) |
| Static: accept RPC still `auto_assigned: false` / no `assign_renter` in review path | Preserve non-auto-assign |

Existing: `rls.renterApplications.test.ts` (accept membership, no assignment); RP-1.3.5 browser notes for pending Unauthorized. **Missing:** frontend tests for my-applications post-login navigation.

---

## 8. Uncertainty (live / DB — not inspected)

| Item | Note |
| --- | --- |
| Specific Live user row | Whether the observed test account has `tenant_memberships` `(renter, active)` for `hodan-properties` was **not** queried this audit |
| Auth credential / email confirm state | Not exercised; form persistence after failed Auth is expected |
| Whether reporter clicked “Open portal” vs expected auto-dashboard | Symptom matches missing auto-route even when Auth succeeds |
| Hosted Auth settings | Unchanged / unread |

---

## 9. Static checks this session

- Code path review: `MyApplicationsPage.tsx`, `AuthProvider.tsx`, `LoginPage.tsx`, `TenantLandingPage.tsx`, `ProtectedRoute.tsx`, `roles.ts`, `OverviewPage.tsx`, `App.tsx`, `RenterDashboard.tsx`, `TenantSlugSync.tsx`, accept RPC migration, RLS application tests.  
- No env/dashboard/DB/user changes; no credentials/tokens printed.

Automated (safe):

```text
cd frontend
npx vitest run src/lib/signupEmailRedirect.test.ts src/lib/supabaseEnv.test.ts src/lib/liveLocalEnvSeparation.test.ts src/lib/passwordForm.test.ts
→ Test Files  4 passed (4)
→ Tests       19 passed (19)
```

---

## 10. Explicit confirmations

- Audit only — **no fix implemented**.  
- No Auth users, passwords, memberships, applications, assignments, or Supabase settings altered.  
- No migrations, env edits, or deploys.  
- RP-1.4 not started.
