import { describe, expect, it } from "vitest";
import { workspaceAppHomePath } from "@/lib/roles";
import {
  resolveMyApplicationsRenterDestination,
  resolveTenantPortalDashboardDestination,
  type MyApplicationsNavMembership,
} from "./myApplicationsNav";

const hodanRenter: MyApplicationsNavMembership = {
  id: "mem-renter-1",
  role: "renter",
  status: "active",
  tenant: {
    slug: "hodan-properties",
    subdomain: "hodan-properties",
    tenant_type: "landlord",
    status: "active",
  },
};

const hodanLandlord: MyApplicationsNavMembership = {
  id: "mem-ll-1",
  role: "landlord_admin",
  status: "active",
  tenant: {
    slug: "hodan-properties",
    subdomain: "hodan-properties",
    tenant_type: "landlord",
    status: "active",
  },
};

describe("myApplicationsNav / portal destinations (RP-1.3.22 / RP-1.3.26)", () => {
  it("routes active renter to /app/renter with tenant slug preserved", () => {
    const dest = resolveMyApplicationsRenterDestination(
      [hodanRenter],
      "Hodan-Properties",
    );
    expect(dest).toEqual({
      path: "/app/renter?tenant=hodan-properties",
      membershipId: "mem-renter-1",
    });
    expect(resolveTenantPortalDashboardDestination([hodanRenter], "hodan-properties")).toEqual(
      dest,
    );
  });

  it("does not grant renter access without an active renter membership", () => {
    expect(resolveMyApplicationsRenterDestination([], "hodan-properties")).toBeNull();
    expect(resolveTenantPortalDashboardDestination([], "hodan-properties")).toBeNull();
    expect(
      resolveMyApplicationsRenterDestination(
        [{ ...hodanRenter, status: "invited" }],
        "hodan-properties",
      ),
    ).toBeNull();
    expect(
      resolveTenantPortalDashboardDestination(
        [{ ...hodanRenter, status: "invited" }],
        "hodan-properties",
      ),
    ).toBeNull();
    expect(
      resolveMyApplicationsRenterDestination([hodanRenter], "other-landlord"),
    ).toBeNull();
    expect(
      resolveTenantPortalDashboardDestination([hodanRenter], "other-landlord"),
    ).toBeNull();
  });

  it("treats empty memberships as a loading/missing race (no destination)", () => {
    // Fresh refresh returning [] must not invent /app/renter or /app/landlord.
    expect(resolveTenantPortalDashboardDestination([], "hodan-properties")).toBeNull();
    expect(
      resolveTenantPortalDashboardDestination(
        [
          {
            ...hodanLandlord,
            tenant: {
              ...hodanLandlord.tenant,
              slug: "other-landlord",
              subdomain: "other-landlord",
            },
          },
        ],
        "hodan-properties",
      ),
    ).toBeNull();
  });

  it("preserves landlord and platform-admin home paths", () => {
    expect(
      resolveTenantPortalDashboardDestination([hodanLandlord], "hodan-properties"),
    ).toEqual({
      path: "/app/landlord?tenant=hodan-properties",
      membershipId: "mem-ll-1",
    });

    expect(
      workspaceAppHomePath({
        role: "super_admin",
        tenant: { slug: "platform", tenant_type: "platform" },
      }),
    ).toBe("/app?tenant=platform");

    expect(
      resolveMyApplicationsRenterDestination([hodanLandlord], "hodan-properties"),
    ).toBeNull();
  });

  it("pending/rejected style rows (no active membership) stay blocked", () => {
    expect(
      resolveTenantPortalDashboardDestination(
        [
          {
            ...hodanRenter,
            status: "removed",
          },
        ],
        "hodan-properties",
      ),
    ).toBeNull();
  });
});
