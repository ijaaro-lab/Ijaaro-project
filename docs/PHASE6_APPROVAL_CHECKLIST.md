# Phase 6 — Approval Checklist

**Purpose:** Explicit human approval gates before any future integration work.  
**Date:** 2026-10-26  
**Plans:** `docs/PHASE6_DETAILED_INTEGRATION_PLAN.md`, `docs/PHASE6_CONFLICT_REGISTER.md`  
**Prior:** `docs/PHASE5_SAFE_GIT_SETUP_REPORT.md`

**Instructions:** Each gate requires a dated signature (name) and `APPROVED` / `DEFERRED` / `REJECTED`. Do not start a stage until its gate is `APPROVED`. Planning (Phase 6) does not grant execution rights.

**Global hard rules (always in force):**

- Do not overwrite `supabase/migrations/20261013000013_security_isolation_hardening.sql` with the GitHub variant.
- Do not modify Live env secrets or connect for writes without a Live-specific gate.
- Do not run `git reset --hard`, `git clean -fd`, force-push to `main`, or destroy the Phase 5 backup / compare checkout / integrate repo.
- Do not treat a green build as proof of tenant isolation.

---

## Gate 0 — Accept Phase 6 plan (analysis complete)

| Item | Status |
|------|--------|
| Phase A references verified (active path, compare≈`f8bd11c` EOL-normalized, integrate untouched, backup verified, mig 13 hash match) | ☐ |
| Feature matrix and conflict register reviewed | ☐ |
| Understood: active local is Git-less; backup is recovery | ☐ |
| **Decision** | ☐ APPROVED · ☐ DEFERRED · ☐ REJECTED |
| Approver / date | |
| Notes | |

**Stop condition:** REJECTED or incomplete → no further stages.

---

## Gate 1 — Git initialization (active project)

**Prerequisite:** Gate 0 APPROVED; Phase 5 backup still verified.

| Item | Status |
|------|--------|
| Apply reviewed `.gitignore` (Phase 5 `PROPOSED_gitignore` or successor) **before** first add | ☐ |
| Confirm `.env.local`, `.env.live.local`, `.env.isolated`, credentials will not be staged | ☐ |
| Approve `git init` + `remote add origin` + fetch in active folder only | ☐ |
| Approve branch strategy (e.g. `sync/local-main-lossless` from `origin/main` @ `f8bd11c`) | ☐ |
| Forbid: hard reset / clean that drops local-only files | ☐ |
| **Decision** | ☐ APPROVED · ☐ DEFERRED · ☐ REJECTED |
| Approver / date | |
| Notes | |

**Rollback:** If init goes wrong and never pushed, remove `.git` only after confirming backup intact; prefer restore from Phase 5 backup for file safety.

---

## Gate 2 — Utility source integration (files only, no DB apply)

**Prerequisite:** Gate 0; Gate 1 optional but recommended.

| Item | Status |
|------|--------|
| Import GH-only utility pages + `DirectoryUi` + `AppLoading` + `simplePdf` | ☐ |
| Import edge dirs `provision-company-customer`, `provision-company-staff` | ☐ |
| Import 12 GH-only migration **files** into tree (not applied) | ☐ |
| Import `docs/WATER_COMPANY_DASHBOARD.md` + `utility_tenant_isolation_probe.sql` as files | ☐ |
| Preserve all local-only marketplace/auth/landlord/renter files | ☐ |
| Preserve local-only edge functions (provision-renter, public-listing-photos, generate-monthly-rent-charges) | ☐ |
| Conflict CR-010/011/018 reviewed | ☐ |
| **Decision** | ☐ APPROVED · ☐ DEFERRED · ☐ REJECTED |
| Approver / date | |
| Notes | |

**Stop if:** Any local-only marketplace file deleted; protected mig 13 changed.

---

## Gate 3 — Shell / types / deps union merge

**Prerequisite:** Gate 2 (or explicit scope reduction).

| Item | Status |
|------|--------|
| UNION `App.tsx` (keep marketplace + set-password; add utility routes) | ☐ |
| UNION AppShell / `appShellNav` (finance-first utility links; keep extraction/tests) | ☐ |
| KEEP LOCAL AuthProvider, ProtectedRoute (active membership), supabaseEnv guards | ☐ |
| UNION `types/database.ts` | ☐ |
| UNION `package.json` scripts; decide jspdf (default: omit if unused) | ☐ |
| UNION `supabase/config.toml` (keep set-password + function blocks) | ☐ |
| `npm run typecheck` + `npm run build` planned after merge | ☐ |
| RoleRoute: confirm **no** silent add of `landlord_staff` to renter routes | ☐ |
| **Decision** | ☐ APPROVED · ☐ DEFERRED · ☐ REJECTED |
| Approver / date | |
| Notes | |

---

## Gate 4 — Security fixes (application code)

**Prerequisite:** Gate 3 preferred so LoginPage/App still local-canonical.

| Item | Status |
|------|--------|
| Fix LoginPage membership query: filter `user_id` (CR-005) | ☐ |
| Decide remediation track for `search_properties_for_link` UUID branch (CR-026) — **new migration later**, not edit mig 13 in place if already applied | ☐ |
| Review `register-workspace-admin` abuse controls (rate limit / policy) — scope agreed | ☐ |
| Review `manage_membership` + company staff provision interaction | ☐ |
| Tests listed for each fix | ☐ |
| **Decision** | ☐ APPROVED · ☐ DEFERRED · ☐ REJECTED |
| Approver / date | |
| Notes | |

**Stop if:** Fix requires Live probing.

---

## Gate 5 — Isolated-environment testing

**Prerequisite:** Gates 2–4 as applicable; disposable Supabase/DB only.

| Item | Status |
|------|--------|
| Target is **isolated** (not Live); env guards confirmed | ☐ |
| Apply union migrations only on isolated DB; record order used | ☐ |
| Run vitest / typecheck / build | ☐ |
| Run landlord, renter/marketplace, utility workflow smoke | ☐ |
| Run `utility_tenant_isolation_probe.sql` (or successor) on isolated | ☐ |
| Edge function authz checks for provision-renter + provision-company-* | ☐ |
| Document failures; no “pass” claimed for Live isolation | ☐ |
| **Decision** | ☐ APPROVED · ☐ DEFERRED · ☐ REJECTED |
| Approver / date | |
| Notes | |

**Forbidden:** SQL against Live; destructive reset of shared environments.

---

## Gate 6 — Live migration review (review only — no apply)

**Prerequisite:** Gate 5 evidence; explicit product need for Live.

| Item | Status |
|------|--------|
| Export / inventory Live migration history (read-only method agreed) | ☐ |
| Diff Live history vs union file set; list gaps and conflicts | ☐ |
| Confirm mig 13 on Live vs local hash implications understood | ☐ |
| Timestamp interleave plan reviewed (local 8 + GH 12) | ☐ |
| Written go/no-go for a **future** apply phase | ☐ |
| **Decision (review complete)** | ☐ APPROVED · ☐ DEFERRED · ☐ REJECTED |
| Approver / date | |
| Notes | |

**This gate does not authorize applying migrations to Live.** A separate future checklist is required for any Live apply.

---

## Gate 7 — Commit and push

**Prerequisite:** Gates 1–3 at minimum; secrets scrubbed; tests agreed.

| Item | Status |
|------|--------|
| `git status` shows no env/credential files | ☐ |
| Commit message reviewed | ☐ |
| Push target branch ≠ force to `main` unless separately approved | ☐ |
| Remote `origin` is `https://github.com/ijaaro-lab/ijaaro-project.git` | ☐ |
| **Decision** | ☐ APPROVED · ☐ DEFERRED · ☐ REJECTED |
| Approver / date | |
| Notes | |

---

## Gate 8 — Deployment

**Prerequisite:** Gate 7; Gate 5 for behavior confidence; Gate 6 if DB changes involved.

| Item | Status |
|------|--------|
| Frontend deploy artifact identified | ☐ |
| Edge functions deploy set identified (local-only + imported) | ☐ |
| Env vars present on host (**names verified; values not pasted into tickets**) | ☐ |
| Rollback artifact / previous deploy known | ☐ |
| Post-deploy smoke limited; no unverified Live data writes | ☐ |
| **Decision** | ☐ APPROVED · ☐ DEFERRED · ☐ REJECTED |
| Approver / date | |
| Notes | |

---

## Gate summary table

| Gate | Topic | Approved? |
|------|-------|-----------|
| 0 | Accept Phase 6 plan | |
| 1 | Git initialization | |
| 2 | Utility source import (files) | |
| 3 | Shell / types / deps union | |
| 4 | Security fixes | |
| 5 | Isolated testing | |
| 6 | Live migration review (no apply) | |
| 7 | Commit and push | |
| 8 | Deployment | |

---

## Confirmation (Phase 6 authoring)

- This checklist was created as a planning document only.  
- No gate above was executed by the Phase 6 planning pass.  
- No source code, Git state, Supabase configuration, or database state was changed to “check” these boxes.
