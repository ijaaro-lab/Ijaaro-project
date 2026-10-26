import { describe, expect, it } from "vitest";
import { resolvePortalTenantKey } from "./tenant";

describe("resolvePortalTenantKey (RP-1.3.32 F1)", () => {
  it("prefers active membership slug over URL tenant", () => {
    expect(
      resolvePortalTenantKey({
        membershipSlug: "hodan-properties",
        membershipSubdomain: "other",
        search: "?tenant=other-landlord",
      }),
    ).toBe("hodan-properties");
  });

  it("falls back to membership subdomain when slug is empty", () => {
    expect(
      resolvePortalTenantKey({
        membershipSlug: "  ",
        membershipSubdomain: "Hodan-Properties",
        search: "",
      }),
    ).toBe("hodan-properties");
  });

  it("falls back to ?tenant= when membership is absent", () => {
    expect(
      resolvePortalTenantKey({
        search: "?tenant=hodan-properties",
      }),
    ).toBe("hodan-properties");
  });

  it("returns null when unresolved (fail closed)", () => {
    expect(resolvePortalTenantKey({ search: "" })).toBeNull();
  });
});
