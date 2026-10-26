# RP-1.3.5 — Final Browser Verification

**Date:** 2026-10-20  
**Builds on:** RP-1.3.4 (`docs/RP-1.3.4_LOCAL_ENV_MIGRATION_SAFETY.md`)  
**Frontend:** `npm run dev:local` → `http://127.0.0.1:5174`  
**API target:** `http://127.0.0.1:54321` (loopback verified)  
**Hosted Supabase / Edge deploy / GitHub / Vercel / production:** untouched  

---

## Verdict

RP-1.3 **public browse + application lifecycle + username isolation** were verified end-to-end in the browser against **local** Supabase on `?tenant=hodan-properties`.

**Residual blocker (pre-existing hygiene, not an RP-1.3 product defect):** local schema lacks `list_same_tenant_member_profiles` (not in repo migrations). This fails 1 rental Vitest and shows an error on the Invite page “Active renters” list / assign picker. No migration was applied (forbidden). Do **not** treat this as a silent pass.

Overall RP-1.3 application security goals for this verification: **PASS**, with the assign/member-list local gap explicitly open.

---

## Phase A — Preflight

| Check | Status | Evidence |
| --- | --- | --- |
| Local Supabase running | **PASS** | `supabase status` → `api_host=127.0.0.1` `api_port=54321` |
| `npm run dev:local` | **PASS** | Vite on **5174** (not 5173) |
| Frontend env → loopback | **PASS** | `.env.development.local` host `127.0.0.1:54321`; browser resources hit `127.0.0.1:54321` |
| DEV hosted guard | **PASS** | `supabaseEnv` / `supabase.ts` fail-closed (unit tests 5 pass) |
| Fresh local-only accounts | **PASS** | `*@ijaaro.local` users created via Auth/UI on local only |

**Verified URLs**

- Frontend: `http://127.0.0.1:5174`
- API hostname: `127.0.0.1` (port `54321`)

---

## Phase B — Public browsing

Fixture: workspace `hodan-properties` was **absent** at start. Created via supported **Create workspace** UI (after Auth sign-in), then two listed available properties via landlord **Create property** UI (`RP135 Flat A`, `RP135 Flat B`). Subdomain redirect after create was ignored for verification; all checks used `?tenant=hodan-properties` on `127.0.0.1:5174`.

| Check | Status | Evidence |
| --- | --- | --- |
| `?tenant=hodan-properties` shows published available cards | **PASS** | Flat A $250, Flat B $300 |
| Listing detail public fields only | **PASS** | name, type, district/city, rent, description; no tenant_id/owner/renter/ops metadata in UI |
| Foreign property under this tenant | **PASS** | Smoke property id under `?tenant=hodan-properties` → “This listing is not available.” |
| Console/network | **PASS** | API calls to `127.0.0.1:54321` only (no hosted supabase.co) |

Screenshot: public landing captured during session (`page-2026-10-20T07-23-13-313Z.png` in Cursor temp screenshots).

---

## Phase C — Application lifecycle

| Check | Status | Evidence |
| --- | --- | --- |
| Register/sign-in via public apply | **PASS** | Renter Accept + Renter Reject via `/apply` |
| Submit → `pending` | **PASS** | UI success + local rows `pending` for `@ahmed` / `@fatima` |
| Submit does not grant active membership | **PASS** | Pending applicant `/app/renter` → **Unauthorized**; only landlord_admin membership until accept |
| Landlord applications UI | **PASS** | `/app/landlord/applications?tenant=hodan-properties` listed both pending apps |
| Accept → active membership | **PASS** | `@ahmed` → `accepted`; `tenant_memberships` gains `renter`/`active` |
| Accept does **not** auto-assign | **PASS** | Flat A remained `available`, `current_renter_id` null |
| Reject → no membership | **PASS** | `@fatima` → `rejected`; still only landlord_admin + accepted renter memberships |
| Rejected reapply | **PASS** | Same user reapplied with `@fatima` → new `pending` |
| Cross-landlord review denied | **PASS** | Hodan landlord `review_rental_application` on smoke-tenant app → `not authorized` (supported RPC; not DB write) |
| Self-review blocked | **PASS** | Applicant review of own app → `applicants cannot review their own application` |

---

## Phase D — Username isolation

| Check | Status | Evidence |
| --- | --- | --- |
| Same username across landlords allowed | **PASS** | `@ahmed` accepted on hodan-properties; submit with `@ahmed` on smoke tenant succeeded |
| Duplicate within one landlord denied | **PASS** | New user submit with `@ahmed` on hodan-properties → `duplicate pending application or username conflict` |
| Reject frees username for reapply | **PASS** | Browser reapply as fatima after reject |
| Global `profiles.username` not reintroduced | **PASS** | No-op migration + landlordScope tests; storage in `tenant_renter_usernames` |

---

## Phase E — Existing workflow regression

| Workflow | Status | Notes |
| --- | --- | --- |
| Invite / provision UI | **PASS** (page) / **BLOCKED** (member list) | `/app/landlord/renters` shows Provision + Link Existing forms; alert: missing `list_same_tenant_member_profiles` |
| Link-existing form present | **PASS** | UI present; full provision Edge Function not exercised (local functions not served; not deployed) |
| Property assignment UI | **BLOCKED** locally | Assign picker empty / depends on missing member-profile RPC |
| Move-out / payments | **NOT TESTED** (browser) | Covered by rental Vitest (22/23) on local; browser not re-run |
| Marketplace browse | **PASS** (tests) | `rls.marketplace.test.ts` **9 passed**; browser marketplace path **NOT TESTED** this session |

---

## Phase F — `list_same_tenant_member_profiles`

| Question | Finding |
| --- | --- |
| Cause | **Existing schema setup / repo hygiene gap** — function lives on hosted historically; **absent from `supabase/migrations/`** (documented since STEP 5.4.24–5.4.30) |
| Implementation defect in RP-1.3? | **No** — unrelated to applications/usernames |
| Safe fix under boundaries? | **No** — would require adding + **applying** a migration (apply/reset forbidden here) |
| Action taken | None (documented only) |
| Test impact | `rls.rental.test.ts`: **22 passed, 1 failed** (PGRST202) |
| UI impact | Invite “Active renters” list error; assign picker limited |

---

## Automated tests (local target)

Commands run from `frontend/` against `127.0.0.1` via `.env.isolated`:

| Suite | Passed | Failed | Skipped |
| --- | --- | --- | --- |
| `rls.renterApplications.test.ts` | **12** | 0 | 0 |
| Username/invite/provision/guard unit bundle | **45** | 0 | 0 |
| `rls.marketplace.test.ts` | **9** | 0 | 0 |
| `rls.rental.test.ts` | **22** | **1** | 0 |
| **Combined** | **88** | **1** | **0** |

Failure message (unchanged): missing `public.list_same_tenant_member_profiles(p_tenant_id)`.

---

## Files changed

**None** in this verification-only task (no product code changes). Documentation only: this file.

---

## Remaining blockers

1. Export/apply `list_same_tenant_member_profiles` (and related) into local schema via a future **approved** migration workflow — outside RP-1.3.5 boundaries.
2. Full browser exercise of move-out/payments/marketplace and Edge-backed **provision-renter** invite send (local Edge Functions not running).
3. Prefer `npm run dev:local` over legacy `:5173` which may still point at hosted via `.env.local`.

---

## Untouched systems (explicit)

- No hosted Supabase access or writes  
- No migrations applied / no `db reset` / no repair  
- No Edge Function deploy / no hosted secret changes  
- No GitHub push  
- No Vercel / production changes  
- No subdomain product work (query-tenant only)  
- No secrets printed  

---

## Exact next action

Close RP-1.3 as **verified for applications/public listings/username rules**, then schedule a **separate hygiene task** to capture `list_same_tenant_member_profiles` into repo migrations and apply it **locally only** under an approved maintenance window. Do **not** start RP-1.4 or hosted cutover until that local assign/invite-list gap is accepted or fixed.
