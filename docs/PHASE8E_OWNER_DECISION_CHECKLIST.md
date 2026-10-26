# Phase 8E — Owner Decision Checklist

**Status:** `AWAITING_OWNER_RESPONSE` (decision preparation only)  
**Date:** 2026-10-26  
**Active project:** `C:\my projects\Ijaaro-project-main`  
**Branch:** `integration/lossless-utility-sync`  
**HEAD:** `f8bd11cc7d304f193929060b1f57f32636e6544a` (`HEAD` = local `origin/main`)  
**Source register:** `docs/PHASE8D_FINAL_UNRESOLVED_DECISIONS.md` §3 and §8, checked against Phase 8A, Phase 8B, and Phase 8C for the same paths and terms.

This checklist records evidence and the audit’s recommended options. It does not choose for the owner. No box below is marked. A blank response is not a decision.

Marking a box does not stage, commit, push, restore, redact, or integrate anything. `INCLUDE_CANDIDATE` still means “evidence supports future inclusion,” not “approved for commit.”

---

## How to answer

For each item, mark exactly one of:

| Mark | Meaning |
|------|---------|
| `APPROVE` | Accept the recommended option named in that item. Where the audit states two safe branches, name which branch in the note. |
| `REJECT` | Do not accept that recommended option. Name a supported alternative in the note. |
| `DEFER` | Leave the item unresolved. |

`REJECT` and `DEFER` leave the files as they are. Neither mark authorizes a restore, a redaction, or a commit.

Three labels are kept separate:

- **Evidence** — facts Phase 8D verified (re-checked for this checklist where noted).
- **Recommendation** — the audit’s safe option. It is not an owner decision.
- **Owner response** — unresolved until marked.

---

## Answer sheet

| # | Decision ID | Subject | Recommended option (not yet chosen) | Owner mark |
|---|-------------|---------|-------------------------------------|------------|
| 1 | D-U01 | `ensure-live-env.mjs` and the hardcoded Live project ref | Defer include, or include only after OK to publish the Live ref | |
| 2 | D-U02–04 | Three manual marketplace SQL scripts | Prefer exclude from the baseline sync | |
| 3 | D-U05 | Landlord password-recovery doc | `EXCLUDE_ARTIFACT` | |
| 4 | A-EX-SCR | Related recovery script | `EXCLUDE_ARTIFACT` | |
| 5 | D-U06–12 | Seven diagnostic / verification docs | Keep reviewing | |
| 6 | D-U13–15 | Three smoke / browser verification docs | Lean `EXCLUDE_ARTIFACT` | |
| 7 | A-EX-SCR | Four smoke scripts | `EXCLUDE_ARTIFACT` | |
| 8 | D-ENVEX | `.env.example` host patterns | Confirm the host patterns are intentional to publish | |
| 9 | D-CR010 | Reduced local utility pages | Accept the reduced UX until a future utility import | |
| 10 | D-DEL | All 23 local deletions vs `HEAD` | Acknowledge recording them in a future baseline sync | |
| 11 | D-UDT | Absent `update_delete_tenant` migration | `KEEP ABSENT FOR NOW` | |
| 12 | A-UTL22 / D-UTL-IMP | 22 other missing utility files | Keep absent; do not restore now | |

---

## 1. D-U01 — `ensure-live-env.mjs`

**Register class:** §8.B owner choice (path U01).

**Paths:** `frontend/scripts/ensure-live-env.mjs` (`??` untracked). Invoked by `frontend/package.json` scripts `env:live` and `dev`.

**Evidence:** The script ensures `frontend/.env.live.local` for `vite --mode live`. It copies keys from ignored `.env.local` into ignored `.env.live.local` at runtime. It hardcodes the Live project ref / host pattern. Phase 8D sensitivity scan: `jwt_like=false`, `service_role` word present conceptually, `supabase.co=true`. It does not embed JWT or service-role assignment literals. Necessity for the current Live `npm run dev` workflow is High. Publishability cannot be decided from evidence alone.

**Recommendation:** Defer include, or include only after the owner accepts publishing the hardcoded Live project ref. Disposition stays `USER_DECISION_REQUIRED`.

**Other options supported by the audit:** Redact the ref in a later change phase. That redaction is not part of Phase 8E.

**Security / operational implications:** Including the file publishes Live project identity. Excluding it breaks the documented Live `npm run dev` workflow unless that workflow changes. Misuse can target the wrong environment. Runtime copies stay in ignored env files.

**Owner response:** `APPROVE` / `REJECT` / `DEFER`  
If `APPROVE`, name one branch: `defer include` or `include after OK to publish the Live ref`.

Chosen: ____________________  
Note:

---

## 2. D-U02–04 — Manual SQL and the baseline

**Register class:** §8.B owner choice (paths U02, U03, U04).

**Paths (all `??` untracked):**

- `supabase/manual/marketplace_field_isolation.rollback.sql` (U02)
- `supabase/manual/marketplace_field_isolation.stage1_rpcs.sql` (U03)
- `supabase/manual/marketplace_field_isolation.stage2_policies.sql` (U04)

**Evidence:** These are manual operational SQL files, not versioned migrations. U02 rolls back `20261018220000_marketplace_field_isolation.sql`, restores pre-cutover SELECT policies, contains `DROP` / `CREATE POLICY`, and its comments document a Live project identity from the STEP 5.4.31 preflight. U03 is STAGE 1 RPC cutover (`DROP FUNCTION` / recreate). U04 is STAGE 2 policy tightening (`DROP POLICY` / `CREATE POLICY`). The versioned migration `supabase/migrations/20261018220000_marketplace_field_isolation.sql` is already `INCLUDE_CANDIDATE`. The manual files are not required for the app build once that versioned migration exists.

**Recommendation:** Prefer **exclude from the baseline sync**, unless an ops archive is wanted. U02’s safe lean is `EXCLUDE_ARTIFACT`, or keep it as an ops archive with a clear manual-only intent. U03 and U04 stay the same class of `USER_DECISION_REQUIRED`.

**Other options supported by the audit:** Include all three as a manual-only archive.

**Security / operational implications:** Applying the rollback on the wrong database re-opens pre-isolation SELECT. Out-of-band apply can drift from versioned history. Including the files can tempt that apply and would publish the Live project reference in the rollback comments. Excluding them drops the cutover archive from the baseline sync. They must stay distinct from auto-applied migrations.

**Owner response:** `APPROVE` / `REJECT` / `DEFER`  
`APPROVE` accepts exclude-from-baseline. `REJECT` means include as a manual-only archive; say so in the note.

Chosen: ____________________  
Note:

---

## 3. D-U05 — Landlord password-recovery documentation

**Register class:** §8.B owner choice (path U05).

**Path:** `docs/RP-1.3.10_LOCAL_LANDLORD_PASSWORD_RECOVERY.md` (`??` untracked).

**Evidence:** The doc describes privileged local landlord password recovery and pairs with `frontend/scripts/recover-local-rp135-landlord-password.mjs`, which Phase 8C already classified `EXCLUDE_ARTIFACT` (item 4). Phase 8D scan: `password_word=true`, `localhost=true`, no JWT-like literals. Phase 8D called exclude-from-baseline a soft yes; the owner may keep the doc privately.

**Recommendation:** `EXCLUDE_ARTIFACT` from the baseline sync.

**Other options supported by the audit:** Include it as a historical doc, or keep it privately outside Git.

**Security / operational implications:** Including it puts the recovery procedure in repository history. Excluding it from the baseline leaves the local file on disk and does not delete the paired script.

**Owner response:** `APPROVE` / `REJECT` / `DEFER`

Chosen: ____________________  
Note:

---

## 4. A-EX-SCR — Related recovery script

**Register class:** §8.A evidence-backed recommendation. Soft owner mark. This script is not one of the 15 paths still held at `REVIEW_REQUIRED`.

**Path:** `frontend/scripts/recover-local-rp135-landlord-password.mjs` (`??` untracked; reconfirmed this phase).

**Evidence:** Phase 8C reclassified it from `REVIEW_REQUIRED` to `EXCLUDE_ARTIFACT`. It is a privileged local recovery utility (RP-1.3.10), loopback-oriented, not referenced in `package.json`, and not imported by app runtime. No hardcoded JWT was detected. Phase 8D: privileged and disposable; not product runtime. It is still untracked and was not auto-staged.

**Recommendation:** `EXCLUDE_ARTIFACT` from the baseline sync. The owner may keep it privately outside Git.

**Other options supported by the audit:** Include with warnings.

**Security / operational implications:** Publishing it distributes privileged recovery tooling. Phase 8C rated misuse against the wrong environment as high impact. Exclusion keeps it out of the baseline commit; it does not delete the local script and does not approve running it.

**Owner response:** `APPROVE` / `REJECT` / `DEFER`  
`APPROVE` accepts exclusion from the baseline sync.

Chosen: ____________________  
Note:

---

## 5. D-U06–12 — Diagnostic and verification docs

**Register class:** §8.B owner choice. Seven paths. Default is to keep reviewing, which is not an include or an exclude.

**Paths (all `??` untracked; reconfirmed this phase):**

| ID | Path | Phase 8D evidence marker |
|----|------|--------------------------|
| U06 | `docs/RP-1.3.24_RENTER_SESSION_RUNTIME_DIAGNOSTIC.md` | Runtime diagnostic; `localhost=true`; `jwt_like=false`. Also tagged `KEEP_REVIEW_REQUIRED`. |
| U07 | `docs/RP-1.3.25_RENTER_AUTH_STATE_VERIFICATION.md` | Auth-state verification; `supabase.co=true`; `jwt_like=false`. |
| U08 | `docs/RP-1.3.27_SHARED_TENANT_LOGIN_RUNTIME_DIAGNOSTIC.md` | Large landlord-vs-renter login diagnostic; `localhost=true`. |
| U09 | `docs/RP-1.3.28_EXISTING_RENTER_LOGIN_DIAGNOSTIC.md` | `service_role_word=true`; `jwt_like=false`. |
| U10 | `docs/RP-1.3.30_RENTER_REDIRECT_AND_RLS_DIAGNOSTIC.md` | Redirect and RLS diagnostic; `localhost=true`. |
| U11 | `docs/RP-1.3.5_FINAL_BROWSER_VERIFICATION.md` | Browser verification; `supabase.co=true`; `jwt_like=false`. |
| U12 | `docs/RP-1.3.9_LOCAL_LANDLORD_LOGIN_DIAGNOSIS.md` | Recovery-adjacent login diagnosis; `password_word=true`; `localhost=true`. |

**Evidence:** No JWT literals were found. Operational density, host discussion, and conceptual `service_role` mention are why they stayed unresolved. Phase 8D §6: including or excluding these docs does not change runtime auth or route gates. §3.2 soft-lean-toward-exclude list is U05, U12, U13, and U15 only. Inside this group, that soft lean applies to U12 alone.

**Recommendation:** Owner preference; default **keep reviewing** (`USER_DECISION_REQUIRED`).

**Other options supported by the audit:** Include all, exclude all, or selective. U12 may be excluded with U05; that is a soft lean, not a decision already made.

**Security / operational implications:** Inclusion puts host, session, RLS, and privileged-auth discussion into repository history. Exclusion drops incident history from the baseline. Neither choice changes the running app. No JWT literals were found; that does not by itself settle operational density.

**Owner response:** `APPROVE` / `REJECT` / `DEFER`  
`APPROVE` accepts “keep reviewing” (do not include or prune this set on the audit alone). `REJECT` requires a note of include-all, exclude-all, or the selective paths.

Chosen: ____________________  
Note:

---

## 6. D-U13–15 — Smoke and browser verification docs

**Register class:** §8.B owner choice.

**Paths (all `??` untracked; reconfirmed this phase):**

| ID | Path | What the evidence establishes |
|----|------|-------------------------------|
| U13 | `docs/STEP_5_4_25_LANDLORDS_BROWSER_SMOKE_TEST.md` | Fixture domain `@ijaaro.test`. Pairs with smoke script already `EXCLUDE_ARTIFACT`. Safe lean: `EXCLUDE_ARTIFACT`. Soft yes for exclude-from-baseline. |
| U14 | `docs/STEP_5_4_26_PENDING_PAYMENT_APPROVAL_VERIFICATION.md` | Verification / smoke class. `localhost=true`. No fixture-email marker in the boolean scan. No separate soft-exclude lean in §3.2. |
| U15 | `docs/STEP_5_4_29_LANDLORDS_MOVE_OUT_BROWSER_VERIFICATION.md` | `@ijaaro.test=true`; `uuid_count=4`. Related smoke script is Phase 8C `EXCLUDE_ARTIFACT`. Safe lean: `EXCLUDE_ARTIFACT`. |

**Evidence:** These are verification write-ups, not product source. The §8 register groups all three with a lean to `EXCLUDE_ARTIFACT`. The path-level soft lean is U13 and U15. U14 remains `USER_DECISION_REQUIRED` without that soft lean.

**Recommendation:** Lean `EXCLUDE_ARTIFACT` for the group. If the mark for U14 should differ, say so in the note.

**Other options supported by the audit:** Include the docs (all or selective).

**Security / operational implications:** U13 and U15 would put fixture identity in Git. Excluding the docs does not remove product source. The paired smoke scripts are item 7, not these markdown files.

**Owner response:** `APPROVE` / `REJECT` / `DEFER`  
`APPROVE` accepts the exclude lean. Use the note if U14 should stay in review or be included while U13 and U15 are excluded.

Chosen: ____________________  
Note:

---

## 7. A-EX-SCR — Four smoke scripts

**Register class:** §8.A evidence-backed recommendation. Soft owner mark. Same decision ID as item 4; the script set is split so the recovery script and the smoke scripts can be marked separately.

**Paths (all `??` untracked; reconfirmed this phase):**

- `frontend/scripts/smoke-landlords-5425.mjs`
- `frontend/scripts/smoke-moveout-5429.mjs`
- `frontend/scripts/smoke-payments-5426.mjs`
- `frontend/scripts/smoke-payments-5426-approve.mjs`

**Evidence:** Phase 8C reclassified each from `REVIEW_REQUIRED` to `EXCLUDE_ARTIFACT`. They are disposable fixture tooling (STEP 5.4.25, 5.4.29, and 5.4.26). They can act against the loaded environment and perform password or auth operations. They are not product source. Phase 8D: still present, still untracked, not auto-staged. Ignored smoke outputs `frontend/.smoke-5425.json`, `frontend/.smoke-5426.json`, and `frontend/.smoke-5429-moveout.json` are already `EXCLUDE_ARTIFACT` and are not reopened here.

**Recommendation:** `EXCLUDE_ARTIFACT` from the baseline sync.

**Other options supported by the audit:** Include with warnings, if the owner wants the smoke tooling published.

**Security / operational implications:** Publishing them distributes fixture and auth-capable tooling. Leaving them excluded keeps them on disk and out of the baseline commit.

**Owner response:** `APPROVE` / `REJECT` / `DEFER`  
`APPROVE` accepts exclusion from the baseline sync.

Chosen: ____________________  
Note:

---

## 8. D-ENVEX — Publishability of `.env.example` host patterns

**Register class:** §8.B owner choice.

**Paths:**

- `.env.example` (tracked, modified `M`; reconfirmed)
- `frontend/.env.example` (tracked, modified `M`; reconfirmed)

**Evidence:** Both contain a `supabase.co` host pattern and no JWT-like literal (Phase 8D §7.2). They are templates, not ignored secret files. Phase 8A: `!.env.example` and `!frontend/.env.example` keep the examples trackable. Phase 8B shape check passed for placeholders and commented service-role lines; values were not printed. Phase 8B classified both `INCLUDE_CANDIDATE` pending a hostname eyeball (CR-024). Phase 8D still requires the owner to confirm that publishing the host patterns is intentional. Secret files stay `EXCLUDE_SECRET`: `frontend/.env.local`, `frontend/.env.live.local`, `frontend/.env.isolated`, and `frontend/.local/rp135-landlord-login.txt`.

**Recommendation:** Confirm the host patterns are intentional to publish.

**Other options supported by the audit:** Redact the host patterns in a later change phase. That redaction is not part of Phase 8E.

**Security / operational implications:** Publishing the templates discloses host patterns. It does not, on the scans reported, disclose a JWT-like literal. Clearing this item does not stage the files and does not admit the secret env files.

**Owner response:** `APPROVE` / `REJECT` / `DEFER`  
`APPROVE` confirms the host patterns may be published. `REJECT` means publication is not accepted; redaction waits for a later change phase.

Chosen: ____________________  
Note:

---

## 9. D-CR010 — Reduced local utility pages

**Register class:** §8.B owner choice.

**Paths:** Nine tracked utility files, still modified (`M`), not deleted. Phase 8B §6.8. Local status reconfirmed this phase for each path via the working-tree diff warnings and the unchanged modified count of 65.

- `frontend/src/pages/utility/BillsPage.tsx`
- `frontend/src/pages/utility/CustomerDetailPage.tsx`
- `frontend/src/pages/utility/CustomerPaymentsPage.tsx`
- `frontend/src/pages/utility/CustomersPage.tsx`
- `frontend/src/pages/utility/PaymentsReviewPage.tsx`
- `frontend/src/pages/utility/ReadingsPage.tsx`
- `frontend/src/pages/utility/ReportsPage.tsx`
- `frontend/src/pages/utility/UtilityDashboard.tsx`
- `frontend/src/pages/utility/shared.ts`

**Evidence:** Core utility routes remain. Connections, staff, notifications, and settings routes are absent with the deleted utility pages (item 12), not by edits inside this list. Phase 8B: the baseline keeps these local bytes; GitHub finance-first richness returns only through a later utility import. Phase 8C: committing the reductions locks the simpler UX until a UNION import. Phase 8D: the open question is whether to accept that reduced UX until import.

**Recommendation:** Accept the reduced local UX until a future utility import.

**Other options supported by the audit:** Restore the richer utility UX in a future import phase. That restore is not part of Phase 8E.

**Security / operational implications:** A later baseline commit of these modifications would lock the simpler UX on the branch tip until import. Acceptance here does not create that commit. Rejection does not restore GitHub page bytes.

**Owner response:** `APPROVE` / `REJECT` / `DEFER`  
`APPROVE` accepts the reduced pages as the baseline until a future import.

Chosen: ____________________  
Note:

---

## 10. D-DEL — Acknowledge all 23 local deletions

**Register class:** §8.B owner choice. This acknowledgement is separate from restoring any file, and separate from D-UDT’s keep-absent recommendation.

**Paths:** The same 23 `INTENTIONALLY_ABSENT_UTILITY_FILE` entries as Phase 8B §8.E and Phase 8C §5. `git diff --name-only --diff-filter=D HEAD` this phase returned the same 23 paths, in this order:

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

**Evidence:** All 23 are still deleted versus `HEAD` (`D`). Blobs remain in `HEAD` / `origin/main`. Phase 8C justified baseline absence for 22 of them and left item 18 as `USER_DECISION_REQUIRED` (items 11 and 12). Phase 8D: recording the deletions in a future baseline sync commit still needs explicit acknowledgement, with a special note for `update_delete_tenant`. That acknowledgement is not a restore. Absence is not “safe forever.”

**Recommendation:** Acknowledge that a future baseline sync commit may record all 23 deletions, including the D-UDT special note.

**Other options supported by the audit:** Restore selected paths in a future phase before any commit that would record those deletions.

**Security / operational implications:** A commit that records the deletions removes the files from the branch tip. History still holds the blobs, and they stay recoverable from `origin/main`, but the tip would not contain working copies until a later import. Committing without this acknowledgement is what Phase 8D said must not happen. This mark does not stage the deletions.

**Owner response:** `APPROVE` / `REJECT` / `DEFER`  
`APPROVE` is the acknowledgement only. It does not stage, commit, or restore.

Chosen: ____________________  
Note:

---

## 11. D-UDT — Local absence of `update_delete_tenant`

**Register class:** §8.C. Acknowledge absence now. Any restore belongs to a future, separately approved integration phase. Phase 8D section recommendation: **`KEEP ABSENT FOR NOW`**.

**Path:** `supabase/migrations/20261020000006_update_delete_tenant.sql`  
**Working tree:** Deleted versus `HEAD`. On-disk check this phase: `Test-Path` = False. Not restored.

**Evidence (verified from Git history in Phase 8D; SQL was not executed):**

- It is a database migration (167 lines at `HEAD`), not an Edge Function and not a frontend module. The blob is recoverable with `git show HEAD:…`.
- It creates two `SECURITY DEFINER` RPCs: `public.update_tenant(...)` (name / slug / subdomain / status) and `public.delete_tenant(uuid)` (hard-delete of a tenant and tenant-scoped rows).
- Both require `auth.uid()` and `public.is_super_admin()`. The platform tenant is blocked. `REVOKE ALL` from `PUBLIC` and `anon`. `GRANT EXECUTE` to `authenticated`. `search_path` is `public`. The inspected text does not hardcode a service-role JWT.
- `delete_tenant` updates `meter_readings.correction_of_id` and deletes `utility_payments`, `utility_bills`, `meter_readings`, `meters`, `utility_accounts`, `rent_payments`, `rent_charges`, `rental_assignments`, `rental_applications`, `property_photos`, `properties`, and the `tenants` row. A guard blocks delete while other utility companies’ `utility_accounts` still link to the tenant’s `properties`.
- Memberships and `tenant_renter_usernames` are cascade-only in a comment. `audit_logs.tenant_id` SET NULL is a comment. The migration text has no direct `DELETE` from `auth.users`, `profiles`, or `tenant_memberships`. Cascade behavior was not re-verified against live FK DDL.
- Local `frontend/src/types/database.ts` has `update_tenant_branding` and does not declare `update_tenant` or `delete_tenant`. `HEAD` types did. Local `TenantDetailPage.tsx` does not call the two RPCs. `HEAD` admin pages did. Tracked `supabase/migrations/20261013000012_update_tenant_branding.sql` is not an equivalent hard-delete or name/slug/status RPC.
- Live was not contacted. Whether Live already has these functions is unknown.

**Inference (not a verified fact):** membership deletion via FK cascade; local Super Admin tenant edit/delete UX was simplified (CR-020).

**Recommendation:** `KEEP ABSENT FOR NOW`. A later `CONSIDER IN FUTURE INTEGRATION` option (restore, plus admin UI, plus a types UNION) is not authorized by this checklist or by Phase 8D.

**Other options supported by the audit:** Future restore together with the admin UI and a types UNION, only under an explicit later phase. Before any such phase, Phase 8D §4.6 still requires review of UI pairing, types, Live-versus-local history, FK cascades, irreversible-delete runbooks, and locally added marketplace / rent-charge / photo migrations.

**Security / operational implications:** Restoring without that review returns irreversible Super Admin hard-delete. Recording the deletion without acknowledgement (item 10) drops that capability from the branch tip. The local landlord/renter admin surface does not call these RPCs today.

**Owner response:** `APPROVE` / `REJECT` / `DEFER`  
`APPROVE` accepts `KEEP ABSENT FOR NOW`. It does not restore the migration.

Chosen: ____________________  
Note:

---

## 12. A-UTL22 / D-UTL-IMP — 22 missing utility files

**Register class:** A-UTL22 is §8.A (evidence-backed absence for this baseline; soft acknowledgement). D-UTL-IMP is §8.C (do not restore now; source integration waits for a future phase).

**Paths:** The 23 deletions in item 10 except item 18 (`20261020000006_update_delete_tenant.sql`). Phase 8C class for each of these 22: `ABSENCE_JUSTIFIED_FOR_BASELINE`. None were restored.

| Paths | Phase 8C basis |
|-------|----------------|
| `docs/WATER_COMPANY_DASHBOARD.md` | CR-025 |
| `frontend/src/components/ui/app-loading.tsx`, `frontend/src/lib/simplePdf.ts` | CR-012 |
| `CompanySettingsPage.tsx`, `ConnectionsPage.tsx`, `DirectoryUi.tsx`, `NotificationsPage.tsx`, `StaffPage.tsx` under `frontend/src/pages/utility/` | CR-011 |
| `supabase/functions/provision-company-customer/index.ts`, `supabase/functions/provision-company-staff/index.ts` | CR-019. Local `provision-renter` and tracked `provision-staff` are not equivalents. |
| Utility migrations `20261018000001` through `20261020000005` and `20261021000001` through `20261021000004` | CR-018. Local rent-charge work is rent, not utility flat bills. |
| `supabase/tests/utility_tenant_isolation_probe.sql` | CR-018 / CR-023 |

**Evidence:** Local `App.tsx` has no imports of the deleted utility pages, `simplePdf`, or `app-loading` (Phase 8C). Water and electricity core routes remain on the reduced pages in item 9. The 22 absences match CR-011, CR-012, CR-018, CR-019, and CR-025. Blobs remain recoverable from `HEAD` / `origin/main`. Phase 8D did not authorize a utility source-integration phase.

**Recommendation:** Keep the 22 absent for this baseline (A-UTL22). Do not restore them now (D-UTL-IMP). Plan any import as a future, separately approved utility source-integration phase.

**Other options supported by the audit:** A future utility import. Premature restore is the risk the audit named, not an action available in Phase 8E.

**Security / operational implications:** Leaving them absent keeps water connections, company staff, flat-bill RPCs, and the isolation probe off the local baseline until import. Restoring them early would conflict with that baseline. Incomplete water UX until import is the accepted consequence of the recommendation, not a hidden defect in the count.

**Owner response:** `APPROVE` / `REJECT` / `DEFER`  
`APPROVE` accepts “keep absent and defer source integration.” It does not restore files.

Chosen: ____________________  
Note:

---

## Evidence-backed items with no response box

These stay classifications from Phase 8D §8.A. This checklist does not approve them for staging.

| ID | What remains true | What this checklist does with it |
|----|-------------------|----------------------------------|
| A-INC | Phase 8C Count A `INCLUDE_CANDIDATE` set, plus the Phase 8B, 8C, and 8D reports, exists and was not reclassified. | No include approval. A later staging phase still needs its own approval. |
| A-SEC | Secret env files and `frontend/.local/rp135-landlord-login.txt` stay ignored, untracked, and `EXCLUDE_SECRET`. | No change. Contents were not read or printed. |
| A-MIG | `supabase/migrations/20261013000013_security_isolation_hardening.sql` local bytes match the expected SHA-256. Git status remains modified versus `HEAD` (CR-016). Live execution is unknown. | Local KEEP bytes stay. The file was not edited. |

Also already reclassified in Phase 8C, and not reopened here: `frontend/scripts/run-isolated-dev.mjs`, `docs/RP-1.3.29_RENTER_SESSION_RESOLUTION_FIX_REPORT.md`, `docs/RP-1.3.31_AUTH_SESSION_JWT_COHERENCE_FIX_REPORT.md`, and `docs/STEP_5_4_24_LANDLORDS_WORKFLOW_VERIFICATION.md` (`INCLUDE_CANDIDATE`).

---

## Phase 8E verification

Read-only checks. No staging, commit, push, checkout, restore, SQL, migration, or Supabase Live contact.

| Check | Result |
|-------|--------|
| Branch | `integration/lossless-utility-sync` (unchanged) |
| `HEAD` | `f8bd11cc7d304f193929060b1f57f32636e6544a` (unchanged; equals local `origin/main`) |
| Staging | Empty (`git diff --cached --name-only` count 0) |
| Modified / deleted before this write | **65** / **23** |
| Untracked before this write | **162** via `git ls-files --others --exclude-standard` and `git status --porcelain -uall` (matches Phase 8D close) |
| Default `git status` untracked lines | **149**. Git folds files inside untracked directories under `-unormal`. This is a display difference, not missing files. |
| Protected migration SHA-256 | `00B056D20D96FB9D01BE35D9A64FDFCC9420742D5E1F82A01E6B36D25027EE1D` (match, before write) |
| `update_delete_tenant` on disk | False |
| Decision paths in items 1–8 | Present and in the status Phase 8D recorded |
| Application source edited this phase | None. The only write is this checklist. |
| Database / Supabase Live | Not contacted |
| Post-write branch / `HEAD` | Unchanged (`integration/lossless-utility-sync` / `f8bd11cc7d304f193929060b1f57f32636e6544a`) |
| Post-write staging | Empty (`staged=0`) |
| Post-write modified / deleted / untracked | **65** / **23** / **163** (`git ls-files --others --exclude-standard` and `git status --porcelain -uall`) |
| Untracked delta | **+1**, `docs/PHASE8E_OWNER_DECISION_CHECKLIST.md` (`??`) |
| Post-write protected migration SHA-256 | `00B056D20D96FB9D01BE35D9A64FDFCC9420742D5E1F82A01E6B36D25027EE1D` (match) |
| Checks marked `NOT VERIFIED` | None |

**STOP.** Do not start Phase 8F, staging, commit, utility import, or a database phase from this document. Wait until the owner marks the response lines above.
