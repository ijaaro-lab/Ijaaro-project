# RP-1.3.8 — Move-Out Test Flakiness Triage

**Date:** 2026-10-20  
**Builds on:** RP-1.3.7 residual unit flake  
**Scope:** Stabilize `PropertyDetailPage.moveOut.test.tsx` disable-in-flight assertion  
**Hosted Supabase / Edge / secrets / GitHub / Vercel / production:** **untouched**

---

## Verdict

**Root cause:** test race, not a production UI defect.  
**Fix:** controllable deferred RPC promise (no fixed `setTimeout`).  
**Production code changed:** **No**.  
**Focused repeat runs:** **12/12 passed**.  
**With RP-1.3.7 core suites:** **96 passed / 0 failed / 0 skipped** (includes the 2 move-out tests).  
**Typecheck:** exit **0**.

RP-1.4 was **not** started.

---

## Phase A — Failure inspection

### Reported symptom (RP-1.3.7)

```text
FAIL PropertyDetailPage.moveOut.test.tsx
  disables Complete move-out while the RPC is in flight and reports success only once
Error: expect(element).toBeDisabled()
Received element is not disabled: <button class="… outline …">
```

Failure appeared when the file ran inside a large Vitest batch; isolated runs often passed.

### Production behavior (inspected)

`PropertyDetailPage.moveOut`:

- Sets `movingOut` true before `complete_move_out`
- Button: `disabled={movingOut}` and label `"Completing move-out…"` when true
- Early return `if (!assignment || movingOut) return` blocks re-entry
- Clears `movingOut` after error or after successful `load()`

`Button` forwards the native `disabled` attribute. No evidence of a real disable defect.

### Prior test pattern (defect)

```ts
// complete_move_out mock used setTimeout(..., 40)
fireEvent.click(btn);
expect(await screen.findByRole("button", { name: /completing move-out/i })).toBeDisabled();
```

Under suite load, the 40ms mock could resolve (and `movingOut` clear via `load()`) between `findByRole` seeing the in-flight label and `toBeDisabled()` reading the DOM — classic race. Arbitrary delay is not reliable synchronization.

### Classification

| Candidate | Verdict |
| --- | --- |
| Real UI defect | **No** — `disabled` and label share `movingOut` |
| Missing / wrong async mock | **Yes** — wall-clock `setTimeout(40)` |
| Test race / wait pattern | **Yes** — assertion not gated on an unresolved promise |
| Shared state leak | **No** — `beforeEach` resets mocks |

### Pre-fix reproduce

- 5 and 15 consecutive isolated runs: all passed (flake is load-sensitive).
- Historical RP-1.3.7 failure under aggregated suite remains the evidence of flakiness.

---

## Phase B — Minimal correction

**File changed:** `frontend/src/pages/landlord/PropertyDetailPage.moveOut.test.tsx` only.

Changes:

1. Replaced `setTimeout(40)` with a **deferred promise** the test resolves after asserting the in-flight disabled state.
2. Asserted RPC call count is still **1** after a second click while disabled (production `movingOut` guard).
3. Strengthened the error case the same way: assert disabled in flight → resolve error → assert error copy, no success toast, button **re-enabled**.
4. Used `/^complete move-out$/i` for the idle button so it does not collide with “Completing…”.

No production, schema, migration, or business-logic changes.

---

## Phase C — Verification

### Focused repeat runs

```text
npx vitest run src/pages/landlord/PropertyDetailPage.moveOut.test.tsx
```

× **12 consecutive process invocations:** **PASSED=12 FAILED=0**  
Each run: **2 passed / 0 failed / 0 skipped**

### PropertyDetailPage suite

Only test file for this page: `PropertyDetailPage.moveOut.test.tsx` → **2/2 passed** (same as focused).

### RP-1.3.7 core regression (+ move-out)

```text
npx vitest run
  src/pages/landlord/PropertyDetailPage.moveOut.test.tsx
  src/lib/inviteRenter.test.ts
  src/lib/listSameTenantMemberProfiles.migration.test.ts
  src/lib/provisionRenter.authz.test.ts
  src/lib/provisionRenter.test.ts
  src/lib/provisionRenter.usernameScope.test.ts
  src/lib/supabaseEnv.test.ts
  src/lib/username.landlordScope.test.ts
  src/lib/username.test.ts
  src/pages/landlord/InviteRenterPage.test.tsx
  src/test/rls.rental.test.ts
  src/test/rls.marketplace.test.ts
  src/test/rls.renterApplications.test.ts
```

| Result | Count |
| --- | --- |
| Test files | **13 passed** |
| **Passed** | **96** |
| **Failed** | **0** |
| **Skipped** | **0** |

(Compare RP-1.3.7 critical set **94** + this file’s **2** = **96**.)

### Typecheck

```text
npm run typecheck   # exit 0
```

Build not required (no production file changes).

---

## Untouched systems

| Surface | Touched? |
| --- | --- |
| Hosted Supabase | **No** |
| DB migrations / reset / repair | **No** |
| Edge deploy | **No** |
| Secrets | **No** |
| GitHub push | **No** |
| Vercel / production | **No** |

---

## Remaining issues

None for this flake. Broader roadmap items (e.g. hosted STEP 5.4.31) remain outside RP-1.3.8.

---

## Exact next action

RP-1.3 local invite/assign RPC + move-out unit flake are addressed. **Do not start RP-1.4** until the product owner schedules that phase.
