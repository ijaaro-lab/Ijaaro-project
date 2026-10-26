# RP-1.3.24 — Renter Session and Membership Resolution Diagnostic

**Date:** 2026-10-20  
**Scope:** Diagnosis only — no fix, no Auth/user mutations, no env/schema/deploy, no RP-1.4  
**Target tenant slug:** `hodan-properties`  
**App under test:** Vite Live mode on `http://127.0.0.1:5173` (`npm run dev`)  

---

## 1. Runtime access status

| Access | Result |
| --- | --- |
| Public browser (unauthenticated) | **Available** — landing `/?tenant=hodan-properties` loaded; Portal Login present |
| Authenticated browser (renter password sign-in → Enter dashboard) | **Not available this session** — no renter credentials supplied; safety rules forbid prompting for / logging passwords or tokens |
| Live DB read (aggregate counts only, no PII) | **Available** via Supabase SQL MCP |
| Agent-claimed full runtime verification of checkpoints 1–3, 5–7 | **No** — those require an authenticated browser session |

**Therefore:** This report does **not** claim end-to-end browser verification of the loop. It combines (A) safe Live DB facts, (B) static code checkpoint mapping, and (C) a manual capture checklist for the operator.

---

## 2. Safe Live DB evidence (checkpoint 4 — server side)

Query: aggregates only for `tenants.slug = 'hodan-properties'` (no emails, user ids, or tokens printed).

| Fact | Value |
| --- | --- |
| Tenant status | `active` |
| Tenant type | `landlord` |
| Active `renter` memberships | **1** |
| Active memberships (all roles) | **2** |
| Accepted applications | **1** |
| Pending applications | **0** |
| Accepted apps missing active renter membership | **0** |

**Checkpoint 4 (DB):** The Live project **does** have an active `renter` membership for `hodan-properties`, and every accepted application on that tenant has a matching active renter membership. A “no membership in database” explanation for the loop is **ruled out** for the current Live data.

**Not verified from DB alone:** whether the **browser Auth session** is the same user as that membership row (would require authenticated client checks without printing identity).

---

## 3. Checkpoint matrix

| # | Checkpoint | Code expectation | Verified this RP? | Status |
| --- | --- | --- | --- | --- |
| 1 | Session present after password sign-in | `signIn` → `onAuthStateChange` sets session (`AuthProvider.tsx` 148–150, 112–113). Welcome back UI requires `session` (`TenantLandingPage.tsx` 131–139). | Browser auth **not run** | **Inferred PASS when Welcome back is visible** (prior confirmed UX) |
| 2 | Session still present after Enter dashboard | Enter dashboard does **not** call `signOut` (377–380). Loss ⇒ `ProtectedRoute` bounce. | Browser auth **not run** | **Primary suspect if URL becomes `/?tenant=…`** |
| 3 | AuthProvider refreshes memberships before Enter dashboard navigate | **No.** Handler only `setActiveMembershipId` + `navigate(workspaceAppHomePath(memberMatch))` — **no** `refreshMemberships` / `loadMembershipsNow` (377–380). Portal *password* submit **does** refresh (180–181, 208). | Static **verified** | **FAIL vs ideal** — stale `memberMatch` possible; not a refresh-before-nav |
| 4 | Active renter membership for user + `hodan-properties` | Accept RPC + AuthProvider query | DB aggregates **PASS**; client query for signed-in user **not run** | **DB OK; client TBD** |
| 5 | `memberMatch` has renter role + tenant slug | `memberMatch` finds active non–super-admin on slug; does **not** assert `role === "renter"` (131–139) | Browser auth **not run** | **TBD** — Welcome back implies slug match; role must be read at click |
| 6 | `workspaceAppHomePath` → `/app/renter?tenant=hodan-properties` | Only if `tenant_type === "landlord"` **and** `role === "renter"` (`roles.ts` 126–128); else `/app/landlord?…` | Static **verified** for role=`renter` | **PASS if role is renter; FAIL → landlord path if not** |
| 7 | Cause of return to `/` or `/?tenant=` | `ProtectedRoute` `!session` → `tenantWorkspacePath` (21–32); AppShell Sign out (242–256); catch-all `*` → `/` (`App.tsx` 209) | Browser auth **not run** | **Most code-aligned automatic path: ProtectedRoute** |
| 8 | Safe facts only | — | This doc | — |

---

## 4. Exact failing checkpoint (best current diagnosis)

### What is ruled out

- **Missing Live membership row for accepted applicants on `hodan-properties`** — DB shows 1 active renter and 0 accepted-without-membership.  
- Enter dashboard **intentionally** navigating to the public landlord site — it calls `workspaceAppHomePath`, not `/?tenant=`.

### What is not runtime-proven

Which of these two branches fires in the browser after Enter dashboard:

**Branch A — Session null at `/app/*` (checkpoint 2 → 7)**  
Navigate to `/app/renter?tenant=hodan-properties` (or `/app/landlord?…`) → `ProtectedRoute` sees `session === null` → `<Navigate to="/?tenant=hodan-properties" />` → public landlord website → Portal Login. Later login can then hit “not registered” if membership reload fails.

**Branch B — Wrong role path (checkpoint 5/6)**  
`memberMatch.role !== "renter"` → `/app/landlord?tenant=hodan-properties` → `RoleRoute` Unauthorized (not public home). Public home then requires Sign out or a later session loss.

Given the **confirmed** symptom “returns to the landlord **website**/home” (public landing), **Branch A (ProtectedRoute + absent session)** is the best match. Branch B alone does not land on the marketing site unless the user signs out or session drops afterward.

### Checkpoint 3 gap (confirmed in code)

Enter dashboard **does not** refresh memberships before navigation. Portal password submit does. That is a real asymmetry and a candidate for stale/wrong `memberMatch` used in `workspaceAppHomePath`, but it does not by itself clear the session.

---

## 5. Minimal proposed fix (do not implement here)

1. Enter dashboard: await `refreshMemberships()` (or equivalent), re-resolve membership for the current tenant, require `role === "renter"` and `tenant_type === "landlord"`, then `navigate(workspaceAppHomePath(...), { replace: true })`.  
2. If no renter membership after refresh: stay on landing with a clear message — **do not** navigate to `/app/landlord`.  
3. Harden AuthProvider `onAuthStateChange` so membership `getSession` work cannot briefly expose `session === null` to `ProtectedRoute` during navigation (known async-callback risk).  
4. Keep portal `onSubmit` from signing out until membership reload is definitive; filter to current `user_id`.  
5. Do not auto-assign property; do not grant roles in the UI.

---

## 6. Manual capture checklist (operator — authenticated browser)

Reproduce on `http://127.0.0.1:5173/?tenant=hodan-properties`. **Do not paste passwords, tokens, emails, or JWTs into tickets.**

After Portal Login succeeds (Welcome back visible), open DevTools → Console and run **only**:

```js
(() => {
  const path = location.pathname + location.search;
  const keys = Object.keys(localStorage).filter((k) => k.includes("auth") || k.includes("supabase"));
  const hasAuthStorage = keys.length > 0; // boolean only — do not print values
  return {
    route: path,
    authStorageKeysPresent: hasAuthStorage,
    authStorageKeyCount: keys.length,
  };
})();
```

Then click **Enter dashboard** and immediately note:

| Capture | Safe values to record |
| --- | --- |
| URL right after click | Full path+query only, e.g. `/app/renter?tenant=hodan-properties` vs `/app/landlord?…` vs `/?tenant=hodan-properties` |
| Brief flash? | Did `/app/…` appear before `/?tenant=…`? |
| AppShell visible? | Yes/No; if Yes: page title / “Unauthorized”? |
| Welcome back vs login | After return, which portal card? |
| Role line in AppShell (if any) | e.g. `renter` / `landlord admin` — role **label** only |
| Console (optional) | Re-run the snippet above; record `route` + `authStorageKeysPresent` only |

**How to map captures to checkpoints**

| Observation | Failing checkpoint |
| --- | --- |
| First URL is `/app/renter?tenant=hodan-properties`, then `/?tenant=…`, storage auth keys become absent | **2 + 7 (ProtectedRoute)** |
| First URL is `/app/landlord?tenant=…`, Unauthorized | **5/6 (role / workspaceAppHomePath default)** |
| First URL is `/app/renter?…` and stays, dashboard works | No failure — prior report outdated |
| Portal login after return shows “not registered” | Membership resolution on `onSubmit` (post–sign-out path) |

---

## 7. Public browser smoke (unauthenticated — performed)

- URL: `http://127.0.0.1:5173/?tenant=hodan-properties`  
- Result: Landlord public landing rendered; Portal Login controls present; apply/listings entry points present.  
- No sign-in attempted; no session mutation.

---

## 8. Explicit confirmations

- No fix implemented; no code changes.  
- No passwords changed; no automatic sign-out; no role/membership/application/assignment mutations.  
- No env/Supabase dashboard/schema/migration/deploy changes.  
- RP-1.4 not started.  
- No tokens, passwords, or private user identifiers printed. DB output limited to counts/status/slug/type.
