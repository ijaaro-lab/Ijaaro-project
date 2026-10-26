# RP-1.3.32 F1 — Tenant-Scoped Renter Browse Fix Report

**Date:** 2026-10-21  
**Approved plan:** `docs/RP-1.3.32_F1_TENANT_SCOPED_BROWSE_MINIMAL_FIX_PLAN.md` (Option A)  
**Status:** Implemented (frontend only)

---

## 1. Summary

Authenticated renter Browse Listings and Property Details now call the existing landlord-scoped public RPCs with the active portal tenant key. Global marketplace RPCs are no longer used by these pages. Missing tenant key fails closed (no marketplace fallback).

---

## 2. Changed files and behavior

| File | Change |
| --- | --- |
| `frontend/src/lib/tenant.ts` | Added `resolvePortalTenantKey()` — prefers `activeMembership` slug/subdomain, then `?tenant=` / host |
| `frontend/src/pages/renter/BrowseListingsPage.tsx` | Calls `list_landlord_public_listings({ p_tenant_key })`; fail-closed error if no key; client filters unchanged |
| `frontend/src/pages/renter/ListingDetailPage.tsx` | Calls `get_landlord_public_listing({ p_tenant_key, p_property_id })`; missing key → error; empty result → existing unavailable UI |
| `frontend/src/lib/resolvePortalTenantKey.test.ts` | Unit tests for key resolution order / fail-closed |
| `frontend/src/pages/renter/BrowseListingsPage.test.tsx` | RPC args, no marketplace fallback, district filter |
| `frontend/src/pages/renter/ListingDetailPage.test.tsx` | Detail RPC args, cross-tenant empty → unavailable, fail-closed |

**Unchanged (by design):**

- Landlord public website (`LandlordPublicListings`, `PublicListingDetailPage`)
- Marketplace RPC SQL / grants / RLS
- “Publish in renter browse listings” checkbox copy
- Card/detail field mapping and browse routes (`/app/renter/browse`, `/app/renter/browse/:id`)
- Environment, ports, deployments

### Behavior detail

1. **Browse:** Resolves portal tenant key → `list_landlord_public_listings`. Server returns only that landlord’s listed+available allowlisted cards.
2. **Detail:** Same key + route property id → `get_landlord_public_listing`. Cross-tenant / unlisted ids yield empty rows → “This listing is unavailable…”.
3. **Fail closed:** If key unresolved, pages set an error (“Missing workspace…”) and **do not** call `list_marketplace_listings` / `get_marketplace_listing`.
4. **Filters:** District / max rent / type remain client-side on the already-scoped row set.

---

## 3. Scope confirmation

| Constraint | Result |
| --- | --- |
| Option A only (reuse landlord-public RPCs) | Yes |
| Frontend only | Yes |
| No migrations / SQL / RLS / grant / RPC definition changes | Confirmed |
| No env / port / dashboard / deployment changes | Confirmed |
| No user / property / application data mutations | Confirmed |
| No landlord public website changes | Confirmed |
| No publish-checkbox copy change | Confirmed |
| No RP-1.4 | Confirmed |

---

## 4. Test / typecheck / build results

All commands run from `frontend/`.

### Focused + light regression (unit)

```text
npm test -- src/lib/resolvePortalTenantKey.test.ts \
  src/pages/renter/BrowseListingsPage.test.tsx \
  src/pages/renter/ListingDetailPage.test.tsx \
  src/pages/renter/RenterDashboard.test.tsx \
  src/pages/TenantLandingPage.test.tsx --reporter=verbose
```

| Result | Detail |
| --- | --- |
| Exit | 0 |
| Files | 5 passed |
| Tests | **21 passed / 0 failed** |

### Isolated RPC regression (marketplace + landlord public)

```text
npm test -- src/test/rls.marketplace.test.ts src/test/rls.renterApplications.test.ts --reporter=verbose
```

| Result | Detail |
| --- | --- |
| Exit | 0 |
| Files | 2 passed |
| Tests | **21 passed / 0 failed** |

### Typecheck

```text
npm run typecheck
```

| Result | Exit 0 (`tsc --noEmit`) |

### Build

```text
npm run build
```

| Result | Exit 0 (`tsc -b && vite build`; chunk size warning only) |

---

## 5. Manual browser verification (2026-10-21)

### Manual browser cross-tenant detail denial — PASS

Operator-observed Live local session (`npm run dev` / Vite on Live Supabase):

| Fact | Observation |
| --- | --- |
| Signed-in renter portal tenant | `hodan-properties` |
| Hodan browse | Public listing browse for Hodan observed working |
| Hodan own-property detail | Own-property detail observed working |
| Foreign listing source | Property belonging to `darusalam-properties`, identified via that landlord’s **public** listing ID only |
| Foreign property ID | `9ff7aefd-7780-4449-8497-8e1a75e9736a` |
| Negative route (renter remained on Hodan) | `/app/renter/browse/9ff7aefd-7780-4449-8497-8e1a75e9736a` under `hodan-properties` context |
| UI result | **“This listing is unavailable. It may be unlisted, occupied, or no longer published.”** |
| Screenshot | No foreign property details visible |

**Claim boundary:** This evidence supports **manual browser cross-tenant detail denial — PASS** (UI did not show the foreign listing’s details). It does **not** by itself prove the exact server-side denial reason, nor that all Live RPC request/response behavior was independently inspected in DevTools.

### Still unverified / out of scope this record

| Check | Status |
| --- | --- |
| Independent Live Network inspection of every listing RPC payload | **Not claimed** by this manual evidence |
| Live landlord portal / platform-admin UI smoke | **Not run** as part of this evidence record |

---

## 6. Explicit change confirmation

**No database, RLS, grant, RPC definition, SQL, environment, configuration, or deployment changes were made** for this documentation update.

**Original application changes** remain limited to the frontend files listed in §2 (implementation + focused tests). This update only amends this report to record the 2026-10-21 manual browser evidence.

**Deliverable:** `docs/RP-1.3.32_F1_TENANT_SCOPED_BROWSE_FIX_REPORT.md`
