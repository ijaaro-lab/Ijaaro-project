# STEP 5.4.29 — Landlords Move-Out Browser Verification

**Date:** 2026-10-19  
**Scope:** Landlords module · FR-011 move-out browser path only  
**App:** `http://localhost:5173` (Vite) against existing remote Supabase via `frontend/.env.local`  
**Hosted SQL / RLS / schema changes:** none  
**Deployments:** none (no GitHub push, Vercel, VPS, or `supabase db push`)

---

## Browser workflow result: **PASS**

Landlord can complete the existing move-out workflow in the browser via **Complete move-out** → `complete_move_out`. Property returns to **available**, assignment becomes **completed** with history retained, and cross-tenant move-out remains denied. One confirmed UI defect (duplicate concurrent submit) was fixed with a minimal client guard.

---

## Requirements used

| Source | Criterion |
| --- | --- |
| **FR-011** | Complete move-out and return property to Available; preserve tenancy history. |
| **Roadmap Phase 2** | Move-out → property Available; history retained. |
| **OQ-08 / product** | Allow move-out; keep balances visible; do **not** auto-cancel open charges or auto-relist. |
| **Gap G3 (5.4.27)** | Browser move-out not previously exercised (API already PASS in 5.4.24). |

---

## Evidence and test fixture used

**Fixture script:** `frontend/scripts/smoke-moveout-5429.mjs` → `frontend/.smoke-5429-moveout.json`  
Reuses disposable **5425** smoke landlord users/tenants; adds dedicated move-out property + Landlord B occupied assignment.

| Actor | Identity | Notes |
| --- | --- | --- |
| Landlord A | `smoke_ll_a_5425@ijaaro.test` / `SmokePass123!_5425` | `landlord_admin` on `smoke-ll-a-5425` |
| Landlord B | `smoke_ll_b_5425@ijaaro.test` | Cross-tenant denial target only |
| Renter A | `smoke_renter_a_5425@ijaaro.test` | Assigned on A’s move-out target |
| Renter B | `smoke_renter_b_5429@ijaaro.test` | Assigned on B’s property (disposable) |

| Object | ID / name |
| --- | --- |
| Move-out property | `Smoke Move-Out Target 5429` (`c9e7eb76-ea55-48a0-a4ce-fa1a04305210`) |
| Active assignment (before) | `2c7a6001-713a-484f-80dd-342917352735` |
| Foreign property (B) | `Smoke Property B 5425` (`4c76a078-44c1-4dc3-9327-1ec28729ac99`) |
| Foreign assignment (B) | `2b287de5-2612-42e3-a754-9b4750b04fa6` |

**No real renter assignments or production financial records were altered.**

---

## Browser workflow results

| # | Check | Result | Evidence |
| --- | --- | --- | --- |
| 1 | Sign in as authorized landlord | **PASS** | `/login?tenant=smoke-ll-a-5425` → `/app/landlord` as Admin |
| 2 | Open occupied property / assignment | **PASS** | Detail showed **occupied**, active assignment ($250, due day 1, start 2026-10-01), **Complete move-out** |
| 3 | Submit move-out | **PASS** | Button click invokes existing `complete_move_out` (no new confirmation inputs in current UI) |
| 4 | Success only when RPC succeeds | **PASS** | Banner: **“Move-out completed; property set to available”**; badge → **available**; assign form returned |
| 5 | Assignment / property / renter display | **PASS** | UI: available + no active tenancy. DB: `status=available`, `current_renter_id=null`, assignment `completed`, `end_date=2026-10-19` |
| 6 | History retained; no auto charge cancel / relist | **PASS** | Tenancy detail: status **completed**, dates `2026-10-01 → 2026-10-19`, rent charge still present (**overdue** $250). **Listed: No** unchanged |
| 7 | Duplicate submission | **PASS** (observed + fixed) | Pre-fix double-click showed success **and** RPC error *“only active assignments can be completed”* (no false-only success). Minimal fix: disable button while in flight |
| 8 | Cross-tenant (browser) | **PASS** | As A, open B property URL → **“Property not found or unauthorized.”** (no move-out control) |
| 9 | Cross-tenant (supporting API) | **PASS** | As A, `complete_move_out` on B’s assignment → `not authorized`; B property remained **occupied** / assignment **active** |
| 10 | RPC error without false success | **PASS** | Duplicate path showed error banner; unit test asserts error-only path |

**Distinction:** Rows 1–8 and tenancy history are **browser evidence**. Row 9 is **API-only** supporting authorization proof (UI correctly hides foreign property).

---

## Assignment and property state verified

| Field | Before | After |
| --- | --- | --- |
| Property status | `occupied` | `available` |
| `current_renter_id` | Smoke Renter A | `null` |
| Assignment status | `active` | `completed` |
| Assignment end_date | `null` | `2026-10-19` |
| Rent charges on assignment | 1 | 1 (retained) |
| `is_listed` | `false` | `false` (not auto-relisted) |

---

## Loading, error, success, duplicate-submission

| State | Observed |
| --- | --- |
| Loading | Brief blank/loading on property & tenancy routes; post-fix button label **“Completing move-out…”** while RPC runs |
| Success | Green banner + status **available** + assign UI restored |
| Error | Red banner for duplicate/completed assignment RPC message |
| Duplicate | Pre-fix: concurrent double-click could show error + success together. **Fixed** with `movingOut` guard (single RPC). |

---

## Defect fixed and tests executed

| ID | Finding | Fix | SQL? |
| --- | --- | --- | --- |
| M1 | Move-out button not disabled; double-click could fire two RPCs and show error beside success | `movingOut` state; clear banners; disable + “Completing move-out…” label in `PropertyDetailPage.tsx` | **No** |

| Check | Result |
| --- | --- |
| `PropertyDetailPage.moveOut.test.tsx` | **PASS** (2) — in-flight disable / single RPC; error without success |
| RLS `assign_renter works` + `move-out` + `cannot complete_move_out` | **PASS** (3) |
| `npm run typecheck` | **PASS** |

---

## Remaining Landlords blockers

1. **G1** Marketplace field-isolation live cutover — still **BLOCKED** on explicit live approval (`docs/STEP_5.4.21_MARKETPLACE_CUTOVER_PLAN.md`). Not started here.
2. Optional: confirmation dialog before move-out (not required by FR-011; current one-click behavior retained).
3. Optional: landlord email lookup for invite (from 5.4.28) — product follow-up, unrelated to move-out.
4. Disposable smoke users/properties remain for reuse; do not treat as production identities.

**G3 (browser move-out) is closed by this step.**

---

## Confirmation

- No Marketplace or other-module changes.
- No shared RLS / schema changes.
- No deployment or `supabase db push`.
- Stopped after browser verification + minimal client fix.
