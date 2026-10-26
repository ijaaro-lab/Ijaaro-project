# STEP 5.4.21 — Final Marketplace Cutover Safety Review

**Date:** 2026-10-18  
**Mode:** Review and prepare only — **no live execution**  
**SQL file:** `supabase/migrations/20261018220000_marketplace_field_isolation.sql`  
**Frontend:** `BrowseListingsPage.tsx`, `ListingDetailPage.tsx`, `types/database.ts` (RPCs + DTOs)

---

## Verdict

**READY FOR EXPLICIT LIVE DEPLOYMENT APPROVAL**

Scope of that approval: manual paste/apply of the reviewed SQL file (as a privileged DB role) **then** deploy the RPC-based frontend in the same change window. Not `db push`, not migration repair, not inventing `20261016000016`.

---

## 1. Exact artifact reviewed

| Artifact | Role |
| --- | --- |
| `supabase/migrations/20261018220000_marketplace_field_isolation.sql` | Sole DB cutover script |
| `frontend/src/pages/renter/BrowseListingsPage.tsx` | `rpc('list_marketplace_listings')` — cards use district/city, not `address_line` |
| `frontend/src/pages/renter/ListingDetailPage.tsx` | `rpc('get_marketplace_listing', { p_id })` — address + inquiry contacts; unavailable state |
| `frontend/src/types/database.ts` | `MarketplaceListingSummary` / `MarketplaceListing` + Function typings |

Landlord/admin/tenancy pages still use `properties` table SELECT — correct under post-cutover RLS (member / renter / super-admin).

---

## 2. Sequence safety (broken marketplace vs data exposure)

| Order | Marketplace UX | Full-row exposure to outsiders |
| --- | --- | --- |
| **SQL then frontend (required)** | Brief outage for browse until frontend ships; then OK | **No** — RLS removes listed+available table SELECT; RPCs return allowlists only |
| Frontend before SQL | Browse errors (`rpc` missing) | Unchanged (old leaky table SELECT still live) — worse |
| SQL only, frontend delayed | Browse broken for non-members (old `select("*")` returns empty) | **No** full-row leak to outsiders |
| Old frontend after SQL | Broken browse | **No** full-row leak |

**Conclusion:** Proposed order does **not** leave a window where outsiders regain `select("*")` on others’ properties. Worst case of slow frontend is empty/error browse, not a privacy regression.

**Does not depend on `20261016000016`:** script references only `public.properties`, helpers (`is_member_of`, `is_super_admin`, `can_manage_landlord_ops`), `property_photos`, and `storage.objects` — all from earlier hosted phases. Orphan version is irrelevant.

**`list_company_member_profiles`:** hygiene only; not a dependency.

---

## 3. Confirmed security assumptions

1. Apply SQL as the **Supabase privileged migration / SQL-editor role** (typically `postgres`) so `SECURITY DEFINER` functions are owned by a role that bypasses RLS when reading `properties`.
2. `SET search_path = public` on both functions; objects are schema-qualified.
3. `auth.uid() IS NULL` → exception `42501` before any return.
4. `REVOKE ALL` from `PUBLIC`/`anon`; `GRANT EXECUTE` to `authenticated` only.
5. List RPC columns exclude `address_line`, contacts, `owner_id`, `tenant_id`, `current_renter_id`, etc.
6. Detail RPC adds only approved public inquiry fields + address/description.
7. Filters: `is_listed = true AND status = 'available'`.
8. `DROP POLICY IF EXISTS` then recreate single SELECT policies — removes marketplace branch; keeps member / current renter / assignment renter / super-admin (and landlord ops on storage).
9. Within-file order: **create RPCs + grants before** dropping marketplace RLS branches — mid-script authenticated clients can already use RPCs once functions exist.
10. Local validation (5.4.18) PASS on disposable DB; history path (5.4.20) = manual apply only.

### Unresolved / residual risks (non-blocking for approval, must acknowledge)

| Risk | Notes |
| --- | --- |
| DEFINER ownership | Not `ALTER FUNCTION … OWNER TO` explicit; depends on apply role. **Preflight:** run as postgres/SQL editor privileged role. |
| `search_path = public` | Matches project; not empty path. |
| Hosted storage INSERT path | Marketplace script fixes SELECT path binding only; INSERT fix (`20261018143031`) may still be pending on host — upload bug risk, not browse privacy. |
| Cutover outage | Seconds–minutes of broken browse if frontend lags SQL. |
| No verified backup asserted | Rollback uses **repo-sourced prior policy SQL**, not a claimed hosted snapshot. |
| Dual migration history | Do not `db push` after this; optional record of apply is operator process. |
| Utility `search_properties_for_link` | Still returns limited marketplace fields to utility staff — separate surface. |

---

## 4. Exact manual cutover sequence

### A. Hosted preflight (read-only / inspect before execute)

Perform on the **target** hosted project (confirm project ref matches intended env):

1. Confirm functions absent: `list_marketplace_listings()`, `get_marketplace_listing(uuid)`.
2. Confirm `properties_select` (or equivalent) still includes listed+available **or** document current definition for rollback.
3. Confirm helpers exist: `is_member_of`, `is_super_admin`, `can_manage_landlord_ops`.
4. Confirm `property_photos_storage_select` exists on `storage.objects` for bucket `property-photos`.
5. Confirm at least one listed+available property exists for smoke (or use a known test listing).
6. Confirm deployable frontend build includes RPC browse/detail (this repo state).
7. Schedule a short maintenance window; have rollback SQL snippets ready (section 5).
8. Do **not** require `20261016000016` or `list_company_member_profiles`.

### B. Execute (only after explicit live approval)

1. Open Supabase SQL editor (privileged role) on target project.
2. Paste **entire** contents of `supabase/migrations/20261018220000_marketplace_field_isolation.sql` (single run).
3. Verify success (no error); optionally: `\df` / information_schema checks that both functions exist; `pg_policies` shows new `properties_select` without listed+available.
4. **Immediately** deploy frontend that calls the marketplace RPCs (same window).
5. Do not deploy frontend first; do not leave old production frontend against post-RLS DB longer than necessary.

### C. Postflight smoke

| # | Check | Expect |
| --- | --- | --- |
| 1 | Authenticated non-member: `list_marketplace_listings` | Rows; no `address_line` / contacts / `owner_id` |
| 2 | Authenticated: `get_marketplace_listing` for listed available | Address + contacts present; no `tenant_id` / `owner_id` |
| 3 | Authenticated: `from('properties').select('*')` on another landlord’s listed id | Empty |
| 4 | Anon: both RPCs | Error / no data |
| 5 | Landlord A: own property `select('*')` | Full row |
| 6 | Assigned renter: own occupied property | Readable via RLS |
| 7 | Super admin: can still read as today |
| 8 | UI browse cards | District/city only |
| 9 | UI detail | Address + inquiry contacts; unavailable for unlisted/occupied |
| 10 | Outsider: `property_photos` / signed URL for foreign listing | Denied |

---

## 5. Rollback procedure and limitations

### Procedure

1. Redeploy previous frontend **or** keep new frontend only after RLS restored — prefer **restore RLS + old frontend together**.
2. Restore prior policies from **repo definitions** (not from an unverified backup):
   - `properties_select` and `property_photos_select` from `supabase/migrations/20261014000014_tenant_member_isolation.sql` (includes listed+available).
   - `property_photos_storage_select` from `supabase/migrations/20261018143031_fix_property_photos_storage_path_policy.sql` **if** that SELECT shape was already live; otherwise from the phase2/hardening definition that matches pre-cutover host (confirm in preflight).
3. Optionally `DROP FUNCTION public.list_marketplace_listings();` and `DROP FUNCTION public.get_marketplace_listing(uuid);` (or leave unused).
4. Re-smoke: outsider can again `select` listed+available full rows (pre-isolation behavior); browse works on old UI.

### Limitations

- Rollback **re-opens** intentional pre-isolation marketplace full-row SELECT (privacy regresses to prior accepted state).
- If hosted storage SELECT differed from both repo files, wrong rollback snippet can break photo access — **capture live policy text in preflight**.
- No claim is made that a point-in-time hosted backup exists.
- Migration history dual-numbering remains; rollback does not “repair” history.

---

## 6. Approval statement

Approve explicitly for:

1. Manual execution of `20261018220000_marketplace_field_isolation.sql` on the chosen hosted project as a privileged role.  
2. Immediate deployment of the RPC marketplace frontend.  

Do not approve: `db push`, migration repair, replay of unknown `20261016000016`, or unrelated Landlords changes.
