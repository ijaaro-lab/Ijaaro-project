# Phase 8B — Final Baseline Commit Readiness Review

**Status:** COMPLETE (read-only)  
**Date:** 2026-10-26  
**Active project:** `C:\my projects\Ijaaro-project-main`  
**Scope:** Working-tree readiness report only — **no staging, commit, push, merge, checkout, restore, database, or application changes**  
**Prior input:** `docs/PHASE8A_BASELINE_COMMIT_AUDIT.md`, Phase 5–7 reports, `docs/PHASE6_CONFLICT_REGISTER.md`

**Important:** This document is a **review manifest**, not an approved commit operation. Nothing listed below is staged or committed by this phase.

---

## 1. Executive Summary

Read-only inspection of the active IJAARO tree confirms expected Git identity: branch `integration/lossless-utility-sync`, `HEAD` = `origin/main` = `f8bd11cc7d304f193929060b1f57f32636e6544a`, remote `https://github.com/ijaaro-lab/ijaaro-project.git`. The working tree diverges from `HEAD` with **65 modified**, **23 deleted-vs-HEAD**, and **159 untracked files** (porcelain shows **146** `??` lines because some directories collapse children). The staging index is **empty**.

Protected migration `supabase/migrations/20261013000013_security_isolation_hardening.sql` **exists** and its working-tree SHA-256 **matches** the expected value `00B056D20D96FB9D01BE35D9A64FDFCC9420742D5E1F82A01E6B36D25027EE1D`. Git still reports the file as modified because the on-disk (local KEEP) bytes differ from the `HEAD`/GitHub blob — expected under CR-016.

Secret-bearing env files under `frontend/` (`.env.local`, `.env.live.local`, `.env.isolated`) **exist, are ignored, and are untracked**. No JWT-like values were detected in tracked `.env.example` templates (placeholders / comments only; values not printed). Ignored caches and smoke outputs remain out of the trackable set.

The **23** absent GitHub utility paths align with Phase 6/7 “do not restore yet” intent (CR-011/012/018/019/025). Local marketplace/auth/landlord/renter work remains present as modifications and untracked sources. Several path groups still need **human** include/exclude decisions before any future staging phase (`frontend/scripts/**`, `supabase/manual/**`, verbose diagnostic docs, and whether to record the 23 deletions in the baseline sync commit).

**Recommendation:** `READY_FOR_USER_REVIEW`  
This audit does **not** claim production readiness, Live schema correctness, or approval to stage/commit/push.

---

## 2. Git Baseline and Working-Tree State

| Check | Result |
|-------|--------|
| Current working directory | `C:\my projects\Ijaaro-project-main` |
| Repo toplevel | `C:/my projects/Ijaaro-project-main` |
| Current branch | `integration/lossless-utility-sync` (**matches expected**) |
| `HEAD` | `f8bd11cc7d304f193929060b1f57f32636e6544a` (**matches expected**) |
| `HEAD` subject | `Merge pull request #1 from ijaaro-lab/integration/local-ijaaro-work` |
| `origin/main` | `f8bd11cc7d304f193929060b1f57f32636e6544a` |
| `HEAD` matches `origin/main` | **Yes** |
| Remote `origin` fetch/push | `https://github.com/ijaaro-lab/ijaaro-project.git` (**matches expected**; not modified) |
| Staging area (`git diff --cached`) | **Empty** |
| Expected-state deltas | **None** on branch / HEAD / remote URL |

### Working-tree counts vs `HEAD`

| Category | Count | Notes |
|----------|------:|-------|
| Modified (`M`) | **65** | Tracked files with local content changes |
| Deleted vs `HEAD` (`D`) | **23** | Present in `HEAD`, absent on disk |
| Untracked files (`git ls-files --others --exclude-standard`) | **159** | Exact file paths |
| Porcelain `??` lines | **146** | Lower because `frontend/scripts/`, `listings/`, some function dirs collapse |
| Staged | **0** | |
| Porcelain total lines | **234** | 65 + 23 + 146 |

### Interpretation

Branch tip equals official `main`. Local landlord/renter/marketplace/auth authority lives in the unstaged working tree. GitHub-only utility-company paths appear as deletions until a later import phase. No commit or push occurred during this review.

---

## 3. Protected Migration SHA-256 Verification

| Item | Value |
|------|--------|
| Path | `supabase/migrations/20261013000013_security_isolation_hardening.sql` |
| Exists on disk | **Yes** |
| Working-tree SHA-256 | `00B056D20D96FB9D01BE35D9A64FDFCC9420742D5E1F82A01E6B36D25027EE1D` |
| Expected SHA-256 | `00B056D20D96FB9D01BE35D9A64FDFCC9420742D5E1F82A01E6B36D25027EE1D` |
| Match | **Yes** |
| Git status vs `HEAD` | **Modified** (local KEEP bytes ≠ GitHub blob) |
| Diff theme (summary only) | Conditional `DO $$ … to_regprocedure … $$` around `REVOKE` for `rls_auto_enable()` / `service_type_for_tenant(uuid)` so local resets do not fail when helpers are absent (+11 / −2 lines) |

**Stop condition:** Not triggered. Further migration analysis continued.  
**Do not edit or replace this file.** Source-file presence ≠ Live DB migration execution (not verified here; no SQL/Supabase contact).

---

## 4. Deleted Utility Files — File-by-File Review

Evidence: `git diff --name-status --diff-filter=D HEAD`, `git show HEAD:<path>` headers, Phase 6 CR-011/012/018/019/025, Phase 8A §3.10. **None restored.**

| # | Path | Type | Purpose (from HEAD) | Utility-related? | Local equivalent? | Classification | Evidence |
|---|------|------|---------------------|------------------|-------------------|----------------|----------|
| 1 | `docs/WATER_COMPANY_DASHBOARD.md` | Documentation | Water company admin dashboard routes/pages doc | Yes | No local water-dashboard doc; landlord/marketplace docs differ | `INTENTIONALLY_ABSENT` (record deletion in future sync **only after human OK**) | CR-025; absent on disk |
| 2 | `frontend/src/components/ui/app-loading.tsx` | UI component | Full-screen / inline loading spinner | Shared (used by GH auth/utility flows) | Inline “Loading…” divs in `App.tsx` / `ProtectedRoute.tsx` | `INTENTIONALLY_ABSENT` | CR-012; App no longer imports it |
| 3 | `frontend/src/lib/simplePdf.ts` | Lib | Hand-rolled PDF builder for invoices/reports | Yes (utility payments/reports) | No local PDF helper; `jspdf` removed from `package.json` | `INTENTIONALLY_ABSENT` + **re-import risk** | CR-012; large utility page net deletions |
| 4 | `frontend/src/pages/utility/CompanySettingsPage.tsx` | Page | Utility branding/settings wrapper | Yes | `WorkspaceBrandingPage` still exists; routes removed from `App.tsx` | `INTENTIONALLY_ABSENT` | CR-011 |
| 5 | `frontend/src/pages/utility/ConnectionsPage.tsx` | Page | House/connection registration UI | Yes | No local connections page | `INTENTIONALLY_ABSENT` | CR-011; routes removed |
| 6 | `frontend/src/pages/utility/DirectoryUi.tsx` | UI helper | Temp password / directory UI helpers | Yes | No direct equivalent | `INTENTIONALLY_ABSENT` | CR-011 |
| 7 | `frontend/src/pages/utility/NotificationsPage.tsx` | Page | Utility ops notifications | Yes | No local equivalent | `INTENTIONALLY_ABSENT` | CR-011 |
| 8 | `frontend/src/pages/utility/StaffPage.tsx` | Page | Utility company staff management | Yes | Landlord `StaffMembersPage` / `provision-staff` are different product surface | `INTENTIONALLY_ABSENT` | CR-011 |
| 9 | `supabase/functions/provision-company-customer/index.ts` | Edge Function | Provision utility company customers | Yes | Local `provision-renter` (landlord/renter) — **not** equivalent | `INTENTIONALLY_ABSENT` | CR-019 |
| 10 | `supabase/functions/provision-company-staff/index.ts` | Edge Function | Provision utility company staff | Yes | Tracked `provision-staff` is workspace staff, not company-customer ops | `INTENTIONALLY_ABSENT` | CR-019 |
| 11 | `supabase/migrations/20261018000001_list_company_member_profiles.sql` | Migration | `list_company_member_profiles` RPC | Yes | Local member-profile hygiene docs/tests exist; **not** this GH migration | `INTENTIONALLY_ABSENT` | CR-018 |
| 12 | `supabase/migrations/20261019000001_register_utility_house.sql` | Migration | Register utility house + flat bills | Yes | None locally | `INTENTIONALLY_ABSENT` | CR-018 |
| 13 | `supabase/migrations/20261020000001_register_utility_payment_by_ops.sql` | Migration | Ops register pending utility payment | Yes | None locally | `INTENTIONALLY_ABSENT` | CR-018 |
| 14 | `supabase/migrations/20261020000002_generate_flat_bill_upsert.sql` | Migration | Flat bill upsert RPC | Yes | None locally | `INTENTIONALLY_ABSENT` | CR-018 |
| 15 | `supabase/migrations/20261020000003_create_utility_adhoc_charge.sql` | Migration | Ad-hoc utility charge RPC | Yes | None locally | `INTENTIONALLY_ABSENT` | CR-018 |
| 16 | `supabase/migrations/20261020000004_adjust_utility_bill_by_ops.sql` | Migration | Adjust/cancel utility bill | Yes | None locally | `INTENTIONALLY_ABSENT` | CR-018 |
| 17 | `supabase/migrations/20261020000005_update_utility_customer_by_ops.sql` | Migration | Update/deactivate utility customer | Yes | None locally | `INTENTIONALLY_ABSENT` | CR-018 |
| 18 | `supabase/migrations/20261020000006_update_delete_tenant.sql` | Migration | Super-admin update/delete tenant | Platform + utility ops adjacency | Local admin pages simplified; **RPC absence is product risk** if GH admin UX expected | `REVIEW_REQUIRED` for product impact; absence still intentional for *this* baseline | Header: Super Admin tenant cascade |
| 19 | `supabase/migrations/20261021000001_staff_can_approve_utility_payments.sql` | Migration | Staff may approve utility payments | Yes | None locally | `INTENTIONALLY_ABSENT` | CR-018 |
| 20 | `supabase/migrations/20261021000002_auto_issue_flat_bill_on_register.sql` | Migration | Auto-issue flat bill on house register | Yes | None locally | `INTENTIONALLY_ABSENT` | CR-018 |
| 21 | `supabase/migrations/20261021000003_issue_monthly_flat_bills_batch.sql` | Migration | Batch monthly flat bills | Yes | Local rent charges migration/function is **rent**, not utility flat bills | `INTENTIONALLY_ABSENT` | CR-018 |
| 22 | `supabase/migrations/20261021000004_issue_flat_bills_months_ahead.sql` | Migration | Issue N months of flat bills | Yes | None locally | `INTENTIONALLY_ABSENT` | CR-018 |
| 23 | `supabase/tests/utility_tenant_isolation_probe.sql` | SQL test | Cross-tenant utility isolation probe | Yes | Local RLS tests under `frontend/src/test/`; not this SQL probe | `INTENTIONALLY_ABSENT` | CR-018 / CR-023 |

**Aggregate judgment:** **22/23** are clearly GitHub utility-company (or its shared helpers) and intentionally absent for the landlord/renter baseline. Item **18** (`update_delete_tenant`) needs explicit human acknowledgment because it is platform Super Admin capability, not only water UX. **Do not assume every deletion is safe forever** — blobs remain recoverable from `origin/main` for a later utility-import phase. Classifying them as absent for *this* baseline is consistent with Phase 6/7/8A, pending user confirmation before staging deletions.

---

## 5. Untracked Files — Full Classification

**Total untracked files:** 159  

| Bucket | Count |
|--------|------:|
| Documentation (`docs/`) | 54 |
| Application source (`frontend/src/`) | 81 |
| Tooling scripts (`frontend/scripts/`) | 7 |
| Edge Functions | 5 |
| Migrations | 8 |
| Manual SQL helpers | 3 |
| SQL tests | 1 |

### 5.1 Documentation (54) — category: Documentation

**INCLUDE_CANDIDATE (40)** — integration / planning / fix reports (non-exhaustive listing by group):

- Phase reports: `docs/PHASE5_SAFE_GIT_SETUP_REPORT.md`, `docs/PHASE6_APPROVAL_CHECKLIST.md`, `docs/PHASE6_CONFLICT_REGISTER.md`, `docs/PHASE6_DETAILED_INTEGRATION_PLAN.md`, `docs/PHASE7_GIT_SETUP_REPORT.md`, `docs/PHASE8A_BASELINE_COMMIT_AUDIT.md`
- Remaining RP-1.3 / STEP_5* docs **not** listed in §5.2 (plans, cutovers, auth/navigation fix reports, marketplace plans, etc.)

**REVIEW_REQUIRED (14)** — operationally dense diagnostics / recovery / smoke verification (include only after owner OK):

- `docs/RP-1.3.10_LOCAL_LANDLORD_PASSWORD_RECOVERY.md`
- `docs/RP-1.3.24_RENTER_SESSION_RUNTIME_DIAGNOSTIC.md`
- `docs/RP-1.3.25_RENTER_AUTH_STATE_VERIFICATION.md`
- `docs/RP-1.3.27_SHARED_TENANT_LOGIN_RUNTIME_DIAGNOSTIC.md`
- `docs/RP-1.3.28_EXISTING_RENTER_LOGIN_DIAGNOSTIC.md`
- `docs/RP-1.3.29_RENTER_SESSION_RESOLUTION_FIX_REPORT.md`
- `docs/RP-1.3.30_RENTER_REDIRECT_AND_RLS_DIAGNOSTIC.md`
- `docs/RP-1.3.31_AUTH_SESSION_JWT_COHERENCE_FIX_REPORT.md`
- `docs/RP-1.3.5_FINAL_BROWSER_VERIFICATION.md`
- `docs/RP-1.3.9_LOCAL_LANDLORD_LOGIN_DIAGNOSIS.md`
- `docs/STEP_5_4_24_LANDLORDS_WORKFLOW_VERIFICATION.md`
- `docs/STEP_5_4_25_LANDLORDS_BROWSER_SMOKE_TEST.md`
- `docs/STEP_5_4_26_PENDING_PAYMENT_APPROVAL_VERIFICATION.md`
- `docs/STEP_5_4_29_LANDLORDS_MOVE_OUT_BROWSER_VERIFICATION.md`

*(No JWT literals printed; still REVIEW because of operational sensitivity and possible env/host discussion.)*

### 5.2 Frontend scripts (7) — category: Other / tooling — **REVIEW_REQUIRED**

| Path | Notes | Handling |
|------|-------|----------|
| `frontend/scripts/ensure-live-env.mjs` | Writes live env for `vite --mode live` | `REVIEW_REQUIRED` |
| `frontend/scripts/run-isolated-dev.mjs` | Isolated local Supabase dev runner | `REVIEW_REQUIRED` |
| `frontend/scripts/recover-local-rp135-landlord-password.mjs` | Local password recovery utility | `REVIEW_REQUIRED` |
| `frontend/scripts/smoke-landlords-5425.mjs` | Browser/API smoke | `REVIEW_REQUIRED` |
| `frontend/scripts/smoke-moveout-5429.mjs` | Move-out smoke | `REVIEW_REQUIRED` |
| `frontend/scripts/smoke-payments-5426.mjs` | Payments smoke | `REVIEW_REQUIRED` |
| `frontend/scripts/smoke-payments-5426-approve.mjs` | Payment approval smoke | `REVIEW_REQUIRED` |

Referenced by modified `frontend/package.json` (`env:live`, `dev`, `dev:isolated`). Powerful against whatever env they load — **not** auto-approved for inclusion.

### 5.3 Application source (81) — **INCLUDE_CANDIDATE**

Auth / session:

- `frontend/src/auth/AuthProvider.test.tsx`
- `frontend/src/auth/ProtectedRoute.test.tsx`
- `frontend/src/auth/RoleRoute.test.tsx`
- `frontend/src/auth/authSessionCoherence.ts`
- `frontend/src/auth/authSessionCoherence.test.ts`

Layout / landing / listings:

- `frontend/src/components/layout/appShellNav.ts`, `appShellNav.test.ts`, `AppShell.test.tsx`
- `frontend/src/components/landing/LandlordPublicListings.tsx`, `LandlordPublicListings.test.tsx`
- `frontend/src/components/landing/templates/SiteChrome.test.tsx`, `landingTemplates.composition.test.tsx`
- `frontend/src/components/listings/PropertyCoverImage.tsx`, `PropertyImageGallery.tsx`, `PropertyImageGallery.test.tsx`, `PropertyImagePlaceholder.tsx`

Libs (marketplace, rent, env, invite, photos, username, redirects, etc.):

- `frontend/src/lib/supabaseEnv.ts`, `supabaseEnv.test.ts`
- `frontend/src/lib/inviteRenter.ts`, `inviteRenter.test.ts`
- `frontend/src/lib/provisionRenter.ts`, `provisionRenter.test.ts`, `provisionRenter.authz.test.ts`, `provisionRenter.usernameScope.test.ts`
- `frontend/src/lib/propertyPhotos.ts`, `propertyPhotos.test.ts`, `propertyPhotoIdentity.migration.test.ts`
- `frontend/src/lib/publicListingPhotos.ts`, `publicListingPhotos.test.ts`, `publicListingPhotos.eligibility.test.ts`, `publicListingPhotos.logic.test.ts`
- `frontend/src/lib/monthlyRentPeriod.ts`, `monthlyRentPeriod.test.ts`
- `frontend/src/lib/generateMonthlyRentCharges.migration.test.ts`
- `frontend/src/lib/reviewRentPayment.migration.test.ts`
- `frontend/src/lib/listSameTenantMemberProfiles.migration.test.ts`
- `frontend/src/lib/liveLocalEnvSeparation.test.ts`
- `frontend/src/lib/myApplicationsNav.ts`, `myApplicationsNav.test.ts`
- `frontend/src/lib/passwordForm.ts`, `passwordForm.test.ts`
- `frontend/src/lib/scrollToHashTarget.ts`, `scrollToHashTarget.test.ts`
- `frontend/src/lib/setPasswordLoginRedirect.ts`, `setPasswordLoginRedirect.test.ts`
- `frontend/src/lib/signupEmailRedirect.ts`, `signupEmailRedirect.test.ts`
- `frontend/src/lib/tenancyDisplay.ts`, `tenancyDisplay.test.ts`
- `frontend/src/lib/username.ts`, `username.test.ts`, `username.landlordScope.test.ts`
- `frontend/src/lib/resolvePortalTenantKey.test.ts`

Pages:

- `frontend/src/pages/ApplyToRentPage.tsx`
- `frontend/src/pages/MyApplicationsPage.tsx`, `MyApplicationsPage.test.tsx`
- `frontend/src/pages/PublicListingDetailPage.tsx`, `PublicListingDetailPage.test.tsx`
- `frontend/src/pages/SetPasswordPage.tsx`, `SetPasswordPage.test.tsx`
- `frontend/src/pages/AccountPage.test.tsx`, `TenantLandingPage.test.tsx`
- `frontend/src/pages/landlord/ApplicationsPage.tsx`
- `frontend/src/pages/landlord/InviteRenterPage.tsx`, `InviteRenterPage.test.tsx`
- `frontend/src/pages/landlord/PaymentsReviewPage.test.tsx`, `PropertiesPage.test.tsx`, `PropertyDetailPage.moveOut.test.tsx`, `PropertyFormPage.test.tsx`, `TenanciesPage.test.tsx`, `TenancyDetailPage.test.tsx`
- `frontend/src/pages/renter/BrowseListingsPage.test.tsx`, `ListingDetailPage.test.tsx`, `RenterDashboard.test.tsx`, `RenterPaymentsPage.test.tsx`, `RenterTenancyPage.test.tsx`

Tests harness:

- `frontend/src/test/isolatedEnv.ts`
- `frontend/src/test/rls.marketplace.test.ts`
- `frontend/src/test/rls.membershipHardening.test.ts`
- `frontend/src/test/rls.renterApplications.test.ts`
- `frontend/src/test/rls.staffProperties.test.ts`

### 5.4 Database migrations (8) — **INCLUDE_CANDIDATE**

- `supabase/migrations/20261018143031_fix_property_photos_storage_path_policy.sql`
- `supabase/migrations/20261018220000_marketplace_field_isolation.sql`
- `supabase/migrations/20261021120000_review_rent_payment_require_rejection_reason.sql`
- `supabase/migrations/20261022200000_property_photo_identity_immutable.sql`
- `supabase/migrations/20261024120000_generate_monthly_rent_charges.sql`
- `supabase/migrations/20261024133000_add_villa_property_type.sql`
- `supabase/migrations/20261024140000_property_rooms_and_neighborhood.sql`
- `supabase/migrations/20261024150000_public_listing_detail_rooms_neighborhood.sql`

**Note:** File presence ≠ applied on Live. No migration execution in this phase.

### 5.5 Edge Functions (5) — **INCLUDE_CANDIDATE**

- `supabase/functions/generate-monthly-rent-charges/index.ts`
- `supabase/functions/provision-renter/index.ts`
- `supabase/functions/provision-renter/logic.ts`
- `supabase/functions/public-listing-photos/index.ts`
- `supabase/functions/public-listing-photos/logic.ts`

### 5.6 Manual SQL (3) — **REVIEW_REQUIRED**

- `supabase/manual/marketplace_field_isolation.rollback.sql`
- `supabase/manual/marketplace_field_isolation.stage1_rpcs.sql`
- `supabase/manual/marketplace_field_isolation.stage2_policies.sql`

Operational cutover helpers; not the same as versioned migrations.

### 5.7 SQL test (1) — **INCLUDE_CANDIDATE**

- `supabase/tests/monthly_rent_charges_sql_checks.sql`

### 5.8 Ignored secrets / artifacts (not in untracked list; confirmed)

| Path | Exists | Ignored | Handling |
|------|--------|---------|----------|
| `frontend/.env.local` | Yes | Yes | `EXCLUDE_SECRET` |
| `frontend/.env.live.local` | Yes | Yes | `EXCLUDE_SECRET` |
| `frontend/.env.isolated` | Yes | Yes | `EXCLUDE_SECRET` |
| `frontend/.local/rp135-landlord-login.txt` | Yes | Yes (`frontend/.local/`) | `EXCLUDE_SECRET` |
| `supabase/.temp/` | Yes | Yes | `EXCLUDE_ARTIFACT` (may hold project-ref / pooler metadata) |
| `frontend/.vitest/` | Yes | Yes | `EXCLUDE_ARTIFACT` |
| `frontend/tsconfig.tsbuildinfo` | Yes | Yes | `EXCLUDE_ARTIFACT` |
| `frontend/.smoke-5425.json`, `.smoke-5426.json`, `.smoke-5429-moveout.json` | Yes | Yes | `EXCLUDE_ARTIFACT` |
| `frontend/node_modules/`, `frontend/dist/` | Expected present | Yes | `EXCLUDE_ARTIFACT` |

Root `.env` / `.env.local` / `.env.live.local` / `.env.isolated`: **not present**; ignore patterns would apply if created.

---

## 6. Modified Files — File-by-File Review

All **65** paths are **active local functionality** intended for a future baseline sync (KEEP LOCAL / UNION per Phase 6). Recommendations below are **review classifications**, not staging approval. Security/auth/tenancy-sensitive changes are flagged.

### 6.1 Config / env / docs / deps

| Path | Δ (approx) | Summary | Sensitive? | Baseline | Conflict note |
|------|-------------|-----------|------------|----------|---------------|
| `.env.example` | +5/0 | Comments for provision-renter Edge secrets (placeholders) | Env template | `INCLUDE_CANDIDATE` (eyeball hosts/placeholders) | CR-024 |
| `.gitignore` | +13/−2 | Hardened ignores: `!frontend/.env.example`, coverage, tsbuildinfo, vite/turbo, playwright | Ignore hygiene | `INCLUDE_CANDIDATE` | CR-024 |
| `PROJECT_ROADMAP.md` | +26/−6 | Roadmap updates for local landlord/marketplace work | Docs | `INCLUDE_CANDIDATE` | CR-025 |
| `README.md` | +15/−2 | README updates | Docs | `INCLUDE_CANDIDATE` | CR-025 |
| `frontend/.env.example` | +18/−3 | Live/dev instructions; `VITE_ALLOW_REMOTE_SUPABASE`; service-role commented | Env template | `INCLUDE_CANDIDATE` (eyeball) | CR-024; no JWT-like values detected |
| `frontend/package.json` | +3/−2 | `env:live` / live-mode `dev` / `dev:isolated`; remove `jspdf` | Deps / scripts | `INCLUDE_CANDIDATE` | CR-013; ties to REVIEW scripts |
| `frontend/package-lock.json` | +1/−230 | Lockfile churn (jspdf removal and related) | Deps | `INCLUDE_CANDIDATE` | Must stay paired with package.json |
| `supabase/config.toml` | +15/−1 | `/set-password` redirect; function JWT flags for listing photos / rent charges | Auth config | `INCLUDE_CANDIDATE` | CR-015; hosted SMTP not proven by file |

### 6.2 Auth, routing, tenancy, Supabase client (priority)

| Path | Δ | Summary | Sensitive? | Baseline | Conflict note |
|------|---|----------|------------|----------|---------------|
| `frontend/src/App.tsx` | +19/−16 | Adds set-password, public listing, apply, invite, applications routes; removes water/electricity connections/staff/notifications/settings; RoleRoute allow drops `landlord_staff` on renter tools; replaces AppLoading | **Authz / nav** | `INCLUDE_CANDIDATE` | CR-001 vs GH utility routes |
| `frontend/src/auth/AuthProvider.tsx` | +121/−39 | Session commit + JWT coherence; deferred membership load; `activeMembership` model | **Auth / session** | `INCLUDE_CANDIDATE` | CR-002 |
| `frontend/src/auth/ProtectedRoute.tsx` | +40/−15 | `activeMembershipAllowsRoute` requires **active** membership only; RoleRoute uses `activeMembership` not any membership | **Authz** | `INCLUDE_CANDIDATE` | CR-003 |
| `frontend/src/lib/supabase.ts` | +23/−5 | `assertDevSupabaseTarget` + `VITE_ALLOW_REMOTE_SUPABASE` fail-closed | **Env guard** | `INCLUDE_CANDIDATE` | CR-004 |
| `frontend/src/lib/tenant.ts` | +19/0 | Portal/tenant key helpers expanded | Tenancy | `INCLUDE_CANDIDATE` | CR-022 |
| `frontend/src/lib/roles.ts` | +1/−4 | Role/home-path trim | Roles | `INCLUDE_CANDIDATE` | CR-022 |
| `frontend/src/types/database.ts` | +194/−170 | Marketplace/application types; property rooms/villa; RPC typing drift vs GH utility | **DB types** | `INCLUDE_CANDIDATE` | CR-014 |
| `supabase/migrations/20261013000013_security_isolation_hardening.sql` | +11/−2 | Protected local KEEP (hash verified) | **Security SQL** | `INCLUDE_CANDIDATE` | CR-016 |

`RoleRoute` lives in `ProtectedRoute.tsx` (not a separate tracked file). Untracked `RoleRoute.test.tsx` covers active-membership behavior.

### 6.3 Layout / landing / UI chrome

| Path | Δ | Summary | Sensitive? | Baseline | Conflict |
|------|---|----------|------------|----------|----------|
| `frontend/src/components/layout/AppShell.tsx` | +178/−532 | Nav extracted to `appShellNav`; large GH utility finance nav absent | Nav | `INCLUDE_CANDIDATE` | CR-006 UNION later |
| `frontend/src/components/landing/templates/SiteChrome.tsx` | +172/−36 | Public chrome / listings integration | UX | `INCLUDE_CANDIDATE` | CR-021 |
| `…/CommunityConnect.tsx`, `CorporateTrust.tsx`, `MinimalClean.tsx`, `ModernProfessional.tsx`, `ServiceShowcase.tsx` | +3 each | Minor template wiring | UX | `INCLUDE_CANDIDATE` | CR-021 |
| `…/PublicSections.tsx` | +16/−32 | Public sections refactor | UX | `INCLUDE_CANDIDATE` | CR-021 |
| `…/types.ts` | +5/0 | Template types | UX | `INCLUDE_CANDIDATE` | CR-021 |
| `frontend/src/components/charts/SimpleCharts.tsx` | +55/−197 | Chart simplification | UX | `INCLUDE_CANDIDATE` | CR-021 |
| `frontend/src/components/ui/metric-card.tsx` | +20/−37 | Metric card trim | UX | `INCLUDE_CANDIDATE` | CR-021 |
| `frontend/src/index.css` | +0/−58 | CSS reduction | UX | `INCLUDE_CANDIDATE` | CR-021 |
| `frontend/src/lib/format.ts` | +1/−14 | Format helpers trim | UX | `INCLUDE_CANDIDATE` | CR-021 |

### 6.4 Account / login / landing pages

| Path | Δ | Summary | Sensitive? | Baseline |
|------|---|----------|------------|----------|
| `frontend/src/pages/AccountPage.tsx` | +406/−129 | Password change UX (`passwordForm`) | Auth UX | `INCLUDE_CANDIDATE` |
| `frontend/src/pages/LoginPage.tsx` | +10/0 | Notice banner from location state | Auth UX | `INCLUDE_CANDIDATE` |
| `frontend/src/pages/TenantLandingPage.tsx` | +164/−50 | Public listings / landlord landing | Marketplace | `INCLUDE_CANDIDATE` |

### 6.5 Admin pages

| Path | Δ | Summary | Sensitive? | Baseline | Conflict |
|------|---|----------|------------|----------|----------|
| `frontend/src/pages/admin/AdminPaymentsPage.tsx` | +189/−191 | Local admin payments variant | Admin | `INCLUDE_CANDIDATE` | CR-020 dual-sided |
| `frontend/src/pages/admin/AdminPropertiesPage.tsx` | +129/−98 | Local admin properties | Admin | `INCLUDE_CANDIDATE` | CR-020 |
| `frontend/src/pages/admin/AdminUtilityOpsPage.tsx` | +246/−115 | Local utility ops admin (not GH water suite) | Admin / utility adjacency | `INCLUDE_CANDIDATE` | CR-020 |
| `frontend/src/pages/admin/SuperAdminDashboard.tsx` | +1/−8 | Minor trim | Admin | `INCLUDE_CANDIDATE` | |
| `frontend/src/pages/admin/TenantDetailPage.tsx` | +7/−191 | Large simplification vs GH | Admin / tenancy | `INCLUDE_CANDIDATE` | CR-020; relates to deleted `update_delete_tenant` mig |
| `frontend/src/pages/admin/TenantsPage.tsx` | +16/−309 | Large simplification vs GH | Admin | `INCLUDE_CANDIDATE` | CR-020 |

### 6.6 Landlord module (active local authority)

| Path | Δ | Summary | Sensitive? | Baseline |
|------|---|----------|------------|----------|
| `frontend/src/pages/landlord/LandlordDashboard.tsx` | +346/−58 | Expanded landlord home | Active local | `INCLUDE_CANDIDATE` |
| `frontend/src/pages/landlord/PaymentsReviewPage.tsx` | +603/−70 | Rent payment review UX | Payments / tenancy | `INCLUDE_CANDIDATE` |
| `frontend/src/pages/landlord/PropertiesPage.tsx` | +747/−60 | Listings/photos-oriented properties | Marketplace | `INCLUDE_CANDIDATE` |
| `frontend/src/pages/landlord/PropertyDetailPage.tsx` | +196/−30 | Detail + move-out flows | Tenancy | `INCLUDE_CANDIDATE` |
| `frontend/src/pages/landlord/PropertyFormPage.tsx` | +803/−118 | Photos, rooms, districts, villa type | Marketplace / data | `INCLUDE_CANDIDATE` |
| `frontend/src/pages/landlord/TenanciesPage.tsx` | +767/−53 | Tenancy list/display | Tenancy | `INCLUDE_CANDIDATE` |
| `frontend/src/pages/landlord/TenancyDetailPage.tsx` | +573/−108 | Tenancy detail / charges | Tenancy / payments | `INCLUDE_CANDIDATE` |

### 6.7 Renter module

| Path | Δ | Summary | Sensitive? | Baseline |
|------|---|----------|------------|----------|
| `frontend/src/pages/renter/BrowseListingsPage.tsx` | +215/−56 | Tenant-scoped browse | Tenancy scope | `INCLUDE_CANDIDATE` |
| `frontend/src/pages/renter/ListingDetailPage.tsx` | +295/−56 | Listing detail | Marketplace | `INCLUDE_CANDIDATE` |
| `frontend/src/pages/renter/RenterDashboard.tsx` | +431/−67 | Dashboard auth-state fixes | Auth UX | `INCLUDE_CANDIDATE` |
| `frontend/src/pages/renter/RenterPaymentsPage.tsx` | +636/−95 | Renter payments | Payments | `INCLUDE_CANDIDATE` |
| `frontend/src/pages/renter/RenterTenancyPage.tsx` | +622/−45 | Renter tenancy view | Tenancy | `INCLUDE_CANDIDATE` |

### 6.8 Utility pages still tracked but locally reduced (CR-010)

These remain **modified** (not deleted). Net deletions are large vs GitHub finance-first utility UX. Baseline keeps **local** bytes; GH richness returns only via later utility import.

| Path | Δ | Summary | Sensitive? | Baseline |
|------|---|----------|------------|----------|
| `frontend/src/pages/utility/BillsPage.tsx` | +16/−32 | Reduced | Utility | `INCLUDE_CANDIDATE` (local) |
| `frontend/src/pages/utility/CustomerDetailPage.tsx` | +114/−148 | Reduced | Utility | `INCLUDE_CANDIDATE` (local) |
| `frontend/src/pages/utility/CustomerPaymentsPage.tsx` | +93/−509 | Heavily reduced | Utility | `INCLUDE_CANDIDATE` (local) |
| `frontend/src/pages/utility/CustomersPage.tsx` | +216/−1000 | Heavily reduced | Utility | `INCLUDE_CANDIDATE` (local) |
| `frontend/src/pages/utility/PaymentsReviewPage.tsx` | +58/−2282 | Massive reduction (PDF/finance flows) | Utility / payments | `INCLUDE_CANDIDATE` (local) |
| `frontend/src/pages/utility/ReadingsPage.tsx` | +1/−5 | Minor | Utility | `INCLUDE_CANDIDATE` (local) |
| `frontend/src/pages/utility/ReportsPage.tsx` | +50/−431 | Reduced | Utility | `INCLUDE_CANDIDATE` (local) |
| `frontend/src/pages/utility/UtilityDashboard.tsx` | +124/−990 | Simplified dashboard | Utility | `INCLUDE_CANDIDATE` (local) |
| `frontend/src/pages/utility/shared.ts` | +0/−43 | Shared helpers trimmed | Utility | `INCLUDE_CANDIDATE` (local) |

### 6.9 Tests (modified)

| Path | Δ | Summary | Baseline |
|------|---|----------|----------|
| `frontend/src/lib/membershipWriteHardening.migration.test.ts` | +21/−78 | Membership write hardening expectations | `INCLUDE_CANDIDATE` |
| `frontend/src/lib/provisionStaff.authz.test.ts` | +11/−62 | Staff provision authz | `INCLUDE_CANDIDATE` |
| `frontend/src/test/rls.hardening.test.ts` | +16/−18 | RLS hardening | `INCLUDE_CANDIDATE` |
| `frontend/src/test/rls.rental.test.ts` | +389/−22 | Expanded rental RLS | `INCLUDE_CANDIDATE` |
| `frontend/src/test/rls.security.test.ts` | +16/−18 | Security RLS | `INCLUDE_CANDIDATE` |
| `frontend/src/test/rls.utility.test.ts` | +12/−82 | Utility RLS adjusted to local surface | `INCLUDE_CANDIDATE` |

---

## 7. Security and Environment Findings

| Requirement | Result |
|-------------|--------|
| `.env.local` / `.env.live.local` / `.env.isolated` must not be staged/committed | **Satisfied** — present under `frontend/`, ignored, untracked |
| `.env.example` may include only if placeholders | **Pass shape check** — no JWT-like (`eyJ…`) values; service-role lines are placeholders or commented; **do not print values** |
| Never display env values | **Honored** in this report |
| Never connect to Supabase / run SQL | **Honored** |
| Never infer Live schema/migration history correctness | **Stated** — file inventory ≠ applied history |
| Distinguish source presence vs DB execution | **Stated** |
| `supabase/.temp/` | Ignored; treat as artifact / possible linkage metadata — `EXCLUDE_ARTIFACT` |
| Smoke JSON / `.local` credential file | Ignored — `EXCLUDE_ARTIFACT` / `EXCLUDE_SECRET` |
| Tracked secrets in index | **None detected** |

**Suspicious / manual-review (no secrets shown):**

1. Example env files may contain real-looking `*.supabase.co` **hostname patterns** — confirm publishability.  
2. `frontend/scripts/recover-local-rp135-landlord-password.mjs` — privileged local recovery tooling.  
3. Smoke scripts can act against loaded env (Live vs isolated) — review before publishing.  
4. Recording **23** deletions permanently removes utility RPCs/UI from the branch tip until re-import — intentional but high-impact.  
5. Protected mig 13 local bytes must remain the ones with hash `00B056D2…` if staged later — never replace with GitHub variant without a separate CR-016 decision.

---

## 8. Exact Baseline Manifest

> **Review manifest only. Not an approved commit. Do not treat `REVIEW_REQUIRED` as approved for inclusion.**

### A. `INCLUDE_CANDIDATE` (exact paths)

**Modified (65):**  
`.env.example`, `.gitignore`, `PROJECT_ROADMAP.md`, `README.md`, `frontend/.env.example`, `frontend/package-lock.json`, `frontend/package.json`, `frontend/src/App.tsx`, `frontend/src/auth/AuthProvider.tsx`, `frontend/src/auth/ProtectedRoute.tsx`, `frontend/src/components/charts/SimpleCharts.tsx`, `frontend/src/components/landing/templates/CommunityConnect.tsx`, `frontend/src/components/landing/templates/CorporateTrust.tsx`, `frontend/src/components/landing/templates/MinimalClean.tsx`, `frontend/src/components/landing/templates/ModernProfessional.tsx`, `frontend/src/components/landing/templates/PublicSections.tsx`, `frontend/src/components/landing/templates/ServiceShowcase.tsx`, `frontend/src/components/landing/templates/SiteChrome.tsx`, `frontend/src/components/landing/templates/types.ts`, `frontend/src/components/layout/AppShell.tsx`, `frontend/src/components/ui/metric-card.tsx`, `frontend/src/index.css`, `frontend/src/lib/format.ts`, `frontend/src/lib/membershipWriteHardening.migration.test.ts`, `frontend/src/lib/provisionStaff.authz.test.ts`, `frontend/src/lib/roles.ts`, `frontend/src/lib/supabase.ts`, `frontend/src/lib/tenant.ts`, `frontend/src/pages/AccountPage.tsx`, `frontend/src/pages/LoginPage.tsx`, `frontend/src/pages/TenantLandingPage.tsx`, `frontend/src/pages/admin/AdminPaymentsPage.tsx`, `frontend/src/pages/admin/AdminPropertiesPage.tsx`, `frontend/src/pages/admin/AdminUtilityOpsPage.tsx`, `frontend/src/pages/admin/SuperAdminDashboard.tsx`, `frontend/src/pages/admin/TenantDetailPage.tsx`, `frontend/src/pages/admin/TenantsPage.tsx`, `frontend/src/pages/landlord/LandlordDashboard.tsx`, `frontend/src/pages/landlord/PaymentsReviewPage.tsx`, `frontend/src/pages/landlord/PropertiesPage.tsx`, `frontend/src/pages/landlord/PropertyDetailPage.tsx`, `frontend/src/pages/landlord/PropertyFormPage.tsx`, `frontend/src/pages/landlord/TenanciesPage.tsx`, `frontend/src/pages/landlord/TenancyDetailPage.tsx`, `frontend/src/pages/renter/BrowseListingsPage.tsx`, `frontend/src/pages/renter/ListingDetailPage.tsx`, `frontend/src/pages/renter/RenterDashboard.tsx`, `frontend/src/pages/renter/RenterPaymentsPage.tsx`, `frontend/src/pages/renter/RenterTenancyPage.tsx`, `frontend/src/pages/utility/BillsPage.tsx`, `frontend/src/pages/utility/CustomerDetailPage.tsx`, `frontend/src/pages/utility/CustomerPaymentsPage.tsx`, `frontend/src/pages/utility/CustomersPage.tsx`, `frontend/src/pages/utility/PaymentsReviewPage.tsx`, `frontend/src/pages/utility/ReadingsPage.tsx`, `frontend/src/pages/utility/ReportsPage.tsx`, `frontend/src/pages/utility/UtilityDashboard.tsx`, `frontend/src/pages/utility/shared.ts`, `frontend/src/test/rls.hardening.test.ts`, `frontend/src/test/rls.rental.test.ts`, `frontend/src/test/rls.security.test.ts`, `frontend/src/test/rls.utility.test.ts`, `frontend/src/types/database.ts`, `supabase/config.toml`, `supabase/migrations/20261013000013_security_isolation_hardening.sql`

**Untracked application / DB / tests / non-diagnostic docs (135):**  
All paths in §5.3, §5.4, §5.5, §5.7, plus the **40** documentation paths in §5.1 INCLUDE set (Phase 5–8A reports, non-diagnostic RP/STEP docs).

**Count A:** 65 + 135 = **200** paths

### B. `EXCLUDE_ARTIFACT`

- `frontend/.vitest/` (tree)  
- `frontend/tsconfig.tsbuildinfo`  
- `frontend/.smoke-5425.json`  
- `frontend/.smoke-5426.json`  
- `frontend/.smoke-5429-moveout.json`  
- `supabase/.temp/` (tree; CLI metadata)  
- `frontend/node_modules/` / `frontend/dist/` / `coverage/` / `.nyc_output/` / `.turbo/` / `.vite/` / `playwright-report/` / `test-results/` (per `.gitignore`; must stay out)

**Count B (named existing artifacts of interest):** **≥8** path entries (+ large ignored trees)

### C. `EXCLUDE_SECRET`

- `frontend/.env.local`  
- `frontend/.env.live.local`  
- `frontend/.env.isolated`  
- `frontend/.local/rp135-landlord-login.txt`  
- Any future root `.env` / `.env.*` secrets matching ignore rules  
- Never: real service-role keys, access tokens, private keys

**Count C:** **4** named present files (+ pattern coverage)

### D. `REVIEW_REQUIRED`

- `frontend/scripts/ensure-live-env.mjs`  
- `frontend/scripts/run-isolated-dev.mjs`  
- `frontend/scripts/recover-local-rp135-landlord-password.mjs`  
- `frontend/scripts/smoke-landlords-5425.mjs`  
- `frontend/scripts/smoke-moveout-5429.mjs`  
- `frontend/scripts/smoke-payments-5426.mjs`  
- `frontend/scripts/smoke-payments-5426-approve.mjs`  
- `supabase/manual/marketplace_field_isolation.rollback.sql`  
- `supabase/manual/marketplace_field_isolation.stage1_rpcs.sql`  
- `supabase/manual/marketplace_field_isolation.stage2_policies.sql`  
- 14 diagnostic/verification docs listed in §5.1  
- Explicit human OK on staging the **23** deletions in section E (especially `20261020000006_update_delete_tenant.sql`)  
- Final eyeball of `.env.example` / `frontend/.env.example` publishable hostnames before stage

**Count D (file paths):** 7 + 3 + 14 = **24** (+ decision items above)

### E. `INTENTIONALLY_ABSENT_UTILITY_FILE`

1. `docs/WATER_COMPANY_DASHBOARD.md`  
2. `frontend/src/components/ui/app-loading.tsx`  
3. `frontend/src/lib/simplePdf.ts`  
4. `frontend/src/pages/utility/CompanySettingsPage.tsx`  
5. `frontend/src/pages/utility/ConnectionsPage.tsx`  
6. `frontend/src/pages/utility/DirectoryUi.tsx`  
7. `frontend/src/pages/utility/NotificationsPage.tsx`  
8. `frontend/src/pages/utility/StaffPage.tsx`  
9. `supabase/functions/provision-company-customer/index.ts`  
10. `supabase/functions/provision-company-staff/index.ts`  
11. `supabase/migrations/20261018000001_list_company_member_profiles.sql`  
12. `supabase/migrations/20261019000001_register_utility_house.sql`  
13. `supabase/migrations/20261020000001_register_utility_payment_by_ops.sql`  
14. `supabase/migrations/20261020000002_generate_flat_bill_upsert.sql`  
15. `supabase/migrations/20261020000003_create_utility_adhoc_charge.sql`  
16. `supabase/migrations/20261020000004_adjust_utility_bill_by_ops.sql`  
17. `supabase/migrations/20261020000005_update_utility_customer_by_ops.sql`  
18. `supabase/migrations/20261020000006_update_delete_tenant.sql`  
19. `supabase/migrations/20261021000001_staff_can_approve_utility_payments.sql`  
20. `supabase/migrations/20261021000002_auto_issue_flat_bill_on_register.sql`  
21. `supabase/migrations/20261021000003_issue_monthly_flat_bills_batch.sql`  
22. `supabase/migrations/20261021000004_issue_flat_bills_months_ahead.sql`  
23. `supabase/tests/utility_tenant_isolation_probe.sql`  

**Count E:** **23**

---

## 9. Unresolved Risks and Manual Decisions

1. **Whether the first baseline sync commit should record all 23 deletions** (branch tip diverges from GitHub utility product until import phase).  
2. **`update_delete_tenant` migration absence** — platform Super Admin capability risk; needs explicit acknowledgment.  
3. **Include or defer** `frontend/scripts/**` and `supabase/manual/**`.  
4. **Include or prune** 14 diagnostic/verification docs.  
5. **Confirm example env hostnames** are intentional to publish.  
6. **CR-010 local utility pages** — committing local reductions locks a simpler utility UX until UNION import.  
7. **CRLF / `core.autocrlf`** noise — do not “fix” with destructive Git file ops.  
8. **Working tree remains the only live copy of local authority until committed** — Phase 5 backup is the off-tree safety net (not inspected/modified here).  
9. **Green tests/builds (not run here) ≠ tenant isolation proof.**  
10. **Ignore rules do not scrub history** — no JWT found in current example templates; historical secret remediation is out of scope.

---

## 10. Final Read-Only Verification

Performed at end of Phase 8B (after writing this report only):

| Check | Result |
|-------|--------|
| Staged index empty | **Yes** (`git diff --cached` → empty) |
| Commit created this phase | **No** |
| Push occurred | **No** |
| Branch unchanged | `integration/lossless-utility-sync` |
| `HEAD` unchanged | `f8bd11cc7d304f193929060b1f57f32636e6544a` |
| Protected migration SHA-256 recheck | `00B056D20D96FB9D01BE35D9A64FDFCC9420742D5E1F82A01E6B36D25027EE1D` (**match**) |
| Secret env files ignored + untracked | **Yes** (`.local` / `.live.local` / `.isolated`) |
| Working-tree counts (pre-report inventory) | Modified **65**, Deleted **23**, Untracked files **159**, Staged **0** |
| Working-tree counts (after this report was written) | Modified **65**, Deleted **23**, Untracked files **160** (includes this `PHASE8B_…` file), Staged **0** |
| Application / migration / env / Git config edited by this phase | **No** (this report file only) |
| Database / Supabase / tests executed | **No** |
| Forbidden Git mutators used | **No** |

---

## 11. Recommendation for the Next Phase

### `READY_FOR_USER_REVIEW`

**Meaning:** The read-only readiness audit succeeded. Identity, protected hash, secret ignore posture, and inventories are documented. The user should review sections 8–9 and explicitly approve a **separate** staging/commit phase before any `git add` / `git commit`.  

**Not claimed:** production readiness, Live DB correctness, approval to stage/commit/push, or resolution of `REVIEW_REQUIRED` items.

**STOP.** Wait for explicit user approval before proposing or executing the next phase.
