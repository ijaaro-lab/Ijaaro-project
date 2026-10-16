# IJAARO — Utility Billing & Payment Rules (Prompt 03)

**Status:** Implemented in Phase 3–4 migrations (`20261013000006`–`07`)  
**Sources:** `BRD-1.md` FR-054–057, BR-006, BR-020–021 · `SYSTEM_DESIGN.md` §8.6

---

## Documented formula (authoritative)

```text
units_consumed = current_reading − previous_reading
bill_total     = (units_consumed × unit_price) + extra_charges
```

Worked example (FR-054): readings `100 → 130`, `unit_price = 0.50` ⇒ `30` units, **`$15.00`** before extra charges.

Calculations run only in trusted RPCs (`record_meter_reading`, `generate_utility_bill`). Browser-submitted totals are never trusted.

---

## Responsibility snapshot (BR-006)

At bill generation time:

- If `properties.current_renter_id` is set → `responsible_party_id = current_renter`, role `renter`
- Else → `responsible_party_id = owner_id`, role `owner`

`responsible_party_id`, amounts, and `unit_price` on the bill are immutable after insert (except payment balance updates via `review_utility_payment`). Changing occupancy or account tariff does **not** rewrite historic bills.

---

## OQ-07 working defaults (explicit — not invented tariffs)

| Topic | Working default | Status |
| --- | --- | --- |
| Due date | `period_end + 14 days` if not supplied | Working default |
| Extra charges | `extra_charges_config.fixed_amount` or sum of `items[].amount`; else `0` | Working default |
| Partial payments | Allowed; bill status `partial` until balance `0` | Working default |
| Estimated readings | May be stored (`estimated`); **not** used for bill generation | Working default |
| Decreasing readings | Rejected unless status `corrected` / `reset` with `correction_reason` | Per FR-056 |
| Tiered / TOU tariffs | **Not specified** — flat `unit_price` only | Open |
| Late fees / arrears policy | **Not specified** | Open (OQ-07) |
| Meter rollover / replacement workflow | Status fields exist; full replacement workflow deferred | Open |
| API payment provider | Manual path only | Open (OQ-02) |

---

## Payment rules (critical)

| Payment type | Starts as | Approved by |
| --- | --- | --- |
| Manual rent | `pending` | Landlord admin/staff |
| Manual **utility** | `pending` | **Same water/electricity company only** |

Landlords **cannot** approve utility payments. Utility companies **cannot** approve rent payments.

Manual approval records a company review of a submitted claim; it does **not** independently verify funds received outside the platform.

---

## Trusted RPCs

| RPC | Purpose |
| --- | --- |
| `search_properties_for_link` | Minimal cross-tenant property search for linking |
| `create_utility_premises` | Path B premises create (`created_source` = utility) |
| `link_utility_account` | Create account (+ optional meter) on existing property |
| `record_meter_reading` | Validated reading insert |
| `generate_utility_bill` | Formula + responsibility snapshot + period uniqueness |
| `review_utility_payment` | Company approve/reject; updates bill balance once |

Edge wrappers: `link-utility-account`, `record-meter-reading`, `generate-utility-bill`; `approve-payment` accepts `payment_type: rent | utility`.
