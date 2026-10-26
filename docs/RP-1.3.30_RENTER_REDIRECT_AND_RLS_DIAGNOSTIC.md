# RP-1.3.30 — Renter Redirect and RLS Diagnostic

**Date:** 2026-10-20  
**Scope:** Diagnosis only — no hosted DB policy/schema/migration/env/port/deploy changes; no RP-1.4  
**Context:** After RP-1.3.29, existing renter briefly sees the dashboard then returns to `/?tenant=hodan-properties`. DevTools shows PostgREST `42501` on `rental_assignments`, `rent_charges`, `rent_payments`.  
**Constraint:** Existing renter/membership only — no new accounts, applications, or property assignments.

---

## 1. Verdict (keep layers separate)

| Finding | Confidence | Kind |
| --- | --- | --- |
| **Exact UI redirect** after session is gone: `ProtectedRoute` → `/?tenant=<slug>` | **Proven in code + unit tests** | Runtime path matches code |
| **RenterDashboard / RoleRoute / data errors do not navigate** to the public homepage | **Proven in code + unit tests** | Code |
| **`42501` is not caused by a missing renter SELECT RLS policy** on Live for these tables | **Proven via Live SQL** (policies allow `renter_id` / `payer_id = auth.uid()`; `authenticated` has SELECT) | Runtime (DB) |
| **`42501` means table privilege failure for the DB role used — consistent with `anon` (no JWT), not “renter RLS denied row”** | **Strong** (Live: `anon` SELECT=false; RLS denials return empty `200`, not `42501`) | Code + Live SQL; request role not packet-captured this turn |
| **Redirect root cause is session becoming null (auth), not the rent-table load errors** | **Strong** | Code: only `ProtectedRoute` preserves `?tenant=` bounce from `/app/*` |
| **What clears React session after the brief dashboard paint** | **Hypothesis (not browser-instrumented this turn)** | Likely auth-client / React session desync after RP-1.3.29 mirror; see §5 |

---

## 2. Confirmed operator observations vs this turn

### Runtime-confirmed (operator)

| # | Fact |
| --- | --- |
| O1 | After RP-1.3.29, dashboard briefly appears |
| O2 | Browser settles on `/?tenant=hodan-properties` |
| O3 | Network shows HTTP/PostgREST `42501` involving `rental_assignments`, `rent_charges`, `rent_payments` |

### Runtime-confirmed (agent this turn)

| # | Fact |
| --- | --- |
| A1 | Post-bounce page on Live local: `http://127.0.0.1:5173/?tenant=hodan-properties`, portal landing, **no** `sb-*` auth storage keys |
| A2 | Live DB: RLS enabled+forced on the three rent tables |
| A3 | Live DB: SELECT policies include renter/payer self-access (`renter_id = auth.uid()` / `payer_id = auth.uid()`) |
| A4 | Live DB: `authenticated` has SELECT on all three; `anon` does **not** |
| A5 | Agent did **not** re-run password sign-in (no credentials); did **not** capture live response bodies for the failing requests this turn |

### Code-proven

| # | Fact |
| --- | --- |
| C1 | Sole automatic navigate from `/app/renter?tenant=` → `/?tenant=` is `ProtectedRoute` when React `session` is null |
| C2 | `RoleRoute` failure stays on `/app/*` with “Unauthorized” (does not send to public homepage) |
| C3 | `App.tsx` `*` → `/` **drops** `?tenant=` (does not match O2) |
| C4 | `RenterDashboard` on query error only `setError(...)` — no `navigate`, no `signOut` |
| C5 | RP-1.3.29 temporary `[ijaaro:rp1328]` diagnostics already removed; none re-added |

---

## 3. Exact redirect source

### Trace

```text
/app/renter?tenant=hodan-properties
  → ProtectedRoute
       loading? → wait
       React session present? → Outlet → AppShell → RoleRoute → RenterDashboard
       React session null + ?tenant= → <Navigate to="/?tenant=hodan-properties" replace />
                                         ▲
                                         ★ only code path that matches O2
```

| Candidate | Navigates to `/?tenant=`? | Notes |
| --- | --- | --- |
| `ProtectedRoute` (`frontend/src/auth/ProtectedRoute.tsx`) | **Yes** | When `!session` and query tenant present |
| `RoleRoute` | No | Unauthorized notice on `/app/*` |
| `RenterDashboard` effect | No | Inline error only |
| `RenterPaymentsPage` / `RenterTenancyPage` | No | Same pattern |
| `AppShell.handleSignOut` | Yes, but only on explicit Sign out | Not automatic |
| `App.tsx` `*` | To `/` without tenant | Mismatch with O2 |
| `TenantSlugSync` | Only adjusts `?tenant=` on `/app/*` | Does not send to landing |

**Conclusion:** The homepage return is the **auth guard bounce** after React `session` becomes null. It is **not** a navigation triggered by rent-table `42501` handlers.

---

## 4. Permission errors (`42501`)

### Expected request shape (from `RenterDashboard`)

| Table | HTTP (PostgREST) | Filter | Dashboard reaction on error |
| --- | --- | --- | --- |
| `rental_assignments` | `GET` / `SELECT` | `renter_id=eq.<user>` | `setError(message)` only |
| `rent_charges` | `GET` / `SELECT` | `renter_id=eq.<user>`, `status≠paid` | same |
| `rent_payments` | `GET` / `SELECT` | `payer_id=eq.<user>`, `limit=5` | same |

Operator confirmed these names fail with `42501`. Full response JSON / `message` text was not re-captured this turn (no sign-in reproduce). Typical Postgres/PostgREST text for this code: `permission denied for table <name>` (or schema privilege wording). **Do not log Authorization headers or JWTs.**

### Live authorization model (SQL this turn)

**Policies (SELECT, `authenticated`):**

| Table | Policy | USING (summary) |
| --- | --- | --- |
| `rental_assignments` | `rental_assignments_select` | `can_manage_landlord_ops(tenant_id) OR renter_id = auth.uid() OR is_super_admin()` |
| `rent_charges` | `rent_charges_select` | `can_manage_landlord_ops(tenant_id) OR renter_id = auth.uid() OR is_super_admin()` |
| `rent_payments` | `rent_payments_select` | `can_manage_landlord_ops(tenant_id) OR payer_id = auth.uid() OR is_super_admin()` |

**Grants (Live `has_table_privilege`):**

| Table | `anon` SELECT | `authenticated` SELECT |
| --- | --- | --- |
| `rental_assignments` | false | true |
| `rent_charges` | false | true |
| `rent_payments` | false | true |

### Significance of each failure

| Table | Missing renter SELECT policy? | Expected if authenticated renter, no assignment | Most likely `42501` meaning |
| --- | --- | --- | --- |
| `rental_assignments` | **No** — self-access exists | **HTTP 200 + `[]`** (accepted renters often have zero assignments) | Request role **`anon`** (no/invalid JWT on request) or equivalent privilege miss — **not** “RLS hid rows” |
| `rent_charges` | **No** | **200 + `[]`** | same |
| `rent_payments` | **No** | **200 + `[]`** | same |

**Product note (prior RPs):** Accepting an application creates an active `renter` membership **without** auto-creating `rental_assignments`. Empty tenancy lists are **valid UX**, not an auth failure.

**Do not** broadly GRANT to `anon` or disable RLS. A policy change is **not** indicated for “renter cannot SELECT own rows” — that path already exists. If a future fix is needed on the DB side, it would only be after proving `authenticated` + valid `auth.uid()` still gets `42501` (unexpected given current Live ACLs).

---

## 5. Redirect root cause vs data-loading errors

| Layer | Causes homepage bounce? |
| --- | --- |
| `42501` on rent tables | **No** (dashboard stays; shows error banner) |
| React `session` → null while URL is `/app/renter?tenant=` | **Yes** → `ProtectedRoute` |

### Why session can clear after a brief dashboard paint (hypotheses)

Ranked for fit with O1–O3 + A1 + RP-1.3.29 behavior (“navigate works, then bounce”):

| ID | Hypothesis | Fit |
| --- | --- | --- |
| H1 | **React session mirrored in `signIn` / `SIGNED_IN` while Supabase client JWT is briefly unavailable** → dashboard paints (React session) → PostgREST as `anon` → `42501` → later auth-state/`getSession` settles to null → `ProtectedRoute` bounce | Best fit for **dashboard + 42501 + bounce** together |
| H2 | **Stale initial `getSession().then(setSession)`** in `AuthProvider` overwrites a newer signed-in session with `null` if the mount read races a later sign-in / remount | Plausible; code has unconditional `setSession(data.session)` on initial resolve |
| H3 | Residual unintended `signOut()` from portal submit | Weaker after RP-1.3.29 (`no_session` no longer signs out); empty membership still signs out **before** navigate, which would not show a dashboard |
| H4 | `RoleRoute` / empty memberships | Poor — Unauthorized, not public homepage |

**RP-1.3.29 related surface (code):**

```text
signIn → setSession(data.session)     // React-only mirror
onAuthStateChange → setSession(next)  // sync
setTimeout(0) → loadProfile / refreshMemberships(userId)
TenantLandingPage → navigate(/app/renter?tenant=…)
ProtectedRoute reads React session only
RenterDashboard queries use supabase client Authorization (storage/client session)
```

That split (React session vs client JWT for fetches) is the most coherent explanation for **seeing the shell briefly while Network shows privilege errors**, then bouncing when React session finally clears.

---

## 6. Minimal proposed fix (do **not** apply in this RP)

1. **Auth session coherence (primary)**  
   - Treat client auth session as source of truth for “signed in”.  
   - Prevent stale `getSession()` null from overwriting a newer `SIGNED_IN` / `signIn` session (generation/seq guard).  
   - Optionally keep `ProtectedRoute` waiting while auth is settling (loading) when storage session exists but React session is still null — inverse of today’s “React ahead of client” failure mode.

2. **Dashboard fetches**  
   - Start rent queries only after `supabase.auth.getSession()` (or equivalent) confirms a user; on failure show inline error — **already no navigate** (keep that).

3. **RLS / grants**  
   - **No change** unless a follow-up proves `authenticated` + valid JWT still returns `42501` on these SELECTs.  
   - Do **not** grant `anon` SELECT; do **not** disable RLS.

4. **No** new renter, application, membership, or property assignment for diagnosis or fix validation beyond the existing account.

---

## 7. Tests added / run

| Test | Proves |
| --- | --- |
| `ProtectedRoute` session null on `/app/renter?tenant=` | Exact bounce to `/?tenant=` (RP-1.3.30 redirect trigger) |
| `ProtectedRoute` session present | Outlet renders (no bounce) |
| `RenterDashboard` `42501`-style errors | Inline error; **no** navigate; **no** signOut; shell remains |
| `RenterDashboard` empty success | “No tenancies yet”; no error; no navigate/signOut |
| Existing TenantLandingPage RP-1.3.29 cases | Still pass |

```text
npx vitest run src/auth/ProtectedRoute.test.tsx src/pages/renter/RenterDashboard.test.tsx src/pages/TenantLandingPage.test.tsx
→ Test Files  3 passed (3)
→ Tests       13 passed (13)

npm run typecheck  → exit 0
npm run build      → exit 0
```

---

## 8. Remaining verification (operator / next RP)

1. Reproduce once with DevTools Network: confirm status, response `code`/`message` for each of the three GETs (**redact** Authorization).  
2. In the same capture, note whether `Authorization: Bearer` is present on those failing requests.  
3. Console/auth timeline: which event clears session **after** `/app/renter` paints (`SIGNED_OUT` vs React-only overwrite).  
4. Only after review: implement §6 AuthProvider/session coherence fix — still without broad RLS grants.

---

## 9. Explicit confirmations

- Diagnosis only; **no** Live policy/schema/migration/env/port/deploy changes.  
- **No** new renter / application / membership / property assignment.  
- RP-1.4 not started.  
- Temporary RP-1.3.28 diagnostic logs remain removed; none added for this RP.  
- Redirect source and “errors ≠ navigate” are code-proven; Live RLS/grants inspected; full Network JWT presence on failing calls still needs one operator capture.
