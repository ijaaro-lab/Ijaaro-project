# Phase 8D — Final Unresolved Decisions Review

**Status:** COMPLETE (read-only)  
**Date:** 2026-10-26  
**Active project:** `C:\my projects\Ijaaro-project-main`  
**Scope:** Evidence-based decision register for unresolved Phase 8C baseline items. **No staging, commit, push, merge, checkout, restore, source integration, application-code changes, environment changes, or database operations.**  
**Prior input:** `docs/PHASE8B_BASELINE_COMMIT_READINESS.md`, `docs/PHASE8C_BASELINE_FINDINGS_RESOLUTION.md`

**Important:** Classifications and recommendations are **not** permission to stage or commit. `INCLUDE_CANDIDATE` means “evidence supports future inclusion,” not “approved for commit.”

---

## 1. Executive Summary

Phase 8D re-verified Git identity and working-tree status against Phase 8C, then reviewed the **15** path-level `REVIEW_REQUIRED` items plus non-path baseline decisions (especially `update_delete_tenant` and recording the **23** deletions).

| Check | Result |
|-------|--------|
| Branch / `HEAD` / `origin/main` | Match expected (`integration/lossless-utility-sync` / `f8bd11cc7d304f193929060b1f57f32636e6544a`) |
| Staging | **Empty** |
| Protected migration SHA-256 | **Match** expected value |
| Untracked at Phase 8D start | **161** (Phase 8C post-report state) |
| Of 15 unresolved paths reclassified to INCLUDE/EXCLUDE without owner OK | **0** |
| Paths still requiring explicit user decisions | **15** (+ non-path items in §8) |
| `update_delete_tenant` section recommendation | **`KEEP ABSENT FOR NOW`** |

No path among the 15 has enough evidence to silently approve or silently discard. Several have a **safe default leaning** documented in §8; the owner must still choose.

**Recommendation:** `READY_FOR_USER_REVIEW`  
Not production-ready. Not approval to stage/commit/push/integrate.

---

## 2. Initial Git State

| Check | Expected | Observed | Delta |
|-------|----------|----------|-------|
| Working directory | `C:\my projects\Ijaaro-project-main` | Match | None |
| Branch | `integration/lossless-utility-sync` | Match | None |
| `HEAD` | `f8bd11cc7d304f193929060b1f57f32636e6544a` | Match | None |
| `HEAD` = `origin/main` | Yes | Yes | None |
| Staging area | Empty | Empty (`staged=0`) | None |
| Phase 8B / 8C reports | Present | Present (`??`) | None |
| Phase 8D report (pre-write) | Absent | Absent | None |

### Working-tree counts at Phase 8D start

| Category | Count |
|----------|------:|
| Modified (`M`) | **65** |
| Deleted vs `HEAD` (`D`) | **23** |
| Untracked (`git ls-files --others --exclude-standard`) | **161** |
| Staged | **0** |

**Interpretation:** Matches Phase 8C final verification (65 / 23 / 161 / 0). No unexpected drift before this audit. The +1 vs Phase 8B’s post-report **160** is `docs/PHASE8C_BASELINE_FINDINGS_RESOLUTION.md`.

---

## 3. Review of the 15 Unresolved Paths

Source list: Phase 8C §9.D (exact 15 paths retained as `REVIEW_REQUIRED`). All **15** currently exist on disk as **untracked** (`??`), not ignored, not tracked.

### Reconciliation

| Metric | Count |
|--------|------:|
| Phase 8C path-level unresolved | **15** |
| Confirmed present + untracked at Phase 8D | **15** |
| Missing / ignored / tracked unexpectedly | **0** |
| Additional non-path decision items (see §8) | **6** (deletions ack, env hostnames, CR-010, `update_delete_tenant` product risk, etc.) |

### 3.1 Path-by-path

#### U01 — `frontend/scripts/ensure-live-env.mjs`

| Field | Value |
|-------|--------|
| Status | `??` untracked |
| Purpose / module | Tooling: ensures `frontend/.env.live.local` for `vite --mode live` |
| Why unresolved | Hardcodes Live project **ref** / host pattern; copies keys from ignored `.env.local` into ignored `.env.live.local` at runtime |
| Risks | Publishes Live project identity if committed; misuse against wrong env; does **not** embed JWT/service-role assignment literals (boolean scan) |
| Evidence | File header + `LIVE_REF` / `LIVE_HOST`; `frontend/package.json` scripts `env:live` and `dev` invoke it; sensitivity scan: `jwt_like=false`, `service_role` word present conceptually, `supabase.co=true` |
| Recommended disposition | **`USER_DECISION_REQUIRED`** |
| Can decide from evidence alone? | **No** — necessity for current Live `npm run dev` is High; publishability of hardcoded Live ref needs owner OK |

#### U02 — `supabase/manual/marketplace_field_isolation.rollback.sql`

| Field | Value |
|-------|--------|
| Status | `??` |
| Purpose / module | Manual ops rollback for marketplace field isolation (not a versioned migration) |
| Why unresolved | Destructive `DROP`/`CREATE POLICY`; documents Live project identity from STEP 5.4.31 preflight |
| Risks | Wrong-DB apply re-opens pre-isolation SELECT; confusion with auto-applied migrations |
| Evidence | Header comments; `DROP POLICY` present; Live project ref string present; versioned mig `20261018220000_marketplace_field_isolation.sql` already `INCLUDE_CANDIDATE` |
| Recommended disposition | **`USER_DECISION_REQUIRED`** (safe lean: `EXCLUDE_ARTIFACT` from baseline sync **or** keep as ops archive with clear “manual only” intent) |
| Can decide from evidence alone? | **No** (product/ops archive preference) |

#### U03 — `supabase/manual/marketplace_field_isolation.stage1_rpcs.sql`

| Field | Value |
|-------|--------|
| Status | `??` |
| Purpose / module | Manual STAGE 1 cutover SQL (RPCs + grants) |
| Why unresolved | Operational cutover helper; `DROP FUNCTION` / recreate; not required for app build once versioned migration exists |
| Risks | Accidental apply; schema drift vs versioned history |
| Evidence | Header STAGE 1; `DROP` SQL markers; companion of INCLUDE migration |
| Recommended disposition | **`USER_DECISION_REQUIRED`** |
| Can decide from evidence alone? | **No** |

#### U04 — `supabase/manual/marketplace_field_isolation.stage2_policies.sql`

| Field | Value |
|-------|--------|
| Status | `??` |
| Purpose / module | Manual STAGE 2 policy tightening |
| Why unresolved | Same class as U03; `DROP POLICY` / `CREATE POLICY` |
| Risks | Destructive policy changes if applied out of band |
| Evidence | Header STAGE 2; DROP SQL markers |
| Recommended disposition | **`USER_DECISION_REQUIRED`** |
| Can decide from evidence alone? | **No** |

#### U05 — `docs/RP-1.3.10_LOCAL_LANDLORD_PASSWORD_RECOVERY.md`

| Field | Value |
|-------|--------|
| Status | `??` |
| Purpose / module | Documents privileged local landlord password recovery (pairs with excluded recover script) |
| Why unresolved | Operational sensitivity; recovery procedure documentation |
| Risks | Procedure leakage; pairs with `EXCLUDE_ARTIFACT` script `recover-local-rp135-landlord-password.mjs` |
| Evidence | Header; `password_word=true`; `localhost=true`; no JWT-like literals; recover script already Phase 8C `EXCLUDE_ARTIFACT` |
| Recommended disposition | **`USER_DECISION_REQUIRED`** (safe lean: **`EXCLUDE_ARTIFACT`** from baseline sync) |
| Can decide from evidence alone? | Soft yes for exclude-from-baseline; owner may keep privately |

#### U06 — `docs/RP-1.3.24_RENTER_SESSION_RUNTIME_DIAGNOSTIC.md`

| Field | Value |
|-------|--------|
| Status | `??` |
| Purpose / module | Runtime diagnostic: renter session / membership resolution |
| Why unresolved | Operational density; diagnostic class |
| Risks | Host/session discussion in repo history; no JWT literals found |
| Evidence | Header; `localhost=true`; `jwt_like=false` |
| Recommended disposition | **`KEEP_REVIEW_REQUIRED`** / **`USER_DECISION_REQUIRED`** |
| Can decide from evidence alone? | **No** |

#### U07 — `docs/RP-1.3.25_RENTER_AUTH_STATE_VERIFICATION.md`

| Field | Value |
|-------|--------|
| Status | `??` |
| Purpose / module | Auth-state verification during navigation |
| Why unresolved | Mentions hosted host patterns (`supabase.co` boolean true) |
| Risks | Environment/host disclosure density |
| Evidence | Header; `supabase.co=true`; `jwt_like=false` |
| Recommended disposition | **`USER_DECISION_REQUIRED`** |
| Can decide from evidence alone? | **No** |

#### U08 — `docs/RP-1.3.27_SHARED_TENANT_LOGIN_RUNTIME_DIAGNOSTIC.md`

| Field | Value |
|-------|--------|
| Status | `??` |
| Purpose / module | Large runtime diagnostic (landlord vs renter login) |
| Why unresolved | Operational diagnostic density |
| Risks | Same class as other diagnostics; no JWT literals |
| Evidence | Header; `localhost=true` |
| Recommended disposition | **`USER_DECISION_REQUIRED`** |
| Can decide from evidence alone? | **No** |

#### U09 — `docs/RP-1.3.28_EXISTING_RENTER_LOGIN_DIAGNOSTIC.md`

| Field | Value |
|-------|--------|
| Status | `??` |
| Purpose / module | Existing renter login / dashboard bounce diagnostic |
| Why unresolved | Mentions `service_role` conceptually |
| Risks | Privileged-auth discussion in docs |
| Evidence | Header; `service_role_word=true`; `jwt_like=false` |
| Recommended disposition | **`USER_DECISION_REQUIRED`** |
| Can decide from evidence alone? | **No** |

#### U10 — `docs/RP-1.3.30_RENTER_REDIRECT_AND_RLS_DIAGNOSTIC.md`

| Field | Value |
|-------|--------|
| Status | `??` |
| Purpose / module | Redirect + RLS diagnostic |
| Why unresolved | Authz/RLS operational write-up |
| Risks | Diagnostic density; no JWT literals |
| Evidence | Header; `localhost=true` |
| Recommended disposition | **`USER_DECISION_REQUIRED`** |
| Can decide from evidence alone? | **No** |

#### U11 — `docs/RP-1.3.5_FINAL_BROWSER_VERIFICATION.md`

| Field | Value |
|-------|--------|
| Status | `??` |
| Purpose / module | Final browser verification report |
| Why unresolved | Host discussion (`supabase.co` boolean) |
| Risks | Environment linkage in docs |
| Evidence | Header; `supabase.co=true`; `jwt_like=false` |
| Recommended disposition | **`USER_DECISION_REQUIRED`** |
| Can decide from evidence alone? | **No** |

#### U12 — `docs/RP-1.3.9_LOCAL_LANDLORD_LOGIN_DIAGNOSIS.md`

| Field | Value |
|-------|--------|
| Status | `??` |
| Purpose / module | Local landlord login diagnosis (recovery-adjacent) |
| Why unresolved | Login/recovery-adjacent operational content |
| Risks | Procedure adjacency to privileged recovery |
| Evidence | Header; `password_word=true`; `localhost=true` |
| Recommended disposition | **`USER_DECISION_REQUIRED`** (soft lean exclude with U05) |
| Can decide from evidence alone? | **No** |

#### U13 — `docs/STEP_5_4_25_LANDLORDS_BROWSER_SMOKE_TEST.md`

| Field | Value |
|-------|--------|
| Status | `??` |
| Purpose / module | Landlords browser smoke test report |
| Why unresolved | Fixture email domain `@ijaaro.test`; pairs with excluded smoke scripts |
| Risks | Fixture identity leakage; not product source |
| Evidence | Header; `@ijaaro.test=true`; Phase 8C excluded related smoke `.mjs` as `EXCLUDE_ARTIFACT` |
| Recommended disposition | **`USER_DECISION_REQUIRED`** (safe lean: **`EXCLUDE_ARTIFACT`**) |
| Can decide from evidence alone? | Soft yes for exclude-from-baseline |

#### U14 — `docs/STEP_5_4_26_PENDING_PAYMENT_APPROVAL_VERIFICATION.md`

| Field | Value |
|-------|--------|
| Status | `??` |
| Purpose / module | Pending payment approval browser verification |
| Why unresolved | Verification/smoke class |
| Risks | Operational verification detail; no fixture-email marker in boolean scan |
| Evidence | Header; `localhost=true` |
| Recommended disposition | **`USER_DECISION_REQUIRED`** |
| Can decide from evidence alone? | **No** |

#### U15 — `docs/STEP_5_4_29_LANDLORDS_MOVE_OUT_BROWSER_VERIFICATION.md`

| Field | Value |
|-------|--------|
| Status | `??` |
| Purpose / module | Move-out browser verification |
| Why unresolved | Fixture emails + UUIDs |
| Risks | Fixture identity leakage |
| Evidence | Header; `@ijaaro.test=true`; `uuid_count=4`; related smoke script Phase 8C `EXCLUDE_ARTIFACT` |
| Recommended disposition | **`USER_DECISION_REQUIRED`** (safe lean: **`EXCLUDE_ARTIFACT`**) |
| Can decide from evidence alone? | Soft yes for exclude-from-baseline |

### 3.2 Aggregate on the 15

| Outcome | Count |
|---------|------:|
| Force-resolved to `INCLUDE_CANDIDATE` by evidence alone | **0** |
| Force-resolved to `EXCLUDE_ARTIFACT` / `EXCLUDE_SECRET` by evidence alone | **0** |
| Remain `USER_DECISION_REQUIRED` / `KEEP_REVIEW_REQUIRED` | **15** |
| Soft evidence lean toward exclude (still need owner OK) | **4** (U05, U12 soft; U13, U15) |

---

## 4. Detailed `update_delete_tenant` Assessment

### 4.1 Identity

| Question | Verified fact |
|----------|---------------|
| What is it? | A **database migration** (SQL file), not an Edge Function and not a frontend module |
| Path (in `HEAD` / `origin/main`) | `supabase/migrations/20261020000006_update_delete_tenant.sql` |
| Working-tree status | **Deleted vs `HEAD`** (`D`); **absent on disk** (`Test-Path` = False) |
| Recoverable from local Git? | **Yes** — blob present at `HEAD` / `origin/main` (`git cat-file` / `git show HEAD:…` succeeded) |
| Line count (HEAD) | **167** |

### 4.2 What the migration defines (from `git show HEAD:…` — not executed)

Creates two `SECURITY DEFINER` RPCs:

1. **`public.update_tenant(...)`** — updates `tenants` name / slug / subdomain / status  
2. **`public.delete_tenant(uuid)`** — hard-deletes a tenant and tenant-scoped rows

**Authorization visible in source (verified):**

- Both functions: `IF auth.uid() IS NULL OR NOT public.is_super_admin() THEN RAISE … 'not authorized'`
- Platform tenant blocked from update/delete
- `REVOKE ALL … FROM PUBLIC, anon`
- `GRANT EXECUTE … TO authenticated` (gate is `is_super_admin()`, not role-less open execute)

**Privileged posture (verified):** `SECURITY DEFINER` + `SET search_path = public` (elevated relative to caller RLS). Does **not** hardcode service-role JWT in the migration text inspected.

### 4.3 Tables / entities touched by `delete_tenant` (verified DELETE/UPDATE list)

From HEAD SQL (explicit statements):

| Action | Entities |
|--------|----------|
| Guard | Blocks delete if other utility companies’ `utility_accounts` still link to this tenant’s `properties` |
| `UPDATE` | `meter_readings.correction_of_id` cleared for tenant |
| `DELETE` | `utility_payments`, `utility_bills`, `meter_readings`, `meters`, `utility_accounts` |
| `DELETE` | `rent_payments`, `rent_charges`, `rental_assignments`, `rental_applications`, `property_photos`, `properties` |
| `DELETE` | `tenants` row |
| Comment only | `memberships` + `tenant_renter_usernames` **cascade**; `audit_logs.tenant_id` SET NULL |
| Audit | `_insert_audit_log` with event `tenant.deleted` / `tenant.updated` |

**Verified non-mentions in this migration text:** no direct `DELETE FROM auth.users`, no direct `DELETE FROM profiles`, no direct `DELETE FROM tenant_memberships` (cascade implied by comment / FK design — **inference**, not re-verified against live FK DDL here).

### 4.4 Local working-tree equivalents

| Surface | Finding |
|---------|---------|
| Migration on disk | **Absent** |
| Local types (`frontend/src/types/database.ts`) | Only **`update_tenant_branding`** among tenant-update RPCs; **no** `update_tenant` / `delete_tenant` keys |
| `HEAD` types | **Did** declare `update_tenant` and `delete_tenant` (confirmed via `git show HEAD:frontend/src/types/database.ts`) |
| Local `TenantDetailPage.tsx` | Uses `lookup_profile_by_email`, `manage_membership`, **`update_tenant_branding`** only — **no** `update_tenant` / `delete_tenant` calls |
| `HEAD` admin pages | Called `update_tenant` and `delete_tenant` (confirmed via `git show HEAD:…` Select-String) |
| Branding migration present locally | `supabase/migrations/20261013000012_update_tenant_branding.sql` **exists** (tracked) — **not** an equivalent for hard-delete or name/slug/status RPC |

**Inference (labeled):** Local product intentionally simplified Super Admin tenant edit/delete UX (CR-020); branding-only update remains.

### 4.5 Could it affect tenants, properties, memberships, accounts?

| Entity class | Evidence |
|--------------|----------|
| Tenants | **Yes** — direct UPDATE/DELETE on `tenants` |
| Properties / photos / rent / applications | **Yes** — explicit DELETEs |
| Utility billing/meters/accounts | **Yes** — explicit DELETEs |
| Memberships / renter usernames | **Likely via cascade** (comment); not direct DELETE in this file |
| Auth user accounts (`auth.users`) | **Not shown** in this migration text |
| Cross-tenant utility linkage | Guard prevents delete when other companies still bill this landlord’s properties |

### 4.6 Missing dependency / integration prerequisites (before any future restore)

Do **not** restore in this phase. Before a future, separately approved integration, review at least:

1. Pairing with GH-style admin UI that calls these RPCs (CR-020 — currently local pages are simplified).  
2. Regenerating / UNION-merging `frontend/src/types/database.ts` for the two RPCs.  
3. Confirming Live vs local migration history (file presence ≠ applied on Live; **Live was not contacted**).  
4. Cascade FK behavior for memberships / usernames / audit logs against actual schema.  
5. Operational runbooks (irreversible hard delete).  
6. Interaction with marketplace / rent-charge / photo migrations present only locally.

### 4.7 Facts vs inferences

| Class | Items |
|-------|-------|
| **Verified** | Migration type; SECURITY DEFINER; `is_super_admin` gates; table DELETE list; absent on disk; present in HEAD; local UI/types lack RPC; HEAD UI/types had RPC |
| **Inference** | Membership deletion via FK cascade; Live apply status unknown; “safe forever” if committed as deletion — **false** only if history rewritten (not claimed) |
| **Unknown / not verified** | Whether Live already has these functions; exact FK ON DELETE behavior; whether any other local caller exists outside scanned admin pages |

### 4.8 Section recommendation

### `KEEP ABSENT FOR NOW`

**Rationale:** Local landlord/renter baseline admin surface does not call these RPCs; local types omit them; restoring would reintroduce irreversible Super Admin hard-delete capability without a matching approved UI/types/integration review. Blob remains recoverable from `HEAD`/`origin/main` for a **future, separately approved** integration phase (`CONSIDER IN FUTURE INTEGRATION` as a later option — **not** authorized now).

**Still required from the user before staging the `D` path into a baseline commit:** explicit acknowledgment that recording this deletion is intentional (see Decision D-UDT / D-DEL in §8). That acknowledgment is **not** the same as restoring the function.

---

## 5. Baseline Manifest Consistency

Phase 8C revised manifest (§9) vs current Git (Phase 8D start):

| Manifest bucket | Phase 8C claim | Phase 8D verification |
|-----------------|----------------|------------------------|
| `INCLUDE_CANDIDATE` Count A | **205** (+ Phase 8C report → **206** after 8C write) | Spot-checked Phase 8B INCLUDE set still present; Phase 8B/8C reports present as `??`; **no silent approval** |
| Modified INCLUDE | **65** | **65** match |
| Deleted utility set | **23** | **23** still `D` vs HEAD (list unchanged) |
| `EXCLUDE_ARTIFACT` (named scripts) | recover + 4 smoke `.mjs` | All still exist as `??` (correctly **not** auto-staged; still untracked until a future staging phase chooses) |
| `EXCLUDE_SECRET` | frontend env + `.local` login file | Exist, ignored (`!!` / `check-ignore`), untracked — see §7 |
| `REVIEW_REQUIRED` paths | **15** | All **15** still `??` |
| Utility absences | 22× justified + 1× user decision (`update_delete_tenant`) | Confirmed; §4 recommends keep absent for now |
| Phase reports in untracked list | 8A/8B/8C | Present; classify Phase 8B/8C/8D as **`INCLUDE_CANDIDATE`** for a future docs-inclusive baseline (not permission to commit) |

### Manifest vs Git mismatches

| Item | Result |
|------|--------|
| Unexpected missing INCLUDE path | **None found** in spot checks + count alignment |
| Unexpected new application source beyond Phase 8C expectation | **None** (untracked=161 = Phase 8C final) |
| Staging pollution | **None** |
| Silent reclassification performed this phase | **None** |

**Note:** After this Phase 8D report is written, untracked count is expected to become **162**. Treat `docs/PHASE8D_FINAL_UNRESOLVED_DECISIONS.md` as `INCLUDE_CANDIDATE` for a future docs-inclusive baseline.

---

## 6. Local Functionality and Security Boundaries

Read-only source references only. No broad speculative claims.

| Boundary | Relevant local paths | Interaction with unresolved decisions |
|----------|----------------------|----------------------------------------|
| Authentication / active membership | `frontend/src/auth/AuthProvider.tsx` (`activeMembership`, `memberships`, `isSuperAdmin`) | Diagnostic docs (U06–U12) describe historical auth debugging; including/excluding docs does **not** change runtime. Scripts (U01) affect **which env** `npm run dev` targets. |
| `RoleRoute` / route gates | `RoleRoute` exported from `frontend/src/auth/ProtectedRoute.tsx`; used in `frontend/src/App.tsx` | Gates on **active** membership + status; Super Admin redirected to `/app/admin`. Unresolved docs/scripts do not alter this code. |
| Tenant / property access | Landlord pages (e.g. `PropertyFormPage.tsx`) compare `data.tenant_id` to `activeMembership.tenant_id` | Baseline INCLUDE set covers these; unresolved items are peripheral tooling/docs/manual SQL. |
| Utility-company functionality | Reduced local utility pages remain `M`; 23 utility paths remain `D` | Committing deletions locks absence until a future import; CR-010 still needs owner OK. |
| DB types / migration compatibility | Local `database.ts` lacks `update_tenant`/`delete_tenant`; local marketplace/rent migrations untracked INCLUDE | Manual SQL (U02–U04) must not be confused with versioned migrations; `update_delete_tenant` absence is a **types + admin UX** product gap if GH Super Admin delete is expected. |
| Local-only Edge Functions | Untracked `provision-renter`, `public-listing-photos`, `generate-monthly-rent-charges` are INCLUDE_CANDIDATE | Not among the 15 unresolved paths. |
| Environment protection | Ignored `frontend/.env.*` secret files; U01 writes `.env.live.local` from `.env.local` | U01 inclusion is an env-workflow / publishability decision. |
| Landlord / renter / marketplace | Large INCLUDE_CANDIDATE set (pages, libs, tests, migrations) | Unresolved smoke/diagnostic docs do not gate product compile; excluding them does not remove product source. |

**Limitation:** This section does not prove Live RLS correctness or that every INCLUDE path is free of product bugs — only that unresolved path decisions are mostly **documentation/tooling/ops**, except where `update_delete_tenant` / utility deletions touch **platform admin and utility** capability.

---

## 7. Protected Migration and Environment Verification

### 7.1 Protected migration

| Item | Value |
|------|--------|
| Path | `supabase/migrations/20261013000013_security_isolation_hardening.sql` |
| Expected SHA-256 | `00B056D20D96FB9D01BE35D9A64FDFCC9420742D5E1F82A01E6B36D25027EE1D` |
| SHA-256 at Phase 8D start | `00B056D20D96FB9D01BE35D9A64FDFCC9420742D5E1F82A01E6B36D25027EE1D` |
| Match | **Yes** |
| Git status | **Modified** vs `HEAD` (local KEEP ≠ GitHub blob; CR-016) |
| Modified this phase? | **No** |

File presence ≠ Live DB execution. Live was **not** contacted.

### 7.2 Environment / credential ignore status (contents **not** printed)

| Path | Exists | Ignored | Tracked | Handling |
|------|--------|---------|---------|----------|
| `.env` | No | Yes (`.gitignore` `.env`) | No | N/A |
| `.env.local` | No (root) | Yes (`.env.*`) | No | N/A |
| `.env.live.local` | No (root) | Yes | No | N/A |
| `.env.isolated` | No (root) | Yes | No | N/A |
| `.env.example` | Yes | No | Yes (`M`) | Template; `supabase.co` pattern present; **no** JWT-like literal |
| `frontend/.env` | No | Yes | No | N/A |
| `frontend/.env.local` | Yes | Yes | No | `EXCLUDE_SECRET` |
| `frontend/.env.live.local` | Yes | Yes | No | `EXCLUDE_SECRET` |
| `frontend/.env.isolated` | Yes | Yes | No | `EXCLUDE_SECRET` |
| `frontend/.env.example` | Yes | No | Yes (`M`) | Template; host pattern present; **no** JWT-like literal |
| `frontend/.local/rp135-landlord-login.txt` | Yes | Yes (`frontend/.local/`) | No | `EXCLUDE_SECRET` |

---

## 8. User Decision Register

Clearly separated:

### A. Decisions supported by evidence (still need staging-phase approval later)

| ID | File / issue | Verified facts | Remaining uncertainty | Recommended safe option | Alternatives | Risk if wrong | User approval required? |
|----|--------------|----------------|----------------------|-------------------------|--------------|---------------|-------------------------|
| A-INC | Phase 8C Count A INCLUDE set (+ 8B/8C/8D reports) | Paths exist; not secrets; landlord/renter/marketplace work | Live apply/deploy unproven | Keep as `INCLUDE_CANDIDATE` for future staging plan | Defer subsets | Losing local work if omitted from a sync commit | Staging phase yes; classification evidence-backed |
| A-EX-SCR | recover + 4 smoke scripts | Privileged/disposable; not in product runtime (except package refs for other scripts) | Owner may want smoke tooling published | `EXCLUDE_ARTIFACT` from baseline sync | Include with warnings | Publishing privileged smoke/recovery tooling | Soft |
| A-SEC | Secret env files | Ignored + untracked | — | `EXCLUDE_SECRET` forever from Git | None | Credential leak | No further discovery |
| A-MIG | Protected migration local bytes | Hash match | Live execution unknown | Keep local KEEP bytes | — | Losing CR-016 hardening conditional | Staging phase |
| A-UTL22 | 22 utility absences (non-UDT) | Align CR-011/012/018/019/025; local App lacks deleted routes | Future utility import needed | Keep absent for this baseline | Future import phase | Incomplete water UX until import | Soft ack with deletions |

### B. Decisions that remain the user’s choice

| ID | File / issue | Verified facts | Remaining uncertainty | Recommended safe option | Alternatives | Risk if wrong | User approval required? |
|----|--------------|----------------|----------------------|-------------------------|--------------|---------------|-------------------------|
| D-U01 | `ensure-live-env.mjs` | Required by current `dev`/`env:live`; hardcodes Live ref; no JWT literal | Publishability of Live ref | Defer include **or** include after owner OK on Live ref | Redact ref in a later change phase (not this phase) | Wrong include publishes project identity; wrong exclude breaks documented Live `npm run dev` unless workflow changes | **Yes** |
| D-U02–04 | Three `supabase/manual/marketplace_field_isolation.*.sql` | Destructive SQL; Live project ref in rollback; versioned mig already INCLUDE | Ops-archive vs baseline clutter | Prefer **exclude from baseline sync** unless ops archive desired | Include as manual-only archive | Wrong include may tempt out-of-band apply; wrong exclude loses cutover history | **Yes** |
| D-U05 | RP-1.3.10 recovery doc | Pairs with excluded recover script | Keep privately? | `EXCLUDE_ARTIFACT` | Include as historical doc | Procedure exposure | **Yes** |
| D-U06–12 | Diagnostic / verification docs (7) | No JWT literals; some host/`service_role` discussion | Include as history vs prune | Owner preference; default **keep reviewing** | Include all / exclude all / selective | Doc noise vs losing incident history | **Yes** |
| D-U13–15 | STEP smoke verification docs | Fixture markers on 25/29 | Same as smoke scripts | Lean `EXCLUDE_ARTIFACT` | Include | Fixture identity in Git | **Yes** |
| D-ENVEX | `.env.example` / `frontend/.env.example` host patterns | `supabase.co` present; no JWT-like | Intentional publish? | Confirm intentional | Redact in later change phase | Host disclosure | **Yes** |
| D-CR010 | Reduced local utility pages (`M`) | Core utility routes remain; connections/staff/etc. gone | Lock until import? | Accept reduced UX until utility import | Restore via future import | Committing locks simpler UX | **Yes** |
| D-DEL | Record all **23** deletions in a future baseline sync commit | All still `D`; blobs in HEAD | Product completeness | Acknowledge with UDT special note | Restore selected paths in a future phase **before** commit | Committing deletions without ack permanently records absence on branch tip (history still has blobs) | **Yes** |

### C. Deferred to a future, separately approved integration phase

| ID | File / issue | Verified facts | Remaining uncertainty | Recommended safe option | Alternatives | Risk if wrong | User approval required? |
|----|--------------|----------------|----------------------|-------------------------|--------------|---------------|-------------------------|
| D-UDT | `20261020000006_update_delete_tenant.sql` | SECURITY DEFINER Super Admin update/delete; cascade deletes; absent locally; HEAD recoverable | Live presence; FK cascade details; whether SA delete UX is required | **`KEEP ABSENT FOR NOW`** | Future restore + admin UI + types UNION | Restoring without review enables irreversible deletes; committing deletion without ack drops SA hard-delete from branch tip | **Yes** (ack now; integrate later only with explicit phase) |
| D-UTL-IMP | Remaining 22 utility GH paths | Intentional absence for landlord/renter baseline | Import sequencing / CR couples | Do not restore now | Future utility source-integration phase | Premature restore conflicts with local baseline | Future phase only |

---

## 9. Remaining Risks and Evidence Gaps

1. **Live schema / migration history unknown** — local files and Git blobs do not prove what is applied on Supabase Live (not contacted).  
2. **`delete_tenant` cascade of memberships** — documented by comment only; FK DDL not re-audited in this phase.  
3. **Publishing Live project ref** via `ensure-live-env.mjs` or manual SQL comments — owner preference unresolved.  
4. **Diagnostic docs** — no JWT literals found, but operational density remains a judgment call.  
5. **INCLUDE_CANDIDATE ≠ tested production readiness** — auth/tenancy/admin/utility reduced surfaces still carry product implications (CR-010/020).  
6. **Recording deletions** — recoverable from `origin/main` history after commit, but branch tip would no longer contain working-tree copies until re-imported.

---

## 10. Final Read-Only Verification

Performed after writing this report only (recheck commands are read-only):

| Check | Result |
|-------|--------|
| Branch | `integration/lossless-utility-sync` (**unchanged**) |
| `HEAD` | `f8bd11cc7d304f193929060b1f57f32636e6544a` (**unchanged**; equals `origin/main`) |
| Staging empty | **Yes** (`staged=0`) |
| Commit / push this phase | **No** |
| Application-code changes | **None** |
| Database / Supabase / mutative tests | **Not executed** |
| Forbidden Git mutators | **Not used** |
| Protected migration SHA-256 (end) | `00B056D20D96FB9D01BE35D9A64FDFCC9420742D5E1F82A01E6B36D25027EE1D` (**match**) |
| Modified / Deleted / Untracked / Staged | **65** / **23** / **162** / **0** |
| Untracked excluding this report | **161** (matches Phase 8C final inventory) |
| Only new write | `docs/PHASE8D_FINAL_UNRESOLVED_DECISIONS.md` |

---

## 11. Recommendation for the Next Phase

### `READY_FOR_USER_REVIEW`

**Meaning:** Phase 8D produced an evidence-based decision register for all **15** unresolved paths, deep-inspected `update_delete_tenant` from local Git history, reconciled the Phase 8C manifest to current Git status, and re-verified the protected migration hash. **No** path was silently approved for commit.

**Not claimed:** production readiness, Live DB correctness, approval to stage/commit/push, or utility/`update_delete_tenant` source integration.

**STOP.** Wait for explicit user decisions (§8) before any staging, commit, utility import, or database phase.
