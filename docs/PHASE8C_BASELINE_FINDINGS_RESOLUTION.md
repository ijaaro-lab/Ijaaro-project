# Phase 8C — Baseline Findings Resolution

**Status:** COMPLETE (read-only)  
**Date:** 2026-10-26  
**Active project:** `C:\my projects\Ijaaro-project-main`  
**Scope:** Resolve outstanding Phase 8B review questions with evidence; produce a revised baseline manifest. **No staging, commit, push, merge, checkout, restore, database, application, or environment changes.**  
**Prior input:** `docs/PHASE8B_BASELINE_COMMIT_READINESS.md` (authoritative for the 24 / 23 / 200 inventories)

**Important:** This document is an **audit and planning** report only. Classifications are recommendations for a future, separately approved staging phase — not permission to stage or commit.

---

## 1. Executive Summary

Phase 8C re-inspected the working tree against Phase 8B’s inventories. Git identity matches expectations: branch `integration/lossless-utility-sync`, `HEAD` = `origin/main` = `f8bd11cc7d304f193929060b1f57f32636e6544a`, staging **empty**. Protected migration SHA-256 **matches** `00B056D20D96FB9D01BE35D9A64FDFCC9420742D5E1F82A01E6B36D25027EE1D`. Current untracked file count is **160**; the +1 vs Phase 8B’s pre-report **159** is explained by `docs/PHASE8B_BASELINE_COMMIT_READINESS.md` itself (documented in Phase 8B §10).

Of the **24** distinct `REVIEW_REQUIRED` file paths from Phase 8B §8.D:

| Outcome | Count |
|---------|------:|
| Reclassified with evidence (`INCLUDE_CANDIDATE` or `EXCLUDE_ARTIFACT`) | **9** |
| Retained `REVIEW_REQUIRED` (user decision still required) | **15** |

Of the **23** intentionally absent utility paths: **22** are `ABSENCE_JUSTIFIED_FOR_BASELINE` for the landlord/renter baseline; **1** (`supabase/migrations/20261020000006_update_delete_tenant.sql`) is `USER_DECISION_REQUIRED` because it is platform Super Admin capability, not water-only UX. All 23 remain candidates for a **future, separately approved** utility source-integration phase (`INTEGRATION_REVIEW_REQUIRED` as a future-phase note — none restored here).

All **200** Phase 8B `INCLUDE_CANDIDATE` paths still exist with expected Git status. One additional phase report (`PHASE8B_…`) is added as `INCLUDE_CANDIDATE`. Secret env files remain ignored/untracked. No private-key-like files found outside ignored trees.

**Recommendation:** `READY_FOR_USER_REVIEW`  
Not production-ready. Not approval to stage/commit/push. Remaining §10 decisions must be explicit before any staging phase.

---

## 2. Initial Git State

| Check | Expected | Observed | Delta |
|-------|----------|----------|-------|
| Working directory | `C:\my projects\Ijaaro-project-main` | Match | None |
| Branch | `integration/lossless-utility-sync` | Match | None |
| `HEAD` | `f8bd11cc7d304f193929060b1f57f32636e6544a` | Match | None |
| `HEAD` = `origin/main` | Yes | Yes | None |
| Staging area | Empty | Empty (`git diff --cached` empty) | None |
| Phase 8B report | Present | Present | None |
| Phase 8C report (pre-write) | Absent | Absent | None |

### Working-tree counts at Phase 8C start

| Category | Count |
|----------|------:|
| Modified (`M`) | **65** |
| Deleted vs `HEAD` (`D`) | **23** |
| Untracked files (`git ls-files --others --exclude-standard`) | **160** |
| Staged | **0** |

**Interpretation:** Matches Phase 8B post-report state (65 / 23 / 160 / 0). No unexpected drift before this audit.

---

## 3. Protected Migration Verification

| Item | Value |
|------|--------|
| Path | `supabase/migrations/20261013000013_security_isolation_hardening.sql` |
| Exists on disk | **Yes** |
| Working-tree SHA-256 (Phase 8C) | `00B056D20D96FB9D01BE35D9A64FDFCC9420742D5E1F82A01E6B36D25027EE1D` |
| Expected SHA-256 | `00B056D20D96FB9D01BE35D9A64FDFCC9420742D5E1F82A01E6B36D25027EE1D` |
| Match | **Yes** |
| Git status vs `HEAD` | **Modified** (local KEEP ≠ GitHub blob; CR-016) |

**Not edited. Not applied. File presence ≠ Live DB execution.**

---

## 4. REVIEW_REQUIRED Paths — Individual Findings

Phase 8B §8.D listed **24** exact file paths (7 scripts + 3 manual SQL + 14 docs). Reconciled count: **24** distinct paths (no extras, none missing on disk). All are currently **untracked** (`??`), not ignored, not tracked.

### 4.1 Scripts (7)

#### 1. `frontend/scripts/ensure-live-env.mjs`

| Field | Value |
|-------|--------|
| Git status | `??` (untracked) |
| Category | Tooling / env bootstrap |
| Flagged because | Writes Live-mode env for `vite --mode live`; powerful against loaded env |
| Evidence | Header: ensures `frontend/.env.live.local` for live mode. Reads gitignored `.env.local`, writes `.env.live.local`. Hardcodes Live project **ref** (hostname pattern) in source. Referenced by `frontend/package.json` (`env:live`, and thus `dev`). No hardcoded JWT / service-role assignment literals detected. |
| Security / integrity | Publishes Live project identity in-repo if committed; copies keys from ignored source into another ignored file at runtime. Does not itself embed JWT values. |
| Necessary for local baseline? | **Yes for current Live-mode `npm run dev` workflow** — but publishability of hardcoded Live ref needs owner OK. |
| Recommended classification | **`REVIEW_REQUIRED`** (retain) |
| Confidence | High (necessity) / Medium (publishability) |
| User decision still needed? | **Yes** — approve including a script that hardcodes the Live project ref, or defer / redact in a later change phase. |

#### 2. `frontend/scripts/run-isolated-dev.mjs`

| Field | Value |
|-------|--------|
| Git status | `??` |
| Category | Tooling / isolated local dev |
| Flagged because | Dev runner; powerful against env |
| Evidence | Header: start Vite against isolated local Supabase (`127.0.0.1:54321`). Referenced by `package.json` `dev:isolated`. No hardcoded JWT/service-role literals. Loopback-oriented. |
| Security / integrity | Local-only posture; lower than Live bootstrap. |
| Necessary for local baseline? | **Yes** for documented isolated-dev workflow. |
| Recommended classification | **`INCLUDE_CANDIDATE`** |
| Confidence | **High** |
| User decision still needed? | No for baseline include recommendation (owner may still defer tooling). |

#### 3. `frontend/scripts/recover-local-rp135-landlord-password.mjs`

| Field | Value |
|-------|--------|
| Git status | `??` |
| Category | Privileged local recovery utility |
| Flagged because | Password recovery against Auth |
| Evidence | Header: RP-1.3.10 local-only landlord password recovery. Password/auth admin operations; writes files; loopback-oriented. **Not** referenced in `package.json`. |
| Security / integrity | Privileged; misuse against wrong env is high impact. No hardcoded JWT detected. |
| Necessary for local baseline? | **No** — operational one-off; app runtime does not import it. |
| Recommended classification | **`EXCLUDE_ARTIFACT`** |
| Confidence | **High** |
| User decision still needed? | Soft — owner may keep privately outside Git; recommend **not** in baseline sync commit. |

#### 4–7. Smoke scripts

| Path | Evidence summary |
|------|------------------|
| `frontend/scripts/smoke-landlords-5425.mjs` | Disposable Landlords smoke fixtures (STEP 5.4.25); create/upsert test users; env + network; writes outputs |
| `frontend/scripts/smoke-moveout-5429.mjs` | Move-out fixtures (STEP 5.4.29); reuses smoke users |
| `frontend/scripts/smoke-payments-5426.mjs` | Pending rent payment fixtures (STEP 5.4.26) |
| `frontend/scripts/smoke-payments-5426-approve.mjs` | Seed pending payment for approve-after-reject |

| Field | Common finding |
|-------|----------------|
| Git status | `??` each |
| Category | Disposable smoke / fixture tooling |
| Flagged because | Can act against loaded env; password/auth ops |
| Necessary for baseline? | **No** — verification tooling, not product source |
| Recommended classification | **`EXCLUDE_ARTIFACT`** each |
| Confidence | **High** |
| User decision? | Soft — exclude from baseline commit unless owner wants smoke tooling published |

### 4.2 Manual SQL (3)

#### 8. `supabase/manual/marketplace_field_isolation.rollback.sql`

| Field | Value |
|-------|--------|
| Git status | `??` |
| Category | Manual / operational SQL (not versioned migration) |
| Flagged because | Rollback helper; not same as migrations |
| Evidence | Header: ROLLBACK for `20261018220000_marketplace_field_isolation.sql`; restores pre-cutover SELECT policies; comments reference a **Live project** identity from STEP 5.4.31 preflight. Contains `DROP`/`CREATE POLICY`. |
| Security / integrity | Destructive if applied to wrong DB; documents Live project linkage; **must not** be confused with auto-applied migrations. |
| Necessary for baseline? | **Not for app build**; operational cutover archive. Versioned migration already `INCLUDE_CANDIDATE`. |
| Recommended classification | **`REVIEW_REQUIRED`** (retain) |
| Confidence | High on risk; Medium on include-vs-exclude preference |
| User decision? | **Yes** — keep as ops archive in repo vs leave out of baseline commit |

#### 9. `supabase/manual/marketplace_field_isolation.stage1_rpcs.sql`

| Field | Value |
|-------|--------|
| Git status | `??` |
| Category | Manual staged cutover SQL |
| Evidence | STAGE 1 RPCs + grants; `DROP FUNCTION` / recreate marketplace RPCs; ordered before policy tightening |
| Necessary for baseline? | No (versioned mig covers product intent) |
| Recommended classification | **`REVIEW_REQUIRED`** |
| User decision? | **Yes** |

#### 10. `supabase/manual/marketplace_field_isolation.stage2_policies.sql`

| Field | Value |
|-------|--------|
| Git status | `??` |
| Category | Manual staged cutover SQL |
| Evidence | STAGE 2 removes marketplace full-row SELECT branches; `DROP POLICY` / `CREATE POLICY` |
| Necessary for baseline? | No |
| Recommended classification | **`REVIEW_REQUIRED`** |
| User decision? | **Yes** |

### 4.3 Diagnostic / verification docs (14)

Sensitivity scan (booleans only; **no secret values printed**): **0** JWT-like literals across all 14. No password-assignment literals detected. Some mention localhost, `supabase.co` hosts, `service_role` conceptually, or `@ijaaro.test` fixture emails/UUIDs.

#### Reclassified to `INCLUDE_CANDIDATE` (3)

| Path | Why reclassify | Confidence | User decision? |
|------|----------------|------------|----------------|
| `docs/RP-1.3.29_RENTER_SESSION_RESOLUTION_FIX_REPORT.md` | Fix report parallel to already-included RP fix reports; no JWT/pwd/email markers | High | No |
| `docs/RP-1.3.31_AUTH_SESSION_JWT_COHERENCE_FIX_REPORT.md` | Fix report documenting auth session coherence work; no JWT literals in file | High | No |
| `docs/STEP_5_4_24_LANDLORDS_WORKFLOW_VERIFICATION.md` | Workflow verification without fixture emails/UUIDs; same class as nearby INCLUDE STEP reviews | Medium | Soft |

#### Retained `REVIEW_REQUIRED` (11)

| Path | Why retain | Confidence | User decision? |
|------|------------|------------|----------------|
| `docs/RP-1.3.10_LOCAL_LANDLORD_PASSWORD_RECOVERY.md` | Documents privileged recovery procedure; pairs with excluded recover script | High | **Yes** |
| `docs/RP-1.3.24_RENTER_SESSION_RUNTIME_DIAGNOSTIC.md` | Runtime diagnostic; operational density | Medium | **Yes** |
| `docs/RP-1.3.25_RENTER_AUTH_STATE_VERIFICATION.md` | Auth-state verification; mentions hosted host patterns | Medium | **Yes** |
| `docs/RP-1.3.27_SHARED_TENANT_LOGIN_RUNTIME_DIAGNOSTIC.md` | Large runtime diagnostic (landlord vs renter) | Medium | **Yes** |
| `docs/RP-1.3.28_EXISTING_RENTER_LOGIN_DIAGNOSTIC.md` | Mentions service-role conceptually; diagnostic | Medium | **Yes** |
| `docs/RP-1.3.30_RENTER_REDIRECT_AND_RLS_DIAGNOSTIC.md` | Redirect + RLS diagnostic | Medium | **Yes** |
| `docs/RP-1.3.5_FINAL_BROWSER_VERIFICATION.md` | Browser verification with host discussion | Medium | **Yes** |
| `docs/RP-1.3.9_LOCAL_LANDLORD_LOGIN_DIAGNOSIS.md` | Login diagnosis / recovery-adjacent | Medium | **Yes** |
| `docs/STEP_5_4_25_LANDLORDS_BROWSER_SMOKE_TEST.md` | Smoke test report; `@ijaaro.test` fixture email domain | High | **Yes** |
| `docs/STEP_5_4_26_PENDING_PAYMENT_APPROVAL_VERIFICATION.md` | Payment approval browser verification | Medium | **Yes** |
| `docs/STEP_5_4_29_LANDLORDS_MOVE_OUT_BROWSER_VERIFICATION.md` | Move-out smoke; fixture emails + UUIDs (`@ijaaro.test`) | High | **Yes** |

### 4.4 REVIEW_REQUIRED reconciliation

| Metric | Count |
|--------|------:|
| Phase 8B distinct `REVIEW_REQUIRED` file paths | **24** |
| Resolved → `INCLUDE_CANDIDATE` | **4** (`run-isolated-dev.mjs` + 3 docs) |
| Resolved → `EXCLUDE_ARTIFACT` | **5** (recover + 4 smoke scripts) |
| Still `REVIEW_REQUIRED` | **15** |
| Decision items outside the 24 paths (deletions, env hostnames) | See §10 |

---

## 5. Utility Files — Individual Decisions

Source: `git diff --name-only --diff-filter=D HEAD` (**23**), `git show HEAD:<path>` headers, Phase 6 CR-011/012/018/019/025, Phase 8B §4. **None restored.** Local `App.tsx` has **no** imports of deleted utility pages / `simplePdf` / `app-loading`. Water/electricity **core** routes (customers, bills, payments, reports, etc.) remain; connections/staff/notifications/settings routes removed.

| # | Path | Purpose (HEAD) | Feature | Local equivalent? | Omission intentional? | Dependencies note | Baseline absence | Future import |
|---|------|----------------|---------|-------------------|----------------------|-------------------|------------------|---------------|
| 1 | `docs/WATER_COMPANY_DASHBOARD.md` | Water admin dashboard doc | Water UX docs | No water-dashboard doc | Yes (CR-025) | Docs only | `ABSENCE_JUSTIFIED_FOR_BASELINE` | Integration phase |
| 2 | `frontend/src/components/ui/app-loading.tsx` | Loading spinner | Shared UX | Inline loading in App/ProtectedRoute | Yes (CR-012) | No remaining imports | `ABSENCE_JUSTIFIED_FOR_BASELINE` | Optional with utility UX |
| 3 | `frontend/src/lib/simplePdf.ts` | Hand-rolled PDF | Utility invoices/reports | None; `jspdf` absent from package.json/lock | Yes (CR-012) | GH Payments/Reports depended on it; local pages reduced | `ABSENCE_JUSTIFIED_FOR_BASELINE` | Required if restoring GH finance PDF UX |
| 4 | `frontend/src/pages/utility/CompanySettingsPage.tsx` | Utility branding wrapper | Company settings | `WorkspaceBrandingPage` exists; route removed | Yes (CR-011) | Not routed in App | `ABSENCE_JUSTIFIED_FOR_BASELINE` | CR-011 import |
| 5 | `frontend/src/pages/utility/ConnectionsPage.tsx` | House/connection registration | Connections | None | Yes (CR-011) | Not routed | `ABSENCE_JUSTIFIED_FOR_BASELINE` | CR-011 + migs |
| 6 | `frontend/src/pages/utility/DirectoryUi.tsx` | Directory / temp-password UI | Staff/customer directory | None | Yes (CR-011) | Helper for deleted pages | `ABSENCE_JUSTIFIED_FOR_BASELINE` | With CR-011 pages |
| 7 | `frontend/src/pages/utility/NotificationsPage.tsx` | Ops notifications | Notifications | None | Yes (CR-011) | Not routed | `ABSENCE_JUSTIFIED_FOR_BASELINE` | CR-011 |
| 8 | `frontend/src/pages/utility/StaffPage.tsx` | Utility company staff | Company staff | Landlord `StaffMembersPage` / `provision-staff` ≠ company staff | Yes (CR-011) | Landlord staff route remains separate | `ABSENCE_JUSTIFIED_FOR_BASELINE` | CR-011 + provision-company-staff |
| 9 | `supabase/functions/provision-company-customer/index.ts` | Provision utility customers | Company customer ops | Local `provision-renter` is landlord/renter — **not** equivalent | Yes (CR-019) | Not in local `config.toml` function list checked | `ABSENCE_JUSTIFIED_FOR_BASELINE` | CR-019 |
| 10 | `supabase/functions/provision-company-staff/index.ts` | Provision utility staff | Company staff ops | Tracked `provision-staff` is workspace staff | Yes (CR-019) | Distinct product surface | `ABSENCE_JUSTIFIED_FOR_BASELINE` | CR-019 |
| 11 | `supabase/migrations/20261018000001_list_company_member_profiles.sql` | `list_company_member_profiles` RPC | Company member profiles | Local member-profile hygiene ≠ this migration | Yes (CR-018) | Types: no match found for this RPC name in local `database.ts` scan | `ABSENCE_JUSTIFIED_FOR_BASELINE` | CR-018 |
| 12 | `supabase/migrations/20261019000001_register_utility_house.sql` | Register house + flat bills | Connections/billing | None | Yes (CR-018) | Needed if Connections UI restored | `ABSENCE_JUSTIFIED_FOR_BASELINE` | CR-018 |
| 13 | `supabase/migrations/20261020000001_register_utility_payment_by_ops.sql` | Ops register pending payment | Utility payments | None | Yes (CR-018) | Ops payment UX | `ABSENCE_JUSTIFIED_FOR_BASELINE` | CR-018 |
| 14 | `supabase/migrations/20261020000002_generate_flat_bill_upsert.sql` | Flat bill upsert | Flat billing | None | Yes (CR-018) | Billing RPCs | `ABSENCE_JUSTIFIED_FOR_BASELINE` | CR-018 |
| 15 | `supabase/migrations/20261020000003_create_utility_adhoc_charge.sql` | Ad-hoc charge | Charge balance | None | Yes (CR-018) | Water charge UX | `ABSENCE_JUSTIFIED_FOR_BASELINE` | CR-018 |
| 16 | `supabase/migrations/20261020000004_adjust_utility_bill_by_ops.sql` | Adjust/cancel bill | Invoice edit | None | Yes (CR-018) | Invoice UX | `ABSENCE_JUSTIFIED_FOR_BASELINE` | CR-018 |
| 17 | `supabase/migrations/20261020000005_update_utility_customer_by_ops.sql` | Update/deactivate customer | Customer ops | None | Yes (CR-018) | Customer admin | `ABSENCE_JUSTIFIED_FOR_BASELINE` | CR-018 |
| 18 | `supabase/migrations/20261020000006_update_delete_tenant.sql` | Super Admin `update_tenant` + hard-delete cascade | **Platform** admin | Local `TenantDetailPage` uses `update_tenant_branding` only; large admin simplification vs GH | Intentional for *local* simplified admin, but **not** water-only | Platform capability risk if GH Super Admin update/delete expected on Live | **`USER_DECISION_REQUIRED`** | Also future import / product decision |
| 19 | `supabase/migrations/20261021000001_staff_can_approve_utility_payments.sql` | Staff approve utility payments | Payments | None | Yes (CR-018) | Payment approval authz | `ABSENCE_JUSTIFIED_FOR_BASELINE` | CR-018 |
| 20 | `supabase/migrations/20261021000002_auto_issue_flat_bill_on_register.sql` | Auto-issue bill on register | Billing | None | Yes (CR-018) | Ties to house register | `ABSENCE_JUSTIFIED_FOR_BASELINE` | CR-018 |
| 21 | `supabase/migrations/20261021000003_issue_monthly_flat_bills_batch.sql` | Batch monthly flat bills | Billing | Local rent-charges function/migration is **rent**, not utility flat bills | Yes (CR-018) | Do not confuse with `generate-monthly-rent-charges` | `ABSENCE_JUSTIFIED_FOR_BASELINE` | CR-018 |
| 22 | `supabase/migrations/20261021000004_issue_flat_bills_months_ahead.sql` | Issue N months flat bills | Billing | None | Yes (CR-018) | Billing | `ABSENCE_JUSTIFIED_FOR_BASELINE` | CR-018 |
| 23 | `supabase/tests/utility_tenant_isolation_probe.sql` | Cross-tenant utility probe | Isolation test | Frontend RLS tests exist; not this SQL probe | Yes (CR-018/023) | Privileged SQL Editor probe | `ABSENCE_JUSTIFIED_FOR_BASELINE` | With utility import |

**Aggregate:** Absence from the **landlord/renter local baseline** is justified for 22/23. Item 18 needs explicit human acknowledgment before recording the deletion permanently. Blobs remain recoverable from `origin/main` / `HEAD` for a later utility-import phase. **Do not treat absence as “safe forever.”**

---

## 6. Untracked Count Reconciliation

| Moment | Untracked files | Notes |
|--------|----------------:|-------|
| Phase 8B pre-report inventory | **159** | §2 / §5 |
| Phase 8B after writing its report | **160** | §10 explicitly: includes `docs/PHASE8B_BASELINE_COMMIT_READINESS.md` |
| Phase 8C start (this audit) | **160** | Exact `git ls-files --others --exclude-standard` |

**Explanation:** The increase **159 → 160** is fully explained by the Phase 8B report file itself. No other unexpected add/remove was detected between Phase 8B’s post-report note and Phase 8C start.

**Composition of current 160** (matches Phase 8B buckets + PHASE8B):

| Bucket | Count |
|--------|------:|
| Documentation (`docs/`) | **55** (= 54 + PHASE8B) |
| Application source (`frontend/src/`) | **81** |
| Tooling scripts (`frontend/scripts/`) | **7** |
| Edge Functions | **5** |
| Migrations | **8** |
| Manual SQL | **3** |
| SQL tests | **1** |
| **Total** | **160** |

After this Phase 8C report is written, untracked count is expected to become **161** (this file only), without implying new application source.

---

## 7. INCLUDE_CANDIDATE Audit

Phase 8B Count A = **200** = 65 modified + 135 untracked (81 app + 8 mig + 5 edge + 1 SQL test + 40 docs).

### Verification results

| Check | Result |
|-------|--------|
| All 65 modified paths exist | **Yes** (0 missing) |
| All 65 show modified Git status vs `HEAD` | **Yes** |
| All 135 untracked INCLUDE paths exist | **Yes** (0 missing) |
| All 135 show `??` status | **Yes** |
| Exact list reconstructible from Phase 8B §5.3–5.7 + §5.1 INCLUDE docs | **Yes** |

### By category (exact paths preserved)

#### 7.1 Modified — config / docs / deps (8) — `INCLUDE_CANDIDATE`

`.env.example`, `.gitignore`, `PROJECT_ROADMAP.md`, `README.md`, `frontend/.env.example`, `frontend/package-lock.json`, `frontend/package.json`, `supabase/config.toml`

**Notes:** Example envs: no JWT-like values; placeholders/comments. Host patterns may include `supabase.co` — publishability still a §10 eyeball. `package.json` ties to REVIEW/INCLUDE scripts. Presence ≠ Live SMTP/schema proof.

#### 7.2 Modified — auth / tenancy / types / protected mig (8)

`frontend/src/App.tsx`, `frontend/src/auth/AuthProvider.tsx`, `frontend/src/auth/ProtectedRoute.tsx`, `frontend/src/lib/supabase.ts`, `frontend/src/lib/tenant.ts`, `frontend/src/lib/roles.ts`, `frontend/src/types/database.ts`, `supabase/migrations/20261013000013_security_isolation_hardening.sql`

**Notes:** Authz/session/tenancy sensitive; protected mig hash verified. Keep local bytes for CR-016.

#### 7.3 Modified — layout / landing / UI (12)

`frontend/src/components/layout/AppShell.tsx`, `frontend/src/components/landing/templates/{CommunityConnect,CorporateTrust,MinimalClean,ModernProfessional,PublicSections,ServiceShowcase,SiteChrome,types}.tsx` (types.ts), `frontend/src/components/charts/SimpleCharts.tsx`, `frontend/src/components/ui/metric-card.tsx`, `frontend/src/index.css`, `frontend/src/lib/format.ts`

#### 7.4 Modified — account / login / landing pages (3)

`frontend/src/pages/AccountPage.tsx`, `LoginPage.tsx`, `TenantLandingPage.tsx`

#### 7.5 Modified — admin (6)

`frontend/src/pages/admin/{AdminPaymentsPage,AdminPropertiesPage,AdminUtilityOpsPage,SuperAdminDashboard,TenantDetailPage,TenantsPage}.tsx`

**Notes:** Local simplifications relate to absent `update_delete_tenant` migration (CR-020).

#### 7.6 Modified — landlord (7)

`frontend/src/pages/landlord/{LandlordDashboard,PaymentsReviewPage,PropertiesPage,PropertyDetailPage,PropertyFormPage,TenanciesPage,TenancyDetailPage}.tsx`

#### 7.7 Modified — renter (5)

`frontend/src/pages/renter/{BrowseListingsPage,ListingDetailPage,RenterDashboard,RenterPaymentsPage,RenterTenancyPage}.tsx`

#### 7.8 Modified — utility reduced local surface (9)

`frontend/src/pages/utility/{BillsPage,CustomerDetailPage,CustomerPaymentsPage,CustomersPage,PaymentsReviewPage,ReadingsPage,ReportsPage,UtilityDashboard,shared}.{tsx,ts}`

**Notes:** CR-010 — committing locks simpler utility UX until UNION import.

#### 7.9 Modified — tests (6)

`frontend/src/lib/membershipWriteHardening.migration.test.ts`, `provisionStaff.authz.test.ts`, `frontend/src/test/rls.{hardening,rental,security,utility}.test.ts`

#### 7.10 Untracked application source (81) — `INCLUDE_CANDIDATE`

Auth: `frontend/src/auth/{AuthProvider.test.tsx,ProtectedRoute.test.tsx,RoleRoute.test.tsx,authSessionCoherence.ts,authSessionCoherence.test.ts}`

Layout/landing/listings: `frontend/src/components/layout/{appShellNav.ts,appShellNav.test.ts,AppShell.test.tsx}`, `frontend/src/components/landing/{LandlordPublicListings.tsx,LandlordPublicListings.test.tsx}`, `frontend/src/components/landing/templates/{SiteChrome.test.tsx,landingTemplates.composition.test.tsx}`, `frontend/src/components/listings/{PropertyCoverImage.tsx,PropertyImageGallery.tsx,PropertyImageGallery.test.tsx,PropertyImagePlaceholder.tsx}`

Libs: `supabaseEnv.ts/.test.ts`, `inviteRenter.ts/.test.ts`, `provisionRenter.ts` + 3 tests, `propertyPhotos.ts/.test.ts`, `propertyPhotoIdentity.migration.test.ts`, `publicListingPhotos.ts` + 3 tests, `monthlyRentPeriod.ts/.test.ts`, `generateMonthlyRentCharges.migration.test.ts`, `reviewRentPayment.migration.test.ts`, `listSameTenantMemberProfiles.migration.test.ts`, `liveLocalEnvSeparation.test.ts`, `myApplicationsNav.ts/.test.ts`, `passwordForm.ts/.test.ts`, `scrollToHashTarget.ts/.test.ts`, `setPasswordLoginRedirect.ts/.test.ts`, `signupEmailRedirect.ts/.test.ts`, `tenancyDisplay.ts/.test.ts`, `username.ts` + 2 tests, `resolvePortalTenantKey.test.ts` (all under `frontend/src/lib/`)

Pages: `ApplyToRentPage.tsx`, `MyApplicationsPage.tsx/.test.tsx`, `PublicListingDetailPage.tsx/.test.tsx`, `SetPasswordPage.tsx/.test.tsx`, `AccountPage.test.tsx`, `TenantLandingPage.test.tsx`, `landlord/ApplicationsPage.tsx`, `landlord/InviteRenterPage.tsx/.test.tsx`, landlord page tests (PaymentsReview, Properties, PropertyDetail.moveOut, PropertyForm, Tenancies, TenancyDetail), renter page tests (Browse, ListingDetail, Dashboard, Payments, Tenancy)

Harness: `frontend/src/test/{isolatedEnv.ts,rls.marketplace.test.ts,rls.membershipHardening.test.ts,rls.renterApplications.test.ts,rls.staffProperties.test.ts}`

**Audit:** Necessary to preserve local marketplace/auth/landlord/renter functionality. No secret files in this set. Not generated artifacts.

#### 7.11 Untracked migrations (8) — `INCLUDE_CANDIDATE`

- `supabase/migrations/20261018143031_fix_property_photos_storage_path_policy.sql`
- `supabase/migrations/20261018220000_marketplace_field_isolation.sql`
- `supabase/migrations/20261021120000_review_rent_payment_require_rejection_reason.sql`
- `supabase/migrations/20261022200000_property_photo_identity_immutable.sql`
- `supabase/migrations/20261024120000_generate_monthly_rent_charges.sql`
- `supabase/migrations/20261024133000_add_villa_property_type.sql`
- `supabase/migrations/20261024140000_property_rooms_and_neighborhood.sql`
- `supabase/migrations/20261024150000_public_listing_detail_rooms_neighborhood.sql`

**Note:** On-disk ≠ applied on Live.

#### 7.12 Untracked Edge Functions (5) — `INCLUDE_CANDIDATE`

- `supabase/functions/generate-monthly-rent-charges/index.ts`
- `supabase/functions/provision-renter/index.ts`
- `supabase/functions/provision-renter/logic.ts`
- `supabase/functions/public-listing-photos/index.ts`
- `supabase/functions/public-listing-photos/logic.ts`

#### 7.13 Untracked SQL test (1) — `INCLUDE_CANDIDATE`

- `supabase/tests/monthly_rent_charges_sql_checks.sql`

#### 7.14 Untracked INCLUDE docs from Phase 8B (40) — still `INCLUDE_CANDIDATE`

`docs/PHASE5_SAFE_GIT_SETUP_REPORT.md`, `PHASE6_APPROVAL_CHECKLIST.md`, `PHASE6_CONFLICT_REGISTER.md`, `PHASE6_DETAILED_INTEGRATION_PLAN.md`, `PHASE7_GIT_SETUP_REPORT.md`, `PHASE8A_BASELINE_COMMIT_AUDIT.md`, `RP-1.3.11_SUPABASE_LIVE_READINESS_AUDIT.md`, `RP-1.3.12_LIVE_MIGRATION_REVIEW.md`, `RP-1.3.13_LIVE_PREFLIGHT_REPORT.md`, `RP-1.3.14_LIVE_MIGRATION_EXECUTION_REPORT.md`, `RP-1.3.15_LIVE_SECURITY_AND_DEV_READINESS.md`, `RP-1.3.16_ENV_CONFIGURATION_AUDIT.md`, `RP-1.3.17_LIVE_DEV_ENV_CONFIGURATION_REPORT.md`, `RP-1.3.18_LIVE_LOCAL_ENVIRONMENT_SEPARATION.md`, `RP-1.3.19_RENTER_EMAIL_CONFIRMATION_REDIRECT_AUDIT.md`, `RP-1.3.20_RENTER_EMAIL_REDIRECT_FIX_REPORT.md`, `RP-1.3.21_RENTER_SIGNIN_ROUTING_AUDIT.md`, `RP-1.3.22_ACCEPTED_RENTER_NAVIGATION_FIX_REPORT.md`, `RP-1.3.23_RENTER_PORTAL_LOGIN_LOOP_AUDIT.md`, `RP-1.3.26_RENTER_DASHBOARD_AUTH_STATE_FIX_REPORT.md`, `RP-1.3.32_F1_TENANT_SCOPED_BROWSE_FIX_REPORT.md`, `RP-1.3.32_F1_TENANT_SCOPED_BROWSE_MINIMAL_FIX_PLAN.md`, `RP-1.3.32_LANDLORD_RENTER_DATA_INTEGRITY_AUDIT.md`, `RP-1.3.4_LOCAL_ENV_MIGRATION_SAFETY.md`, `RP-1.3.6_MEMBER_PROFILE_RPC_HYGIENE.md`, `RP-1.3.7_LOCAL_RPC_APPLY_AND_REGRESSION.md`, `RP-1.3.8_MOVE_OUT_TEST_TRIAGE.md`, `RP-1.3_INITIAL_RENT_POLICY_IMPLEMENTATION_PLAN.md`, `RP-1.3_INITIAL_RENT_PRORATION_IMPLEMENTATION_PLAN.md`, `RP-1.3_RENT_CHARGE_CALCULATION_AUDIT.md`, `RP-1.3_RENT_PAYMENT_REVIEW_UX_IMPLEMENTATION_PLAN.md`, `RP-1.3_TENANCY_DISPLAY_FIX_REPORT.md`, `RP-1.3_TENANCY_FUNCTIONAL_AUDIT.md`, `STEP_5.4.19_MIGRATION_REVIEW.md`, `STEP_5.4.20_MIGRATION_HISTORY_RECONCILIATION.md`, `STEP_5.4.21_MARKETPLACE_CUTOVER_PLAN.md`, `STEP_5.4.31_MARKETPLACE_FIELD_ISOLATION_CUTOVER.md`, `STEP_5_4_27_LANDLORDS_FINAL_GAP_REVIEW.md`, `STEP_5_4_28_LANDLORD_RENTER_INVITE_UI.md`, `STEP_5_4_30_LANDLORDS_ROADMAP_RECONCILIATION.md`

**Caveat:** Several Live readiness/migration docs describe operational Live history. They remain INCLUDE_CANDIDATE as project history, but they are **not** proof of current Live schema state.

#### 7.15 INCLUDE audit caveats (do not treat as staging approval)

- Auth/tenancy/admin/utility reduced pages carry unresolved **product** implications (CR-010/020), not path-existence issues.
- Migrations/Edge Functions on disk do not prove apply/deploy.
- No path in the 200 was found missing or secretly an env/credential file.

---

## 8. Secret and Environment Review

**No secret values printed.**

| Path | Exists | Ignored | Tracked | Handling |
|------|--------|---------|---------|----------|
| `.env` | No | Yes (pattern) | No | N/A |
| `.env.local` | No | Yes | No | N/A |
| `.env.live.local` | No (root) | Yes | No | N/A |
| `.env.isolated` | No (root) | Yes | No | N/A |
| `.env.example` | Yes | No | Yes (`M`) | Template — shape OK (no JWT-like); host patterns need eyeball |
| `frontend/.env` | No | Yes | No | N/A |
| `frontend/.env.local` | Yes | Yes (`!!`) | No | `EXCLUDE_SECRET` |
| `frontend/.env.live.local` | Yes | Yes (`!!`) | No | `EXCLUDE_SECRET` |
| `frontend/.env.isolated` | Yes | Yes (`!!`) | No | `EXCLUDE_SECRET` |
| `frontend/.env.example` | Yes | No | Yes (`M`) | Template — placeholders/comments; no JWT-like |
| `frontend/.local/rp135-landlord-login.txt` | Yes | Yes | No | `EXCLUDE_SECRET` |
| `supabase/.env` / `.env.local` | No | Yes | No | N/A |

| Artifact | Exists | Ignored | Handling |
|----------|--------|---------|----------|
| `frontend/.vitest/` | Yes | Yes | `EXCLUDE_ARTIFACT` |
| `frontend/tsconfig.tsbuildinfo` | Yes | Yes | `EXCLUDE_ARTIFACT` |
| `frontend/.smoke-5425.json` / `.smoke-5426.json` / `.smoke-5429-moveout.json` | Yes | Yes | `EXCLUDE_ARTIFACT` |
| `supabase/.temp/` | Yes | Yes | `EXCLUDE_ARTIFACT` |
| `frontend/node_modules/` / `frontend/dist/` | Yes | Yes | `EXCLUDE_ARTIFACT` |

Suspicious private-key / `credentials.json` scan outside ignored trees: **0** hits.

**Manual review still needed (no values shown):** example-env hostname publishability; `ensure-live-env.mjs` hardcoded Live project ref if that script is included later.

Live Supabase configuration was **not** contacted or modified.

---

## 9. Revised Exact Baseline Manifest

> Review recommendations only. **Not** an approved commit. Exact paths.

### Classification change log (from Phase 8B)

| Path | Previous | New | Evidence | Clear without user OK? |
|------|----------|-----|----------|------------------------|
| `frontend/scripts/run-isolated-dev.mjs` | `REVIEW_REQUIRED` | `INCLUDE_CANDIDATE` | `package.json` `dev:isolated`; loopback; no hardcoded JWT | Yes (recommendation) |
| `frontend/scripts/recover-local-rp135-landlord-password.mjs` | `REVIEW_REQUIRED` | `EXCLUDE_ARTIFACT` | Privileged recovery; not in package.json; not app runtime | Yes for exclude-from-baseline |
| `frontend/scripts/smoke-landlords-5425.mjs` | `REVIEW_REQUIRED` | `EXCLUDE_ARTIFACT` | Disposable fixtures | Yes for exclude |
| `frontend/scripts/smoke-moveout-5429.mjs` | `REVIEW_REQUIRED` | `EXCLUDE_ARTIFACT` | Disposable fixtures | Yes for exclude |
| `frontend/scripts/smoke-payments-5426.mjs` | `REVIEW_REQUIRED` | `EXCLUDE_ARTIFACT` | Disposable fixtures | Yes for exclude |
| `frontend/scripts/smoke-payments-5426-approve.mjs` | `REVIEW_REQUIRED` | `EXCLUDE_ARTIFACT` | Disposable fixtures | Yes for exclude |
| `docs/RP-1.3.29_RENTER_SESSION_RESOLUTION_FIX_REPORT.md` | `REVIEW_REQUIRED` | `INCLUDE_CANDIDATE` | Fix report; no JWT/pwd/email markers | Yes |
| `docs/RP-1.3.31_AUTH_SESSION_JWT_COHERENCE_FIX_REPORT.md` | `REVIEW_REQUIRED` | `INCLUDE_CANDIDATE` | Fix report; no JWT literals | Yes |
| `docs/STEP_5_4_24_LANDLORDS_WORKFLOW_VERIFICATION.md` | `REVIEW_REQUIRED` | `INCLUDE_CANDIDATE` | Verification without fixture emails | Soft |
| `docs/PHASE8B_BASELINE_COMMIT_READINESS.md` | *(absent from 8B Count A)* | `INCLUDE_CANDIDATE` | Phase readiness report; explains 159→160 | Yes |

**Unchanged `REVIEW_REQUIRED` (15):**  
`frontend/scripts/ensure-live-env.mjs`,  
`supabase/manual/marketplace_field_isolation.rollback.sql`,  
`supabase/manual/marketplace_field_isolation.stage1_rpcs.sql`,  
`supabase/manual/marketplace_field_isolation.stage2_policies.sql`,  
`docs/RP-1.3.10_LOCAL_LANDLORD_PASSWORD_RECOVERY.md`,  
`docs/RP-1.3.24_RENTER_SESSION_RUNTIME_DIAGNOSTIC.md`,  
`docs/RP-1.3.25_RENTER_AUTH_STATE_VERIFICATION.md`,  
`docs/RP-1.3.27_SHARED_TENANT_LOGIN_RUNTIME_DIAGNOSTIC.md`,  
`docs/RP-1.3.28_EXISTING_RENTER_LOGIN_DIAGNOSTIC.md`,  
`docs/RP-1.3.30_RENTER_REDIRECT_AND_RLS_DIAGNOSTIC.md`,  
`docs/RP-1.3.5_FINAL_BROWSER_VERIFICATION.md`,  
`docs/RP-1.3.9_LOCAL_LANDLORD_LOGIN_DIAGNOSIS.md`,  
`docs/STEP_5_4_25_LANDLORDS_BROWSER_SMOKE_TEST.md`,  
`docs/STEP_5_4_26_PENDING_PAYMENT_APPROVAL_VERIFICATION.md`,  
`docs/STEP_5_4_29_LANDLORDS_MOVE_OUT_BROWSER_VERIFICATION.md`

### A. `INCLUDE_CANDIDATE`

**All 200 Phase 8B paths (unchanged membership)**  
plus:

- `docs/PHASE8B_BASELINE_COMMIT_READINESS.md`
- `frontend/scripts/run-isolated-dev.mjs`
- `docs/RP-1.3.29_RENTER_SESSION_RESOLUTION_FIX_REPORT.md`
- `docs/RP-1.3.31_AUTH_SESSION_JWT_COHERENCE_FIX_REPORT.md`
- `docs/STEP_5_4_24_LANDLORDS_WORKFLOW_VERIFICATION.md`

**Count A (revised):** **205**  
*(Does not yet include this Phase 8C report; after write it should also be treated as `INCLUDE_CANDIDATE` → 206.)*

### B. `EXCLUDE_ARTIFACT`

Phase 8B named artifacts **plus**:

- `frontend/scripts/recover-local-rp135-landlord-password.mjs`
- `frontend/scripts/smoke-landlords-5425.mjs`
- `frontend/scripts/smoke-moveout-5429.mjs`
- `frontend/scripts/smoke-payments-5426.mjs`
- `frontend/scripts/smoke-payments-5426-approve.mjs`

(also: `.vitest/`, `tsconfig.tsbuildinfo`, smoke JSON, `supabase/.temp/`, `node_modules/`, `dist/`, etc.)

### C. `EXCLUDE_SECRET`

Unchanged named set:

- `frontend/.env.local`
- `frontend/.env.live.local`
- `frontend/.env.isolated`
- `frontend/.local/rp135-landlord-login.txt`

### D. `REVIEW_REQUIRED` (file paths)

The **15** paths listed above, **plus** non-path decisions in §10 (23 deletions acknowledgment; example-env hostnames; whether to include `ensure-live-env` after Live-ref OK).

### E. `INTENTIONALLY_ABSENT_UTILITY_FILE`

Same **23** paths as Phase 8B §8.E. Baseline decision classes per §5: 22× `ABSENCE_JUSTIFIED_FOR_BASELINE`, 1× `USER_DECISION_REQUIRED` (`20261020000006_update_delete_tenant.sql`).

---

## 10. Remaining User Decisions

Evidence-backed recommendations are separated from items that still need an explicit owner choice.

### Still require explicit user decision

1. **Include or defer** `frontend/scripts/ensure-live-env.mjs` (hardcoded Live project ref; required by current `npm run dev` Live workflow).
2. **Include or exclude** the three `supabase/manual/marketplace_field_isolation.*.sql` files (ops archive with Live project reference / destructive SQL).
3. **Include or prune** the 11 retained diagnostic/smoke docs in §4.3.
4. **Acknowledge recording all 23 deletions** in a future baseline sync commit (especially `update_delete_tenant`).
5. **Confirm** `.env.example` / `frontend/.env.example` host patterns are intentional to publish.
6. **Confirm** CR-010 local reduced utility pages are acceptable to lock until utility import.

### Evidence-backed (no further discovery needed; still need staging-phase approval)

1. Include the 205-path `INCLUDE_CANDIDATE` set (plus this report once written).
2. Exclude recover + smoke scripts from the baseline sync commit.
3. Keep secret env files and smoke/temp artifacts out of Git.
4. Keep protected migration local bytes (hash match).
5. Keep 22 utility absences for this baseline; plan utility import separately.
6. Treat `update_delete_tenant` absence as acknowledged platform-risk item before staging deletions.

---

## 11. Final Read-Only Verification

Performed at end of Phase 8C (after writing this report only — recheck commands are read-only):

| Check | Result |
|-------|--------|
| Branch | `integration/lossless-utility-sync` (**unchanged**) |
| `HEAD` | `f8bd11cc7d304f193929060b1f57f32636e6544a` (**unchanged**; equals `origin/main`) |
| Staging empty | **Yes** (`staged=0`) |
| Commit / push this phase | **No** (`HEAD` still `f8bd11c Merge pull request #1…`) |
| Protected migration SHA-256 | `00B056D20D96FB9D01BE35D9A64FDFCC9420742D5E1F82A01E6B36D25027EE1D` (**match**) |
| Modified / Deleted / Untracked / Staged | **65** / **23** / **161** / **0** |
| Untracked excluding this report | **160** (matches Phase 8B post-report inventory) |
| Only new write | `docs/PHASE8C_BASELINE_FINDINGS_RESOLUTION.md` |
| DB / Supabase / tests / mutative Git | **Not executed** |
| Forbidden Git mutators | **Not used** |

---

## 12. Recommendation for the Next Phase

### `READY_FOR_USER_REVIEW`

**Meaning:** Phase 8C resolved **9** of **24** path-level review findings with evidence, clarified all **23** utility absences, reconciled the untracked-count discrepancy, verified the protected hash, and audited the **200** INCLUDE paths. **15** path-level items plus §10 decisions remain for the owner.

**Not claimed:** production readiness, Live DB correctness, approval to stage/commit/push, or utility source integration.

**STOP.** Wait for explicit user approval before any staging, commit, utility import, or database phase.
