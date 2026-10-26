# RP-1.3.29 — Renter Session Resolution Fix Report

**Date:** 2026-10-20  
**Scope:** Minimal fix for confirmed RP-1.3.28 race (`no_session` → unintended `signOut` after successful renter password sign-in)  
**Tenant:** `hodan-properties`  
**Expected destination:** `/app/renter?tenant=hodan-properties`  
**Constraints honored:** no Live DB/schema/env/port changes, no deploy, no RP-1.4, existing renter/membership unchanged

---

## 1. Confirmed evidence (from RP-1.3.28)

| Step | Observation |
| --- | --- |
| `SIGNED_IN` | Session present |
| `refreshMemberships` | Session present; one active `renter` on `hodan-properties`; no query error |
| `resolveFreshPortalDestination` | `kind: no_session` (session absent) |
| `portalPasswordSubmit` | `signOut_after_resolve_fail` → `SIGNED_OUT` |
| UI result | Redirect back to `/?tenant=hodan-properties` |

---

## 2. Root cause

**Session source mismatch + auth-callback race, then destructive recovery.**

1. Password sign-in succeeds via `signInWithPassword` → `SIGNED_IN` with a valid session.
2. `AuthProvider`’s `onAuthStateChange` was **async** and **awaited** `refreshMemberships()` / `loadProfile()`, which call Supabase auth + PostgREST **inside** the auth notification callback (known unsafe pattern; supabase/auth-js#762).
3. That in-callback `refreshMemberships` could still see the session (matches evidence).
4. Immediately afterward, `TenantLandingPage.resolveFreshPortalDestination` called a **fresh** `supabase.auth.getSession()` and observed **null** (`kind: no_session`) — a transient storage/lock race, not a real sign-out.
5. Password `onSubmit` treated any non-`ok` resolve (including `no_session`) as “not registered” and called **`signOut()`**, clearing the just-established session.
6. Navigation (or a follow-on `/app/renter` attempt) then hit `ProtectedRoute` with React `session === null` → bounce to `/?tenant=hodan-properties`.

So the membership/role data were fine; the resolver’s independent `getSession()` + premature `signOut()` were the failure mode.

---

## 3. Exact changes

### `frontend/src/auth/AuthProvider.tsx`

- `onAuthStateChange` callback is **synchronous**: set React session immediately; defer profile/membership loads with `setTimeout(0)` so they run outside the auth notify path.
- Deferred refresh uses `next.user.id` (no `getSession()` inside the callback).
- `refreshMemberships(userId?: string)` accepts an optional user id so callers with a known session skip storage `getSession()`.
- `signIn` returns `{ error, session }` from `signInWithPassword` and **mirrors** `data.session` into React state immediately (so `ProtectedRoute` does not bounce before the auth listener re-render lands).
- Removed temporary RP-1.3.28 diagnostic logs.

### `frontend/src/pages/TenantLandingPage.tsx`

- `resolveFreshPortalDestination(knownSession?)` prefers: sign-in session → React session → storage `getSession()` (last resort).
- Passes `current.user.id` into `refreshMemberships`.
- Password submit uses `result.session` from `signIn`.
- **`no_session` after Auth success no longer calls `signOut()`** — shows a non-destructive retry message instead.
- Still signs out on confirmed session with no usable membership / denial (true “not registered” / wrong-org cases).
- Removed temporary diagnostic logs.

### `frontend/src/auth/ProtectedRoute.tsx`

- Removed temporary diagnostic logs (bounce behavior unchanged).

### Removed

- `frontend/src/lib/authFlowDebug.ts`
- `frontend/src/lib/authFlowDebug.test.ts`

### Tests

- `frontend/src/pages/TenantLandingPage.test.tsx` — RP-1.3.29 password-submit regressions (see below).

---

## 4. Regression coverage

| Case | Expectation |
| --- | --- |
| Auth success + active renter membership | Navigate to `/app/renter?tenant=hodan-properties`; **no** `signOut` |
| Auth success session present but storage `getSession` null | Still navigates using sign-in session; **no** `signOut` |
| Transient `no_session` (no sign-in session + storage null) | Error shown; **no** `signOut`; no navigate |
| Auth success + empty memberships | `signOut` (definitive not registered); no navigate |
| Existing Enter-dashboard + ProtectedRoute bounce tests | Still pass |

---

## 5. Verification run (this RP)

```text
npx vitest run src/auth/ProtectedRoute.test.tsx src/pages/TenantLandingPage.test.tsx src/lib/myApplicationsNav.test.ts
→ Test Files  3 passed (3)
→ Tests       16 passed (16)

npm run typecheck
→ tsc --noEmit  (exit 0)

npm run build
→ tsc -b && vite build  (exit 0)
```

---

## 6. Remaining verification (operator)

1. On Live local (`npm run dev`, port 5173): open `/?tenant=hodan-properties`.
2. Portal Login → sign in with the **existing** renter (do not create accounts/apps).
3. Confirm navigation settles on `/app/renter?tenant=hodan-properties` (Welcome / renter app, not bounced homepage).
4. Confirm session persists (no immediate return to public landing; no “not registered” flash from a false `no_session`).
5. Optional: Sign out from renter app → lands on tenant homepage; re-enter via Welcome back / password still works.

---

## 7. Explicit confirmations

- Root cause addressed with smallest safe fix (session source + no premature `signOut`); not error-suppression/retry-only.
- Temporary `[ijaaro:rp1328]` diagnostics removed; no passwords/tokens/cookies/PII logged.
- No Live DB data/schema/migrations/env/port changes; no deploy; RP-1.4 not started.
- Existing renter account/membership reused; no new accounts or applications.
