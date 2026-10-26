# Phase 8F — Final Git safety audit

**Date:** 2026-10-26  
**Repository:** `C:\my projects\Ijaaro-project-main`  
**Remote:** `https://github.com/ijaaro-lab/ijaaro-project.git`  
**Scope:** Read-only readiness audit for a future baseline commit. No stage, commit, push, restore, or Live/database operation was performed.

## 1. Executive verdict

**`READY_WITH_EXCLUSIONS`**

A path-limited baseline commit can be prepared from the current working tree. A blanket `git add -A` is not safe.

What is established:

- `HEAD` is `f8bd11cc7d304f193929060b1f57f32636e6544a`, identical to `origin/main` (0 ahead, 0 behind).
- The protected migration on disk matches the expected SHA-256.
- Real environment files and the local landlord login file are gitignored and are not in the change set. Their contents were not read.
- A content scan of the change set plus tracked files found no JWT, private key, database URL, cloud access key, or `sb_secret` value.
- No new path appeared after Phase 8E. Counts before this report: 65 modified, 23 deleted, 163 untracked, 0 staged, 0 conflicts.

What must stay out of the commit:

- Five local operational scripts (password recovery and four smoke tools).
- Three manual marketplace SQL files, including the rollback.
- Fourteen untracked Live-operations documents that repeat the hosted project id.
- `PROJECT_ROADMAP.md`, until its new closing line is rewritten. That line names the hosted project and tells the reader to paste manual SQL into it.

The 23 missing tracked files, including `update_delete_tenant`, should stay absent for this baseline. Their blobs remain on `HEAD` / `origin/main`. This audit did not restore them and did not compare the Live database to the repo.

This report file is new. After it is written, the untracked count is 164. Treat `docs/PHASE8F_FINAL_GIT_SAFETY_AUDIT.md` as safe to include.

## 2. Repository state

| Item | Measured value |
| --- | --- |
| Root | `C:/my projects/Ijaaro-project-main` |
| Branch | `integration/lossless-utility-sync` |
| HEAD | `f8bd11cc7d304f193929060b1f57f32636e6544a` |
| HEAD subject | Merge pull request #1 from ijaaro-lab/integration/local-ijaaro-work |
| Upstream | None configured |
| `origin/main` | Same commit as HEAD |
| Ahead / behind `origin/main` | 0 / 0 |
| Staged paths | 0 |
| Unmerged / conflict paths | 0 |
| Modified (unstaged) | 65 |
| Deleted vs HEAD | 23 |
| Untracked (`-uall`, before this report) | 163 |
| Porcelain lines (before this report) | 251 |
| Tracked diff | 88 files, +9525 / −13395 |
| Ignored porcelain lines | 11793, almost all `node_modules` / build trees |

`git diff --check` reported trailing whitespace only in `PROJECT_ROADMAP.md` lines 5 and 6. That file is in the hold set. No conflict markers were found.

`core.autocrlf` is `true`. Git printed “LF will be replaced by CRLF the next time Git touches it” for many tracked files. That is a line-ending notice, not a merge conflict. The protected migration file itself is LF-only (16,481 bytes, 0 CR, 476 LF).

### Comparison with Phase 8E

Phase 8E recorded 65 modified, 23 deleted, and 163 untracked after its own report was written. This audit measured the same counts. No file under the repo (excluding `node_modules`, `.git`, `dist`, and `.vite`) has a timestamp newer than `docs/PHASE8E_OWNER_DECISION_CHECKLIST.md` (2026-10-26 13:13 +03). This is file-count and timestamp evidence, not a stored manifest diff. No unexpected application path appeared.

## 3. Protected migration

| Check | Result |
| --- | --- |
| Path | `supabase/migrations/20261013000013_security_isolation_hardening.sql` |
| On-disk SHA-256 | `00B056D20D96FB9D01BE35D9A64FDFCC9420742D5E1F82A01E6B36D25027EE1D` |
| Expected | `00B056D20D96FB9D01BE35D9A64FDFCC9420742D5E1F82A01E6B36D25027EE1D` |
| Verdict | **PASS** |

The file was not modified by this audit. Git still shows it as modified versus HEAD (11 insertions, 2 deletions). The working-tree change wraps two `REVOKE` statements in `to_regprocedure` existence checks so a local reset does not fail when `rls_auto_enable()` or `service_type_for_tenant(uuid)` is absent. The rest of the revoke/policy body is unchanged in that hunk.

**Include the current on-disk bytes** in the future commit. That publishes the hash-verified text. Immediately before any future `git add` of this path, recompute the SHA-256. Do not run `git add --renormalize`, `git checkout`, or `git restore` on it. A later Windows checkout with `core.autocrlf=true` can rewrite the working tree to CRLF and make the on-disk hash fail even if the stored blob is still the LF text.

Live execution of this migration was not checked.

## 4. How files were classified

Every porcelain path was listed. Every existing changed or untracked text file was included in a secret scan (section 5). Full diffs were read for environment templates, `.gitignore`, `README.md`, `frontend/package.json`, `supabase/config.toml`, the protected migration, and `PROJECT_ROADMAP.md`. Route and RPC symbols were extracted from `App.tsx`, the admin tenant pages, and `database.ts`. New migrations were searched for `DROP`, `TRUNCATE`, and `DELETE FROM`. Manual SQL and the seven untracked scripts were read.

Large UI page diffs were measured with numstat and included in the secret scan. They were not narrated hunk by hunk. That limit is stated here so it is not silent. Those pages are product source with no secret-scan hit, so they are in the include set.

Not opened, on purpose:

- `frontend/.env.local`
- `frontend/.env.live.local`
- `frontend/.env.isolated`
- `frontend/.local/rp135-landlord-login.txt`
- `supabase/.temp/**` (includes `project-ref`, `pooler-url`, `linked-project.json`)
- `frontend/.smoke-*.json`, `frontend/.vitest/**`, `node_modules`, `dist`

## 5. Secret and environment safety

Scan set: unique existing paths from the porcelain list plus `git ls-files`, excluding `node_modules`, `.git`, `dist`, and the forbidden files above. About 370 paths. The scanner printed categories and paths only.

| Category | Result |
| --- | --- |
| JWT-like values | None in the scanned set |
| Private key blocks | None |
| `postgres://` or `postgresql://` URLs | None |
| AWS access-key pattern | None |
| `sb_secret_` values | None |
| Quoted password / secret literals | See below |
| Hosted project id | Already on `origin/main` in two tracked files. Also present in new files listed below. The id is not repeated in this report. |

### Quoted credentials

| Path | Shape (value not shown) | Decision |
| --- | --- | --- |
| `frontend/scripts/smoke-landlords-5425.mjs` | 18-character fixture word; file loads `.env.local` and uses the service role | Exclude |
| `frontend/scripts/smoke-moveout-5429.mjs` | Same pattern | Exclude |
| `frontend/scripts/smoke-payments-5426.mjs` | No quoted password; still loads `.env.local` and the service role | Exclude |
| `frontend/scripts/smoke-payments-5426-approve.mjs` | Loads `.env.local` | Exclude |
| `frontend/src/lib/passwordForm.test.ts` | 9-character fixture word | Include |
| `frontend/src/lib/provisionRenter.test.ts` | 15-character unit-test literal; test asserts the field is stripped from the safe payload | Include |
| `frontend/src/pages/AccountPage.test.tsx` | 9-character fixture word | Include |
| `frontend/src/pages/SetPasswordPage.test.tsx` | 9-character fixture word | Include |
| `frontend/src/test/rls.*.test.ts` (9 files) | 16–23 character fixture words. Suites skip unless an isolated loopback target is configured | Include the source. Do not run them as part of commit prep |

`frontend/scripts/recover-local-rp135-landlord-password.mjs` has no hardcoded password. It generates one and writes `frontend/.local/rp135-landlord-login.txt`. Exclude the script. The output file is already ignored.

### Hosted project id

Already present at HEAD, so already on `origin/main`:

- `supabase/config.toml` (`id` and a remote-project comment). The working-tree diff does **not** introduce this line.
- `supabase/tests/phase1_rls_sql_checks.sql` (a verification comment). The file is not in the current diff.

New copies, not in HEAD:

- `frontend/scripts/ensure-live-env.mjs` — include. `package.json` `dev` and `env:live` call it. It copies a gitignored Live block into gitignored `.env.live.local` and does not print the key. The id matches the one already stored in `config.toml`. Removing the script while committing the new `dev` script would break a fresh clone.
- `frontend/src/lib/liveLocalEnvSeparation.test.ts` — include. It asserts that the script still contains that allowlist.
- `frontend/src/lib/supabaseEnv.test.ts` — include. It uses the host as an example of a non-loopback name.
- `PROJECT_ROADMAP.md` — hold. The new last paragraph tells the reader to paste `supabase/manual/` Stage 1 then Stage 2 into the hosted project.
- `supabase/manual/marketplace_field_isolation.rollback.sql` — hold. The header says the policies were captured from that hosted project.
- The 14 documents in section 6.3 — hold.

No other scanned file contained that id.

### Environment templates

`.env.example` and `frontend/.env.example` were read in full.

Both contain placeholders only (`your-project-ref`, `your_publishable_or_anon_key_here`, `your_supabase_anon_key`, `your_service_role_key_here`). No live key, JWT, or database URL. **Include both.**

`frontend/.env.example` sets `VITE_ALLOW_REMOTE_SUPABASE=true` as a documented template flag and comments that service-role keys must not use a `VITE_` prefix. That flag is not a credential. Anyone who copies the template and fills a real URL is intentionally opting into a remote target. No redaction is required before publication.

`.gitignore` now ignores `.env`, `.env.*`, `credentials.json`, `frontend/.local/`, `*.pem`, smoke JSON, Vitest cache, coverage, and `supabase/.temp/`, with exceptions only for `.env.example` and `frontend/.env.example`. **Include `.gitignore`.**

Confirmed ignored and absent from the untracked list:

- `frontend/.env.local`
- `frontend/.env.live.local`
- `frontend/.env.isolated`
- `frontend/.local/rp135-landlord-login.txt`
- `frontend/.smoke-5425.json`
- `frontend/.smoke-5426.json`
- `frontend/.smoke-5429-moveout.json`
- `frontend/.vitest/json/output.json`
- `frontend/tsconfig.tsbuildinfo`
- `supabase/.temp/cli-latest`
- `supabase/.temp/gotrue-version`
- `supabase/.temp/linked-project.json`
- `supabase/.temp/pooler-url`
- `supabase/.temp/postgres-version`
- `supabase/.temp/project-ref`
- `supabase/.temp/rest-version`
- `supabase/.temp/storage-migration`
- `supabase/.temp/storage-version`

`git check-ignore` matched the four forbidden paths to `.env.*` or `frontend/.local/`.

## 6. Inclusion plan

Do not stage with `git add -A` or `git add .`. Stage only section 6.1 and the deletions in section 6.4.

### 6.1 Include

#### Tracked modifications (64)

Leave `PROJECT_ROADMAP.md` unstaged (section 6.3).

- `.env.example`
- `.gitignore`
- `README.md`
- `frontend/.env.example`
- `frontend/package-lock.json` (jspdf block removed; one `"dev": true` lockfile line added)
- `frontend/package.json` (removes `jspdf`; adds `env:live`, `dev` via `ensure-live-env.mjs`, and `dev:isolated`)
- `frontend/src/App.tsx`
- `frontend/src/auth/AuthProvider.tsx`
- `frontend/src/auth/ProtectedRoute.tsx`
- `frontend/src/components/charts/SimpleCharts.tsx`
- `frontend/src/components/landing/templates/CommunityConnect.tsx`
- `frontend/src/components/landing/templates/CorporateTrust.tsx`
- `frontend/src/components/landing/templates/MinimalClean.tsx`
- `frontend/src/components/landing/templates/ModernProfessional.tsx`
- `frontend/src/components/landing/templates/PublicSections.tsx`
- `frontend/src/components/landing/templates/ServiceShowcase.tsx`
- `frontend/src/components/landing/templates/SiteChrome.tsx`
- `frontend/src/components/landing/templates/types.ts`
- `frontend/src/components/layout/AppShell.tsx`
- `frontend/src/components/ui/metric-card.tsx`
- `frontend/src/index.css`
- `frontend/src/lib/format.ts`
- `frontend/src/lib/membershipWriteHardening.migration.test.ts`
- `frontend/src/lib/provisionStaff.authz.test.ts`
- `frontend/src/lib/roles.ts`
- `frontend/src/lib/supabase.ts`
- `frontend/src/lib/tenant.ts`
- `frontend/src/pages/AccountPage.tsx`
- `frontend/src/pages/LoginPage.tsx`
- `frontend/src/pages/TenantLandingPage.tsx`
- `frontend/src/pages/admin/AdminPaymentsPage.tsx`
- `frontend/src/pages/admin/AdminPropertiesPage.tsx`
- `frontend/src/pages/admin/AdminUtilityOpsPage.tsx`
- `frontend/src/pages/admin/SuperAdminDashboard.tsx`
- `frontend/src/pages/admin/TenantDetailPage.tsx`
- `frontend/src/pages/admin/TenantsPage.tsx`
- `frontend/src/pages/landlord/LandlordDashboard.tsx`
- `frontend/src/pages/landlord/PaymentsReviewPage.tsx`
- `frontend/src/pages/landlord/PropertiesPage.tsx`
- `frontend/src/pages/landlord/PropertyDetailPage.tsx`
- `frontend/src/pages/landlord/PropertyFormPage.tsx`
- `frontend/src/pages/landlord/TenanciesPage.tsx`
- `frontend/src/pages/landlord/TenancyDetailPage.tsx`
- `frontend/src/pages/renter/BrowseListingsPage.tsx`
- `frontend/src/pages/renter/ListingDetailPage.tsx`
- `frontend/src/pages/renter/RenterDashboard.tsx`
- `frontend/src/pages/renter/RenterPaymentsPage.tsx`
- `frontend/src/pages/renter/RenterTenancyPage.tsx`
- `frontend/src/pages/utility/BillsPage.tsx`
- `frontend/src/pages/utility/CustomerDetailPage.tsx`
- `frontend/src/pages/utility/CustomerPaymentsPage.tsx`
- `frontend/src/pages/utility/CustomersPage.tsx`
- `frontend/src/pages/utility/PaymentsReviewPage.tsx`
- `frontend/src/pages/utility/ReadingsPage.tsx`
- `frontend/src/pages/utility/ReportsPage.tsx`
- `frontend/src/pages/utility/UtilityDashboard.tsx`
- `frontend/src/pages/utility/shared.ts`
- `frontend/src/test/rls.hardening.test.ts`
- `frontend/src/test/rls.rental.test.ts`
- `frontend/src/test/rls.security.test.ts`
- `frontend/src/test/rls.utility.test.ts`
- `frontend/src/types/database.ts`
- `supabase/config.toml`
- `supabase/migrations/20261013000013_security_isolation_hardening.sql`

`supabase/config.toml` also sets `verify_jwt = false` for `generate-monthly-rent-charges`. The function reads `SUPABASE_SERVICE_ROLE_KEY` and `MONTHLY_RENT_CRON_SECRET` from the environment. No secret value is in the file. Include the config. Do not deploy the function as part of the commit.

#### Untracked product source, tests, versioned SQL, and docs (141, plus this report)

Scripts that are safe to publish:

- `frontend/scripts/ensure-live-env.mjs`
- `frontend/scripts/run-isolated-dev.mjs` (refuses any host other than `127.0.0.1` or `localhost`)

Edge functions:

- `supabase/functions/generate-monthly-rent-charges/index.ts`
- `supabase/functions/provision-renter/index.ts`
- `supabase/functions/provision-renter/logic.ts`
- `supabase/functions/public-listing-photos/index.ts`
- `supabase/functions/public-listing-photos/logic.ts`

Versioned migrations and the SQL check (include the files; do not execute them against Live):

- `supabase/migrations/20261018143031_fix_property_photos_storage_path_policy.sql`
- `supabase/migrations/20261018220000_marketplace_field_isolation.sql`
- `supabase/migrations/20261021120000_review_rent_payment_require_rejection_reason.sql`
- `supabase/migrations/20261022200000_property_photo_identity_immutable.sql`
- `supabase/migrations/20261024120000_generate_monthly_rent_charges.sql`
- `supabase/migrations/20261024133000_add_villa_property_type.sql`
- `supabase/migrations/20261024140000_property_rooms_and_neighborhood.sql`
- `supabase/migrations/20261024150000_public_listing_detail_rooms_neighborhood.sql`
- `supabase/tests/monthly_rent_charges_sql_checks.sql`

`20261018220000_marketplace_field_isolation.sql` drops and recreates marketplace functions and SELECT policies. Its header says to apply it only through a privileged SQL editor and not with `supabase db push`. Committing the file records the schema the frontend expects. It does not apply the SQL. The same warning applies to the storage-policy migration, which drops and recreates storage policies.

New frontend modules and tests (all untracked paths under these directories that are not in sections 6.2 or 6.3):

- `frontend/src/auth/` — `AuthProvider.test.tsx`, `ProtectedRoute.test.tsx`, `RoleRoute.test.tsx`, `authSessionCoherence.test.ts`, `authSessionCoherence.ts`
- `frontend/src/components/landing/` — `LandlordPublicListings.tsx`, `LandlordPublicListings.test.tsx`, `templates/SiteChrome.test.tsx`, `templates/landingTemplates.composition.test.tsx`
- `frontend/src/components/layout/` — `AppShell.test.tsx`, `appShellNav.ts`, `appShellNav.test.ts`
- `frontend/src/components/listings/` — `PropertyCoverImage.tsx`, `PropertyImageGallery.tsx`, `PropertyImageGallery.test.tsx`, `PropertyImagePlaceholder.tsx`
- `frontend/src/lib/` — the untracked `inviteRenter`, `monthlyRentPeriod`, `myApplicationsNav`, `passwordForm`, `propertyPhotos`, `provisionRenter`, `publicListingPhotos`, `scrollToHashTarget`, `setPasswordLoginRedirect`, `signupEmailRedirect`, `supabaseEnv`, `tenancyDisplay`, `username` modules and their tests, plus `generateMonthlyRentCharges.migration.test.ts`, `listSameTenantMemberProfiles.migration.test.ts`, `liveLocalEnvSeparation.test.ts`, `propertyPhotoIdentity.migration.test.ts`, `resolvePortalTenantKey.test.ts`, `reviewRentPayment.migration.test.ts`
- `frontend/src/pages/` — `ApplyToRentPage.tsx`, `MyApplicationsPage.tsx`, `PublicListingDetailPage.tsx`, `SetPasswordPage.tsx`, `landlord/ApplicationsPage.tsx`, `landlord/InviteRenterPage.tsx`, and the untracked `*.test.tsx` files next to Account, My Applications, public listing, set-password, tenant landing, landlord, and renter pages
- `frontend/src/test/` — `isolatedEnv.ts`, `rls.marketplace.test.ts`, `rls.membershipHardening.test.ts`, `rls.renterApplications.test.ts`, `rls.staffProperties.test.ts`

`isolatedEnv.ts` loads gitignored env files only when a test imports it. The source itself has no secret values. Include it.

Untracked docs to include (no hosted project id in the secret scan):

- `docs/PHASE5_SAFE_GIT_SETUP_REPORT.md`
- `docs/PHASE6_APPROVAL_CHECKLIST.md`
- `docs/PHASE6_CONFLICT_REGISTER.md`
- `docs/PHASE6_DETAILED_INTEGRATION_PLAN.md`
- `docs/PHASE7_GIT_SETUP_REPORT.md`
- `docs/PHASE8A_BASELINE_COMMIT_AUDIT.md`
- `docs/PHASE8B_BASELINE_COMMIT_READINESS.md`
- `docs/PHASE8C_BASELINE_FINDINGS_RESOLUTION.md`
- `docs/PHASE8D_FINAL_UNRESOLVED_DECISIONS.md`
- `docs/PHASE8E_OWNER_DECISION_CHECKLIST.md`
- `docs/PHASE8F_FINAL_GIT_SAFETY_AUDIT.md` (this file)
- `docs/RP-1.3.5_FINAL_BROWSER_VERIFICATION.md`
- `docs/RP-1.3.6_MEMBER_PROFILE_RPC_HYGIENE.md`
- `docs/RP-1.3.7_LOCAL_RPC_APPLY_AND_REGRESSION.md`
- `docs/RP-1.3.8_MOVE_OUT_TEST_TRIAGE.md`
- `docs/RP-1.3.9_LOCAL_LANDLORD_LOGIN_DIAGNOSIS.md`
- `docs/RP-1.3.10_LOCAL_LANDLORD_PASSWORD_RECOVERY.md` (states the password was not written into the doc; the credential file stays ignored)
- `docs/RP-1.3.21_RENTER_SIGNIN_ROUTING_AUDIT.md`
- `docs/RP-1.3.22_ACCEPTED_RENTER_NAVIGATION_FIX_REPORT.md`
- `docs/RP-1.3.23_RENTER_PORTAL_LOGIN_LOOP_AUDIT.md`
- `docs/RP-1.3.24_RENTER_SESSION_RUNTIME_DIAGNOSTIC.md`
- `docs/RP-1.3.26_RENTER_DASHBOARD_AUTH_STATE_FIX_REPORT.md`
- `docs/RP-1.3.27_SHARED_TENANT_LOGIN_RUNTIME_DIAGNOSTIC.md`
- `docs/RP-1.3.28_EXISTING_RENTER_LOGIN_DIAGNOSTIC.md`
- `docs/RP-1.3.29_RENTER_SESSION_RESOLUTION_FIX_REPORT.md`
- `docs/RP-1.3.30_RENTER_REDIRECT_AND_RLS_DIAGNOSTIC.md`
- `docs/RP-1.3.31_AUTH_SESSION_JWT_COHERENCE_FIX_REPORT.md`
- `docs/RP-1.3.32_F1_TENANT_SCOPED_BROWSE_FIX_REPORT.md`
- `docs/RP-1.3.32_F1_TENANT_SCOPED_BROWSE_MINIMAL_FIX_PLAN.md`
- `docs/RP-1.3_INITIAL_RENT_POLICY_IMPLEMENTATION_PLAN.md`
- `docs/RP-1.3_INITIAL_RENT_PRORATION_IMPLEMENTATION_PLAN.md`
- `docs/RP-1.3_RENT_CHARGE_CALCULATION_AUDIT.md`
- `docs/RP-1.3_RENT_PAYMENT_REVIEW_UX_IMPLEMENTATION_PLAN.md`
- `docs/RP-1.3_TENANCY_DISPLAY_FIX_REPORT.md`
- `docs/RP-1.3_TENANCY_FUNCTIONAL_AUDIT.md`
- `docs/STEP_5.4.19_MIGRATION_REVIEW.md`
- `docs/STEP_5.4.20_MIGRATION_HISTORY_RECONCILIATION.md`
- `docs/STEP_5.4.21_MARKETPLACE_CUTOVER_PLAN.md`
- `docs/STEP_5_4_24_LANDLORDS_WORKFLOW_VERIFICATION.md`
- `docs/STEP_5_4_25_LANDLORDS_BROWSER_SMOKE_TEST.md`
- `docs/STEP_5_4_26_PENDING_PAYMENT_APPROVAL_VERIFICATION.md`
- `docs/STEP_5_4_27_LANDLORDS_FINAL_GAP_REVIEW.md`
- `docs/STEP_5_4_28_LANDLORD_RENTER_INVITE_UI.md`
- `docs/STEP_5_4_29_LANDLORDS_MOVE_OUT_BROWSER_VERIFICATION.md`
- `docs/STEP_5_4_30_LANDLORDS_ROADMAP_RECONCILIATION.md`

### 6.2 Exclude

Do not stage these. They are not required for the app to build.

| Path | Why |
| --- | --- |
| `frontend/scripts/recover-local-rp135-landlord-password.mjs` | Privileged local Auth password reset. Writes a gitignored credential file. |
| `frontend/scripts/smoke-landlords-5425.mjs` | Disposable fixture tool. Loads `.env.local`, uses the service role, hardcoded fixture password. |
| `frontend/scripts/smoke-moveout-5429.mjs` | Same class as the landlords smoke script. |
| `frontend/scripts/smoke-payments-5426.mjs` | Loads `.env.local` and the service role. |
| `frontend/scripts/smoke-payments-5426-approve.mjs` | Loads `.env.local`. |
| The 18 ignored paths in section 5 | Secrets, CLI temp, smoke output, build cache. Already ignored. |
| `node_modules`, `dist`, coverage, Playwright output | Generated. Ignored. |

### 6.3 Hold

Leave these unstaged unless a later, explicit approval publishes Live operational material.

Manual SQL:

- `supabase/manual/marketplace_field_isolation.stage1_rpcs.sql` — `DROP FUNCTION` then recreates marketplace RPCs. Manual apply script, not a versioned migration.
- `supabase/manual/marketplace_field_isolation.stage2_policies.sql` — `DROP POLICY` on properties, photos, and storage.
- `supabase/manual/marketplace_field_isolation.rollback.sql` — drops the isolation policies and functions and restores the wider pre-isolation SELECT policies. Header names the hosted project.

The versioned file `supabase/migrations/20261018220000_marketplace_field_isolation.sql` is the copy that belongs in git. The manual trio should not ride along in this baseline.

Tracked file:

- `PROJECT_ROADMAP.md` — status updates are ordinary, but the new next-action sentence instructs a Live SQL paste and contains the hosted project id. It also fails `git diff --check` (trailing whitespace). Follow-up, only if this file must be in the same commit: delete that paste instruction and the project id, and remove the trailing spaces. Until that edit, leave the file unstaged. This audit did not edit it.

Untracked docs that contain the hosted project id:

- `docs/RP-1.3.4_LOCAL_ENV_MIGRATION_SAFETY.md`
- `docs/RP-1.3.11_SUPABASE_LIVE_READINESS_AUDIT.md`
- `docs/RP-1.3.12_LIVE_MIGRATION_REVIEW.md`
- `docs/RP-1.3.13_LIVE_PREFLIGHT_REPORT.md`
- `docs/RP-1.3.14_LIVE_MIGRATION_EXECUTION_REPORT.md`
- `docs/RP-1.3.15_LIVE_SECURITY_AND_DEV_READINESS.md`
- `docs/RP-1.3.16_ENV_CONFIGURATION_AUDIT.md`
- `docs/RP-1.3.17_LIVE_DEV_ENV_CONFIGURATION_REPORT.md`
- `docs/RP-1.3.18_LIVE_LOCAL_ENVIRONMENT_SEPARATION.md`
- `docs/RP-1.3.19_RENTER_EMAIL_CONFIRMATION_REDIRECT_AUDIT.md`
- `docs/RP-1.3.20_RENTER_EMAIL_REDIRECT_FIX_REPORT.md`
- `docs/RP-1.3.25_RENTER_AUTH_STATE_VERIFICATION.md`
- `docs/RP-1.3.32_LANDLORD_RENTER_DATA_INTEGRITY_AUDIT.md`
- `docs/STEP_5.4.31_MARKETPLACE_FIELD_ISOLATION_CUTOVER.md`

The id is already public inside `supabase/config.toml` on `origin/main`. These docs are held because they are Live runbooks, not because they reveal a new key. One later approval can release the whole group. No per-file decision is required for the baseline commit.

### 6.4 Deletions to record (keep absent)

Staging these paths records the deletion. Do not restore them for this baseline. Blobs remain reachable from `HEAD` / `origin/main`.

Documentation:

- `docs/WATER_COMPANY_DASHBOARD.md` (72 lines)

Frontend removals:

- `frontend/src/components/ui/app-loading.tsx` (38 lines). `App.tsx` no longer imports it. No remaining import of `app-loading` or `jspdf` / `simplePdf`.
- `frontend/src/lib/simplePdf.ts` (217 lines)
- `frontend/src/pages/utility/CompanySettingsPage.tsx` (32 lines)
- `frontend/src/pages/utility/ConnectionsPage.tsx` (445 lines)
- `frontend/src/pages/utility/DirectoryUi.tsx` (186 lines)
- `frontend/src/pages/utility/NotificationsPage.tsx` (210 lines)
- `frontend/src/pages/utility/StaffPage.tsx` (576 lines)

Edge functions:

- `supabase/functions/provision-company-customer/index.ts` (210 lines)
- `supabase/functions/provision-company-staff/index.ts` (222 lines)

Migrations and probe:

- `supabase/migrations/20261018000001_list_company_member_profiles.sql`
- `supabase/migrations/20261019000001_register_utility_house.sql`
- `supabase/migrations/20261020000001_register_utility_payment_by_ops.sql`
- `supabase/migrations/20261020000002_generate_flat_bill_upsert.sql`
- `supabase/migrations/20261020000003_create_utility_adhoc_charge.sql`
- `supabase/migrations/20261020000004_adjust_utility_bill_by_ops.sql`
- `supabase/migrations/20261020000005_update_utility_customer_by_ops.sql`
- `supabase/migrations/20261020000006_update_delete_tenant.sql`
- `supabase/migrations/20261021000001_staff_can_approve_utility_payments.sql`
- `supabase/migrations/20261021000002_auto_issue_flat_bill_on_register.sql`
- `supabase/migrations/20261021000003_issue_monthly_flat_bills_batch.sql`
- `supabase/migrations/20261021000004_issue_flat_bills_months_ahead.sql`
- `supabase/tests/utility_tenant_isolation_probe.sql`

That is 22 utility-related absences plus `update_delete_tenant`. Current `frontend/src` has no import of the deleted pages and no call to those deleted RPC names.

`update_delete_tenant` at HEAD defines `public.update_tenant(...)` and `public.delete_tenant(uuid)`. The delete function issues `DELETE FROM` for utility payments, bills, readings, meters, utility accounts, rent payments, rent charges, rental assignments, rental applications, property photos, properties, and then the tenant row. The working tree removes that file and removes the `update_tenant` / `delete_tenant` calls and types from `TenantsPage.tsx`, `TenantDetailPage.tsx`, and `database.ts`. Keeping it absent avoids putting that wipe function on the new tip. It does not drop anything in Live, because this audit ran no SQL. Whether Live already has the function is unknown.

## 7. Functional impact

### Confirmed in source (not browser-verified in this audit)

`App.tsx` still routes landlord properties, tenancies, payments, staff, renters, and applications; renter dashboard, browse, payments, and tenancy; public listing detail, apply, my-applications, and set-password; admin tenants, properties, payments, and reduced water/electricity ops.

Water and electricity routes that remain: dashboard, customers, customer detail, meters, readings, bills, payments, reports, my-bills, my-payments.

The filtered unit run (section 8) executed 305 tests covering landlord property/tenancy/payment screens, renter screens, auth helpers, and static migration contracts. That is test evidence for those modules, not a Live or browser pass.

### Confirmed missing relative to HEAD

- Water and electricity routes `connections`, `staff`, `notifications`, and `settings`.
- PDF helper `simplePdf` and dependency `jspdf`.
- Company customer/staff provision functions.
- Utility ops migrations listed in section 6.4 (register house, payments, flat bills, ad-hoc charges, bill adjust, customer update, staff payment approval, company member profiles).
- Super-admin `update_tenant` and `delete_tenant` UI calls and the migration that defines them.

Remaining utility pages are also reduced in place (`CustomersPage` −1000 lines, `PaymentsReviewPage` −2282, `UtilityDashboard` −990, `ReportsPage` −431, `CustomerPaymentsPage` −509). Those reductions are local product state, not a failed checkout.

### Not verified

- Browser behavior. A `npm run dev` process was already running in the frontend terminal before this audit (`vite --mode live` on port 5173). This audit did not start it, did not read its env files, and did not click through the app.
- Whether Live schema matches these migrations.
- RLS suites against a database.
- Production build.

### Later integration, not this commit

Restoring the 22 utility files, restoring `update_delete_tenant`, and applying marketplace or rent SQL to Live are separate authorized jobs. They are not blockers for recording the current tree, and they must not be done inside the commit step.

## 8. Checks

| Command | Result |
| --- | --- |
| `git status`, `git diff --name-status`, `git diff --cached`, `git rev-list --left-right --count origin/main...HEAD` | Completed. Counts in section 2. Index empty. |
| `Get-FileHash -Algorithm SHA256` on the protected migration | **PASS** |
| `git diff --check` | **FAIL**, trailing whitespace only in `PROJECT_ROADMAP.md` (held) |
| `npm run typecheck` in `frontend` (`tsc --noEmit`) | **PASS**, exit 0 |
| `npm run lint` in `frontend` | **FAIL**, exit 2. ESLint 10.12.0 found no `eslint.config.*`. `git ls-files "*eslint*"` is empty. This is a missing config, not a list of source-rule violations. |
| `node --check` on the seven `frontend/scripts/*.mjs` files | **PASS** syntax only. Scripts were not executed. |
| Vitest via a temporary runner outside the repo: include `src/**/*.test.ts(x)`, exclude `src/test/rls*.test.ts`, `envDir` set to an empty temp directory so gitignored env files were not loaded | **305 tests passed** across 55 files. **2 suites failed to load:** `src/lib/propertyPhotos.test.ts` and `src/components/layout/AppShell.test.tsx`. Both throw from `frontend/src/lib/supabase.ts` because `VITE_SUPABASE_URL` was intentionally absent. Those two failures are from the audit harness, not a demonstrated product failure under a normal env file. |
| `npm test` (full Vitest, including RLS) | **SKIPPED.** `frontend/src/test/isolatedEnv.ts` reads `.env.isolated` and `.env.local`. RLS suites mutate data when an isolated target is configured, and skip otherwise. This audit did not open those env files and did not start a database. |
| `npm run build` | **SKIPPED.** Vite would read gitignored env files and can inline public `VITE_` values into `dist`. |
| SQL, migrations, `supabase db push`, Live API | **NOT RUN** |

Dependencies were not installed. Lockfiles were not edited. No environment variable was changed to point at a database.

## 9. Outstanding risks and the smallest next step

1. Prepare the commit with an explicit path list: section 6.1 plus the deletions in section 6.4. Do not use `git add -A`.
2. Recompute the protected migration SHA-256 immediately before staging that one file. Proceed only if it still matches section 3. Do not renormalize line endings.
3. Leave section 6.2 and section 6.3 unstaged. No code edit is required for that.
4. Edit `PROJECT_ROADMAP.md` only if that file must ship in the same commit. Required edit: remove the Live paste instruction and the hosted project id, and clear the trailing whitespace. Do not do that edit until the owner asks for the roadmap to be included.
5. Do not apply `supabase/migrations/20261018220000_marketplace_field_isolation.sql`, the manual SQL, or any other migration to Live as part of committing.
6. Accept, for this baseline only, that GitHub’s new tip will not contain the 22 utility files or `update_delete_tenant`. History on the parent commit still has them. A later utility-import phase can restore them. This audit did not.
7. `npm run lint` cannot succeed until an ESLint config exists. That is a follow-up, not a secret blocker.
8. The two unit suites that import `supabase.ts` at load time need a URL present or a mock before they can load. Re-run them only with an isolated local URL, never by printing Live env files.

No further owner questionnaire is required before a path-limited commit of section 6.1 and section 6.4.

## 10. Proposed commit

**Summary:** Record the local rental baseline (listings, applications, rent charges, auth/session fixes, and the reduced utility UI) on `integration/lossless-utility-sync`, including the hash-verified isolation migration and the intentional absence of the utility ops files.

**Suggested message:**

```text
Record the local rental baseline without Live runbooks or smoke tools.

The reduced utility tree and the absent update_delete_tenant migration stay
off the new tip on purpose. Manual marketplace SQL and local recovery scripts
stay untracked.
```

Suggested branch for the commit: the current branch `integration/lossless-utility-sync`. It has no upstream. Pushing is a later step and was not done. `origin/main` is still the parent commit.

## 11. Audit boundary

Confirmed for this session:

- No file was staged (`git diff --cached` empty after the checks).
- No commit was created.
- No push, merge, rebase, reset, clean, checkout, or restore was run.
- No application source file was edited. The only project file added is this report.
- The protected migration was hashed and diffed, not written.
- No Live connection, SQL, migration, or deployment command was run.
- Forbidden env and credential files were not read.
- Other project copies (`Ijaaro-project-integrate`, `_ijaaro_compare_tmp`) were not opened.
- Missing utility files and `update_delete_tenant` were not restored.
