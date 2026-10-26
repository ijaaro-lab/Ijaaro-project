# RP-1.3.28 — Existing Renter Login / Dashboard Bounce Diagnostic

**Date:** 2026-10-20  
**Scope:** Diagnostic only — temporary DEV logs + unit tests allowed; **no permanent fix**, no env/schema/Auth/membership mutations, no deploy, no RP-1.4  
**Tenant:** `hodan-properties`  
**Account under test:** existing Live renter (operator-specified; password never stored/logged/reported)  
**Expected destination:** `/app/renter?tenant=hodan-properties`

---

## 1. Verdict

| Layer | Finding |
| --- | --- |
| **Observed runtime (operator)** | Existing renter signs in → dashboard appears to begin opening → returns to landlord public homepage `/?tenant=hodan-properties`. |
| **Observed runtime (agent, post-state)** | After operator test: route `/?tenant=hodan-properties`, portal login form visible, **no** Welcome back, **`sb-*auth-token` absent** (session storage cleared). Agent did **not** watch the live sign-in→flash→bounce sequence in-browser this turn. |
| **DB (safe)** | That account has **active** membership, role label **`renter`**, tenant **`hodan-properties`** / `landlord`. |
| **Exact redirect trigger (code-proven)** | `ProtectedRoute` when React `session` is null and `?tenant=` is present → `<Navigate to="/?tenant=…" />` (`ProtectedRoute.tsx` 21–44). This is the **only** automatic path from `/app/*?tenant=` back to the public tenant homepage with the query preserved. |
| **Why session is gone (best current explanation)** | Final storage empty ⇒ session was **cleared** (typically `signOut()` / `SIGNED_OUT`), not merely a React vs storage desync. Password `onSubmit` still calls `signOut()` when destination resolution fails after Auth success (`TenantLandingPage.tsx` ~260–275). A success `navigate` followed by a later `signOut` (e.g. racing second submit / empty refresh) would match: brief `/app/renter` → bounce → empty storage + login form. |
| **Root cause status** | **Redirect trigger: proven in code + unit tests.** **Session-clear timing relative to navigate: strongly evidenced, not fully browser-instrumented** until operator captures `[ijaaro:rp1328]` console breadcrumbs on one reproduce. |
| **Permanent fix** | Proposed below — **not implemented** in this RP. |

---

## 2. Observed vs hypothesis (keep separate)

### 2.1 Observed runtime facts

| # | Fact | Source |
| --- | --- | --- |
| O1 | Renter signs in on Live `http://127.0.0.1:5173/?tenant=hodan-properties` | Operator manual test |
| O2 | UI briefly looks like the dashboard is opening | Operator |
| O3 | Navigation settles on public landlord homepage `/?tenant=hodan-properties` | Operator |
| O4 | Account has active `renter` on `hodan-properties` | Live SQL (role/status/slug only) |
| O5 | Post-bounce agent capture: route `/?tenant=hodan-properties`, login form, **no** auth storage key, **no** Welcome back, **no** “not registered” alert visible at capture time | Cursor browser CDP after operator test |
| O6 | Agent did not observe the mid-flight `/app/renter` URL in DevTools for that sign-in | Agent limitation this turn |

### 2.2 Code-based hypotheses (not all proven in browser)

| ID | Hypothesis | Fit to O1–O5 |
| --- | --- | --- |
| H1 | `navigate(/app/renter?tenant=…)` succeeds, then React `session` becomes null → `ProtectedRoute` redirects to `/?tenant=` | Fits O2–O3; requires session loss |
| H2 | After Auth success, `refreshMemberships()` returns `[]` / no match → `onSubmit` **`signOut()`** → stay/return on landing with cleared storage | Fits O3+O5 strongly; alone weak for O2 unless user mistook spinner for dashboard |
| H3 | Success navigate **then** a racing failure path / second submit calls `signOut()` → ProtectedRoute bounce + empty storage | Fits O2+O3+O5 best as combined story |
| H4 | Role/tenant mismatch → Unauthorized | **Poor fit** — `RoleRoute` stays on `/app/*`, does not send to public homepage |
| H5 | Catch-all `*` → `/` | **Poor fit** — drops `?tenant=` |

---

## 3. Traced transition (current code)

```text
Portal password Sign in
  → AuthProvider.signIn (signInWithPassword)
  → onAuthStateChange(SIGNED_IN) → setSession(next) + refreshMemberships()
  → onSubmit.resolveFreshPortalDestination
       → supabase.auth.getSession()          // storage session
       → rows = await refreshMemberships()   // returns array; also setMemberships
       → resolveTenantPortalDashboardDestination(rows, key)
  → if ok: navigate(/app/renter?tenant=…, { replace: true })
  → else: signOut() + "This account is not registered."

 /app/renter?tenant=…
  → ProtectedRoute
       → loading? wait
       → !React session? Navigate → /?tenant=…     ★ bounce trigger
       → else Outlet → AppShell → RoleRoute → RenterDashboard
```

### Key files / lines

| Piece | Path | Lines (approx.) |
| --- | --- | --- |
| Password submit + `signOut` on fail | `frontend/src/pages/TenantLandingPage.tsx` | `onSubmit` / `resolveFreshPortalDestination` |
| Enter dashboard (no `signOut` on fail) | same | `enterDashboard` |
| `refreshMemberships` returns rows | `frontend/src/auth/AuthProvider.tsx` | `refreshMemberships` |
| React session updates | same | `onAuthStateChange` |
| Destination + path | `frontend/src/lib/myApplicationsNav.ts`, `frontend/src/lib/roles.ts` | `resolveTenantPortalDashboardDestination`, `workspaceAppHomePath` |
| Bounce to public tenant home | `frontend/src/auth/ProtectedRoute.tsx` | `!session` + `tenantFromQuery` |

### Session / membership notes

- Destination resolution uses **storage** `getSession` + **returned** memberships.  
- `ProtectedRoute` uses **React** `session` only.  
- `refreshMemberships()` **does** return fresh rows (not fire-and-forget only).  
- On `getSession()` without user it returns `[]` **and** clears React memberships.  
- Query `error` was previously ignored (now only flagged in DEV debug as boolean).

---

## 4. Temporary DEV diagnostics added

Safe breadcrumbs only (`[ijaaro:rp1328]`). No credentials, tokens, cookies, emails, or private payloads.

| File | What is logged |
| --- | --- |
| `frontend/src/lib/authFlowDebug.ts` | Helper (DEV-only `console.info`) |
| `AuthProvider.tsx` | `onAuthStateChange` event + session present; `refreshMemberships` counts/roles/slugs; `signOut` ran |
| `TenantLandingPage.tsx` | Resolve kind, destination, React session present, password-submit navigate vs `signOut_after_resolve_fail` |
| `ProtectedRoute.tsx` | Redirect stage + tenant key + path when bouncing |

**Operator capture (one reproduce):** DevTools → Console → filter `ijaaro:rp1328`. Note order of:

1. `onAuthStateChange` / `refreshMemberships`  
2. `resolveFreshPortalDestination` (`kind=ok` vs fail)  
3. `portalPasswordSubmit` (`navigate` vs `signOut_after_resolve_fail`)  
4. `ProtectedRoute` `redirect_query_tenant`  
5. Whether `signOut` appears **after** `navigate`

Remove these logs when the permanent fix lands.

---

## 5. Unit / typecheck results (actual)

```text
npx vitest run src/auth/ProtectedRoute.test.tsx src/pages/TenantLandingPage.test.tsx src/lib/authFlowDebug.test.ts src/lib/myApplicationsNav.test.ts
→ Test Files  4 passed (4)
→ Tests       15 passed (15)

npm run typecheck
→ tsc --noEmit  (exit 0)
```

New coverage:

| Test | Proves |
| --- | --- |
| `ProtectedRoute` session null on `/app/renter?tenant=` | Redirects to tenant landing (exact bounce trigger) |
| `ProtectedRoute` session present | Renders outlet (no bounce) |
| `ProtectedRoute` loading | Waits; no bounce yet |
| Password submit + renter membership | Navigates to `/app/renter?tenant=`; **no** `signOut` |
| Password submit + empty refresh | **`signOut`**; no navigate |

---

## 6. Minimal proposed fix (do **not** implement in this RP)

1. **Stop clearing a just-established session on a single empty membership refresh** after password Auth success — align with Enter dashboard: retry once, keep session, show a non-destructive error; only `signOut` on definitive denial (other-org / super-admin).  
2. **Gate `ProtectedRoute` bounce** — while transitioning after portal sign-in, treat “storage session present + React session still null” as loading (or sync React session from the SIGNED_IN payload before navigate).  
3. **Guard double submit** — disable Sign in until the in-flight resolve finishes (already partially via `submitting`; ensure it cannot run two resolves that end in navigate + `signOut`).  
4. **Remove** `[ijaaro:rp1328]` temporary logs after the fix is verified.  
5. Do **not** change roles, memberships, applications, property assignments, env, migrations, or deploy.

---

## 7. Explicit confirmations

- Diagnostic scope only; permanent fix **not** applied.  
- Temporary DEV logs + unit tests only.  
- No password/token printed or hardcoded in source/env/reports.  
- No new renter/application/membership/property; no password reset; no service-role impersonation.  
- No Live data/schema/env/deploy changes; RP-1.4 not started.  
- Full Live browser pass/fail with console breadcrumb sequence still needs one operator reproduce with DevTools open — do not claim that instrumentation run until it is done.
