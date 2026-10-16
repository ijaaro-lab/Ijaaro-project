# IJAARO Security Test Results

**Date:** 2026-10-13  
**Environment:** Remote Supabase project configured via `frontend/.env.local` (disposable test users/tenants).  
**Runner:** Vitest from `frontend/` (`npm test -- <file>`).

Statuses: **PASS** · **FAIL** · **BLOCKED** · **NOT RUN**

---

## 1. Automated suites executed

| Suite | Result | Notes |
|-------|--------|-------|
| `src/test/rls.hardening.test.ts` | **PASS** (9/9) | New regressions for audit fixes |
| `src/test/rls.security.test.ts` | **PASS** (17/17) | Phase 1 tenant/membership/audit |
| `src/test/rls.rental.test.ts` | **PASS** (11/11) | Cross-landlord, rent payments |
| `src/test/rls.utility.test.ts` | **PASS** (17/17) | Cross-utility, bills, payments |
| Parallel run of all four | **FAIL** (Auth rate limit) | Not a product bug — GoTrue rate limit when many `signInWithPassword` calls run concurrently. Re-run suites sequentially. |

### Hardening suite coverage (all PASS)

| Test | Status |
|------|--------|
| Anon cannot read properties / rent_payments / utility_bills | PASS |
| Water A fuzzy search excludes landlord B private inventory | PASS |
| Search never returns `current_renter_id` | PASS |
| UUID lookup finds property without renter id | PASS |
| `create_utility_premises` attaches under utility tenant only | PASS |
| Renter cannot upload tenant branding logo | PASS |
| Landlord admin can upload own branding | PASS |
| Water A cannot read Water B tenant | PASS |
| Anon `resolve_tenant_workspace` branding-only surface | PASS |

### Build / static checks

| Check | Status |
|-------|--------|
| `npm run typecheck` | **PASS** |
| `npm run build` (`tsc -b && vite build`) | **PASS** |
| `npm run lint` | **NOT RUN** (not executed in this session) |
| Frontend bundle scan for service-role key | **PASS** (inspection: client uses anon key only) |
| Supabase security advisors | **PASS** with WARN: leaked-password protection disabled; DEFINER RPCs executable (expected for app) |

---

## 2. Required cross-tenant attack matrix

| # | Scenario | Status | Evidence |
|---|----------|--------|----------|
| 1 | Landlord A cannot read Landlord B private records | **PASS** | `rls.security` #3, `rls.rental` |
| 2 | Landlord A cannot insert/update/delete B | **PASS** | `rls.security` #4–6, `rls.rental` |
| 3 | Water A cannot access Water B data | **PASS** | `rls.utility` #1–2, `rls.hardening` |
| 4 | Electricity A cannot access Electricity B | **PASS** | `rls.utility` |
| 5 | Water cannot access electricity private data | **PASS** | `rls.utility` #5 |
| 6 | Electricity cannot access water private data | **PASS** | `rls.utility` #5 |
| 7 | Landlord cannot access utility admin records via relation | **PASS** | `rls.utility` (no landlord policies) |
| 8 | Renter cannot access another renter’s private data | **PASS** | `rls.rental` |
| 9 | Utility customer cannot access another customer | **PASS** | `rls.utility` #6 |
| 10 | Object/tenant ID swap denied | **PASS** | RPC/RLS tests across suites |
| 11 | Inactive membership loses access | **PASS** | `rls.security` #7 |
| 12 | Branding / logos tenant-isolated for writes | **PASS** | `rls.hardening` storage tests |
| 13 | Public landing exposes only approved fields | **PASS** | `rls.hardening` resolve RPC |

---

## 3. Remediation retests

| Finding | Fix | Retest |
|---------|-----|--------|
| H1 TRUNCATE grants | Migration grants revoke | **PASS** — live SQL: no TRUNCATE for anon/authenticated |
| H2 property search dump | Scoped RPC | **PASS** — hardening fuzzy search test |
| H3 premises cross-tenant write | Always utility `tenant_id` | **PASS** — hardening premises test |
| H4 payment-proof UUID cast | Exclude `utility/` + UUID regex | **PASS** by policy inspection; storage I/O for utility proofs **NOT RUN** as dedicated test |
| H5 branding member write | Admin-only policies | **PASS** — renter upload denied, admin allowed |
| C1 register-workspace-admin | Removed listUsers / unsafe confirm | Deployed; automated Edge Function abuse tests **NOT RUN** |
| H6 RoleRoute | Frontend guards | Code review **PASS**; browser E2E **NOT RUN** |

---

## 4. Blocked / not run

| Item | Status | Reason |
|------|--------|--------|
| Local Supabase stack tests | **NOT RUN** | Audit used remote project with disposable fixtures |
| Edge Function unauthenticated abuse suite | **NOT RUN** | No dedicated Vitest harness for Functions HTTP |
| Destructive TRUNCATE attempt as `anon` via SQL session | **BLOCKED** | No direct Postgres role login from test harness; verified via grants catalog |
| Auth HaveIBeenPwned leaked-password setting | **BLOCKED** | Requires dashboard / Auth config change (operator) |
| Production tenant data attack tests | **NOT RUN** | Explicitly out of scope / forbidden |
| Rate-limit-free parallel full suite | **BLOCKED** | Hosted Auth rate limits |

---

## 5. Reproduction notes

```bash
cd frontend
# Requires VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
npm test -- src/test/rls.hardening.test.ts
npm test -- src/test/rls.security.test.ts
npm test -- src/test/rls.rental.test.ts
npm test -- src/test/rls.utility.test.ts
npm run typecheck
npm run build
```

If Auth returns `Request rate limit reached`, wait ~60s and re-run suites one file at a time.

---

## 6. Limitations

Passing tests prove isolation for the exercised paths against the configured project. They do not prove absence of all vulnerabilities, do not cover untested Edge Function abuse, and do not replace enabling Auth leaked-password protection or adding signup rate limiting.
