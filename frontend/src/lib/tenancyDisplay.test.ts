import { describe, expect, it } from "vitest";
import { propertyLabel, renterLabel, shortId } from "./tenancyDisplay";

describe("tenancyDisplay", () => {
  it("prefers property name, then address, then unknown", () => {
    expect(propertyLabel({ name: "Villa A", address_line: "1 Main" })).toBe("Villa A");
    expect(propertyLabel({ name: "  ", address_line: "1 Main" })).toBe("1 Main");
    expect(propertyLabel({ name: null, address_line: null })).toBe("Unknown property");
    expect(propertyLabel(null)).toBe("Unknown property");
  });

  it("prefers renter full name, then email, then unknown", () => {
    expect(renterLabel({ full_name: "Som Via", email: "a@b.co" })).toBe("Som Via");
    expect(renterLabel({ full_name: "", email: "a@b.co" })).toBe("a@b.co");
    expect(renterLabel({ full_name: null, email: null })).toBe("Unknown renter");
    expect(renterLabel(null)).toBe("Unknown renter");
  });

  it("shortens ids for secondary troubleshooting labels", () => {
    expect(shortId("65cb54fe-6620-4428-9efc-e6b653295a95")).toBe("65cb54fe…");
    expect(shortId("abc")).toBe("abc");
  });
});
