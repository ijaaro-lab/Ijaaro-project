# IJAARO Tenant Isolation Matrix

**Date:** 2026-10-13  
**Roles:** `super_admin` (SA), `landlord_admin` (LA), `landlord_staff` (LS), `renter` (R), `utility_admin` (UA), `utility_staff` (US), `utility_customer` (UC)

Legend for operations: ✅ allowed under RLS/RPC · ❌ denied · RPC = SECURITY DEFINER only · Pub = intentional public/marketplace

---

## 1. Ownership keys

| Table | Tenant / ownership key | Notes |
|-------|------------------------|-------|
| `tenants` | `id` | Platform tenant hidden from non–super-admin |
| `tenant_memberships` | `tenant_id`, `user_id` | Active status required for helpers |
| `profiles` | `id` (= auth user) | Self + SA |
| `audit_logs` | `tenant_id` | Insert via DEFINER only |
| `properties` | `tenant_id`, `owner_id`, `created_by_tenant_id` | Utility-created premises stay on utility tenant |
| `property_photos` | `tenant_id`, `property_id` | |
| `rental_assignments` | `tenant_id`, `renter_id`, `property_id` | |
| `rent_charges` | `tenant_id`, `renter_id`, `assignment_id` | |
| `rent_payments` | `tenant_id`, `payer_id`, `charge_id` | |
| `utility_accounts` | `tenant_id`, `customer_id`, `property_id` | |
| `meters` | `tenant_id`, `utility_account_id` | |
| `meter_readings` | `tenant_id`, `meter_id` | Mutate via RPC |
| `utility_bills` | `tenant_id`, `responsible_party_id` | Mutate via RPC |
| `utility_payments` | `tenant_id`, `payer_id`, `bill_id` | |

---

## 2. Role × operation matrix (tenant-sensitive tables)

### Foundation

| Table | SELECT | INSERT | UPDATE | DELETE | Policies / RPC |
|-------|--------|--------|--------|--------|----------------|
| `profiles` | self, SA | self | self, SA | ❌ | `profiles_*` |
| `tenants` | SA; active members (non-platform) | SA / `provision_*` / `self_provision_*` | SA; branding via `update_tenant_branding` | ❌ | `tenants_*` |
| `tenant_memberships` | self; LA/UA on tenant; SA | LA/UA (operable); SA; RPCs | LA/UA; SA; no self→SA | ❌ | `memberships_*`, `manage_membership` |
| `audit_logs` | SA; LA/UA on tenant | DEFINER only | ❌ | ❌ | `audit_logs_select_authorized` |

### Rental

| Table | SELECT | INSERT | UPDATE | DELETE | Isolation notes |
|-------|--------|--------|--------|--------|-----------------|
| `properties` | members; Pub listed+available; current renter; SA | LA/LS (`can_manage_landlord_ops`); utility RPC | LA/LS | LA if vacant | Cross-tenant **Pub** browse only for listed available |
| `property_photos` | same as property visibility | LA/LS | LA/LS | LA/LS | |
| `rental_assignments` | LA/LS; R; SA | RPC `assign_renter` | LA/LS (notes; immutables blocked) | RPC `complete_move_out` | Direct I/D denied |
| `rent_charges` | LA/LS; R; SA | LA/LS / RPC | LA/LS (financials protected) | ❌ | |
| `rent_payments` | LA/LS; payer; SA | R pending | payer while pending | ❌ | Approve via `review_rent_payment` (LA only) |

### Utility

| Table | SELECT | INSERT | UPDATE | DELETE | Isolation notes |
|-------|--------|--------|--------|--------|-----------------|
| `utility_accounts` | UA/US; UC; SA | UA/US | UA/US | ❌ | Water vs electricity = separate tenants |
| `meters` | UA/US; customer via account; SA | UA/US | UA/US | ❌ | |
| `meter_readings` | UA/US; customer; SA | RPC | ❌ | ❌ | `record_meter_reading` |
| `utility_bills` | UA/US; responsible; customer; SA | RPC | RPC | ❌ | `generate_utility_bill` |
| `utility_payments` | UA/US; payer; SA | payer (trigger) | payer pending | ❌ | Approve via `review_utility_payment` (UA only) |

**Cross-type rule:** Landlords have **no** policies on utility tables. Utility staff do **not** get landlord ops via property relation alone (except scoped `search_properties_for_link` / premises create under utility tenant).

---

## 3. Privileged RPCs (authorization gate)

| RPC | Who may call | Cross-tenant risk after harden |
|-----|--------------|--------------------------------|
| `provision_tenant` / `set_tenant_status` | SA | None |
| `self_provision_tenant` | authenticated (1 admin workspace / type) | Abuse/spam only |
| `manage_membership` | LA/UA/SA | Cannot grant `super_admin` unless SA |
| `assign_renter` / `complete_move_out` | LA/LS on property tenant | Ownership chain checked |
| `create_rent_charge` / `review_rent_payment` | LA/LS / LA | Tenant of payment |
| `search_properties_for_link` | UA/US | Fuzzy: own/linked/listed-available; UUID: known id; no renter id |
| `create_utility_premises` | UA/US on company | Writes **only** to company tenant |
| `link_utility_account` | UA/US | Property any; account under company; may upsert UC membership |
| `record_meter_reading` / `generate_utility_bill` / `review_utility_payment` | UA/US / UA | Meter/bill tenant must match |
| `resolve_tenant_workspace` | anon + authenticated | Public branding only |
| `update_tenant_branding` | LA/UA/SA | Own tenant |

---

## 4. Storage isolation

| Bucket | Public? | Read | Write | Notes |
|--------|---------|------|-------|-------|
| `avatars` | yes | public | own user folder | Profile photos |
| `tenant-branding` | yes | public | LA/UA/SA only (post-harden) | No SVG |
| `payment-proofs` | no | rent path: LA/LS/renter; utility path: UA/US/customer | Path-scoped | Rent policies exclude `utility/` prefix |
| `property-photos` | no | per property visibility | LA/LS | |

---

## 5. Cross-tenant attack coverage map

| # | Attack | Tables / RPC | Test coverage |
|---|--------|--------------|---------------|
| 1 | Landlord A read Landlord B | `tenants`, `properties`, rent\* | `rls.security`, `rls.rental` |
| 2 | Landlord A mutate B | same | `rls.security`, `rls.rental` |
| 3 | Water A → Water B | utility\* | `rls.utility`, `rls.hardening` |
| 4 | Electricity A → Electricity B | utility\* | `rls.utility` |
| 5 | Water ↔ Electricity private data | utility\* | `rls.utility` |
| 6 | Landlord → utility admin data | utility\* (no policies) | `rls.utility` |
| 7 | Renter → other renter | assignments, payments | `rls.rental` |
| 8 | Utility customer → other customer | accounts, bills | `rls.utility` |
| 9 | ID / tenant_id swap | RPC + RLS | security + rental + utility |
| 10 | Inactive membership | tenants SELECT | `rls.security` #7 |
| 11 | Branding isolation | storage + `update_tenant_branding` | `rls.hardening` |
| 12 | Public landing only public fields | `resolve_tenant_workspace` | `rls.hardening` |
| 13 | Property search dump | `search_properties_for_link` | `rls.hardening` |
| 14 | Premises hijack landlord tenant | `create_utility_premises` | `rls.hardening` |

---

## 6. Unresolved authorization ambiguities

1. **Marketplace browse:** Authenticated users can SELECT listed+available properties across landlord tenants (product intent). Contact phone/email may be visible — confirm product acceptance.
2. **UUID property lookup** for utility linking still returns address for private properties when the exact UUID is known (needed to link accounts).
3. **`link_utility_account` membership upsert** force-activates `utility_customer` — intentional onboarding vs abuse if staff compromised.
4. **Frontend `RoleRoute`** allows super_admin into all role areas — DB still enforces; product may want stricter UX.
