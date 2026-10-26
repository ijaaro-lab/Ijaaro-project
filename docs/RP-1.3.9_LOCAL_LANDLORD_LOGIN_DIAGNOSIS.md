# RP-1.3.9 — Local Landlord Login Diagnosis

**Date:** 2026-10-20  
**Symptom:** Portal login fails with HTTP `400` on `POST …/auth/v1/token?grant_type=password` and UI copy “Invalid email or password…”  
**Observed browser:** `http://localhost:5173/?tenant=hodan-properties#about` (`npm run dev`)  
**Hosted Supabase / secrets display / password reset / user create-delete / migrations / Edge / GitHub / Vercel / production:** **untouched**

---

## Verdict

| Question | Answer |
| --- | --- |
| Wrong hosted API target? | **No** — effective API is local `127.0.0.1:54321` even on `:5173` |
| Using approved local workflow? | **No** — active terminal was `npm run dev` on **5173**, not `npm run dev:local` on **5174** |
| Landlord Auth user missing locally? | **No** — fixture landlord Auth user present (confirmed, email provider, password hash, not banned/deleted) |
| Hodan membership missing? | **No** — active `landlord_admin` on `hodan-properties` |
| App logic / tenant gate after Auth? | **No** — failure is **before** session; UI maps GoTrue `Invalid login credentials` |
| Root cause of the 400 | **Auth rejected the submitted email/password pair** (`error_code: invalid_credentials`). GoTrue anti-enumeration returns the same shape for unknown email *or* wrong password; combined with a present local landlord account + prior successful `last_sign_in_at`, this is **credentials mismatch for the attempt** (wrong password and/or wrong email typed), not a broken Auth stack or missing membership. |
| Production Auth code bug? | **Not demonstrated** — no Auth contract change made |

**Login success was not re-proven with a fresh password grant** (credentials not supplied in this task; password not reset). On `dev:local` **5174**, an **existing** session entered the Hodan landlord portal successfully (“RP135 Landlord Admin”), proving post-Auth membership/routing for that local fixture.

---

## Phase A — Environment

| Check | Result |
| --- | --- |
| Terminal `1.txt` | `npm run dev` → Vite **`http://localhost:5173/`** |
| Approved workflow (RP-1.3.4) | `npm run env:local` + `npm run dev:local` → **`127.0.0.1:5174`** |
| `supabase status` | `API_URL=http://127.0.0.1:54321`, DB `127.0.0.1:54322`, `linked_project=null` |
| Env file URL hosts (values not printed) | `.env.development.local`, `.env.development`, `.env.local` all resolve to **`127.0.0.1:54321`** |
| User network observation | Password grant already targeted **`127.0.0.1:54321`** |

Conclusion: port **5173** is the wrong *workflow*, but it was **not** pointing at hosted Auth. Safe to continue diagnosis on local Auth.

---

## Phase B — Auth diagnosis (read-only)

### Application path

1. `TenantLandingPage` → `signIn(email.trim(), password)` (no password logging).
2. `AuthProvider.signIn` → `supabase.auth.signInWithPassword`.
3. On GoTrue failure, `friendlyAuthError` maps messages containing “invalid login” / “email or password” to the exact UI string observed.

### Local data (counts / flags only — no emails, IDs, or secrets)

| Check | Result |
| --- | --- |
| `auth.users` total | 261 (all confirmed) |
| `hodan-properties` tenant | Present |
| Active landlord ops on Hodan | **1** |
| Active renters on Hodan | **1** |
| Fixture landlord (`rp135_ll_%` pattern) in Auth | **1** — password hash present, provider `email`, not banned/deleted |
| That user’s Hodan membership | `landlord_admin` / `active` |
| Prior successful Auth | `last_sign_in_at` **not null** (account has signed in before) |

### Controlled wrong-password probe (local only)

Against the fixture landlord email (not printed) with a deliberately wrong password:

- HTTP **400**
- `error_code`: **`invalid_credentials`**
- Message matches GoTrue “Invalid login credentials” → same UI mapping

A nonexistent `@ijaaro.local` email with a wrong password returns the **same** 400/`invalid_credentials` (anti-enumeration). Therefore HTTP 400 alone cannot prove “password wrong” vs “email unknown”; the DB evidence that the intended landlord **exists** and has signed in before narrows the user’s failure to **the credentials entered for that attempt**.

### Cause discrimination

| Candidate | Evidence |
| --- | --- |
| Wrong frontend / hosted project | **Ruled out** — loopback API; unlinked local |
| Account absent from local Auth | **Ruled out** — fixture landlord present |
| Missing profile / membership / tenant resolve after Auth | **Ruled out for this 400** — Auth fails first; membership exists; 5174 existing session reaches landlord app |
| Auth misconfiguration | **Ruled out** — health OK; password grants respond |
| Incorrect credentials for the attempt | **Supported** — `invalid_credentials` + present local account + UI mapping |

---

## Phase C — Minimal correction

**No Auth/authorization behavior change.** No password reset, user create/delete, or role change.

| File | Change |
| --- | --- |
| `frontend/scripts/warn-prefer-dev-local.mjs` | **Created** — warns that plain `npm run dev` skips `env:local` / port 5174 |
| `frontend/package.json` | `dev` runs the warning script before `vite` |
| `README.md` | Local setup leads with `env:local` + `dev:local` |

Rationale: reduce recurrence of diagnosing on **5173** while documenting that the observed 400 was credentials against local Auth, not a wrong remote project.

---

## Phase D — Verification

| Check | Result |
| --- | --- |
| `npm run env:local` | host=`127.0.0.1` port=`54321` (key not printed) |
| `http://127.0.0.1:5174/` | HTTP 200 |
| Browser API hosts on Hodan landing | `127.0.0.1:5174`, `127.0.0.1:54321` only |
| Fresh password login | **Not claimed** — no credentials supplied; no password change |
| Existing session on 5174 | **PASS** — “Welcome back” → Enter dashboard → `/app/landlord?tenant=hodan-properties` as **RP135 Landlord Admin** / Admin |

### Tests

| Command | Passed | Failed | Skipped |
| --- | --- | --- | --- |
| `npx vitest run src/lib/supabaseEnv.test.ts src/pages/landlord/InviteRenterPage.test.tsx` | **12** | 0 | 0 |
| `npx vitest run src/lib/supabaseEnv.test.ts` (recheck) | **5** | 0 | 0 |
| `npm run typecheck` | exit **0** | — | — |

Cross-tenant denial was not re-exercised in-browser this task; prior RP-1.3.7 rental suite covers RPC isolation. No claim that a new password grant succeeded.

---

## Remaining requirement

If the operator cannot recall the local fixture password used when the RP-1.3.5 landlord Auth user was created, they need a **separate approved local-only** password reset or re-provision step. That was **not** performed here.

**Workaround now:** use `npm run dev:local` at `http://127.0.0.1:5174/?tenant=hodan-properties`. If a session already exists for the fixture landlord, Portal Login → Enter dashboard works without a new password grant.

Stop using `http://localhost:5173` for local landlord verification.

---

## Untouched systems

| Surface | Touched? |
| --- | --- |
| Hosted Supabase | **No** |
| Auth passwords / user CRUD / roles | **No** |
| DB reset / migrations | **No** |
| Edge deploy | **No** |
| Secrets printed | **No** |
| GitHub / Vercel / production | **No** |

---

## Exact next action

Operator: switch to **`npm run dev:local`** (5174). If fresh sign-in still returns `invalid_credentials`, request an **approved local-only** password reset for the existing Hodan landlord Auth user — **do not start RP-1.4**.
