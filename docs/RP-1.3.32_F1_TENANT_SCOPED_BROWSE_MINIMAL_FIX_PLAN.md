# RP-1.3.32 F1 — Tenant-Scoped Renter Browse Minimal Fix Plan

**Date:** 2026-10-21  
**Source finding:** F1 in `docs/RP-1.3.32_LANDLORD_RENTER_DATA_INTEGRITY_AUDIT.md`  
**Mode:** Planning and code review only — **no implementation**  

---

## 1. Current verified data flow

### 1.1 Authenticated renter browse / detail (broken vs F1)

```
ProtectedRoute (session required)
  → RoleRoute (active membership among renter | landlord_admin | landlord_staff on landlord tenant)
  → /app/renter/browse
       BrowseListingsPage
         → supabase.rpc("list_marketplace_listings")   // Args: none
         → client filters: district substring, property_type, max rent
         → Link to /app/renter/browse/:id   // property id only; no tenant in path

  → /app/renter/browse/:id
       ListingDetailPage
         → useParams().id
         → supabase.rpc("get_marketplace_listing", { p_id: id })
```

**Verified facts (code):**

| Fact | Evidence |
| --- | --- |
| Browse does not pass a tenant key | `BrowseListingsPage.tsx` RPC call has no args |
| Detail does not pass a tenant key | `ListingDetailPage.tsx` only sends `p_id` |
| Marketplace list has no tenant filter | `list_marketplace_listings()` selects all `is_listed` + `available` rows |
| Marketplace detail has no tenant filter | `get_marketplace_listing(p_id)` matches id + listed + available only |
| Marketplace requires authentication | Function raises if `auth.uid()` is null; `GRANT EXECUTE` to `authenticated` only |
| Client filters are local `useMemo` only | Same file; not a security boundary |
| Portal keeps `?tenant=<slug>` on `/app/*` | `TenantSlugSync.tsx` syncs from `activeMembership.tenant.slug` |
| Browse/detail pages currently ignore that slug for RPC calls | Neither page reads `useAuth` / search params for listings |

**Verified at audit time (Live SQL / browser — prior report):** marketplace pool can include many tenants; public landlord path for `hodan-properties` is tenant-scoped. **Not re-executed in this planning task.**

### 1.2 Public landlord website (working tenant-scoped reference)

```
/?tenant=<slug>
  → LandlordPublicListings(tenantKey)
  → list_landlord_public_listings(p_tenant_key)

/listings/:id?tenant=<slug>
  → PublicListingDetailPage
  → get_landlord_public_listing(p_tenant_key, p_property_id)
```

**Verified facts (code + migration):**

| Fact | Evidence |
| --- | --- |
| Tenant resolution | `resolve_operable_landlord_tenant(p_key)` matches active landlord by `slug` or `subdomain` |
| List filter | `p.tenant_id = v_tenant.id` AND listed + available |
| Detail filter | `p.id = p_property_id` AND `p.tenant_id = v_tenant.id` AND listed + available |
| Cross-tenant id → empty result | Same WHERE; UI shows “not available” (`PublicListingDetailPage`) |
| EXECUTE grants | `anon` **and** `authenticated` |
| No membership check on caller | Any caller with a valid operable landlord key gets that landlord’s **public** allowlisted rows |

### 1.3 How active tenant is available inside `/app`

| Source | Role |
| --- | --- |
| `useAuth().activeMembership.tenant.slug` (and `subdomain`) | Authoritative workspace after `TenantSlugSync` selects membership |
| `?tenant=` query | Kept in sync on `/app/*`; used by public pages and deep links |
| Host subdomain helpers | `readTenantSlugFromHost` / `resolveTenantKeyFromLocation` |

Browse and detail pages **do not currently consume** these for listing RPCs.

---

## 2. Root cause and scope of F1

**Root cause:** Renter portal browse/detail were wired to the **global marketplace** RPC pair instead of the **landlord-scoped public** RPC pair, while the publish flag (`is_listed`) is shared by both surfaces.

**In scope for a minimal fix:**

- `BrowseListingsPage` data fetch
- `ListingDetailPage` data fetch
- Resolving and passing the active portal tenant key into those calls
- Fail-closed behavior when tenant key is missing
- Smallest tests to lock tenant scoping
- Optional landlord checkbox copy clarification (recommendation only)

**Out of scope:**

- Changing RPC SQL, grants, RLS, or allowlists
- Deleting marketplace RPCs
- Photos, null-rent UX (W1/W2), property_type labels (W4)
- RP-1.4 or new product features
- Client-only filtering of a global list as the security boundary

---

## 3. Evidence-backed RPC contract comparison

| Dimension | `list_marketplace_listings` / `get_marketplace_listing` | `list_landlord_public_listings` / `get_landlord_public_listing` |
| --- | --- | --- |
| Tenant argument | None / property id only | **`p_tenant_key text`** (+ `p_property_id` on detail) |
| Server tenant filter | **No** | **Yes** (`tenant_id` of resolved landlord) |
| Visibility gate | `is_listed` + `status = available` | Same |
| Card columns | `id, name, district, city, property_type, status, rent_amount, currency` | **Identical** |
| Detail extras | `address_line, description, contact_phone, contact_email` | **Identical** |
| Private fields omitted | `tenant_id`, owner/renter ids, `is_listed`, timestamps, etc. | Same |
| Auth requirement | Must be authenticated | Anon **or** authenticated (no `auth.uid()` check) |
| TypeScript types | `MarketplaceListingSummary` / `MarketplaceListing` | Aliased as same shapes (`LandlordPublicListing*`) |
| Cross-tenant property id | Returns row if that other tenant’s property is listed+available | Returns **empty** if id not under resolved tenant |
| Used by UI today | **Only** renter browse + detail | Public landing + public detail (+ apply page uses detail RPC) |

**Frontend type evidence:** `LandlordPublicListingSummary = MarketplaceListingSummary` and `LandlordPublicListing = MarketplaceListing` in `frontend/src/types/database.ts`.

**Callable by authenticated renters:** **Yes** — `GRANT EXECUTE … TO anon, authenticated` on both landlord-public RPCs. No additional grant or migration required for Option A.

**Field sufficiency for renter UI:** **Yes** — every field rendered on `BrowseListingsPage` and `ListingDetailPage` exists on the landlord-public allowlist (`id`, `name`, `district`, `city`, `property_type`, `status`, `rent_amount`, `currency`, plus detail `address_line`, `description`, `contact_phone`, `contact_email`).

**Assumption (not re-probed this turn):** Live DB still matches migration definitions for these four RPCs (previously verified in RP-1.3.32 audit).

---

## 4. Options

### Option A — Reuse landlord-public RPCs (recommended)

Switch renter browse/detail to:

- `list_landlord_public_listings({ p_tenant_key })`
- `get_landlord_public_listing({ p_tenant_key, p_property_id })`

Pass `p_tenant_key` from the portal tenant context (prefer `activeMembership.tenant.slug`, with URL `?tenant=` / subdomain as fallbacks consistent with `TenantSlugSync`).

| Topic | Assessment |
| --- | --- |
| Files likely affected | `BrowseListingsPage.tsx`, `ListingDetailPage.tsx`; possibly tiny shared helper for “resolve portal tenant key”; **no** SQL/migrations |
| Security | Server-side tenant_id filter remains the boundary; same public allowlist; no RLS change; no broader grants |
| Auth compatibility | Authenticated callers already granted; pages already behind `ProtectedRoute` |
| Field mapping | Drop-in (types already equivalent) |
| Filters | Unchanged client filters; they operate on a smaller, correct set |
| Navigation | Routes stay `/app/renter/browse` and `/app/renter/browse/:id`; `TenantSlugSync` continues to preserve `?tenant=` |
| Cross-tenant deep link | Foreign id + active tenant key → empty RPC → existing “unavailable” UI (same pattern as public detail) |
| Minimal? | **Yes** — frontend-only wiring to existing approved RPCs |
| Why preferred | Meets F1 without new RPC surface; reuses contracts already proven for public isolation tests |

**Not a defect for Option A:** Landlord-public RPCs do not require the caller to be a member of that tenant. That is intentional for the public website. Portal browse will still only show the **active portal** landlord’s listings if the client passes that landlord’s key. Do **not** fall back to marketplace if the key is missing.

**Fail-closed rule (required):** If no operable tenant key can be resolved, show an error / empty state and **do not** call `list_marketplace_listings` / `get_marketplace_listing`.

### Option B — Extend marketplace RPCs with optional tenant key

Add e.g. `p_tenant_key text DEFAULT NULL` to marketplace list/detail; when present, filter like landlord-public; when null, keep global behavior.

| Topic | Assessment |
| --- | --- |
| Files likely affected | New/updated migration SQL; grants review; `database.ts` Args; browse/detail pages; marketplace + possibly new isolation tests |
| Security | Can be safe **if** tenant filter is server-side when key present; still must not rely on client-only filtering |
| Compatibility | More moving parts; dual semantics (global vs scoped) easy to misuse |
| Minimal? | **No** — requires DB change while Option A already provides scoped allowlisted reads |
| When justified | Only if product must keep global marketplace **and** scoped browse on the **same** RPC names, or if landlord-public RPCs were somehow unusable (they are not) |

**Recommendation:** **Option A.** Option B is a fallback only if product later requires authenticated-only marketplace with optional scope in one function family.

---

## 5. Recommended minimal approach

**Implement Option A (frontend-only), after explicit approval.**

Suggested implementation outline (not executed now):

1. Resolve `tenantKey` in browse and detail from `activeMembership?.tenant.slug || activeMembership?.tenant.subdomain || search/host helpers` (same resolution order already used elsewhere).
2. Browse: `rpc("list_landlord_public_listings", { p_tenant_key: tenantKey })` when key present; else error state.
3. Detail: `rpc("get_landlord_public_listing", { p_tenant_key: tenantKey, p_property_id: id })` when key + id present; empty → existing unavailable UI.
4. Keep client filters and card/detail field rendering as-is (optional: switch imported types to `LandlordPublicListing*` for clarity only).
5. Leave marketplace RPCs and their tests intact (still valid for global marketplace product / regressions; currently no other UI callers).
6. Do not change RLS, grants, or allowlists.

---

## 6. Files / functions likely affected (implementation later)

| Path | Likely change |
| --- | --- |
| `frontend/src/pages/renter/BrowseListingsPage.tsx` | Tenant key resolution; RPC name + args; dependency array includes tenant key |
| `frontend/src/pages/renter/ListingDetailPage.tsx` | Tenant key resolution; RPC name + args; effect deps include tenant key |
| Optional: small helper under `frontend/src/lib/` | Shared “portal tenant key for listings” if duplication is undesirable |
| `frontend/src/pages/landlord/PropertyFormPage.tsx` | **Copy only** if approved (see §8) — not required for F1 correctness |
| **Not required:** migrations, RLS, grants, `list_marketplace_*` SQL, public landing components | — |

---

## 7. Security and tenant-isolation requirements

| Requirement | How Option A satisfies |
| --- | --- |
| Only active portal tenant’s listed+available properties in browse | Server filter via `p_tenant_key` → `tenant_id` |
| Detail opens only properties belonging to that tenant | Same + `p_property_id` |
| Security boundary is not client-side filter of global list | Do not call marketplace; do not filter global results in JS for isolation |
| Public-field allowlist unchanged | Reuse existing landlord-public return columns |
| No private fields / no broad grants / no RLS disable | No DB changes |
| Missing tenant key | Fail closed |
| Modified URL with foreign property id | Empty RPC result → unavailable (verified pattern on public detail; expected same for renter detail after switch) |
| RoleRoute allows landlord staff into renter browse | Staff browsing their own portal tenant’s listings is acceptable and still scoped |

**Unresolved / assumption:** Multi-membership users who manually switch `?tenant=` while viewing browse — `TenantSlugSync` should retarget `activeMembership`; implementation must re-fetch when tenant key changes (effect dependency).

---

## 8. Test plan (do not create/edit tests in this task)

### Already covering landlord-public isolation (keep green)

From `frontend/src/test/rls.renterApplications.test.ts` (isolated local):

| Existing behavior | Expected still true |
| --- | --- |
| Anon list for landlord A excludes B’s properties | Pass |
| Foreign property id on `get_landlord_public_listing` returns empty | Pass |
| Allowlisted columns only | Pass |

Marketplace suite (`rls.marketplace.test.ts`) remains valid for **global** marketplace semantics; it does not need to change for Option A.

### Smallest additional coverage (recommended when implementing)

| Test | Expected outcome |
| --- | --- |
| Unit/component: `BrowseListingsPage` with mocked auth slug `hodan-properties` | Calls `list_landlord_public_listings` with that `p_tenant_key`; does **not** call `list_marketplace_listings` |
| Unit/component: `BrowseListingsPage` with no tenant key | No marketplace fallback; error or empty with clear message |
| Unit/component: `ListingDetailPage` | Calls `get_landlord_public_listing` with `{ p_tenant_key, p_property_id }`; foreign/empty → unavailable UI |
| Optional isolated RPC smoke (if extending existing suite lightly) | Authenticated renter calling landlord-public list for tenant A never receives tenant B ids |

**Out of scope for minimal F1:** rewriting marketplace tests to assert “unused by UI.”

---

## 9. UI-copy implications

Current landlord checkbox (`PropertyFormPage.tsx`):

> Publish in renter browse listings

After Option A:

- `is_listed` continues to gate **renter browse** (now correctly tenant-scoped) **and** the **public landlord website**.
- The phrase is **no longer misleading** about cross-tenant marketplace leakage; it becomes **more accurate** for portal browse.
- It still understates that the same flag also publishes to the public site.

**Recommendation (optional, not required for F1):** adjust copy later to something like:

> Publish on your public site and in this workspace’s renter browse

Do **not** change copy in the F1 code fix unless product explicitly wants it in the same PR.

---

## 10. Risks, dependencies, unresolved questions

| Item | Type | Notes |
| --- | --- | --- |
| Product still wants a global marketplace UI somewhere | Risk / question | Option A removes the only UI caller of marketplace RPCs. Confirm no roadmap need for cross-tenant browse under `/app/renter/browse`. Marketplace RPCs can remain for future use. |
| Tenant key missing on first paint | Risk | Mitigate with fail-closed + wait for `activeMembership` / `TenantSlugSync` |
| Staff/admin using renter browse | Verified RoleRoute allows it | Scoped to active landlord tenant — acceptable |
| Live grants still include authenticated on landlord-public RPCs | Assumption | Confirmed in prior audit; re-check with read-only SQL at implement time if desired |
| Authenticated renter Live browser verification of card count | Unverified runtime | Close after implementation with hodan renter session (expect 1 card, not multi-tenant pool) |

---

## 11. Change confirmation

**No implementation, application code edits, tests, migrations, SQL, database writes, RLS/grant/RPC changes, configuration, environment, or deployment actions were performed in this planning task.**

**Only deliverable written:**  
`docs/RP-1.3.32_F1_TENANT_SCOPED_BROWSE_MINIMAL_FIX_PLAN.md`

**Stop:** Await explicit approval before implementing Option A (or directing Option B).
