# STEP 5.4.25 — Landlords Browser Smoke Test

**Date:** 2026-10-19  
**Builds on:** STEP 5.4.24  
**Scope:** Landlords module UI only  
**App:** `http://localhost:5173` (Vite dev) against existing remote Supabase via `frontend/.env.local`  
**Hosted SQL / RLS changes:** none  
**Deployments:** none (no GitHub push, Vercel, or VPS)

---

## Verdict

Landlords browser smoke is **PASS** for the exercised UI workflows on disposable smoke fixtures. One high-impact client defect was found and fixed: the workspace membership switcher listed peer tenant memberships (including a renter’s row) because AuthProvider did not filter to the signed-in user.

---

## Fixtures (disposable)

Provisioned with `frontend/scripts/smoke-landlords-5425.mjs` (does not delete real users):

| Actor | Workspace | Notes |
| --- | --- | --- |
| Landlord A (`smoke_ll_a_5425@ijaaro.test`) | `smoke-ll-a-5425` | `landlord_admin` |
| Landlord B | `smoke-ll-b-5425` | Private property used only for cross-tenant denial URL |
| Renter A | same tenant as A | Eligible assign-picker option |

Safe seed data: Smoke Property A (photos), Smoke Property B (other tenant, unlisted), then browser-created `Smoke Created 5425` / edited variant. No production financial records altered beyond disposable smoke assignment + initial charge.

---

## Workflow results

| # | Workflow | Result | Evidence |
| --- | --- | --- | --- |
| 1 | Sign in as landlord | **PASS** | `/login?tenant=smoke-ll-a-5425` → `/app/landlord` as Admin |
| 2 | Properties list + detail | **PASS** | List showed seeded property; detail showed address, rent, status, photos, tenancy |
| 3 | Create + edit property | **PASS** | Created “Smoke Created 5425” ($175, unlisted); edited title to “…Edited”; redirected to detail |
| 4 | Photos display + upload | **PASS** | Seeded photo signed URL rendered; browser `DataTransfer` upload showed **“Photo uploaded”** and second Remove control; loading preview text observed |
| 5 | Assign-renter picker | **PASS** | Combobox options: only **Smoke Renter A**; assign succeeded with success copy and status **occupied** |
| 6 | Charges + payment-review screens | **PASS** | Tenancy detail: initial charge row + “Add rent charge” + “No payments yet.”; Rent review: empty state copy rendered |
| 7 | Cross-tenant / unauthorized | **PASS** | Edit URL for Landlord B’s property as A → **“Property not found”** (no save form / no false success) |
| 8 | Loading / empty / success / error | **PASS** | Loading previews; empty tenancies/payments; success on upload/assign; error/not-found on bogus + foreign IDs |

**Browser payment approve/reject against a pending submission:** **NOT TESTED** (no renter-submitted pending payment in this UI session; covered by STEP 5.4.24 API suite).

**Manual OS file-picker upload:** exercised via in-page `File`/`DataTransfer` (automation-safe fixture PNG), not a native OS dialog — still validates the upload→row→UI success path.

---

## Defect found and fixed

| ID | Finding | Impact | Fix | SQL? |
| --- | --- | --- | --- | --- |
| B1 | `AuthProvider.refreshMemberships` selected all `tenant_memberships` rows visible under RLS (admins can see peer memberships). Switcher showed **Smoke Landlord A 5425 (renter)** whose membership `user_id` belonged to Smoke Renter A. | High — wrong identity context selectable | Filter `.eq("user_id", current.user.id)` in `frontend/src/auth/AuthProvider.tsx` | **No** |

**Post-fix verification:** hard reload dashboard → membership combobox gone (single own membership); nav still landlord Admin; typecheck **PASS**.

No other confirmed Landlords UI defects required a code change. No shared RLS policies weakened.

---

## States checklist

| State | Observed |
| --- | --- |
| Loading | Photo “Loading preview…” after upload; brief blank document during route transitions |
| Empty | Tenancies “No tenancies yet.” (before assign); payments “No rent payments yet.”; new property “No photos yet.” |
| Success | “Photo uploaded”; “Renter assigned and initial rent charge created”; create/edit navigation to detail |
| Error / denied | Invalid property UUID → “Property not found or unauthorized.”; foreign tenant edit → “Property not found” |

---

## Remaining Landlords blockers / follow-ups

1. **Repo hygiene:** hosted `list_same_tenant_member_profiles` (and `list_company_member_profiles`) still not mirrored in `supabase/migrations/` (runtime OK).
2. **Optional:** browser smoke of renter submit → landlord approve on disposable charge (not done here).
3. **Optional:** payment review UI still shows `proof_path` as text only (known from 5.4.24; not a smoke blocker).
4. Disposable smoke users/tenants remain in the project for reuse; do not treat as production identities.

---

## Next highest-priority Landlords task

Export hosted Landlords member-profile RPC DDL into the repo as non-`db push` mirrors, then optionally a short renter→landlord payment-review browser pass on the same disposable tenant.
