import { describe, expect, it } from "vitest";
import type { MembershipWithTenant } from "@/auth/AuthProvider";
import type { AppRole, TenantType } from "@/types/database";
import {
  canShowBrandingNav,
  navForRole,
  navItemIsActive,
  navLinkUsesExactEnd,
  utilityNavForActiveMembership,
} from "./appShellNav";

function mem(partial: {
  id: string;
  role: AppRole;
  status?: "active" | "disabled" | "invited";
  tenantType?: TenantType;
  tenantId?: string;
  name?: string;
}): MembershipWithTenant {
  const tenantType = partial.tenantType ?? "landlord";
  const tenantId = partial.tenantId ?? `tenant-${partial.id}`;
  return {
    id: partial.id,
    tenant_id: tenantId,
    user_id: "user-1",
    role: partial.role,
    status: partial.status ?? "active",
    permissions: {},
    invited_by: null,
    created_at: "",
    updated_at: "",
    tenant: {
      id: tenantId,
      name: partial.name ?? `Tenant ${partial.id}`,
      slug: `slug-${partial.id}`,
      subdomain: `slug-${partial.id}`,
      tenant_type: tenantType,
      status: "active",
      branding: {},
      settings: {},
      created_at: "",
      updated_at: "",
    },
  };
}

describe("navLinkUsesExactEnd", () => {
  it("marks landlord Overview for exact match so child routes stay inactive", () => {
    expect(navLinkUsesExactEnd("/app/landlord")).toBe(true);
    expect(navLinkUsesExactEnd("/app/landlord/properties")).toBe(false);
    expect(navLinkUsesExactEnd("/app/renter")).toBe(true);
  });
});

describe("navItemIsActive", () => {
  it("activates Tenancies & Rent for payments and renters paths", () => {
    const item = {
      to: "/app/landlord/tenancies",
      label: "Tenancies & Rent",
      icon: (() => null) as never,
      activePrefixes: [
        "/app/landlord/tenancies",
        "/app/landlord/payments",
        "/app/landlord/renters",
      ],
    };
    expect(navItemIsActive(item, "/app/landlord/payments")).toBe(true);
    expect(navItemIsActive(item, "/app/landlord/properties")).toBe(false);
  });

  it("activates Finance & Payments for bills and meters", () => {
    const item = {
      to: "/app/water/finance",
      label: "Finance & Payments",
      icon: (() => null) as never,
      activePrefixes: [
        "/app/water/finance",
        "/app/water/bills",
        "/app/water/payments",
        "/app/water/meters",
        "/app/water/readings",
        "/app/water/reports",
      ],
    };
    expect(navItemIsActive(item, "/app/water/meters")).toBe(true);
    expect(navItemIsActive(item, "/app/water/customers")).toBe(false);
  });
});

describe("canShowBrandingNav", () => {
  it("shows company settings only for active landlord_admin or utility_admin", () => {
    expect(
      canShowBrandingNav(mem({ id: "a", role: "landlord_admin", tenantType: "landlord" })),
    ).toBe(true);
    expect(
      canShowBrandingNav(
        mem({ id: "w", role: "utility_admin", tenantType: "water_company" }),
      ),
    ).toBe(true);
    expect(
      canShowBrandingNav(mem({ id: "s", role: "landlord_staff", tenantType: "landlord" })),
    ).toBe(false);
    expect(
      canShowBrandingNav(
        mem({
          id: "a",
          role: "landlord_admin",
          tenantType: "landlord",
          status: "disabled",
        }),
      ),
    ).toBe(false);
  });
});

describe("utilityNavForActiveMembership", () => {
  it("returns simplified water staff links only when water membership is active", () => {
    const water = mem({
      id: "w",
      role: "utility_admin",
      tenantType: "water_company",
      name: "Water Co",
    });
    const paths = utilityNavForActiveMembership(water).map((i) => i.to);
    expect(paths).toEqual([
      "/app/water",
      "/app/water/customers",
      "/app/water/finance",
      "/app/water/staff",
    ]);
    expect(paths.some((p) => p.startsWith("/app/electricity"))).toBe(false);
  });

  it("hides staff nav for utility_staff", () => {
    const staff = mem({
      id: "ws",
      role: "utility_staff",
      tenantType: "water_company",
    });
    const paths = utilityNavForActiveMembership(staff).map((i) => i.to);
    expect(paths).toEqual(["/app/water", "/app/water/customers", "/app/water/finance"]);
  });

  it("hides utility nav when active membership is landlord", () => {
    const landlord = mem({ id: "ll", role: "landlord_admin", tenantType: "landlord" });
    expect(utilityNavForActiveMembership(landlord)).toEqual([]);
  });
});

describe("navForRole (membership switching)", () => {
  it("landlord admin uses simplified sidebar with Company Settings", () => {
    const admin = mem({ id: "a", role: "landlord_admin", tenantType: "landlord" });
    const paths = navForRole("landlord_admin", false, admin).map((i) => i.to);
    expect(paths).toEqual([
      "/app/landlord",
      "/app/landlord/properties",
      "/app/landlord/applications",
      "/app/landlord/tenancies",
      "/app/landlord/staff",
      "/app/branding",
      "/app/account",
    ]);
    const labels = navForRole("landlord_admin", false, admin).map((i) => i.label);
    expect(labels).toContain("Tenancies & Rent");
    expect(labels).toContain("Company Settings");
    expect(labels).not.toContain("Invite renter");
    expect(labels).not.toContain("Rent review");
  });

  it("landlord staff omits admin ops and company settings", () => {
    const staff = mem({ id: "s", role: "landlord_staff", tenantType: "landlord" });
    const paths = navForRole("landlord_staff", false, staff).map((i) => i.to);
    expect(paths).toEqual([
      "/app/landlord",
      "/app/landlord/properties",
      "/app/account",
    ]);
  });

  it("switching active membership from landlord admin to water drops landlord links", () => {
    const water = mem({
      id: "w",
      role: "utility_admin",
      tenantType: "water_company",
    });
    const paths = navForRole("utility_admin", false, water).map((i) => i.to);
    expect(paths).not.toContain("/app/landlord");
    expect(paths).not.toContain("/app/landlord/staff");
    expect(paths).toContain("/app/water");
    expect(paths).toContain("/app/water/finance");
    expect(paths).toContain("/app/water/staff");
    expect(paths).toContain("/app/branding");
  });

  it("landlord admin active while user also has water membership does not show water nav", () => {
    const activeLandlord = mem({
      id: "ll",
      role: "landlord_admin",
      tenantType: "landlord",
    });
    const paths = navForRole("landlord_admin", false, activeLandlord).map((i) => i.to);
    expect(paths.some((p) => p.startsWith("/app/water"))).toBe(false);
    expect(paths).toContain("/app/landlord/staff");
  });
});
