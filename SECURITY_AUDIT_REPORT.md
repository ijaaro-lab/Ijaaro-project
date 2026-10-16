# IJAARO Security Audit Report

**Audit date:** 2026-10-13  
**Auditor role:** Principal Application Security / PostgreSQL RLS / SaaS multi-tenant  
**Scope:** Existing repository, Supabase migrations & live remote project, Edge Functions, frontend authz, Storage, env handling, and security tests.  
**Method:** Code inspection, live catalog/grant/advisor queries, migration review, remediation migrations, regression tests.  
**Constraint:** No destructive production data operations; no secret values reproduced in this report.

---

## 1. Audit scope

| Area | Status |
|------|--------|
| Docs (`BRD-1`, `SYSTEM_*`, `DATABASE_DESIGN`, roadmap, SaaS/utility docs) | Reviewed |
| All Supabase migrations (repo + applied remote) | Reviewed |
| Live tables, RLS, policies, grants, advisors | Queried |
| SECURITY DEFINER RPCs / triggers | Reviewed |
| Edge Functions | Reviewed; `register-workspace-admin` hardened & redeployed |
| Frontend route guards / roles | Reviewed; `RoleRoute` added |
| Storage buckets & policies | Reviewed & hardened |
| Env / secret handling | Reviewed |
| Existing RLS test suites | Executed (see `SECURITY_TEST_RESULTS.md`) |

**Authorization model (summary):** Shared Postgres database; tenant isolation via `tenant_id` + active `tenant_memberships` roles; RLS + FORCE RLS on domain tables; privileged writes via SECURITY DEFINER RPCs with `auth.uid()` checks; frontend guards are defense-in-depth only.

---

## 2. Findings (ranked)

### Critical

#### C1 — Unauthenticated Edge Function with service-role user admin
- **Component:** `supabase/functions/register-workspace-admin`
- **Evidence:** No JWT check; used `admin.createUser`, `updateUserById(email_confirm)`, and `listUsers({ perPage: 1000 })`.
- **Impact:** Account creation spam; Auth user directory scan; potential email auto-confirm path; service-role capability exposed over HTTP.
- **Remediation (implemented):** Removed `listUsers` and auto-confirm-without-session path; existing emails require successful password sign-in only; input length limits; redeployed (`verify_jwt: false` retained for public onboarding).
- **Remaining risk:** Still a public signup helper using service role for *new* confirmed users — rate limiting / CAPTCHA recommended.

### High

#### H1 — `TRUNCATE` (and excess DML) granted to `anon` / `authenticated`
- **Component:** Phase 2/3 tables (`properties`, `rent_*`, `utility_*`, …)
- **Evidence:** Live `information_schema.role_table_grants` showed `anon`/`authenticated` `TRUNCATE` on financial tables. PostgreSQL **does not apply RLS to TRUNCATE**.
- **Impact:** Any SQL session as those roles could wipe multi-tenant financial data (PostgREST does not expose TRUNCATE today, but grants violate least privilege).
- **Remediation (implemented):** Migration `20261013000013_security_isolation_hardening.sql` — revoke & re-grant least privilege; explicit `REVOKE TRUNCATE, REFERENCES, TRIGGER`.
- **Verification:** Post-fix grant query — no `TRUNCATE` for anon/authenticated.

#### H2 — `search_properties_for_link` platform-wide property dump
- **Component:** SECURITY DEFINER RPC (`20261013000007`)
- **Evidence:** Returned `owner_id`, `current_renter_id`, addresses for any matching property.
- **Impact:** Any utility staff could enumerate landlords’ private occupied inventory and occupant IDs.
- **Remediation (implemented):** Scoped fuzzy search to utility-owned/linked properties + listed available marketplace; exact UUID lookup retained; `current_renter_id` always NULL; `owner_id` only for owned/linked rows.

#### H3 — `create_utility_premises` cross-tenant write into landlord tenants
- **Component:** Same RPC file
- **Evidence:** `tenant_id := COALESCE(owner’s first landlord membership, company_tenant_id)`.
- **Impact:** Utility staff could insert a property row under another landlord’s `tenant_id`.
- **Remediation (implemented):** Always set `tenant_id` / `created_by_tenant_id` to `p_company_tenant_id`.

#### H4 — Payment-proof rent storage policies cast `utility` path as UUID
- **Component:** `payment_proofs_storage_*` vs `utility/...` paths
- **Evidence:** Rent policies applied to all `payment-proofs` objects and cast `foldername[1]::uuid`.
- **Impact:** Query errors / DoS on utility proof access when policies evaluate.
- **Remediation (implemented):** Rent policies require `folder[1] <> 'utility'` and UUID regex before cast.

#### H5 — Tenant branding storage writable by any member
- **Component:** `tenant-branding` bucket policies
- **Evidence:** `is_member_of(tenant_id)` allowed insert/update/delete (incl. renters/customers) on a **public** bucket.
- **Impact:** Portal logo/hero defacement.
- **Remediation (implemented):** Writes limited to `landlord_admin` / `utility_admin` / super_admin; SVG removed from allowed MIME types; client upload helper rejects SVG.

#### H6 — Role routes were session-only (defense-in-depth)
- **Component:** `ProtectedRoute` / `App.tsx`
- **Impact:** Wrong-role users could open privileged URLs; data still gated by RLS, but UI amplified any RLS bug.
- **Remediation (implemented):** `RoleRoute` wrappers for landlord / renter / water / electricity areas.

### Medium

| ID | Finding | Status |
|----|---------|--------|
| M1 | Listed property SELECT is cross-tenant for any authenticated user (marketplace) | Accepted product behavior; contact fields exposed — document / consider field masking |
| M2 | `resolve_tenant_workspace` executable by `anon` | Intentional public landing; returns branding surface only |
| M3 | `utility_payments_insert` policy weaker than trigger | Policy alone insufficient if trigger dropped — keep trigger; optional WITH CHECK tighten later |
| M4 | `link_utility_account` can upsert `utility_customer` membership | Intended for staff onboarding; staff compromise → membership write |
| M5 | `self_provision_tenant` creates active workspaces | Abuse/spam risk; one admin workspace per type mitigates |
| M6 | Edge Function CORS `*` | Medium; mitigated by bearer tokens not cookies |
| M7 | Auth leaked-password protection disabled (Supabase advisor) | **Open** — enable in Auth settings (dashboard) |
| M8 | Helper RPCs (`is_member_of`, etc.) callable by authenticated | Expected for RLS helpers; boolean oracle only |

### Low / Info

| ID | Finding | Status |
|----|---------|--------|
| L1 | `frontend/.env.example` documents service role for Vitest | Footgun if prefixed `VITE_` — documented |
| L2 | Project ref in `supabase/config.toml` | Not a secret |
| L3 | No `dangerouslySetInnerHTML`; roles from DB memberships not JWT metadata | PASS |
| L4 | Service role not in frontend Vite client | PASS |

---

## 3. Remediation artifacts

| Artifact | Purpose |
|----------|---------|
| `supabase/migrations/20261013000013_security_isolation_hardening.sql` | Grants, FORCE RLS, RPC harden, storage policies |
| `supabase/functions/register-workspace-admin/index.ts` | Public signup hardening (deployed) |
| `frontend/src/auth/ProtectedRoute.tsx` + `App.tsx` | RoleRoute guards |
| `frontend/src/lib/uploadImage.ts` | Ban SVG uploads |
| `frontend/src/test/rls.hardening.test.ts` | Regression tests |

Remote migration applied via Supabase MCP as `security_isolation_hardening`.

---

## 4. Remaining risks

1. Public `register-workspace-admin` still uses service role to create **confirmed** users (no CAPTCHA/rate limit).
2. Marketplace property browse remains intentionally cross-tenant for authenticated users.
3. UUID property lookup by utility staff still reveals address of private properties (by design for linking); renter ID no longer returned.
4. Leaked-password protection still disabled in Auth (operator action required).
5. Security tests skip when `SUPABASE_SERVICE_ROLE_KEY` is missing — CI must fail closed for protected branches.
6. No local Supabase instance used for this audit; tests hit the configured remote project with disposable fixtures.

---

## 5. Honest verification posture

This audit **does not** claim the entire platform is secure. It verifies:

- Critical/High issues listed above were fixed with evidence.
- RLS is enabled on all 14 public tables; domain tables FORCE RLS.
- Cross-tenant isolation for core tables is covered by existing + new tests where env is available.

See `TENANT_ISOLATION_MATRIX.md` and `SECURITY_TEST_RESULTS.md`.
