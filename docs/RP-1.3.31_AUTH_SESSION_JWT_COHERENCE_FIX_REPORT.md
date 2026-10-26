# RP-1.3.31 — Auth Session / Client JWT Coherence Fix Report

**Date:** 2026-10-20  
**Scope:** Smallest safe frontend fix for React session vs Supabase client JWT race (RP-1.3.30 hypothesis)  
**Constraints honored:** existing renter only; no Live RLS/grants/schema/migrations; no env/port/deploy; no RP-1.4

---

## 1. Confirmed root cause vs remaining hypotheses

| Claim | Status |
| --- | --- |
| Homepage bounce is `ProtectedRoute` when React `session` is null (`/?tenant=` preserved) | **Confirmed** (RP-1.3.30 code + tests) |
| Live rent-table SELECT policies already allow renter/payer self-access; `42501` ≠ missing renter RLS | **Confirmed** (RP-1.3.30 Live SQL) |
| Mount-time `getSession().then(setSession)` can overwrite a newer `SIGNED_IN` / `signIn` session with a **stale null** | **Confirmed in code**; regression-tested in `AuthProvider.test.tsx` |
| React-only session (mirrored in `signIn`) can allow `/app/renter` paint while PostgREST still lacks JWT → `42501` as `anon` | **Strong hypothesis** (RP-1.3.30); mitigated by client JWT gate before navigate + `confirmClientSession` after password sign-in |
| Operator Network proof that failing GETs lacked `Authorization` | **Still unconfirmed** (not packet-captured) |

**Root cause addressed by this RP:** unconditional application of a slow/stale initial `getSession` result (including null) after a newer authenticated session was already committed, plus navigating into protected renter routes before the client session read was confirmed.

---

## 2. Exact changes

### `frontend/src/auth/authSessionCoherence.ts` (new)

- `shouldApplyInitialSession(epochAtStart, currentEpoch)` — ignore mount `getSession` once a newer auth commit exists.
- `confirmClientSession(getSession, userId)` — short poll until client storage session matches; **never** signs out on failure.

### `frontend/src/auth/AuthProvider.tsx`

- `authEpochRef` + `commitSession()` for every authoritative update (`onAuthStateChange`, successful `signIn`, and eligible initial `getSession`).
- Initial `getSession().then` **skips** apply when epoch advanced (stale-null protection).
- `signIn`: `commitSession` then `confirmClientSession` before returning; **no** `signOut` on transient confirm miss.
- `refreshMemberships()` without a resolvable user id **keeps** existing memberships (does not clear on transient storage null). Real sign-out still clears via `commitSession(null)`.
- Membership / role checks unchanged (`RoleRoute`, denial helpers untouched).

### `frontend/src/pages/TenantLandingPage.tsx`

- After successful destination resolve, **require** `supabase.auth.getSession()` user before `navigate(/app/renter?tenant=…)`.
- Missing client JWT → non-destructive retry message; **no** `signOut`.

### Tests

- `authSessionCoherence.test.ts` — epoch guard + confirm polling.
- `AuthProvider.test.tsx` — stale mount null cannot clear `SIGNED_IN`; `signIn` confirms client session.
- `TenantLandingPage.test.tsx` — renter navigate when client JWT present; no navigate/signOut when client JWT missing after resolve.

### Diagnostics

- No temporary auth-flow logs added; prior RP-1.3.28 breadcrumbs remain removed.

---

## 3. What was not changed

- `ProtectedRoute` still requires a React session (no unauthenticated bypass).
- Live RLS, grants, schema, migrations, env files, ports — unchanged.
- No deploy; RP-1.4 not started; no new users/applications/memberships.

---

## 4. Verification results

```text
npx vitest run src/auth/authSessionCoherence.test.ts src/auth/AuthProvider.test.tsx \
  src/auth/ProtectedRoute.test.tsx src/pages/TenantLandingPage.test.tsx \
  src/pages/renter/RenterDashboard.test.tsx
→ Test Files  5 passed (5)
→ Tests       20 passed (20)

npm run typecheck  → exit 0
npm run build      → exit 0
```

| Coverage | Expectation |
| --- | --- |
| Stale-null protection | Mount `getSession(null)` after `SIGNED_IN` leaves React user set |
| Client confirm on sign-in | `signIn` returns session after client `getSession` matches |
| Renter navigate | `/app/renter?tenant=hodan-properties` when membership + client JWT OK |
| Client JWT missing | No navigate, no `signOut` |
| ProtectedRoute bounce | Still redirects when React session truly null |

---

## 5. Remaining manual browser verification

Please re-test with the **existing** renter on Live local (`npm run dev`, `/?tenant=hodan-properties`):

1. Portal Login → password sign-in.  
2. Expect settle on `/app/renter?tenant=hodan-properties` (no bounce to public landing).  
3. Optional: Network — rent GETs should be **200** (often empty arrays) with an authenticated request, not `42501`.  
4. If anything still bounces, capture whether React session / `sb-*` storage cleared and whether `Authorization` was present on failing calls (redact token values).

---

## 6. Explicit confirmations

- Smallest safe coherence fix applied; ProtectedRoute retained.  
- No `signOut` on transient null session reads.  
- No Live DB/policy/env/deploy changes; existing renter reused; RP-1.4 not started.
