import { describe, expect, it } from "vitest";
import {
  normalizeTenantLoginSlug,
  resolveSetPasswordSuccessLoginPath,
  workspaceLoginPathForSlug,
  type MembershipForLoginRedirect,
} from "./setPasswordLoginRedirect";

function mem(
  partial: Partial<MembershipForLoginRedirect> & {
    tenant?: MembershipForLoginRedirect["tenant"];
  },
): MembershipForLoginRedirect {
  return {
    status: partial.status ?? "active",
    role: partial.role ?? "renter",
    tenant: partial.tenant ?? {
      slug: "hodan-properties",
      subdomain: "hodan-properties",
      tenant_type: "landlord",
      status: "active",
    },
  };
}

describe("normalizeTenantLoginSlug", () => {
  it("accepts lowercase slug-like keys", () => {
    expect(normalizeTenantLoginSlug("Hodan-Properties")).toBe("hodan-properties");
    expect(normalizeTenantLoginSlug("  acme  ")).toBe("acme");
  });

  it("rejects schemes, paths, and unsafe characters", () => {
    expect(normalizeTenantLoginSlug("https://evil.example")).toBeNull();
    expect(normalizeTenantLoginSlug("../admin")).toBeNull();
    expect(normalizeTenantLoginSlug("a/b")).toBeNull();
    expect(normalizeTenantLoginSlug("bad_slug")).toBeNull();
    expect(normalizeTenantLoginSlug("")).toBeNull();
  });
});

describe("workspaceLoginPathForSlug", () => {
  it("URL-encodes the tenant query value", () => {
    expect(workspaceLoginPathForSlug("hodan-properties")).toBe(
      "/login?tenant=hodan-properties",
    );
    // encodeURIComponent leaves hyphens alone; still a relative path only.
    expect(workspaceLoginPathForSlug("acme")).toMatch(/^\/login\?tenant=/);
    expect(workspaceLoginPathForSlug("https://x")).toBe("/login");
  });
});

describe("resolveSetPasswordSuccessLoginPath", () => {
  it("sends a single-workspace renter to workspace login", () => {
    expect(
      resolveSetPasswordSuccessLoginPath({
        memberships: [mem({ role: "renter" })],
      }),
    ).toBe("/login?tenant=hodan-properties");
  });

  it("falls back to platform /login when memberships are empty", () => {
    expect(resolveSetPasswordSuccessLoginPath({ memberships: [] })).toBe("/login");
  });

  it("ignores platform memberships and uses the workspace slug", () => {
    expect(
      resolveSetPasswordSuccessLoginPath({
        memberships: [
          mem({
            role: "super_admin",
            tenant: {
              slug: "platform",
              tenant_type: "platform",
              status: "active",
            },
          }),
          mem({ role: "renter" }),
        ],
      }),
    ).toBe("/login?tenant=hodan-properties");
  });

  it("uses preferred hint only when it matches a membership", () => {
    const rows = [
      mem({
        role: "renter",
        tenant: {
          slug: "alpha-co",
          tenant_type: "landlord",
          status: "active",
        },
      }),
      mem({
        role: "renter",
        tenant: {
          slug: "beta-co",
          tenant_type: "landlord",
          status: "active",
        },
      }),
    ];
    expect(
      resolveSetPasswordSuccessLoginPath({
        memberships: rows,
        preferredTenantHint: "beta-co",
      }),
    ).toBe("/login?tenant=beta-co");
    expect(
      resolveSetPasswordSuccessLoginPath({
        memberships: rows,
        preferredTenantHint: "https://evil.example",
      }),
    ).toBe("/login");
    expect(
      resolveSetPasswordSuccessLoginPath({
        memberships: rows,
        preferredTenantHint: "unknown-co",
      }),
    ).toBe("/login");
  });

  it("when multiple workspaces exist, prefers a unique renter membership", () => {
    expect(
      resolveSetPasswordSuccessLoginPath({
        memberships: [
          mem({
            role: "landlord_admin",
            tenant: {
              slug: "admin-land",
              tenant_type: "landlord",
              status: "active",
            },
          }),
          mem({
            role: "renter",
            tenant: {
              slug: "hodan-properties",
              tenant_type: "landlord",
              status: "active",
            },
          }),
        ],
      }),
    ).toBe("/login?tenant=hodan-properties");
  });

  it("falls back when multiple renters span different workspaces", () => {
    expect(
      resolveSetPasswordSuccessLoginPath({
        memberships: [
          mem({
            role: "renter",
            tenant: { slug: "one", tenant_type: "landlord", status: "active" },
          }),
          mem({
            role: "renter",
            tenant: { slug: "two", tenant_type: "landlord", status: "active" },
          }),
        ],
      }),
    ).toBe("/login");
  });

  it("keeps platform-only admins on /login", () => {
    expect(
      resolveSetPasswordSuccessLoginPath({
        memberships: [
          mem({
            role: "super_admin",
            tenant: {
              slug: "platform",
              tenant_type: "platform",
              status: "active",
            },
          }),
        ],
      }),
    ).toBe("/login");
  });
});
