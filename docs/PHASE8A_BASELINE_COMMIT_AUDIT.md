# Phase 8A — Baseline Commit Audit (Preparation Only)

**Status:** COMPLETE (read-only preparation — no staging, commit, push, merge, source import, or database work)  
**Date:** 2026-10-26  
**Active project:** `C:\my projects\Ijaaro-project-main`  
**Official remote:** `https://github.com/ijaaro-lab/ijaaro-project.git`  
**Current branch:** `integration/lossless-utility-sync`  
**Reference / HEAD / `origin/main`:** `f8bd11cc7d304f193929060b1f57f32636e6544a`  
**Verified backup:** `C:\my projects\_ijaaro_phase5_backup_20261026_111543` (`BACKUP_VERIFIED=True`)

**Prior docs consulted:**  
`PHASE5_SAFE_GIT_SETUP_REPORT.md`, `PHASE6_DETAILED_INTEGRATION_PLAN.md`, `PHASE6_CONFLICT_REGISTER.md`, `PHASE6_APPROVAL_CHECKLIST.md`, `PHASE7_GIT_SETUP_REPORT.md`, Phase 4 compare lists under `_ijaaro_compare_tmp\report\`

---

## 1. Repository state

| Check | Result |
|-------|--------|
| Working directory | `C:\my projects\Ijaaro-project-main` (repo toplevel) |
| Current branch | `integration/lossless-utility-sync` |
| `HEAD` | `f8bd11cc7d304f193929060b1f57f32636e6544a` |
| Tip subject | `Merge pull request #1 from ijaaro-lab/integration/local-ijaaro-work` |
| `origin` fetch/push | `https://github.com/ijaaro-lab/ijaaro-project.git` |
| `origin/main` | `f8bd11cc7d304f193929060b1f57f32636e6544a` (**matches reference**) |
| Ahead / behind `origin/main` | `0` / `0` |
| Working tree vs `HEAD` | **Yes — divergent** (expected): **65** modified, **23** deleted-vs-HEAD, **158** untracked |
| Staging area | **Empty** (`git diff --cached` → 0 paths) |
| Local refs | Only `refs/heads/integration/lossless-utility-sync` → `f8bd11c` |
| Remote-tracking | `origin/main`, `origin/HEAD` → `f8bd11c`; `origin/integration/local-ijaaro-work` → `d7cf5c0` (not checked out) |
| Local Git config anomalies | None unexpected: `remote.origin.*`, `core.*`, `branch.integration/lossless-utility-sync.vscode-merge-base=origin/main` |
| `core.autocrlf` | `true` (LF→CRLF warnings on status/diff; content not rewritten by checkout) |
| Nested compare/backup/integrate dirs inside project | **Absent** |
| Phase 5 backup / integrate / compare temp | Outside project; **not modified** this phase |

**Interpretation (from Phase 7):** Branch tip is official `main`. Index matches `HEAD`. Active landlord/renter/marketplace/auth tree remains on disk as unstaged changes. GitHub-only utility paths are absent from the working tree and appear as **deleted vs `HEAD`** — intentional until a later utility-import phase.

---

## 2. `.gitignore` findings

| Item | Result |
|------|--------|
| Active `.gitignore` | Present; **modified vs `HEAD`** (+ hardening from Phase 7) |
| vs Phase 5 `PROPOSED_gitignore` | **Byte-identical** (SHA-256 `4C750B3AB100535D33C32121940A78800B8FE3580E4398FCF0DA0B71B4FAF906`) |
| Apply further changes this phase | **No** (forbidden) |

### Exclusion coverage (verified)

| Pattern / concern | Covered? | Evidence |
|-------------------|----------|----------|
| `.env.local` / `.env.live.local` / `.env.isolated` | **Yes** | `.env.*` + exceptions; `git check-ignore` matches the three secret files under `frontend/` |
| Other `.env*` secrets | **Yes** | `.env` / `.env.*`; examples excepted |
| `!.env.example` / `!frontend/.env.example` | **Yes** | Examples are **not** ignored; both are tracked |
| `node_modules/` | **Yes** | Root + `frontend/node_modules/` (+ `.tools-img/node_modules/`) |
| `dist/` / `frontend/dist/` | **Yes** | Ignored build outputs present on disk |
| `supabase/.temp/` | **Yes** | CLI artifacts ignored (incl. `pooler-url`, `project-ref`, `linked-project.json`) |
| Smoke outputs | **Yes** | `frontend/.smoke-*.json` (three files ignored) |
| Vitest / coverage | **Yes** | `frontend/.vitest/`, `coverage/`, `.nyc_output/` |
| TS / bundler caches | **Yes** | `*.tsbuildinfo`, `.turbo/`, `.vite/`, `frontend/.vite/` |
| Playwright | **Yes** | `playwright-report/`, `test-results/` |
| `frontend/.local/` | **Yes** | e.g. `frontend/.local/rp135-landlord-login.txt` ignored |
| `credentials.json`, `*.pem` | **Yes** | Declared |

### Source accidental-ignore probe

Probed paths are **trackable** (not ignored): `frontend/src/App.tsx`, `frontend/src/lib/supabaseEnv.ts`, local migrations, `provision-renter`, `SetPasswordPage.tsx`, Phase 7 docs. No evidence that `src/`, `*.ts`/`*.tsx`, or `supabase/migrations/*.sql` are blanket-ignored.

### Proposed corrections (**NOT APPLIED** — document only)

No **required** ignore fix before a future baseline commit: active file already matches the approved Phase 5 proposal.

Optional clarity-only additions for a later approved ignore tweak (redundant with current rules):

1. Explicit named lines for `frontend/.env.local`, `frontend/.env.live.local`, `frontend/.env.isolated` (already matched by `.env.*`).
2. Comment documenting that `supabase/.temp/*` may hold project-ref / pooler metadata and must stay untracked.
3. Confirm team never commits under a filename that bypasses `.env.*` (e.g. `secrets.json`) — consider adding if such files appear.

**Do not** remove `!frontend/.env.example` or the secret env patterns.

---

## 3. File inventory and classification

**Status counts (vs `HEAD` @ `f8bd11c`):** modified **65** · deleted-vs-HEAD **23** · untracked **158** · staged **0**  
**Ignored entries reported by Git:** ~**11 793** (vast majority `node_modules`); **26** non-`node_modules` ignored paths of interest.  
**Migrations on disk:** **28** SQL files.  
**Edge function dirs on disk:** **14** (17 source files).  
**Phase 4 `only_local.txt`:** **167** paths; **0** missing from active working tree.  
**Source-ish files on disk** (excl. `node_modules` / `dist` / `.git` / common caches): **~348** (Phase 5 backup snapshot was 354; delta explained by docs/cache accounting, not backup failure).

### 3.1 Required application source

**Modified vs `HEAD` (keep local authority — Phase 6 KEEP LOCAL / UNION candidates):**  
Includes among others: `frontend/src/App.tsx`, `AuthProvider.tsx`, `ProtectedRoute.tsx`, `AppShell.tsx`, landlord/renter/utility page trees that exist locally, admin pages, landing templates, `supabase.ts`, `roles.ts`, `tenant.ts`, `types/database.ts`, `package.json` / lockfile, `index.css`, charts/metric-card/format helpers.

**Untracked local-only application source (must retain for baseline):**  
- Auth: `authSessionCoherence.ts` (+ tests), route tests  
- Layout: `appShellNav.ts` (+ tests), `AppShell.test.tsx`  
- Marketplace / listings: `LandlordPublicListings.tsx`, `PublicListingDetailPage.tsx`, `ApplyToRentPage.tsx`, `MyApplicationsPage.tsx`, `components/listings/*`  
- Landlord extras: `ApplicationsPage.tsx`, `InviteRenterPage.tsx` (+ tests)  
- Set-password: `SetPasswordPage.tsx` (+ test)  
- Libs: `supabaseEnv.ts`, `inviteRenter.ts`, `provisionRenter.ts`, `propertyPhotos.ts`, `publicListingPhotos.ts`, `username.ts`, rent/period/display/redirect helpers (+ tests)  
- Already-on-`main` and unchanged (still part of tree): e.g. `LandlordHome.tsx`, `StaffDashboard.tsx`, `StaffMembersPage.tsx`, `CreateWorkspacePage.tsx`

### 3.2 Required migrations and database-related source

**Protected / shared modified:**  
`supabase/migrations/20261013000013_security_isolation_hardening.sql` — local protected content (see §5).

**Untracked local-only migrations (must include in baseline):**  
- `20261018143031_fix_property_photos_storage_path_policy.sql`  
- `20261018220000_marketplace_field_isolation.sql`  
- `20261021120000_review_rent_payment_require_rejection_reason.sql`  
- `20261022200000_property_photo_identity_immutable.sql`  
- `20261024120000_generate_monthly_rent_charges.sql`  
- `20261024133000_add_villa_property_type.sql`  
- `20261024140000_property_rooms_and_neighborhood.sql`  
- `20261024150000_public_listing_detail_rooms_neighborhood.sql`

**Also on disk (tracked, may be unchanged):** earlier shared migrations through staff/username hardening set.

**`supabase/config.toml`:** modified — include (UNION later with GitHub; keep local set-password / function flags per Phase 6).

**`supabase/manual/` (untracked):** three marketplace isolation stage/rollback SQL files — **manual review** (operational helpers; not the same as versioned migrations).

### 3.3 Required Edge Functions

**Local-only untracked (must include):**  
- `supabase/functions/generate-monthly-rent-charges/index.ts`  
- `supabase/functions/provision-renter/index.ts`, `logic.ts`  
- `supabase/functions/public-listing-photos/index.ts`, `logic.ts`

**Present and tracked (shared):** approve-payment, assign-renter, complete-move-out, generate-utility-bill, link-utility-account, manage-membership, provision-staff, provision-tenant, record-meter-reading, register-workspace-admin, set-tenant-status.

### 3.4 Required tests

**Modified:** `rls.hardening|rental|security|utility.test.ts`, membership/provisionStaff migration/authz tests, assorted page-adjacent tests already tracked.

**Untracked (include):** auth route/coherence tests; landlord/renter page tests; marketplace/public listing tests; `rls.marketplace|membershipHardening|renterApplications|staffProperties.test.ts`; `isolatedEnv.ts`; many `lib/*.test.ts` listed in status.

**Untracked SQL test:** `supabase/tests/monthly_rent_charges_sql_checks.sql`.

### 3.5 Required documentation

**Untracked planning / audit docs (recommended for baseline):** Phase 5–7 reports, Phase 6 plan/register/checklist, RP-1.3.* and STEP_5* verification/planning markdown under `docs/` (full untracked list in Git status — **158** untracked paths include these).

**Modified:** `README.md`, `PROJECT_ROADMAP.md`.

**Deleted vs `HEAD` (GitHub-only doc absent locally):** `docs/WATER_COMPANY_DASHBOARD.md` — **do not restore in this baseline**; re-import in utility phase (CR-025).

### 3.6 Configuration safe for version control

| Path | Notes |
|------|--------|
| `.gitignore` | Include (Phase 5 proposed already applied) |
| `.env.example` | Include after §4 review (placeholders; comments added) |
| `frontend/.env.example` | Include after §4 review (docs + `VITE_ALLOW_REMOTE_SUPABASE`; service-role line commented) |
| `frontend/package.json` / `package-lock.json` | Include |
| `supabase/config.toml` | Include |
| `.tools-img/*` (4 tracked files) | Already on `main`; unchanged |
| Root architecture PDFs / ERD / `system-design.pen` | Already tracked; unchanged |

### 3.7 Environment and secret-bearing files

| Path | Git status | Classification |
|------|------------|----------------|
| `frontend/.env.local` | **Ignored** | Secrets (JWT-like anon + service role + isolated keys) — **EXCLUDE** |
| `frontend/.env.live.local` | **Ignored** | Live allowlisted client config — **EXCLUDE** |
| `frontend/.env.isolated` | **Ignored** | Isolated secrets — **EXCLUDE** |
| `frontend/.local/rp135-landlord-login.txt` | **Ignored** | Local credential/debug artifact — **EXCLUDE** |
| `.env.example` | Tracked, modified | Template — **candidate include** after review |
| `frontend/.env.example` | Tracked, modified | Template — **candidate include** after review |

No other `.env*` filenames found on disk.

### 3.8 Generated artifacts and caches

Ignored (must stay out of commit): `frontend/node_modules/**`, `frontend/dist/**`, `frontend/tsconfig.tsbuildinfo`, `frontend/.vitest/**`, `frontend/.vite` deps under `node_modules`, `supabase/.temp/**`.

### 3.9 Temporary debugging or smoke-test files

| Path | Status | Action |
|------|--------|--------|
| `frontend/.smoke-5425.json`, `.smoke-5426.json`, `.smoke-5429-moveout.json` | Ignored | **EXCLUDE** |
| `frontend/scripts/smoke-*.mjs`, `ensure-live-env.mjs`, `run-isolated-dev.mjs` | Untracked | **Manual review** then likely include as tooling (they reference service-role **by name** / env reads; **no JWT literals** found) |
| `frontend/scripts/recover-local-rp135-landlord-password.mjs` | Untracked | **Manual review** (local recovery utility; writes under ignored `.local/`) |

### 3.10 Unknown / intentional “deleted vs HEAD” (GitHub-only)

These paths are **not on disk**; Git reports them deleted because the index mirrors `origin/main`. Per Phase 6/7 they must **not** be restored in Phase 8A. A future **baseline sync commit that records the active tree** should **stage these deletions** so the branch tip matches local authority; blobs remain on `origin/main` for later import.

| Category | Paths |
|----------|--------|
| Docs | `docs/WATER_COMPANY_DASHBOARD.md` |
| UI helpers | `frontend/src/components/ui/app-loading.tsx`, `frontend/src/lib/simplePdf.ts` |
| Utility pages | `CompanySettingsPage.tsx`, `ConnectionsPage.tsx`, `DirectoryUi.tsx`, `NotificationsPage.tsx`, `StaffPage.tsx` |
| Edge | `provision-company-customer/index.ts`, `provision-company-staff/index.ts` |
| Migrations (12) | `20261018000001` … `20261021000004` utility set |
| Tests | `supabase/tests/utility_tenant_isolation_probe.sql` |

---

## 4. Secret-safety findings

| Finding | Detail |
|---------|--------|
| Secret env files tracked? | **No** — only `.env.example` and `frontend/.env.example` are tracked |
| Secret env files ignored? | **Yes** — `.local` / `.live.local` / `.isolated` |
| JWT-like values in WT examples? | **No** |
| JWT-like values in `HEAD` examples? | **No** |
| JWT-like literals via `git grep` on tracked tree | **None found** |
| JWT-like in docs / scripts scan | **None** (docs/scripts mention `SERVICE_ROLE` / DB URL **as topics**, not embedded secrets) |
| Live/local env files | Contain JWT-like anon/service-role material — **must never be staged** |
| `supabase/.temp` | Ignored; may hold project linkage metadata — **EXCLUDE** |
| `frontend/.local/rp135-landlord-login.txt` | Ignored credential/debug file — **EXCLUDE** |

### Tracked template risk (no values printed)

- Example key names include `VITE_SUPABASE_*`, optional `SUPABASE_SERVICE_ROLE_KEY` (root example still documents the key; frontend example comments it).  
- Shape check: anon/service values in examples classify as **placeholder_text**; URLs classify as **supabase.co host pattern** (non-empty).  
- **Manual review:** confirm example URLs are acceptable to publish (project ref in hostname is common in templates but should be intentional).

### History note

`.gitignore` does **not** remove secrets already in Git history. This audit found **no JWT-like values** in current `HEAD` env example blobs. If a future review discovers a real secret in history, **stop** and use a dedicated remediation process — do not “fix” with ignore-only changes.

**No secret values are printed in this report. No files were deleted or rewritten.**

---

## 5. Protected migration hash result

| Location | SHA-256 |
|----------|---------|
| Active `supabase/migrations/20261013000013_security_isolation_hardening.sql` | `00B056D20D96FB9D01BE35D9A64FDFCC9420742D5E1F82A01E6B36D25027EE1D` |
| Phase 5 backup copy | `00B056D20D96FB9D01BE35D9A64FDFCC9420742D5E1F82A01E6B36D25027EE1D` |
| Match | **Yes** |
| vs `HEAD` (GitHub) | **Differs** (expected — Git reports modified; local is protected KEEP LOCAL per CR-016) |

**Verdict:** Protected migration intact. Full file contents not printed. **Proceed** with audit (no stop condition).

---

## 6. Baseline completeness review

| Question | Answer |
|----------|--------|
| Local-only files retained on disk? | **Yes** — Phase 4 `only_local` 167/167 present; local migrations + edge fns + marketplace/auth pages present |
| Differ from GitHub `main`? | **Yes** — 65 modified + 158 untracked + 23 absent utility paths |
| Required files blocked by ignore? | **No** (probes clean) |
| Generated artifacts publish risk? | Controlled by ignore; verify again at staging time |
| Comparison/backup dirs inside repo? | **No** |
| Utility import included? | **No** (correct for this baseline) |
| Does green build prove safety? | **No** — explicitly out of scope as proof |

**Baseline intent:** Record the **active local authority tree** on `integration/lossless-utility-sync` atop `f8bd11c`, **without** importing utility-company sources yet, **without** pushing, and **without** touching Live DB.

---

## 7. Proposed baseline manifest

Paths below are **proposed for a future approved commit**. Nothing is staged.

### 7.1 Application source — include

- All **modified** `frontend/src/**` paths listed in current status (App, auth, layout, pages, lib, types, css, components).  
- All **untracked** application sources listed in §3.1 (marketplace, set-password, invite/provision helpers, listings components, `supabaseEnv`, nav extraction, etc.).  
- `frontend/package.json`, `frontend/package-lock.json`.

### 7.2 Migrations — include

- Modified protected: `20261013000013_security_isolation_hardening.sql` (**local** bytes).  
- Eight untracked local-only migrations (§3.2).  
- `supabase/config.toml`.

### 7.3 Edge Functions — include

- Untracked: `generate-monthly-rent-charges`, `provision-renter`, `public-listing-photos` (all files under those dirs).

### 7.4 Tests — include

- Modified RLS/authz tests.  
- Untracked frontend tests and `supabase/tests/monthly_rent_charges_sql_checks.sql`.

### 7.5 Documentation — include

- Untracked `docs/PHASE5_*`, `PHASE6_*`, `PHASE7_*`, and this `PHASE8A_*` report once written.  
- Untracked RP-1.3.* / STEP_5* docs (team may later prune verbose diagnostics — see manual-review).  
- Modified `README.md`, `PROJECT_ROADMAP.md`.

### 7.6 Safe configuration — include

- `.gitignore`  
- `.env.example`, `frontend/.env.example` (**after** §8 secret re-check)

### 7.7 Intentional deletions to record (GitHub-only absent locally)

Stage the **23 deleted-vs-HEAD** paths in §3.10 so the committed tree matches the working tree. Recover later from `origin/main` during utility import — **do not** `git checkout` / restore them now.

### 7.8 Manual-review items (include only after human OK)

| Item | Reason |
|------|--------|
| `frontend/scripts/**` (7 files) | Smoke/live/isolated/recover tooling; env key references; recover script is sensitive operationally |
| `supabase/manual/**` (3 SQL files) | Manual cutover/rollback helpers — confirm they belong in repo |
| Verbose diagnostic docs (RP-1.3.24–28 style) | May contain operational detail; no JWT literals found, but product owner may prefer a docs subset |
| Admin page mods (CR-020) | Content differs both ways vs GitHub; baseline keeps local bytes — confirm |
| Example env URLs | Ensure published hostnames are intentional |
| Landing/charts/CSS (CR-021) | Often cosmetic; default keep local |

### 7.9 Already correct on `HEAD` (no action)

Unchanged tracked files (backend README/types, images, root design docs, most early migrations, shared edge functions identical to `main`, `LandlordHome` / `StaffDashboard` / `StaffMembersPage`, etc.) remain via parent commit.

---

## 8. Exclusion list (must remain out of the baseline commit)

- `frontend/.env.local`  
- `frontend/.env.live.local`  
- `frontend/.env.isolated`  
- `frontend/.local/**` (including `rp135-landlord-login.txt`)  
- `frontend/.smoke-*.json`  
- `frontend/.vitest/**`  
- `frontend/dist/**`  
- `frontend/tsconfig.tsbuildinfo`  
- `frontend/node_modules/**` (and any root `node_modules/`)  
- `supabase/.temp/**`  
- `coverage/`, `.nyc_output/`, `.turbo/`, `.vite/`, `playwright-report/`, `test-results/`, `*.log`  
- `credentials.json`, `*.pem`  
- Any real service-role / access-token / private-key material  
- Paths outside the active project (`_ijaaro_phase5_backup_*`, `_ijaaro_compare_tmp`, `Ijaaro-project-integrate`)  
- GitHub utility sources **as restores** in this commit (they are handled only as intentional deletions until a later import phase)

---

## 9. Manual-review list (summary)

1. Confirm staging **includes** protected mig 13 **local** hash `00B056D2…` and **excludes** all secret env files.  
2. Confirm **23** GitHub-only deletions are intentional for this sync commit.  
3. Review `frontend/scripts/**` and `supabase/manual/**`.  
4. Review `.env.example` / `frontend/.env.example` for publishable URL hosts and placeholder-only secrets.  
5. Decide whether all RP/STEP diagnostic markdown files enter the first baseline or a docs follow-up commit.  
6. Re-read CR-001/004/016/018/019: baseline records local state; utility **import** remains a **separate** approved phase.  
7. EOL/`core.autocrlf` noise — do not “fix” with destructive checkout; normalize only under a later explicit policy.

---

## 10. Exact future commands — **NOT EXECUTED**

> Documentation only. **Do not run** until a separate explicit user approval after this audit is accepted.  
> **Never** use unconditional `git add .` as the only control.  
> **Never** push unless a further approval says so.

```powershell
# --- FUTURE PHASE ONLY — NOT EXECUTED ---
cd "C:\my projects\Ijaaro-project-main"

# 0) Preconditions
git branch --show-current
# Expect: integration/lossless-utility-sync
git rev-parse HEAD origin/main
# Expect both: f8bd11cc7d304f193929060b1f57f32636e6544a
git diff --cached --name-only
# Expect: empty before starting

# 1) Ignore-rule corrections (ONLY if an approved delta exists — none required today)
# # Copy-Item ...  OR edit .gitignore under explicit approval
# # NOT EXECUTED

# 2) Secret exclusion verification (names/status only — do not print values)
git check-ignore -v frontend/.env.local frontend/.env.live.local frontend/.env.isolated
git status --porcelain=v1 --ignored -- frontend/.env.local frontend/.env.live.local frontend/.env.isolated frontend/.local supabase/.temp
Get-FileHash -Algorithm SHA256 supabase\migrations\20261013000013_security_isolation_hardening.sql
# Expect SHA-256: 00B056D20D96FB9D01BE35D9A64FDFCC9420742D5E1F82A01E6B36D25027EE1D

# 3) Add ONLY explicitly reviewed paths (examples — expand from §7 after review)
# git add -- .gitignore
# git add -- .env.example frontend/.env.example
# git add -- README.md PROJECT_ROADMAP.md
# git add -- docs/
# git add -- frontend/package.json frontend/package-lock.json
# git add -- frontend/src/
# git add -- frontend/scripts/          # only after manual review
# git add -- supabase/config.toml
# git add -- supabase/migrations/
# git add -- supabase/functions/generate-monthly-rent-charges supabase/functions/provision-renter supabase/functions/public-listing-photos
# git add -- supabase/tests/monthly_rent_charges_sql_checks.sql
# git add -- supabase/manual/            # only after manual review

# 4) Record intentional absences of GitHub-only utility paths (active tree authority)
# git add -u -- docs/WATER_COMPANY_DASHBOARD.md
# git add -u -- frontend/src/components/ui/app-loading.tsx frontend/src/lib/simplePdf.ts
# git add -u -- frontend/src/pages/utility/CompanySettingsPage.tsx frontend/src/pages/utility/ConnectionsPage.tsx
# git add -u -- frontend/src/pages/utility/DirectoryUi.tsx frontend/src/pages/utility/NotificationsPage.tsx frontend/src/pages/utility/StaffPage.tsx
# git add -u -- supabase/functions/provision-company-customer supabase/functions/provision-company-staff
# git add -u -- supabase/migrations/20261018000001_list_company_member_profiles.sql
# git add -u -- supabase/migrations/20261019000001_register_utility_house.sql
# git add -u -- supabase/migrations/20261020000001_register_utility_payment_by_ops.sql
# git add -u -- supabase/migrations/20261020000002_generate_flat_bill_upsert.sql
# git add -u -- supabase/migrations/20261020000003_create_utility_adhoc_charge.sql
# git add -u -- supabase/migrations/20261020000004_adjust_utility_bill_by_ops.sql
# git add -u -- supabase/migrations/20261020000005_update_utility_customer_by_ops.sql
# git add -u -- supabase/migrations/20261020000006_update_delete_tenant.sql
# git add -u -- supabase/migrations/20261021000001_staff_can_approve_utility_payments.sql
# git add -u -- supabase/migrations/20261021000002_auto_issue_flat_bill_on_register.sql
# git add -u -- supabase/migrations/20261021000003_issue_monthly_flat_bills_batch.sql
# git add -u -- supabase/migrations/20261021000004_issue_flat_bills_months_ahead.sql
# git add -u -- supabase/tests/utility_tenant_isolation_probe.sql

# 5) Review staged filenames (reject if any .env.local / .temp / dist / smoke / .local)
# git diff --cached --name-only
# git diff --cached --stat
# git diff --cached -- .env.example frontend/.env.example   # confirm placeholders only

# 6) Re-check migration 13 staged hash equals backup
# git show :supabase/migrations/20261013000013_security_isolation_hardening.sql | Get-FileHash -Algorithm SHA256
# Expect: 00B056D20D96FB9D01BE35D9A64FDFCC9420742D5E1F82A01E6B36D25027EE1D

# 7) Local build / tests (informational — not proof of tenant isolation)
# cd frontend
# npm run typecheck
# npm run test
# npm run build
# cd ..

# 8) STOP — require separate explicit user approval before:
# git commit -m "Sync active local landlord/renter/marketplace tree onto main for lossless utility integration."
# # git push   # further approval required — NOT part of baseline prep
```

**Forbidden unless separately approved:** `git add .` as sole staging method; `git commit` without review; `git push`; `git merge` / cherry-pick; `git reset --hard`; `git clean`; restoring utility files; modifying mig 13 to the GitHub variant; Live SQL / migration apply; editing secrets.

---

## 11. Explicit risks and unresolved issues

1. **Baseline commit will diverge from `origin/main` by removing utility-only paths** until a later import phase restores/merges them from `origin/main` — intentional, but must be understood by reviewers.  
2. **Working tree is the only copy of local authority until committed** — Phase 5 backup remains the recovery safety net.  
3. **Example env files contain real-looking `*.supabase.co` URLs** with placeholder keys — publish consciously.  
4. **Smoke/recover scripts** are powerful against whatever env they load — review before publishing.  
5. **CRLF / autocrlf** may create noisy diffs; do not “fix” with destructive Git file ops.  
6. **Admin / landing / utility page bytes** on disk are local variants; GitHub richer utility UX is still absent (CR-010/011/020).  
7. **Approval checklist Gates** for commit/push remain human gates — this audit does not approve execution.  
8. **Build/test green ≠ isolation proof** (Phase 6 hard rule).  
9. **No previously committed JWT detected** in env examples; if any other historical secret is later found, ignore rules alone are insufficient.

---

## 12. Final verification (Phase 8A did not modify protected state)

| Item | Status |
|------|--------|
| Application source modified | **No** |
| Migrations modified | **No** |
| `.gitignore` modified | **No** |
| Environment / Supabase config modified | **No** |
| Connected to Supabase / ran SQL | **No** |
| Staged files | **No** |
| Commit created | **No** |
| Push / merge / cherry-pick | **No** |
| Branch / HEAD / refs changed | **No** |
| `git reset` / `clean` / `checkout` / `restore` | **Not used** |
| Phase 5 backup modified | **No** |
| `Ijaaro-project-integrate` modified | **No** |
| Protected mig 13 hash unchanged vs backup | **Yes** |
| Secret values printed | **No** |
| Deliverable added | `docs/PHASE8A_BASELINE_COMMIT_AUDIT.md` only |

**STOP.** Phase 8A read-only baseline commit preparation is complete. Staging and commit require a separate approved phase.
