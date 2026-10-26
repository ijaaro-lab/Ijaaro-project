# Phase 6 — Conflict Register

**Status:** Planning artifact only (2026-10-26)  
**Active:** `C:\my projects\Ijaaro-project-main`  
**GitHub checkout:** `C:\my projects\_ijaaro_compare_tmp\github-main` (@ `f8bd11c`, EOL-normalized)  
**Parent plan:** `docs/PHASE6_DETAILED_INTEGRATION_PLAN.md`

Each entry is a **substantive** conflict or intentional one-sided gap that can cause data/behavior loss if resolved blindly. EOL-only pairs (96) are omitted as non-behavioral unless noted.

**Categories:** `SHELL` · `AUTH` · `LANDLORD` · `RENTER_MARKET` · `UTILITY` · `ADMIN` · `TYPES_DEPS` · `SUPABASE` · `DOCS` · `ARTIFACT`

**Decisions:** KEEP LOCAL · IMPORT GITHUB · UNION MERGE · MANUAL REVIEW · EXCLUDE ARTIFACT

---

## CR-001 — App route tree

| Field | Value |
|-------|-------|
| Paths | `frontend/src/App.tsx` (both) |
| Category | SHELL |
| Diff signal | Local 228 lines / GH 225; different imports and route sets |
| Loss risk if GH wins | Lose `/set-password`, public listings/apply/my-applications, landlord renters/applications |
| Loss risk if local wins unchanged | Lose utility `connections`, `staff`, `notifications`, `settings`; AppLoading |
| Recommended | **UNION MERGE** |
| Reviewer decision | Required before Stage 3 |

## CR-002 — AuthProvider session model

| Field | Value |
|-------|-------|
| Paths | `frontend/src/auth/AuthProvider.tsx` |
| Category | AUTH |
| Diff signal | Local 274 / GH 192; local has coherence + stricter refresh |
| Loss risk | Dropping local → session races / signup redirect regressions |
| Recommended | **KEEP LOCAL** |
| Reviewer decision | Confirm; do not “simplify” to GH |

## CR-003 — RoleRoute semantics

| Field | Value |
|-------|-------|
| Paths | `frontend/src/auth/ProtectedRoute.tsx` |
| Category | AUTH |
| Diff signal | Local activeMembership gate vs GH `memberships.some` |
| Loss risk | GH model allows inactive-workspace role match → wrong tenant UI |
| Recommended | **KEEP LOCAL** |
| Reviewer decision | Required (multi-membership UX) |

## CR-004 — Supabase client env guards

| Field | Value |
|-------|-------|
| Paths | `frontend/src/lib/supabase.ts`; local-only `frontend/src/lib/supabaseEnv.ts` |
| Category | AUTH / SUPABASE |
| Diff signal | Local fail-closed `assertDevSupabaseTarget`; GH simple createClient |
| Loss risk | Accidental Live writes during `vite` without allow flag |
| Recommended | **KEEP LOCAL** |
| Reviewer decision | Required — treat as critical |

## CR-005 — LoginPage membership query

| Field | Value |
|-------|-------|
| Paths | `frontend/src/pages/LoginPage.tsx` |
| Category | AUTH |
| Diff signal | Content differs; both risk unscoped membership select |
| Loss risk | AuthZ false positive if RLS returns peer rows |
| Recommended | **KEEP LOCAL** + scheduled security fix (`.eq("user_id", …)`) |
| Reviewer decision | Required at Security Fixes gate |

## CR-006 — AppShell vs appShellNav

| Field | Value |
|-------|-------|
| Paths | `frontend/src/components/layout/AppShell.tsx`; local-only `appShellNav.ts` (+ tests) |
| Category | SHELL |
| Diff signal | Local 396 extracted nav; GH 750 inlined finance utility nav |
| Loss risk | Blind GH → lose nav tests / staff properties-only; blind local → lose finance nav |
| Recommended | **UNION MERGE** (keep extraction; import GH utility link groups) |
| Reviewer decision | Required |

## CR-007 — Landlord dashboard / properties / form / tenancies / payments

| Field | Value |
|-------|-------|
| Paths | `frontend/src/pages/landlord/LandlordDashboard.tsx`, `PropertiesPage.tsx`, `PropertyFormPage.tsx`, `PropertyDetailPage.tsx`, `TenanciesPage.tsx`, `TenancyDetailPage.tsx`, `PaymentsReviewPage.tsx` |
| Category | LANDLORD |
| Diff signal | Local much larger (e.g. form 965 vs 280; tenancies 790 vs 76) |
| Loss risk | GH overwrite destroys photos/rooms/neighborhood/villa/move-out/review UX |
| Recommended | **KEEP LOCAL** (all) |
| Reviewer decision | Batch approve KEEP LOCAL |

## CR-008 — Renter module pages

| Field | Value |
|-------|-------|
| Paths | `frontend/src/pages/renter/*` (all five page files in content_diff) |
| Category | RENTER_MARKET |
| Diff signal | Local substantially larger |
| Loss risk | Lose tenant-scoped browse, payments, tenancy UX |
| Recommended | **KEEP LOCAL** |
| Reviewer decision | Also decide GH `landlord_staff` on renter RoleRoute (**default: do not add**) |

## CR-009 — Marketplace / public / invite local-only surfaces

| Field | Value |
|-------|-------|
| Paths | Local-only: `PublicListingDetailPage.tsx`, `ApplyToRentPage.tsx`, `MyApplicationsPage.tsx`, `SetPasswordPage.tsx`, `InviteRenterPage.tsx`, `ApplicationsPage.tsx`, `LandlordPublicListings.tsx`, `publicListingPhotos.ts`, related tests |
| Category | RENTER_MARKET |
| Diff signal | Absent on GitHub |
| Loss risk | Entire marketplace + invite activation |
| Recommended | **KEEP LOCAL** (never delete during utility import) |
| Reviewer decision | Required acknowledgment |

## CR-010 — Utility dashboard / customers / payments / reports / shared

| Field | Value |
|-------|-------|
| Paths | `frontend/src/pages/utility/UtilityDashboard.tsx`, `CustomersPage.tsx`, `PaymentsReviewPage.tsx`, `ReportsPage.tsx`, `CustomerPaymentsPage.tsx`, `shared.ts` (+ CustomerDetail/Bills/Readings lesser) |
| Category | UTILITY |
| Diff signal | GH much larger (Payments 2363 vs 139; Customers 1234 vs 450; Dashboard 1090 vs 224) |
| Loss risk | Keeping local blocks finance-first utility product; importing without migs/RPCs breaks runtime |
| Recommended | **IMPORT GITHUB** after types/migrations present; **MANUAL REVIEW** whether to retain property-link wizard |
| Reviewer decision | Required |

## CR-011 — GitHub-only utility pages

| Field | Value |
|-------|-------|
| Paths | GH-only: `ConnectionsPage.tsx`, `StaffPage.tsx`, `NotificationsPage.tsx`, `CompanySettingsPage.tsx`, `DirectoryUi.tsx` |
| Category | UTILITY |
| Diff signal | Missing locally |
| Loss risk | Incomplete utility ops if skipped |
| Recommended | **IMPORT FROM GITHUB** |
| Reviewer decision | Required with CR-010 |

## CR-012 — AppLoading + simplePdf

| Field | Value |
|-------|-------|
| Paths | GH-only `frontend/src/components/ui/app-loading.tsx`, `frontend/src/lib/simplePdf.ts` |
| Category | TYPES_DEPS |
| Diff signal | Local absent; Payments/Reports depend on simplePdf |
| Loss risk | Import Payments without simplePdf → build fail |
| Recommended | **IMPORT FROM GITHUB** |
| Reviewer decision | Confirm jspdf **not** required (simplePdf is hand-rolled) |

## CR-013 — package.json / lockfile

| Field | Value |
|-------|-------|
| Paths | `frontend/package.json`, `frontend/package-lock.json` |
| Category | TYPES_DEPS |
| Diff signal | Local live/isolated scripts; GH adds jspdf; lockfile huge |
| Loss risk | Losing env scripts; adding unused jspdf; lock churn |
| Recommended | **UNION** scripts from local; add jspdf only if an import needs it; regenerate lock carefully |
| Reviewer decision | Required |

## CR-014 — database.ts RPC typings

| Field | Value |
|-------|-------|
| Paths | `frontend/src/types/database.ts` |
| Category | TYPES_DEPS |
| Diff signal | Local 816 / GH 792; different RPC sets |
| Loss risk | One-sided types → TS errors or unsafe `as never` |
| Recommended | **UNION MERGE** |
| Reviewer decision | Required |

## CR-015 — supabase/config.toml

| Field | Value |
|-------|-------|
| Paths | `supabase/config.toml` |
| Category | SUPABASE |
| Diff signal | Local has set-password redirect + function JWT sections; GH minimal |
| Loss risk | Break provision-renter redirects / photo fn / rent cron config |
| Recommended | **UNION MERGE** (keep local function + redirect entries) |
| Reviewer decision | Required |

## CR-016 — Protected migration 13

| Field | Value |
|-------|-------|
| Paths | `supabase/migrations/20261013000013_security_isolation_hardening.sql` |
| Category | SUPABASE |
| Diff signal | SUBSTANTIVE: local conditional REVOKE vs GH bare REVOKE; SHA-256 local/backup `00B056D2…EE1D` |
| Loss risk | GH overwrite breaks disposable reset story; policy drift |
| Recommended | **KEEP LOCAL** (immutable for this integration) |
| Reviewer decision | **Hard gate** — must approve KEEP LOCAL |

## CR-017 — Local-only migrations (8)

| Field | Value |
|-------|-------|
| Paths | `supabase/migrations/20261018143031_*.sql`, `…18220000_*.sql`, `…21120000_*.sql`, `…22200000_*.sql`, `…24120000_*.sql`, `…24133000_*.sql`, `…24140000_*.sql`, `…24150000_*.sql` |
| Category | SUPABASE |
| Diff signal | GitHub absent |
| Loss risk | Marketplace isolation, photos, rent charges, villa/rooms gone from source tree |
| Recommended | **KEEP LOCAL** (files); DB apply later isolated |
| Reviewer decision | Acknowledge ordering vs GH utility migs |

## CR-018 — GitHub-only migrations (12)

| Field | Value |
|-------|-------|
| Paths | `20261018000001` … `20261021000004` utility set (see Phase 6 plan §7) |
| Category | SUPABASE / UTILITY |
| Diff signal | Local absent |
| Loss risk | Utility UI cannot function; Live apply without gap analysis dangerous |
| Recommended | **IMPORT FROM GITHUB** as **source files only** now; apply only after isolated rehearsal + Live history review |
| Reviewer decision | Split: (a) import files (b) apply DB — separate approvals |

## CR-019 — Edge functions one-sided

| Field | Value |
|-------|-------|
| Paths | Local-only: `provision-renter`, `public-listing-photos`, `generate-monthly-rent-charges`; GH-only: `provision-company-customer`, `provision-company-staff` |
| Category | SUPABASE |
| Diff signal | Complementary |
| Loss risk | Blind sync either way drops invite/photos/rent cron **or** company provisioning |
| Recommended | **KEEP** local three; **IMPORT** GH two |
| Reviewer decision | Required |

## CR-020 — Admin tenant / utility ops pages

| Field | Value |
|-------|-------|
| Paths | `frontend/src/pages/admin/TenantsPage.tsx`, `TenantDetailPage.tsx`, `AdminUtilityOpsPage.tsx`, `AdminPaymentsPage.tsx`, `AdminPropertiesPage.tsx`, `SuperAdminDashboard.tsx` |
| Category | ADMIN |
| Diff signal | Mixed sizes (GH Tenants/TenantDetail larger; local AdminUtilityOps larger) |
| Loss risk | Lose local ops tooling or GH delete_tenant UX |
| Recommended | **MANUAL REVIEW** per file; couple with GH `update_tenant`/`delete_tenant` mig |
| Reviewer decision | Required |

## CR-021 — Landing templates / charts / CSS / format / metric-card

| Field | Value |
|-------|-------|
| Paths | `components/landing/templates/*`, `SimpleCharts.tsx`, `index.css`, `lib/format.ts`, `metric-card.tsx` |
| Category | SHELL |
| Diff signal | Content differs; often cosmetic |
| Loss risk | Low–medium visual regressions |
| Recommended | **MANUAL REVIEW**; default **KEEP LOCAL** unless GH fixes a known bug |
| Reviewer decision | Optional batch |

## CR-022 — AccountPage / TenantLandingPage / roles.ts / tenant.ts

| Field | Value |
|-------|-------|
| Paths | `AccountPage.tsx`, `TenantLandingPage.tsx`, `lib/roles.ts`, `lib/tenant.ts` |
| Category | AUTH / RENTER_MARKET |
| Diff signal | Local richer Account/Landing; roles/tenant mostly keep local |
| Recommended | **KEEP LOCAL** |
| Reviewer decision | Light |

## CR-023 — Test suites divergence

| Field | Value |
|-------|-------|
| Paths | `frontend/src/test/rls.*.test.ts`; local-only many auth/marketplace tests; GH `membershipWriteHardening` / `provisionStaff` richer in places |
| Category | AUTH / UTILITY |
| Diff signal | Line counts diverge both ways |
| Loss risk | Dropping either side reduces regression coverage |
| Recommended | **UNION** — keep all local tests; merge useful GH assertions |
| Reviewer decision | After UI/RPC union |

## CR-024 — .gitignore / env examples

| Field | Value |
|-------|-------|
| Paths | `.gitignore`, `.env.example`, `frontend/.env.example` |
| Category | SUPABASE / ARTIFACT |
| Diff signal | Phase 5 proposed ignore; env example key sets differ |
| Loss risk | Secret commit; missing documented keys |
| Recommended | **UNION** via Phase 5 `PROPOSED_gitignore`; merge example **key names only** |
| Reviewer decision | Before first commit |

## CR-025 — README / PROJECT_ROADMAP / WATER doc

| Field | Value |
|-------|-------|
| Paths | `README.md`, `PROJECT_ROADMAP.md`; GH-only `docs/WATER_COMPANY_DASHBOARD.md` |
| Category | DOCS |
| Recommended | **MANUAL** merge docs; **IMPORT** water dashboard doc |
| Reviewer decision | Optional |

## CR-026 — search_properties_for_link UUID scope (shared behavior debt)

| Field | Value |
|-------|-------|
| Paths | Same function body in both mig 13 copies (local protected) |
| Category | SUPABASE |
| Diff signal | Not a tree conflict; shared design issue |
| Loss risk | Cross-tenant property metadata via UUID |
| Recommended | **MANUAL REVIEW** → future **new** migration (do not edit mig 13 in place if already applied) |
| Reviewer decision | Security Fixes / DB gates |

## CR-027 — Generated / local artifacts

| Field | Value |
|-------|-------|
| Paths | `supabase/.temp/**`, `frontend/.smoke-*.json`, `frontend/.vitest/**`, `frontend/.local/**`, `system-design.pen` (binary_diff) |
| Category | ARTIFACT |
| Recommended | **EXCLUDE AS GENERATED/LOCAL-ONLY ARTIFACT** |
| Reviewer decision | Confirm ignore rules before Git init |

## CR-028 — Integration repo vs active tree

| Field | Value |
|-------|-------|
| Paths | `C:\my projects\Ijaaro-project-integrate` (HEAD `d7cf5c0`) vs active (no git) vs `origin/main` `f8bd11c` |
| Category | SHELL |
| Diff signal | Integrate is clean reference; not the working app |
| Loss risk | Accidentally “syncing” from wrong tree |
| Recommended | Do not modify integrate; use compare checkout / origin/main as GH tip |
| Reviewer decision | Acknowledge |

---

## Priority reviewer queue (highest first)

1. CR-016 protected mig 13  
2. CR-004 supabase env guards  
3. CR-001 / CR-006 App + nav union  
4. CR-003 RoleRoute semantics  
5. CR-010 / CR-011 / CR-018 utility import + migrations  
6. CR-009 / CR-017 local marketplace preservation  
7. CR-005 / CR-026 security fixes  
8. CR-013 / CR-014 / CR-015 deps, types, config  
9. CR-020 admin pages  
10. Remaining MANUAL / docs / artifacts  

---

## Confirmation

This register is documentation only. No conflict resolutions were applied to source trees.
