# RP-1.3 — Tenancy Display Fix Report

**Date:** 2026-10-21  
**Scope:** Display-only fix for landlord Tenancy list + detail (audit D1/D2)  
**Mode:** Implementation + local verification; no Live DB / schema / billing changes  

---

## 1. Summary

Landlord Tenancies list and Tenancy detail now show **renter name** and **property name** as primary labels. Abbreviated assignment and property UUIDs remain as secondary troubleshooting text. Missing related records fall back to **Unknown renter** / **Unknown property**.

No rent math, charges, payments, move-out, migrations, RLS, RPCs, env, or Live data were changed.

---

## 2. Changed files

| File | Change |
| --- | --- |
| `frontend/src/lib/tenancyDisplay.ts` | Shared `propertyLabel` / `renterLabel` / `shortId` helpers |
| `frontend/src/lib/tenancyDisplay.test.ts` | Unit tests for label fallbacks |
| `frontend/src/pages/landlord/TenanciesPage.tsx` | Load tenant-scoped properties + `list_same_tenant_member_profiles`; render names |
| `frontend/src/pages/landlord/TenancyDetailPage.tsx` | Same enrichment; heading/summary use names; short ids secondary |
| `frontend/src/pages/landlord/TenanciesPage.test.tsx` | Name render, missing related, tenant-scoped query assertions |
| `frontend/src/pages/landlord/TenancyDetailPage.test.tsx` | Name render, missing related, foreign-tenant empty result |
| `docs/RP-1.3_TENANCY_DISPLAY_FIX_REPORT.md` | This report |

---

## 3. Behavior

### Data access (tenant-scoped; existing patterns)

| Need | Approach |
| --- | --- |
| Assignments | `rental_assignments` filtered by `activeMembership.tenant_id` (list); detail also `.eq("tenant_id", tenantId)` |
| Property names | `properties` select `id, name, address_line` filtered by same `tenant_id` (RLS + client filter) |
| Renter names | Existing RPC `list_same_tenant_member_profiles(p_tenant_id)` (gated by `can_manage_landlord_ops`) |

No new RPCs, no direct `profiles` table reads, no cross-tenant queries.

### UI

| Surface | Primary | Secondary |
| --- | --- | --- |
| List row link | Renter label | Property label under link; mono short assignment + property ids |
| Detail heading | Renter label | Property label; status/dates; short ids |
| Detail summary card | Renter + linked property name | Rent / due day unchanged |

### Fallbacks

- Property: `name` → `address_line` → `Unknown property`
- Renter: `full_name` → `email` → `Unknown renter` (e.g. inactive membership no longer returned by the RPC)

---

## 4. Verification

| Check | Result |
| --- | --- |
| `vitest` tenancyDisplay + TenanciesPage + TenancyDetailPage | **9 passed** |
| `npm run typecheck` | **PASS** |
| `npm run build` | **PASS** |

Commands:

```bash
npx vitest run src/lib/tenancyDisplay.test.ts src/pages/landlord/TenanciesPage.test.tsx src/pages/landlord/TenancyDetailPage.test.tsx
npm run typecheck
npm run build
```

---

## 5. Not verified / limitations

| Item | Notes |
| --- | --- |
| Live browser smoke on Hodan fixture | Not run in this step; refresh `/app/landlord/tenancies` in existing `npm run dev` session to confirm |
| Historical renter no longer an active member | RPC omits them → **Unknown renter** by design (no schema/RPC change) |
| Billing / payment / move-out | Untouched; not re-tested beyond compile |
| Isolated `rls.rental.test.ts` | Not re-run (mutating; out of display scope) |

---

## 6. Residual product notes (unchanged)

Stub-month full rent / proration (audit C1) and payment-review party labels remain out of scope for this fix.
