# RP-1.3.10 — Local-Only Landlord Password Recovery

**Date:** 2026-10-20  
**Builds on:** RP-1.3.9 diagnosis (`invalid_credentials` against present local fixture)  
**Scope:** Restore password login for the existing local RP-1.3 Hodan landlord Auth user  
**Hosted Supabase / Edge / GitHub / Vercel / production / migrations / app Auth contract:** **untouched**

---

## Verdict

Local Auth password for the **existing** RP135 landlord fixture was reset via the Auth Admin API against **verified loopback** Supabase only. A **fresh password grant succeeded**, and the Hodan landlord portal opened on `dev:local` as **RP135 Landlord Admin**. Active `landlord_admin` membership on `hodan-properties` was **unchanged**. Email, profile, and roles were not modified.

Credentials were written only to a **gitignored** local file (password not printed in this report or recovery console output).

---

## Phase A — Setup inspection

| Finding | Detail |
| --- | --- |
| Documented RP-1.3 password | **None** — RP-1.3.5 created `@ijaaro.local` users via UI; password was never committed |
| Established admin reset pattern | Smoke scripts (`smoke-landlords-5425.mjs`) use local `auth.admin.updateUserById({ password })` for **existing** users |
| Dedicated RP135 recover script | **Added** `frontend/scripts/recover-local-rp135-landlord-password.mjs` (local-only guards) |
| Guessed/invented fixed password | **No** — cryptographically generated temporary password |

### Pre-mutation target check

| Check | Result |
| --- | --- |
| `linked_project` | `null` |
| API | `http://127.0.0.1:54321` |
| DB | loopback `:54322` |
| Existing fixture | One Auth user matching `rp135_ll_%` with active `landlord_admin` on `hodan-properties` |

---

## Phase B — Recovery method

1. Re-verified unlinked local API/DB.
2. Resolved the existing Auth user joined to Hodan `landlord_admin` (no create/delete).
3. `auth.admin.updateUserById` — **password + email_confirm only** (email/role/membership not altered).
4. Immediate anon `signInWithPassword` probe → session OK, then sign-out.
5. Re-checked membership = `landlord_admin|active|hodan-properties` and email unchanged.
6. Wrote `EMAIL` / `PASSWORD` to:

`frontend/.local/rp135-landlord-login.txt`  
(gitignored via `frontend/.local/`; file mode restricted)

**Not used:** hosted project, DB password-hash SQL edits, user delete/recreate, membership writes.

---

## Phase C — Verification

| Step | Result |
| --- | --- |
| `npm run env:local` | host=`127.0.0.1` port=`54321` |
| `npm run dev:local` | Vite on **5174** |
| Browser API hosts | `127.0.0.1:5174`, `127.0.0.1:54321` |
| Fresh API password grant (credentials file) | **OK**; Hodan `landlord_admin` active |
| Browser: sign out → password form → Sign in | **OK** → `/app/landlord?tenant=hodan-properties` |
| Portal identity | **RP135 Landlord Admin** / Admin · Hodan Properties |
| DB membership re-check | `membership_unchanged=true` |

---

## Files changed

| File | Change |
| --- | --- |
| `frontend/scripts/recover-local-rp135-landlord-password.mjs` | **Created** — local-only recovery |
| `.gitignore` | Ignore `frontend/.local/` |
| `frontend/.local/rp135-landlord-login.txt` | **Generated locally** (not committed) |
| `docs/RP-1.3.10_LOCAL_LANDLORD_PASSWORD_RECOVERY.md` | This report |

No production application Auth/UI logic changes.

---

## Remaining blockers

None for local landlord password login. Operator should open the gitignored credentials file for the email/password, keep it off git, and prefer `npm run dev:local`.

---

## Untouched systems

| Surface | Touched? |
| --- | --- |
| Hosted Supabase | **No** |
| Edge Functions | **No** |
| Secrets printed in report/console | **No** (password only in gitignored file) |
| GitHub push | **No** |
| Vercel / production | **No** |
| Migrations / DB reset | **No** |
| Membership / email / role | **No** |

---

## Exact next action

Use `npm run dev:local` and sign in with credentials from `frontend/.local/rp135-landlord-login.txt`. **Do not start RP-1.4.**
