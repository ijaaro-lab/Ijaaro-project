# STEP 5.4.19 — Marketplace Isolation Migration Review

**Date:** 2026-10-18  
**Migration under review:** `supabase/migrations/20261018220000_marketplace_field_isolation.sql`  
**Prerequisite:** STEP 5.4.18 local PASS  
**Hosted changes this step:** none (review only)

---

## Verdict

**Superseded by STEP 5.4.20:** history reconciled for marketplace cutover — **READY FOR LIVE APPROVAL** via **manual SQL only** (`docs/STEP_5.4.20_MIGRATION_HISTORY_RECONCILIATION.md`). Original 5.4.19 finding (CLI/`db push` unsafe under dual versioning) remains valid.

---

## 1. Findings by severity

### High

| ID | Finding |
| --- | --- |
| H1 | **Hosted vs repo migration identity mismatch.** Hosted `schema_migrations` (read via Supabase MCP `list_migrations`) uses wall-clock versions/names (e.g. `20261013064154_phase1_foundation`). Repo files use synthetic IDs (`20261013000001_…`). A naive `db push` / link-and-migrate is unsafe. |
| H2 | **Hosted-only migration present in history, absent from repo:** `20261018084934_list_company_member_profiles`. No matching SQL in `supabase/migrations/`. Contents unknown without exporting DDL (not done this step). |
| H3 | **CLI-reported remote-only `20261016000016` is unexplained.** Earlier local CLI listing showed remote `20261016000016` with no local file. Current MCP history has **no** version `20261016000016`. Classified as migration-history inconsistency / stale CLI artifact — contents **not identified**; must not repair or replay. |

### Medium

| ID | Finding |
| --- | --- |
| M1 | **Local-only migrations not on hosted history:** `20261018143031_fix_property_photos_storage_path_policy`, `20261018220000_marketplace_field_isolation`. Hosted may still use pre-isolation marketplace RLS and possibly the pre-fix storage SELECT/INSERT binding. |
| M2 | **Cutover window.** New frontend requires RPCs; new RLS removes table-level marketplace SELECT. Deploying either side alone breaks browse. |
| M3 | **SECURITY DEFINER ownership not explicit.** Functions rely on default migration-role ownership (expected `postgres` / Supabase migration role). No `ALTER FUNCTION … OWNER TO …`. Acceptable if deploy path keeps privileged owner; unsafe if ever recreated as a low-privilege role. |
| M4 | **`SET search_path = public` (not empty).** Matches existing IJAARO RPCs; residual search_path hijack risk if untrusted objects can be created in `public` (normally not granted to clients). |

### Low / Info

| ID | Finding |
| --- | --- |
| L1 | RPC grant order is correct: `REVOKE ALL` from `PUBLIC`/`anon`, then `GRANT EXECUTE` to `authenticated`. |
| L2 | Auth gate: `auth.uid() IS NULL → 42501`; policies are `TO authenticated` only. Anon cannot browse via RPC or base table under intended grants. |
| L3 | Within-file order is safe: create RPCs **before** removing listed+available RLS branches. |
| L4 | Overlapping SELECT policies inspected: single `properties_select`, single `property_photos_select`, single `property_photos_storage_select` for that bucket path after `DROP IF EXISTS`. No second permissive marketplace policy found in repo history. |
| L5 | Legitimate access preserved in proposed policies: `is_member_of`, `current_renter_id`, assignment renter (+ tenant match), `can_manage_landlord_ops` (storage), `is_super_admin`. |
| L6 | `search_properties_for_link` still returns limited marketplace rows to utility staff — separate product surface; not landlord browse. |
| L7 | Marketplace migration’s storage SELECT rewrite uses `storage.objects.name` (correct path binding). It does **not** rewrite storage INSERT; that remains dependent on whether the storage-path fix is already on the target host. |

---

## 2. Investigation: `20261016000016`

| Question | Result |
| --- | --- |
| Present in repo? | **No** |
| Present in current hosted MCP migration list? | **No** |
| Contents? | **Unknown** — cannot identify; do not guess |
| Classification (updated 5.4.20) | **Local orphan** in pre-reset local `schema_migrations`; not a confirmed hosted migration |
| Action taken | None (do not replay, repair, or apply) — closed for hosted deploy purposes in 5.4.20 |

**Related hosted-only entry:** `20261018084934_list_company_member_profiles` (hygiene export; not a marketplace dependency).

---

## 3. Is the SQL safe to *propose* for hosted deployment?

**SQL quality (local review):** Acceptable to propose **after** history reconciliation — not before.

Safe aspects: allowlisted columns, auth required, narrow grants, RLS marketplace branch removal with preserved tenant/renter/admin paths, RPC-before-RLS ordering.

**Not safe to approve live apply now** because H1–H3 / M1 remain unresolved.

---

## 4. Unresolved risks (blockers)

1. Map or document equivalence between hosted migration versions and repo files.
2. Capture `list_company_member_profiles` DDL into the repo (reviewed, not auto-applied via repair).
3. Resolve status of `20261016000016` (confirm absent on all target projects; document as closed or locate DDL).
4. Confirm whether storage-path INSERT fix is already live on the deployment target.
5. Choose a non-`db push`-blind apply path (reviewed SQL / versioned migrate after history sync).
6. Agree frontend ↔ DB cutover so browse never lacks both table SELECT and RPCs.

---

## 5. Deployment sequence (when unblocked)

1. **Freeze** marketplace frontend/DB changes; confirm target project (prod vs `ijaaro-dev`).
2. **Reconcile history** (export hosted-only SQL into repo; document ID mapping). Do **not** `migration repair` without an approved plan.
3. **Pre-checks (read-only):** confirm `list_marketplace_*` absent; confirm current `properties_select` still has listed+available; confirm storage policy names.
4. **Apply** `20261018220000_marketplace_field_isolation.sql` in one transaction/window (RPCs then RLS — already ordered in file).
5. **Deploy frontend** that calls marketplace RPCs **immediately after** DB apply (same change window).
6. **Smoke:** authenticated list/detail; anon denied; landlord A full property access; landlord B denied private rows; occupied/unlisted hidden.
7. **Do not** deploy frontend before RPCs exist, and do not leave old frontend against post-RLS DB.

---

## 6. Rollback sequence

1. Redeploy previous frontend (table `select` browse) **or** keep new frontend and restore RLS first — prefer restoring RLS + old frontend together.
2. Restore prior policies from last known good definitions:
   - `properties_select` / `property_photos_select` from `20261014000014_tenant_member_isolation.sql` (includes listed+available).
   - `property_photos_storage_select` from `20261018143031_…` if that fix was live; else from phase2/hardening baseline actually present on host.
3. Optionally `DROP FUNCTION` marketplace RPCs (or leave unused).
4. Re-run smoke: browse via table SELECT works; no unintended privilege expansion beyond pre-change marketplace behavior.

---

## 7. Local checks this step

No full retest suite re-run (5.4.18 already PASS). Hosted mutations and `db push` / link / repair: **not performed**.
