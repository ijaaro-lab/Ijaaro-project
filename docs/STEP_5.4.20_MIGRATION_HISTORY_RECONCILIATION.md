# STEP 5.4.20 — Migration History Reconciliation

**Date:** 2026-10-18  
**Prerequisite:** STEP 5.4.18 PASS (local) · STEP 5.4.19 review BLOCKED  
**Hosted mutations this step:** none

---

## Verdict

**READY FOR LIVE APPROVAL** — only via **manual, reviewed apply** of `20261018220000_marketplace_field_isolation.sql` (plus coordinated frontend cutover).

**Still forbidden / not ready:** `supabase db push`, `migration repair`, link-and-migrate that assumes repo versions match hosted `schema_migrations`, or any blind replay of local migration files onto hosted.

---

## 1. Evidence gathered

### 1.1 Local repo migration files (17)

| Version (filename) | Name |
| --- | --- |
| `20261013000001` | phase1_foundation |
| `20261013000002` | phase1_security_hardening |
| `20261013000003` | phase2_properties_tenancy |
| `20261013000004` | phase2_rent_ledger |
| `20261013000005` | phase2_revoke_anon_helpers |
| `20261013000006` | phase3_utilities_schema |
| `20261013000007` | phase3_utilities_rpcs |
| `20261013000008` | saas_tenant_hardening |
| `20261013000009` | self_provision_tenant |
| `20261013000010` | avatars_storage |
| `20261013000011` | tenant_branding_storage |
| `20261013000012` | update_tenant_branding |
| `20261013000013` | security_isolation_hardening |
| `20261014000014` | tenant_member_isolation |
| `20261014000015` | branding_draft_upload |
| `20261018143031` | fix_property_photos_storage_path_policy |
| `20261018220000` | marketplace_field_isolation |

No file named `20261016000016` (any suffix). No `list_company_member_profiles` SQL in repo. Workspace is not a git repository here — cannot recover deleted migration blobs from git.

### 1.2 Hosted migration history (read-only MCP `list_migrations`, re-confirmed this step)

| Version | Name |
| --- | --- |
| `20261013064154` | phase1_foundation |
| `20261013064251` | phase1_rls_and_rpcs |
| `20261013064829` | phase1_security_hardening |
| `20261013080401` | phase2_properties_tenancy |
| `20261013080807` | phase2_rent_ledger |
| `20261013080838` | phase2_assign_renter_with_charge |
| `20261013081556` | phase2_revoke_anon_helpers |
| `20261013084337` | phase3_utilities_enums_helpers |
| `20261013084445` | phase3_utilities_accounts_meters |
| `20261013084510` | phase3_utilities_readings_bills |
| `20261013084647` | phase3_utilities_payments_rls |
| `20261013084819` | phase3_utilities_rpcs |
| `20261013102344` | saas_tenant_hardening |
| `20261013105855` | self_provision_tenant |
| `20261013111700` | avatars_storage |
| `20261013112536` | tenant_branding_storage |
| `20261013112750` | update_tenant_branding |
| `20261013142809` | security_isolation_hardening |
| `20261014062512` | tenant_member_isolation |
| `20261014064622` | branding_draft_upload |
| `20261018084934` | list_company_member_profiles |

**Absent from hosted history:** `20261016000016`, `20261018143031`, `20261018220000`.

### 1.3 Local CLI / Docker

- Docker Desktop engine **not running** (`dockerDesktopLinuxEngine` pipe missing).
- `npx supabase status` / `migration list --local` cannot run until Docker is up.
- Minimal safe start (no reset): start Docker Desktop, then from repo root:

```powershell
npx supabase start
```

Do **not** run `npx supabase db reset` unless explicitly approved (destroys local DB state).

### 1.4 Prior STEP 5.4.18 CLI observation (session evidence)

`npx supabase migration list --local` once showed:

- file present / DB absent: `20261018143031`
- file absent / DB present: `20261016000016`

After an approved local `db reset` in 5.4.18, later local lists no longer showed `20261016000016`. Hosted MCP never listed that version.

---

## 2. Exact discrepancy and likely cause

### Discrepancy A — Dual versioning systems (primary)

Repo uses **synthetic sequential** versions (`…000001`, `…000002`, …).  
Hosted uses **wall-clock apply** versions and **finer file splits** (e.g. separate `phase1_rls_and_rpcs`, `phase2_assign_renter_with_charge`, four phase3 chunks vs two local files).

**Likely cause:** Migrations were applied to hosted over time with real timestamps / dashboard or CLI splits, while the repo was later normalized into fewer synthetic-numbered files covering equivalent phases. Content may be largely equivalent by **name family**, but **version IDs are not interchangeable**.

### Discrepancy B — Hosted-only named migration

`20261018084934_list_company_member_profiles` exists only on hosted. **SQL not in repo; contents not invented.**

**Likely cause:** Applied on hosted outside the current local migration tree (dashboard SQL, other branch, or omitted export).

### Discrepancy C — `20261016000016`

| Check | Result |
| --- | --- |
| SQL / purpose available? | **No** — must not guess |
| Under a different filename in repo? | **No evidence** (no matching content/name; no git history available in this workspace) |
| On current hosted MCP list? | **No** |
| Best-supported classification | **Local history discrepancy / orphan version** that appeared in pre-reset **local** `schema_migrations` without a source file; **not** a confirmed hosted applied migration |

**Likely cause:** Local DB once recorded version `20261016000016` (manual insert, partial sync, or lost file). STEP 5.4.18 local reset removed that local row. It is **not** blocking hosted schema based on current MCP evidence.

### Discrepancy D — Local-only pending marketplace / storage fix

`20261018143031` and `20261018220000` exist as files; not in hosted history. Expected — not yet deployed.

---

## 3. Ordering vs `20261018220000_marketplace_field_isolation.sql`

**Depends on (already on hosted under other version IDs):**

- `properties` / enums / RLS helpers (`is_member_of`, `is_super_admin`, `can_manage_landlord_ops`)
- `property_photos` + `property-photos` storage policies
- Latest restated SELECT policies from tenant member isolation era

**Does not depend on:**

- `list_company_member_profiles` (orthogonal)
- `20261016000016` (unknown; not on hosted)
- Prior application of `20261018143031` — marketplace migration **redefines** `property_photos_storage_select` correctly itself; storage **INSERT** fix remains a separate hosted question

**Safe relative order on hosted:** apply marketplace SQL only after confirming prerequisites exist (they do per hosted history through `tenant_member_isolation` / `branding_draft_upload`). Then deploy frontend that calls the new RPCs.

---

## 4. Reconciliation options (preserve live schema & data)

### Option 1 — Manual SQL cutover (recommended for marketplace)

1. Do **not** link/push the whole local migration folder.
2. Apply **only** the reviewed contents of `20261018220000_marketplace_field_isolation.sql` under change control.
3. Optionally record that apply in hosted migration history with a **new** hosted-style version/name (process TBD by operator) — without rewriting past rows.
4. Deploy frontend in the same window.

| Pros | Risks |
| --- | --- |
| Preserves all existing hosted migration rows and data | Operator must not paste wrong SQL |
| Avoids re-running phase1–4 under wrong IDs | History remains dual until a later hygiene project |
| Matches already-reviewed file | Storage INSERT path bug may still exist if never fixed on host |

### Option 2 — Export-then-mirror hygiene (later; not required to ship marketplace)

1. Read-only export of `list_company_member_profiles` DDL into repo as documentation or a **non-applied** mirror note.
2. Maintain an explicit **name-map** table (hosted version ↔ repo file / phase).
3. Only then consider a disciplined CLI workflow.

| Pros | Risks |
| --- | --- |
| Long-term operable history | Easy to misuse `migration repair` and corrupt history |
| Unblocks future `db push` dreams | Scope creep; not needed for this marketplace fix |

### Option 3 — Rename/rewrite local files to match hosted IDs

**Rejected** under STEP constraints (do not delete/rename/rewrite/replay merely to match lists). High risk of double-apply.

### Option 4 — Replay or invent `20261016000016`

**Rejected.** SQL unknown; not on hosted; do not create filler SQL.

---

## 5. Is local PostgreSQL still required?

| Purpose | Required now? |
| --- | --- |
| Close out `20261016000016` vs hosted | **No** — hosted MCP already shows absence; classification uses prior local list + reset evidence |
| Re-validate marketplace SQL | **No** — 5.4.18 already PASS |
| Optional hygiene: `migration list --local` after start | Nice-to-have only |

**When Docker is available:** `npx supabase start` (not `db reset`), then `npx supabase migration list --local`.

---

## 6. Updated readiness checklist

| Item | Status |
| --- | --- |
| Marketplace SQL reviewed (5.4.19) | Done |
| Local validation (5.4.18) | PASS |
| Identify `20261016000016` SQL | **Impossible with available evidence** — closed as non-hosted orphan; do not invent |
| Confirm `20261016000016` not on hosted | Done (MCP) |
| Name-map repo ↔ hosted phases | Documented above (equivalence by name family, not ID) |
| Capture `list_company_member_profiles` into repo | Open (hygiene; not a marketplace dependency) |
| Forbid `db push` until full history sync | **Policy** |
| Manual apply path + frontend cutover approved | **Awaiting live approval** |
| Post-deploy smoke | Pending after approve |

---

## 7. Live approval scope

Approve: **manual apply of marketplace isolation SQL + frontend cutover** on the chosen hosted project.

Do not approve: automatic migration sync from local folder, repair of `20261016000016`, or replay of storage-fix migration unless separately reviewed.
