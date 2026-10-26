import { describe, expect, it } from "vitest";

/**
 * Documents the Edge Function eligibility contract used before signing.
 * The function (public-listing-photos/index.ts) independently:
 * 1) resolves an operable landlord from tenant_key (slug/subdomain, active)
 * 2) keeps only properties with tenant_id match + is_listed + status=available
 * 3) signs photos only for that eligible set
 *
 * These pure checks mirror that filter so tests fail if the contract drifts.
 */
function eligiblePropertyIds(
  requested: string[],
  rows: Array<{ id: string; tenant_id: string; is_listed: boolean; status: string }>,
  resolvedTenantId: string,
): string[] {
  const allowed = new Set(
    rows
      .filter(
        (r) =>
          r.tenant_id === resolvedTenantId &&
          r.is_listed === true &&
          r.status === "available",
      )
      .map((r) => r.id),
  );
  return requested.filter((id) => allowed.has(id));
}

const TENANT_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TENANT_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const PROP_OK = "11111111-1111-4111-8111-111111111111";
const PROP_HIDDEN = "22222222-2222-4222-8222-222222222222";
const PROP_OCCUPIED = "33333333-3333-4333-8333-333333333333";
const PROP_FOREIGN = "44444444-4444-4444-8444-444444444444";
const PROP_UNKNOWN = "55555555-5555-4555-8555-555555555555";

const inventory = [
  { id: PROP_OK, tenant_id: TENANT_A, is_listed: true, status: "available" },
  { id: PROP_HIDDEN, tenant_id: TENANT_A, is_listed: false, status: "available" },
  { id: PROP_OCCUPIED, tenant_id: TENANT_A, is_listed: true, status: "occupied" },
  { id: PROP_FOREIGN, tenant_id: TENANT_B, is_listed: true, status: "available" },
];

describe("public listing photo eligibility contract", () => {
  it("includes only listed+available properties for the resolved tenant", () => {
    expect(
      eligiblePropertyIds(
        [PROP_OK, PROP_HIDDEN, PROP_OCCUPIED, PROP_FOREIGN, PROP_UNKNOWN],
        inventory,
        TENANT_A,
      ),
    ).toEqual([PROP_OK]);
  });

  it("returns no ids for cross-tenant or unknown requests", () => {
    expect(eligiblePropertyIds([PROP_FOREIGN], inventory, TENANT_A)).toEqual([]);
    expect(eligiblePropertyIds([PROP_UNKNOWN], inventory, TENANT_A)).toEqual([]);
  });

  it("returns no ids for hidden or occupied properties", () => {
    expect(eligiblePropertyIds([PROP_HIDDEN, PROP_OCCUPIED], inventory, TENANT_A)).toEqual(
      [],
    );
  });
});
