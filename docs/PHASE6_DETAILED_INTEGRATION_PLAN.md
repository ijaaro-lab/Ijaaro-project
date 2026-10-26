# Phase 6 — Detailed Lossless Integration Plan

**Status:** COMPLETE (analysis and planning only — no source integration, Git init, merge, migration apply, or Live DB work)  
**Date:** 2026-10-26  
**Active project:** `C:\my projects\Ijaaro-project-main`  
**Official remote:** `https://github.com/ijaaro-lab/ijaaro-project.git`  
**Reference `main`:** `f8bd11cc7d304f193929060b1f57f32636e6544a`  
**Comparison checkout:** `C:\my projects\_ijaaro_compare_tmp\github-main`  
**Integration repo:** `C:\my projects\Ijaaro-project-integrate`  
**Phase 5 backup:** `C:\my projects\_ijaaro_phase5_backup_20261026_111543`

**Companion artifacts:**

- `docs/PHASE6_CONFLICT_REGISTER.md`
- `docs/PHASE6_APPROVAL_CHECKLIST.md`
- Prior: `docs/PHASE5_SAFE_GIT_SETUP_REPORT.md`
- Phase 4 lists: `C:\my projects\_ijaaro_compare_tmp\report\` (`only_local.txt`, `only_remote.txt`, `content_diff.txt`, `eol_only.txt`)

---

## 1. Executive summary

The active local tree is a **superset of landlord / renter / marketplace / auth** work on top of an earlier shared baseline. GitHub `main` @ `f8bd11c` is a **superset of utility-company finance ops** (houses, flat billing, staff/customer provisioning, staff payment approval, company settings/notifications). Neither side can replace the other without feature loss.

**Recommended strategy (future phases only):** keep the active working tree as the integration base; preserve all local-only landlord/renter/marketplace/auth assets; **import** GitHub-only utility pages, migrations, edge functions, and helpers; **union-merge** shared shells (`App.tsx`, nav, `database.ts`, `package.json`, `config.toml`); **KEEP LOCAL** for the protected migration `20261013000013_security_isolation_hardening.sql` and for environment/session guards.

**Phase A reference checks:** **PASSED** (with documented notes). See §2.

**This phase changed only planning documents under `docs/`. Application source, Git state, env files, migrations, Edge Functions, and database state were not modified.**

---

## 2. Phase A — Source reference verification

| Check | Result |
|-------|--------|
| Active path `C:\my projects\Ijaaro-project-main` | Present; top-level `frontend`, `supabase`, `docs`, `backend`, `scripts` |
| Active `.git` | **Absent** (unchanged from Phase 5) |
| Comparison checkout path | Present at `C:\my projects\_ijaaro_compare_tmp\github-main` |
| Comparison `.git` | **Absent** (export/copy, not a live clone) |
| Content vs `f8bd11c` | **EOL-normalized match** for sampled tip files (`App.tsx`, `package.json`, `config.toml`, `.gitignore`, mig 13, `roles.ts`, `UtilityDashboard.tsx`, `provision-company-staff`) — raw bytes differ by CRLF only |
| `origin/main` on integrate repo | `f8bd11cc7d304f193929060b1f57f32636e6544a` |
| Integration repo | Present; **clean** working tree; branch `integration/local-ijaaro-work` @ `d7cf5c0` (ancestor of merge commit `f8bd11c`); **not modified** this phase |
| Phase 5 backup | Present; `report/verification.txt` → `BACKUP_VERIFIED=True`, counts 354/354 |
| Protected mig 13 SHA-256 (active = backup) | `00B056D20D96FB9D01BE35D9A64FDFCC9420742D5E1F82A01E6B36D25027EE1D` — **match** |

**Discrepancies / notes (non-blocking for planning):**

1. Phase 4 “source file” counts (347 vs 203) used a narrower inventory than Phase 5 (354). Revalidation this phase: ~313 vs ~182 extension-filtered source-ish files after excluding `node_modules` / `dist` / caches / `.temp` / smoke artifacts — **directionally consistent** (local >> GitHub).
2. Phase 4 lists remain usable: **167** only-local lines, **23** only-remote, **65** content-diff, **96** EOL-only, **1** binary (`system-design.pen`).
3. Integrate HEAD is not `f8bd11c`; `origin/main` is. Treat integrate as an **untouched reference clone**, not as the active workspace.
4. Active tree is **not** recoverable from Git until a future approved init — backup is the recovery path.

---

## 3. Feature-by-feature integration matrix

Legend for **Recommended decision:** KEEP LOCAL · IMPORT GITHUB · UNION · MANUAL REVIEW · EXCLUDE ARTIFACT

### 3.1 Landlord

| Feature/module | Active local | GitHub main | Decision | Exact files | Dependencies | Auth / roles | Tenant isolation | Tests required | Risk | Evidence / open questions |
|----------------|--------------|-------------|----------|-------------|--------------|--------------|------------------|----------------|------|---------------------------|
| Dashboard | Rich admin + staff split via `LandlordHome` → `LandlordDashboard` / `StaffDashboard` | Thin `LandlordDashboard` (~155 lines vs ~443) | **KEEP LOCAL** | `pages/landlord/LandlordHome.tsx`, `LandlordDashboard.tsx`, `StaffDashboard.tsx` | Memberships, properties counts | `landlord_admin` / `landlord_staff` | `activeMembership.tenant_id` | Existing landlord dashboard/smoke | Low | Local is strictly more complete |
| Properties list | Full search, listing visibility, delete rules (~804 lines) | Minimal (~117) | **KEEP LOCAL** | `PropertiesPage.tsx` (+ `.test.tsx`) | `properties` RLS | RoleRoute landlord | RLS + tenant filters | `PropertiesPage.test.tsx` | Low | Do not regress listing toggles |
| Property form | Photos, rooms, neighborhood, villa (~965) | Basic form (~280) | **KEEP LOCAL** | `PropertyFormPage.tsx` | storage `property-photos`, mig rooms/villa | staff can edit; delete limits | `tenant_id` on create | `PropertyFormPage.test.tsx` | Medium | GitHub lacks rooms/neighborhood/villa UX |
| Property detail / move-out | Full assign/move-out (~492) | Smaller (~326) | **KEEP LOCAL** | `PropertyDetailPage.tsx` (+ moveOut test) | assign-renter, complete-move-out | landlord roles | UI checks `tenant_id`; RLS must enforce | move-out tests | Medium | Client loads by id only — RLS critical |
| Tenancies | Full list/detail (~790 / ~663) | Stub-like (~76 / ~198) | **KEEP LOCAL** | `TenanciesPage.tsx`, `TenancyDetailPage.tsx` | rent ledger | `landlord_admin` | tenant-scoped queries | page tests | Low | |
| Rent payments / charges | Review UX + rejection reason; monthly charge generator | Minimal review page | **KEEP LOCAL** | `PaymentsReviewPage.tsx`; mig `…21120000…`, `…24120000…`; fn `generate-monthly-rent-charges` | `review_rent_payment`, cron secret | landlord_admin | assignment-scoped | payment + migration tests | Medium | Preserve rejection-reason contract |
| Invite / applications | `InviteRenterPage`, `ApplicationsPage` | **Absent** | **KEEP LOCAL** | those pages + routes | `provision-renter`, `manage_membership` | landlord_admin | landlord tenant | invite/provision tests | Medium | Must keep routes in App union |
| Staff members | Present | Present | **KEEP LOCAL** (behavior) | `StaffMembersPage.tsx` | `manage_membership`, provision-staff | landlord_admin only | tenant | staff authz tests | Low | Align with local membership hardening |
| Landlord nav | `appShellNav.ts` properties-only staff | Inlined AppShell | **KEEP LOCAL nav model** + extend for utility | `appShellNav.ts`, `AppShell.tsx` | roles | role-based links | active membership | `appShellNav.test.ts` | Medium | Union with GitHub finance utility nav |

### 3.2 Renter

| Feature/module | Active local | GitHub | Decision | Files | Deps | Auth | Isolation | Tests | Risk | Notes |
|----------------|--------------|--------|----------|-------|------|------|-----------|-------|------|-------|
| Dashboard / payments / tenancy | Full pages + tests | Thin stubs | **KEEP LOCAL** | `renter/*` | rent tables | `renter` + `landlord_admin` (local); GitHub also allows `landlord_staff` | tenant | renter page tests | Medium | **Do not** blindly add `landlord_staff` to renter RoleRoute without product decision |
| Browse / listing detail | Tenant-scoped browse RPCs | Thin | **KEEP LOCAL** | `BrowseListingsPage`, `ListingDetailPage` | `list_landlord_public_listings` | auth RoleRoute | F1 tenant-scoped browse | browse tests | Medium | Preserve F1 fix |
| Applications / my-applications | Public+auth hybrid | Absent | **KEEP LOCAL** | `ApplyToRentPage`, `MyApplicationsPage` | application RPCs | public routes + session for writes | `?tenant=` | application RLS tests | Medium | |
| Invitations / set-password | Full flow | Absent `/set-password` | **KEEP LOCAL** | `SetPasswordPage`, redirect helpers, config.toml redirect | Auth invite | invite session | N/A | set-password tests | High if dropped | Required for provision-renter |

### 3.3 Marketplace and public listings

| Feature/module | Active local | GitHub | Decision | Files | Deps | Auth | Isolation | Tests | Risk | Notes |
|----------------|--------------|--------|----------|-------|------|------|-----------|-------|------|-------|
| Public listing routes | `/listings/:id`, landing embeds | Absent | **KEEP LOCAL** | `PublicListingDetailPage`, `LandlordPublicListings` | public RPCs + edge photos | anon allowed for listed | tenant slug required | public listing tests | High if dropped | |
| Photo handling | `publicListingPhotos` + edge fn | Absent | **KEEP LOCAL** | `lib/publicListingPhotos.ts`, `functions/public-listing-photos` | storage, config.toml `verify_jwt` | anon JWT | eligibility inside fn | photo eligibility tests | Medium | |
| Search/filters | Browse filters local | Thin | **KEEP LOCAL** | browse pages | RPCs | auth | tenant | | Low | |
| Rooms / neighborhood | Columns + public detail RPC | Absent | **KEEP LOCAL** | mig `…24140000`, `…24150000`, PropertyForm | properties columns | | | form/listing tests | Low | |
| Marketplace field isolation | Migration present | Absent | **KEEP LOCAL** | `…18220000_marketplace_field_isolation.sql` | RLS/RPC rewrite | | cross-tenant listed isolation | marketplace RLS tests | High | Do not apply GitHub utility migs without this in history plan |

### 3.4 Authentication and authorization

| Feature/module | Active local | GitHub | Decision | Files | Deps | Notes | Risk |
|----------------|--------------|--------|----------|-------|------|-------|------|
| AuthProvider | Session coherence, signup redirects, user_id-scoped memberships | Simpler load | **KEEP LOCAL** | `AuthProvider.tsx`, `authSessionCoherence.ts` | supabase client | Preserve coherence | High |
| ProtectedRoute / RoleRoute | **Active membership** gate | **Any matching membership** (`memberships.some`) | **KEEP LOCAL** (stricter) | `ProtectedRoute.tsx` | roles | Manual review if multi-membership UX breaks utility switch | High |
| roles.ts | workspace home paths | Similar + comments | **UNION** if needed | `roles.ts` | tenants | Keep local helpers | Low |
| LoginPage | Tenant portal + **membership query missing `user_id`** | Similar risk likely | **KEEP LOCAL** + **security fix gate** | `LoginPage.tsx` | roles | See §6 | High |
| Set-password / invites | Present | Absent | **KEEP LOCAL** | SetPassword*, inviteRenter*, provision-renter | | | High |
| Tenant context | `TenantSlugSync`, `tenant.ts`, AppShell selector | Present (simpler) | **KEEP LOCAL** | those files | | | Medium |
| Registration / workspace | `register-workspace-admin` + self_provision | Present | **KEEP LOCAL** callers; review fn | CreateWorkspacePage, edge fn | service role create user | See §6 | High |
| supabaseEnv guards | Present (`assertDevSupabaseTarget`) | Absent | **KEEP LOCAL** | `supabase.ts`, `supabaseEnv.ts` | env flags | Never import GitHub supabase.ts wholesale | Critical |

### 3.5 Utility companies

| Feature/module | Active local | GitHub | Decision | Files | Deps | Auth | Isolation | Tests | Risk | Notes |
|----------------|--------------|--------|----------|-------|------|------|-----------|-------|------|-------|
| Dashboards | Basic KPIs (~224) | Finance-first ops/customer (~1090) | **IMPORT GITHUB** (replace local page) | `UtilityDashboard.tsx` | accounts/bills/payments; `list_company_member_profiles` | utility_* | `tenant_id` filters | utility RLS + UI | Medium | Requires GH migrations |
| Company settings | Absent | `CompanySettingsPage` → branding | **IMPORT** | `CompanySettingsPage.tsx` | branding | utility_admin | tenant | | Low | |
| Connections / Houses | Absent | `ConnectionsPage` + `register_utility_house` | **IMPORT** | page + migs | flat bill RPCs | utility ops | `can_manage_utility_ops` | isolation probe | High | Core GH feature |
| Customers | Property-link wizard (~450) | Finance directory + provision (~1234) | **IMPORT GITHUB** with **MANUAL REVIEW** of legacy link path | `CustomersPage.tsx`, `DirectoryUi.tsx` | `provision-company-customer`, register/update RPCs | admin/staff | ops gates | | High | Decide whether to retain `search_properties_for_link` path |
| Staff management | Absent | `StaffPage` + provision-company-staff | **IMPORT** | StaffPage, edge fn | `manage_membership` | utility_admin | tenant | | Medium | |
| Staff payment approval | Local review admin-oriented (~139) | Full finance hub (~2363) + staff approve mig | **IMPORT GITHUB** | `PaymentsReviewPage.tsx`, mig `…21000001…` | many RPCs, `simplePdf` | admin+staff approve | tenant | | High | Doc says admin-only; code allows staff |
| Notifications | Absent | Derived alerts page | **IMPORT** | `NotificationsPage.tsx` | bills/payments/meters | utility roles | tenant | | Low | |
| Billing / charges / batch / ahead | Meter `generate_utility_bill` only | Flat bill upsert, adhoc, adjust, months-ahead, batch | **IMPORT** migrations + Payments UI | migs `20261019*`–`20261021*`, BillsPage union as needed | | ops | | High | |
| Customer provisioning | Absent | edge `provision-company-customer` | **IMPORT** | function dir | service role env names | utility admin/staff | tenant_id body | authz tests | High | |
| Company staff provisioning | Absent | edge `provision-company-staff` | **IMPORT** | function dir | manage_membership | utility_admin | | | Medium | |
| Meters / readings / classic bills | Present both | Present | **UNION / KEEP meters routes** | Meters, Readings, Bills | phase3 RPCs | | | | Low | Keep routes even if nav is finance-first |
| Utility nav | Meter-centric `appShellNav` | Finance-first in AppShell | **UNION** | nav + AppShell | | hide customer-inappropriate links | | Medium | Prefer extracted `appShellNav` + GH link set |
| Isolation probe | Absent | `utility_tenant_isolation_probe.sql` | **IMPORT** | supabase/tests | isolated DB only | | | High value | Never run against Live in planning |

### 3.6 Shared infrastructure

| Feature/module | Active local | GitHub | Decision | Notes | Risk |
|----------------|--------------|--------|----------|-------|------|
| App.tsx | Marketplace + set-password + limited utility routes | Extra utility routes; AppLoading; no marketplace | **UNION MERGE** | See §4 | Critical |
| AppShell / appShellNav | Extracted nav + tests | Monolithic finance utility nav | **UNION** | Keep extraction; import GH utility link groups | High |
| roles.ts | Local helpers | Near-parity | **KEEP LOCAL** / minor UNION | | Low |
| types/database.ts | Landlord/marketplace RPCs | Utility Phase-6 RPCs | **UNION** | Merge RPC typings both ways | High |
| supabase client / env | Guards + live/isolated scripts | Simple client | **KEEP LOCAL** | | Critical |
| config.toml | set-password redirect + function JWT flags | Minimal auth redirects | **UNION** | Keep local function sections + set-password URL | High |
| package.json | `env:live`, `dev:isolated`; no jspdf | `jspdf` dep; simple `dev` | **UNION** | Keep local scripts; add jspdf **only if** needed — `simplePdf.ts` does **not** import jspdf | Medium |
| .gitignore | Local | Proposed Phase 5 PROPOSED_gitignore from main+hardening | **UNION** via Phase 5 proposal | Apply only after approval | Medium |
| Shared UI | metric-card, charts differ | AppLoading, simplePdf | **IMPORT** AppLoading + simplePdf; **MANUAL** charts/landing | Landing templates mostly EOL/cosmetic | Low–Med |
| PDF | N/A | `simplePdf.ts` (hand-rolled) | **IMPORT** simplePdf; treat jspdf as optional/orphan | | Low |
| Tests | Broad local auth/renter/marketplace | Utility RLS richer in places | **UNION** keep all local tests; import/adapt GH utility tests | | Medium |
| Docs | Many RP-*/STEP-* local | WATER_COMPANY_DASHBOARD.md | **KEEP local docs**; **IMPORT** water doc | | Low |
| Artifacts | `.temp`, `.smoke-*`, `.vitest`, `.local` | — | **EXCLUDE** | Do not commit | — |

---

## 4. Phase C — File-level merge plan (substantive conflicts)

Decision vocabulary: **KEEP LOCAL** · **IMPORT FROM GITHUB** · **UNION MERGE** · **MANUAL REVIEW REQUIRED** · **EXCLUDE AS GENERATED/LOCAL-ONLY ARTIFACT**

### 4.1 Critical union / keep files

| Path | Decision | Preserve from local | Preserve from GitHub |
|------|----------|---------------------|----------------------|
| `frontend/src/App.tsx` | **UNION** | `/set-password`, `/listings/:id`, `/apply`, `/my-applications`, landlord `/renters` `/applications`, local RoleRoute allow-lists (no silent `landlord_staff` on renter), TenantSlugSync | `AppLoading`; routes `connections`, `staff`, `notifications`, `settings` under water/electricity |
| `frontend/src/auth/AuthProvider.tsx` | **KEEP LOCAL** | Session coherence, refreshMemberships `user_id`, signup redirects | — |
| `frontend/src/auth/ProtectedRoute.tsx` | **KEEP LOCAL** | `activeMembershipAllowsRoute`; may adopt `AppLoading` visually | Do **not** switch to `memberships.some` without approval |
| `frontend/src/lib/supabase.ts` | **KEEP LOCAL** | `assertDevSupabaseTarget` fail-closed | — |
| `frontend/src/lib/supabaseEnv.ts` | **KEEP LOCAL** (local-only file) | Env target guards | — |
| `frontend/src/lib/roles.ts` | **KEEP LOCAL** / light UNION | All local helpers | Any GH comments/path tweaks if missing |
| `frontend/src/lib/tenant.ts` | **KEEP LOCAL** | Portal tenant resolution | — |
| `frontend/src/components/layout/AppShell.tsx` | **UNION** | Multi-membership selector, `appShellNav` usage, tests | Finance-first utility titles/links, electricity accent if desired |
| `frontend/src/components/layout/appShellNav.ts` | **KEEP LOCAL structure** + **extend** | Extracted nav + staff properties-only | Add GH utility finance links (connections, staff, settings, notifications); demote meters in default nav |
| `frontend/src/types/database.ts` | **UNION** | Marketplace/rent/landlord RPC types | Utility Phase-6 RPC types (`register_utility_house`, flat bills, `list_company_member_profiles`, `update_tenant`/`delete_tenant`, etc.) |
| `frontend/package.json` | **UNION** | `env:live`, `dev:isolated`, scripts | Add runtime dep only if PDF stack requires — prefer importing `simplePdf` without jspdf |
| `frontend/package-lock.json` | **MANUAL** regenerate after package.json decision | — | — |
| `supabase/config.toml` | **UNION** | `/set-password` redirect; `[functions.public-listing-photos]`; `[functions.generate-monthly-rent-charges]` | Keep shared baseline ports/auth; do not drop local function blocks |
| `.gitignore` | **UNION** via Phase 5 `PROPOSED_gitignore` | Existing secret ignores | `supabase/.temp/`, smoke/vitest/coverage patterns, `!frontend/.env.example` |
| `supabase/migrations/20261013000013_security_isolation_hardening.sql` | **KEEP LOCAL** (PROTECTED) | Conditional `REVOKE` via `to_regprocedure` for disposable resets | Do **not** take GitHub bare `REVOKE` |
| `frontend/src/pages/LoginPage.tsx` | **KEEP LOCAL** + security fix gate | Portal routing | Fix `user_id` filter (future approved fix) |
| `frontend/src/pages/AccountPage.tsx` | **KEEP LOCAL** | Richer account UX | Spot-check GH for missing fields |
| `frontend/src/pages/TenantLandingPage.tsx` | **KEEP LOCAL** | Public listings embed | |
| Landlord/renter pages in content_diff | **KEEP LOCAL** | All richer implementations | |
| Utility pages in content_diff | **IMPORT GITHUB** (except keep meter pages if GH regresses) | Optional: retain local link-property wizard behind flag — **MANUAL REVIEW** | Finance UX, DirectoryUi, Connections, Staff, Notifications, Settings, expanded Payments/Customers/Dashboard/Reports/shared |
| Admin pages (content_diff) | **MANUAL REVIEW** | Local AdminUtilityOps / payments differences | GH TenantsPage/TenantDetail richer tenant delete UX may need `update_tenant`/`delete_tenant` migs |
| Landing templates / charts / metric-card / format / index.css | **MANUAL REVIEW** / mostly **KEEP LOCAL** if cosmetic | Local SiteChrome richer | Import only if GH fixes bugs |
| RLS test files | **UNION** | Keep local marketplace/renter/membership tests | Merge useful GH utility assertions |
| `README.md`, `PROJECT_ROADMAP.md` | **MANUAL REVIEW** | Local roadmap truth | Mention utility finance features |
| `.env.example`, `frontend/.env.example` | **UNION** keys only | Local isolated/live key **names** | GH keys; **never** copy secret values |
| `system-design.pen` | **EXCLUDE** / binary ignore | — | binary_diff |

### 4.2 GitHub-only source (IMPORT)

From `only_remote.txt` (23):

- `docs/WATER_COMPANY_DASHBOARD.md`
- `frontend/src/components/ui/app-loading.tsx`
- `frontend/src/lib/simplePdf.ts`
- `frontend/src/pages/utility/CompanySettingsPage.tsx`
- `frontend/src/pages/utility/ConnectionsPage.tsx`
- `frontend/src/pages/utility/DirectoryUi.tsx`
- `frontend/src/pages/utility/NotificationsPage.tsx`
- `frontend/src/pages/utility/StaffPage.tsx`
- `supabase/functions/provision-company-customer/index.ts`
- `supabase/functions/provision-company-staff/index.ts`
- Twelve utility migrations listed in §7
- `supabase/tests/utility_tenant_isolation_probe.sql`

### 4.3 Local-only source (KEEP; do not delete)

Critical non-doc examples from `only_local.txt`:

- Marketplace/public/auth pages and libs (`PublicListingDetailPage`, `ApplyToRentPage`, `SetPasswordPage`, `publicListingPhotos`, `inviteRenter`, `provisionRenter`, `supabaseEnv`, `appShellNav`, …)
- Edge: `provision-renter`, `public-listing-photos`, `generate-monthly-rent-charges`
- Eight local-only migrations (§7)
- Tests/scripts for live/isolated smoke
- **EXCLUDE ARTIFACTS:** `frontend/.smoke-*.json`, `frontend/.vitest/**`, `frontend/.local/**`, `supabase/.temp/**`

### 4.4 EOL-only (96 files)

Treat as **KEEP LOCAL content** with optional later EOL normalization. No behavior merge required. Do not “resolve” by overwriting with GitHub CRLF/LF variants.

---

## 5. Phase D — Routing and role integration

### 5.1 Route matrix (post-integration target)

| URL pattern | Component | Intended role | Auth | Tenant context | Current source | Integration decision | Tests |
|-------------|-----------|---------------|------|----------------|----------------|----------------------|-------|
| `/` | HomeEntry / TenantLanding / Landing | public / session redirect | optional | slug if portal | both (local richer landing) | KEEP LOCAL HomeEntry; optional AppLoading | landing tests |
| `/login` | LoginPage | public | no | `?tenant=` | both | KEEP LOCAL + security fix | login/session |
| `/signup` | SignupPage | public | no | optional | both | KEEP LOCAL | signup redirect tests |
| `/set-password` | SetPasswordPage | invitee | session from invite | optional | **local only** | **KEEP** | SetPassword tests |
| `/create-workspace` | CreateWorkspacePage | public | no | n/a | both | KEEP LOCAL | |
| `/listings/:id` | PublicListingDetailPage | public | no | `?tenant=` required | **local** | **KEEP** | public listing tests |
| `/apply` | ApplyToRentPage | public | for submit | tenant+property | **local** | **KEEP** | application tests |
| `/my-applications` | MyApplicationsPage | hybrid | for data | tenant | **local** | **KEEP** | |
| `/app` | OverviewPage | any member | yes | active | both | KEEP | |
| `/app/account` | AccountPage | any | yes | active | local richer | KEEP LOCAL | Account tests |
| `/app/branding` | WorkspaceBrandingPage | admin (nav) | yes | active | both | KEEP; utility settings wraps it | |
| `/app/landlord` … properties CRUD | landlord pages | landlord_admin/staff | yes | landlord | local | KEEP LOCAL components | |
| `/app/landlord/staff|tenancies|payments|renters|applications` | admin tools | landlord_admin | yes | landlord | local (+ GH lacks renters/applications) | KEEP all local routes | |
| `/app/renter/*` | renter pages | renter (+ landlord_admin local) | yes | landlord | local | KEEP LOCAL allow-list; **MANUAL** on GH `landlord_staff` | RoleRoute tests |
| `/app/water` & `/app/electricity` | UtilityDashboard | utility_* | yes | water/elec | both → GH UI | IMPORT GH page | |
| `…/customers`, `…/customers/:id` | Customers*, Detail | utility ops / view | yes | | GH richer | IMPORT GH Customers | |
| `…/connections` | ConnectionsPage | utility ops | yes | | **GH only** | **ADD** | |
| `…/meters|readings|bills` | meter stack | utility ops | yes | | both | KEEP routes (nav optional) | |
| `…/payments` | Utility PaymentsReview | ops (+ staff approve GH) | yes | | **IMPORT GH** | |
| `…/reports` | ReportsPage | ops | yes | | IMPORT GH | |
| `…/staff` | StaffPage | utility_admin | yes | | **GH** | **ADD** | |
| `…/notifications` | NotificationsPage | utility | yes | | **GH** | **ADD** | |
| `…/settings` | CompanySettingsPage | utility_admin | yes | | **GH** | **ADD** | |
| `…/my-bills`, `…/my-payments` | customer pages | utility_customer | yes | | both → prefer GH payments if richer | UNION/IMPORT | |
| `/app/admin/*` | super admin | super_admin | yes | platform | both | MANUAL REVIEW pages needing delete_tenant | |

### 5.2 Collisions and gaps

| Issue | Detail | Mitigation |
|-------|--------|------------|
| Utility route gap | Local missing connections/staff/notifications/settings | Add from GH in App union |
| Marketplace route gap on GH | Would be lost if App replaced wholesale | Never replace App; union only |
| RoleRoute semantics | Local active-membership vs GH any-membership | Keep local; document multi-tenant switch UX |
| Renter allow-list | GH includes `landlord_staff` | Product decision before adding |
| Nav vs security | Hidden routes still callable | RoleRoute + RLS tests; do not rely on nav |
| Customer vs ops routes | Same RoleRoute allow list includes customers | Ensure pages self-gate destructive actions; RLS must block |

---

## 6. Phase E — Supabase and security review (static only)

**No Live probing. Tenant isolation is not proven by this review.**

| Finding | Location | Evidence | Status | Impact | Safest remediation (future) | Regression tests | Breaking change? |
|---------|----------|----------|--------|--------|----------------------------|------------------|------------------|
| LoginPage memberships without `user_id` | `frontend/src/pages/LoginPage.tsx` `loadMembershipsNow` (~120–131) | Selects active memberships with no `user_id`; AuthProvider correctly filters | **Confirmed** (code) | Landlord/renter/utility: if RLS returns peer rows, `hasTenantWorkspaceAccess` may authorize wrongly | Add `.eq("user_id", uid)` to match AuthProvider; never trust peer rows for authZ | Login/session tests with multi-user fixture in **isolated** env | No API break |
| `search_properties_for_link` UUID branch unscoped | Local+GH mig 13 function (~182–183 local): `(v_is_uuid AND p.id = v_uuid)` outside text-search tenant OR | Any utility admin/staff who knows a property UUID can resolve address metadata cross-tenant; text branch is scoped (+ listed available) | **Confirmed** in source (both trees) | Utility ops: cross-tenant property metadata disclosure; landlords/renters indirect privacy | Future **new** migration (do not edit protected file in place if already applied elsewhere): require UUID hits to satisfy same scope OR as text branch | SQL probe + utility RLS tests | Possibly — tighten search results |
| Renter / `is_member_of` broad property access | `is_member_of` correctly binds `auth.uid()` (`…000014`); marketplace isolation mig local-only | Residual risk if policies still use membership-wide SELECTs on `properties` | **Potential / partially mitigated locally** | Renter may see non-listed inventory if policy regresses | Keep marketplace isolation mig; isolated RLS tests `rls.marketplace`, `rls.renterApplications` | Isolated SQL/TS | Maybe |
| `register-workspace-admin` service-role user create | `supabase/functions/register-workspace-admin` | Public endpoint creates/verifies users; documented no membership elevation | **Confirmed** design risk | Account creation abuse / email enumeration | Rate limit, captcha, confirm email policies; audit logs; isolated abuse tests | Edge authz tests | Possibly |
| `manage_membership` behavior | Hardened in `…22194500…` (shared EOL) | Landlord admin grant limits; used by invite + company staff provision | **Review required** when importing provision-company-staff | Privilege escalation if role checks weak | Re-read function after union; staff provision must stay utility_admin-only | `membershipWriteHardening`, provision authz tests | Maybe |
| PropertyDetail tenant scoping | `PropertyDetailPage.tsx` load by id | Relies on RLS; UI equality check for edit | **Potential** | Cross-tenant read if RLS fails | Keep RLS tests; optional client `.eq("tenant_id", active)` | move-out + staff property tests | No |
| Utility payment/application filtering | Local PaymentsReview thin; GH huge hub | Client filters by `tenant_id` in many places; approval via RPC | **Unresolved without isolated run** | Cross-tenant bill/payment ops | Import GH UI only with GH RPCs; run `utility_tenant_isolation_probe` in isolated DB | probe + `rls.utility` | Maybe |
| RoleRoute hidden URL access | App routes | UI gate only | **Confirmed** pattern | Unauthorized UI if wrong membership active | Keep activeMembership gate; RLS backend | RoleRoute tests | No |
| Staff approve vs docs | WATER doc vs mig `…21000001` | Doc admin-only; DB allows staff | **Confirmed** product drift | Utility governance | Product decision before import | payment review tests | Policy choice |
| Protected mig 13 diverge | Local conditional REVOKE vs GH bare REVOKE | Substantive | **Confirmed** | Local disposable reset safety | **KEEP LOCAL forever** for this sync | Migration apply dry-run isolated | Yes if replaced |

---

## 7. Phase F — Migration inventory and dependency plan

### 7.1 Rules

- **Do not apply, reorder, rename, squash, or edit migrations in this phase.**
- **Never replace** `20261013000013_security_isolation_hardening.sql` (KEEP LOCAL).
- **Source-file integration ≠ database migration process.** Live history is unknown.
- Shared migrations (except mig 13): **EOL_ONLY** identical after normalization.

### 7.2 Inventory

| Filename | Tree | Content vs other | Affects (summary) | App deps | Ordering notes | Before any future apply |
|----------|------|------------------|-------------------|----------|----------------|-------------------------|
| `20261013000001` … `00012` | both | EOL_ONLY | foundation → branding | baseline app | shared prefix | Confirm already on target DB |
| `20261013000013_security_isolation_hardening.sql` | both | **SUBSTANTIVE** | search_properties_for_link, create_utility_premises, REVOKEs, storage | utility link + security | **KEEP LOCAL bytes** | Hash check; never GH overwrite |
| `20261014000014` … `00015` | both | EOL_ONLY | member isolation, branding draft | | | |
| `20261018000001_list_company_member_profiles.sql` | **GH** | n/a | RPC list profiles | UtilityDashboard, StaffPage | Before staff UI | Isolated |
| `20261018143031_fix_property_photos_storage_path_policy.sql` | **LOCAL** | n/a | storage policies | property photos | After photos exist | Isolated |
| `20261018220000_marketplace_field_isolation.sql` | **LOCAL** | n/a | marketplace RPCs/RLS | public/browse | Before relying on marketplace security | Isolated |
| `20261019000001_register_utility_house.sql` | **GH** | n/a | register house, flat bill v1, meter_reading nullable | Connections/Customers | After phase3 utilities | Isolated |
| `20261019160000_profiles_username.sql` (+ SUPERSEDED.md) | both | EOL_ONLY | usernames | landlord usernames | shared | |
| `20261020000001` … `00006` | **GH** | n/a | ops payment, flat upsert, adhoc, adjust, update customer, update/delete tenant | Payments hub, admin tenants | Sequence as named | Isolated; delete_tenant super-admin only |
| `20261020090000_renter_applications_landlord_usernames.sql` | both | EOL_ONLY | applications | apply/invite | | |
| `20261020110000_list_same_tenant_member_profiles.sql` | both | EOL_ONLY | member profiles | staff/renter lists | | |
| `20261021000001` … `00004` | **GH** | n/a | staff approve; auto flat bill; batch; months-ahead | Payments hub | After register_utility_house family | Isolated |
| `20261021120000_review_rent_payment_require_rejection_reason.sql` | **LOCAL** | n/a | rent review RPC | landlord payments | After rent ledger | Isolated |
| `20261022190000_landlord_staff_properties_only.sql` | both | EOL_ONLY | staff scope | staff dashboard | | |
| `20261022194500_membership_write_hardening_c1_h1.sql` | both | EOL_ONLY | manage_membership hardening | invites/staff | | |
| `20261022200000_property_photo_identity_immutable.sql` | **LOCAL** | n/a | photo immutability trigger | photos | | |
| `20261024120000_generate_monthly_rent_charges.sql` | **LOCAL** | n/a | monthly rent RPC | edge cron | | |
| `20261024133000_add_villa_property_type.sql` | **LOCAL** | n/a | enum villa | PropertyForm | | |
| `20261024140000_property_rooms_and_neighborhood.sql` | **LOCAL** | n/a | columns | PropertyForm/listings | | |
| `20261024150000_public_listing_detail_rooms_neighborhood.sql` | **LOCAL** | n/a | public listing RPC columns | PublicListingDetail | after 24140000 | |

### 7.3 Timestamp interleaving (future DB planning only)

Chronological merge of **filenames** (not an apply order endorsement for Live):

1. GH `18000001`  
2. LOCAL `18143031`, `18220000`  
3. GH `19000001`  
4. shared `19160000`  
5. GH `20000001`–`20000006`  
6. shared `20090000`, `20110000`  
7. GH `21000001`–`21000004`  
8. LOCAL `21120000`  
9. shared `22190000`, `22194500`  
10. LOCAL `22200000`, `24120000`, `24133000`, `24140000`, `24150000`

**Concern:** GitHub utility migrations and local marketplace/rent migrations **interleave**. A DB that applied only one side will need a careful gap analysis before any Live work. **Unknown Live history → stop condition for any migrate phase.**

### 7.4 Counts revalidated

- Local migration files: **29** (28 SQL + 1 SUPERSEDED.md)  
- GitHub migration files: **33** (32 SQL + 1 SUPERSEDED.md)  
- Shared: **21** (20 EOL_ONLY + 1 SUBSTANTIVE mig 13)  
- Local-only SQL: **8**  
- GitHub-only SQL: **12**

---

## 8. Phase G — Edge Functions and dependencies

### 8.1 Function directory comparison

| Function | Local | GitHub | Integration |
|----------|-------|--------|-------------|
| approve-payment, assign-renter, complete-move-out, generate-utility-bill, link-utility-account, manage-membership, provision-staff, provision-tenant, record-meter-reading, register-workspace-admin, set-tenant-status | yes | yes | Assume shared; spot-diff before deploy (**EOL likely**) |
| provision-renter | yes | no | **KEEP LOCAL** |
| public-listing-photos | yes | no | **KEEP LOCAL** |
| generate-monthly-rent-charges | yes | no | **KEEP LOCAL** |
| provision-company-customer | no | yes | **IMPORT** |
| provision-company-staff | no | yes | **IMPORT** |

### 8.2 Import targets (GitHub-only)

| Function | Purpose | Auth | Role / tenant | Tables / RPCs | Env names (no values) | Frontend callers | Tests | Risks |
|----------|---------|------|---------------|---------------|----------------------|------------------|-------|-------|
| `provision-company-customer` | Create Auth user + profile for company customer | Caller JWT | utility_admin/staff on body.tenant_id; company tenant types | memberships, tenants, profiles; Auth admin create | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | `CustomersPage` | authz + no cross-company email | Service role; does not create membership (follow register_utility_house) |
| `provision-company-staff` | Create/link staff + `manage_membership` utility_staff | Caller JWT | **utility_admin only** | same + manage_membership | same three | `StaffPage` | admin-only; tenant scope | Depends on hardened manage_membership |

### 8.3 Keep-local highlights

| Function | Purpose | Auth highlights | config.toml |
|----------|---------|-----------------|-------------|
| `provision-renter` | Landlord invite renter | landlord_admin; email delivery gate | needs `/set-password` redirect |
| `public-listing-photos` | Anon signed covers/gallery | eligibility inside; verify_jwt true | present local |
| `generate-monthly-rent-charges` | Cron → RPC | service role or cron secret; verify_jwt false | present local |

### 8.4 Dependencies

| Item | Local | GitHub | Plan |
|------|-------|--------|------|
| `jspdf` | absent | `^4.2.1` in package.json | **Unresolved need:** `simplePdf.ts` does not import jspdf — prefer IMPORT simplePdf **without** jspdf unless a file imports it |
| Live/isolated scripts | present | absent | KEEP |
| lucide / tailwind / vitest | both | both | KEEP versions from local lock after careful merge |

**Do not install packages in this phase.**

---

## 9. Phase H — Testing and rollback strategy

### 9.1 Test plan (future execution)

| Suite | Prerequisites | Expected | Environment |
|-------|---------------|----------|-------------|
| `npm run typecheck` | union `database.ts`, new pages | clean | local machine; any env files ignored for compile |
| `npm run build` | same | success | local |
| `npm test` (vitest) | deps installed | existing + new tests pass | local; prefer isolated URL if tests hit network |
| Auth/session tests | AuthProvider, ProtectedRoute, LoginPage fix | coherence + user_id filter | unit |
| Route/role tests | App union | marketplace + utility routes registered; RoleRoute active membership | unit |
| Landlord workflows | isolated DB with local migs | properties, photos, tenancies, payments, invite | **isolated only** |
| Renter / marketplace | local migs + public photos fn | browse scoped; public listing; apply | isolated + optional anon |
| Utility workflows | GH migs + provision fns | houses, flat bills, staff approve, months-ahead | isolated |
| Cross-tenant isolation | two company tenants + landlord | zero cross reads/writes | `utility_tenant_isolation_probe.sql` + TS RLS — **isolated** |
| Edge authz | functions served locally | unauthorized rejected | local supabase functions |
| Env target guards | supabaseEnv tests | fail-closed without allow flag | unit |
| Migration consistency | empty or snapshot isolated DB | ordered apply of union set | **isolated**; never Live |

**Forbidden in testing without separate approval:** writes to Supabase Live; destructive git; editing mig 13.

### 9.2 Rollback strategy

1. **Primary restore:** copy from verified Phase 5 backup `C:\my projects\_ijaaro_phase5_backup_20261026_111543\Ijaaro-project-main` (robocopy reverse), excluding regenerating `node_modules` as needed.  
2. **Do not** rely on `git reset --hard` / `git clean -fd` (no `.git` today; destructive later).  
3. Keep `_ijaaro_compare_tmp` and `Ijaaro-project-integrate` intact as read-only references.  
4. If a future Git branch exists: revert commits with explicit approval; still prefer backup for secret-bearing env recovery.  
5. Database rollback is a **separate** concern: use recorded isolated snapshots / manual SQL rollbacks (e.g. marketplace manual rollback scripts) — never assume Live can be reset.

---

## 10. Phase I — Recommended staged execution order (NOT STARTED)

| Stage | Goal | File groups | Dependencies | Verification | Stop if | Rollback | Approval |
|-------|------|-------------|--------------|--------------|---------|----------|----------|
| **0** | Freeze references | none | Phase 5 backup verified | Re-hash mig 13 | Backup missing | n/a | User ack Phase 6 plan |
| **1** | Git init + ignore (optional sync branch) | `.gitignore` from PROPOSED | Stage 0 | No secrets staged; status review | Secrets appear in status | Delete `.git` only if never pushed — or restore backup | Explicit: Git init |
| **2** | Import GitHub-only utility **source** (no DB) | GH-only pages, simplePdf, AppLoading, edge fn dirs, water doc, probe SQL as files | Stage 1 optional | typecheck may fail until types/App union | Type errors unblockable | Restore those paths from backup | Utility source import |
| **3** | Union merge shells | App.tsx, AppShell/nav, database.ts, package.json, config.toml | Stage 2 | typecheck + build + route tests | Role/nav regressions | Backup restore of shells | Shell union |
| **4** | Replace utility page bodies | Customers, Payments, Dashboard, Reports, shared | Stages 2–3 | unit tests; no Live | Runtime against Live attempted | Restore utility pages | Utility UI swap |
| **5** | Security fixes (code) | LoginPage user_id; optional client tenant filters | Stage 3 | auth tests | Behavior unclear | Revert those commits/files | Security fixes |
| **6** | Isolated DB migration rehearsal | Copy union migrations into disposable DB | Isolated project only | probe + RLS suites | Any Live targeting | Drop isolated DB | Isolated testing |
| **7** | Live migration **review only** | reports comparing Live history vs union | Stage 6 evidence | Written gap report | History unknown / conflict with mig 13 | n/a (no apply) | Live migration review |
| **8** | Commit / push | git commit/push | Clean tree, ignores | CI if any | Secrets / wrong branch | Revert commit (no force to main) | Commit and push |
| **9** | Deploy functions/frontend | hosting | Stage 8 | smoke isolated then limited Live read-only checks | Auth failures | Redeploy previous artifact; backup | Deployment |

**Hard stops across all stages:** no overwrite of protected mig 13; no Live SQL apply without Stage 7 approval; no destructive git; integration repo and Phase 5 backup untouched.

---

## 11. Main integration decisions (summary)

1. **Base = active local** (landlord/renter/marketplace/auth win by default).  
2. **Import** GitHub utility finance feature set (pages, 12 migrations as files, 2 edge functions, helpers, probe).  
3. **Union** App routes, nav, types, package/scripts, config.toml.  
4. **KEEP LOCAL** AuthProvider, ProtectedRoute semantics, supabaseEnv guards, protected mig 13.  
5. **Security fixes** scheduled after shell union, before Live.  
6. **DB apply** is a separate approved track after isolated rehearsal.

---

## 12. Confirmation

- Planning documents created under `docs/` only.  
- No application source, migration, env, Git, Supabase config, or database state changes.  
- Phase 5 backup unchanged.  
- Integration repository unchanged.  
- **STOP** — do not start source integration until explicit user approval of the next phase.
