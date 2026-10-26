import { describe, expect, it } from "vitest";
import { formatPropertyTypeLabel, pickCoverPaths } from "./propertyPhotos";

describe("propertyPhotos helpers", () => {
  it("picks the lowest sort_order path per property", () => {
    const covers = pickCoverPaths([
      { property_id: "a", storage_path: "a/second.jpg", sort_order: 2 },
      { property_id: "a", storage_path: "a/first.jpg", sort_order: 0 },
      { property_id: "b", storage_path: "b/only.jpg", sort_order: 1 },
    ]);
    expect(covers).toEqual({
      a: "a/first.jpg",
      b: "b/only.jpg",
    });
  });

  it("formats property type labels", () => {
    expect(formatPropertyTypeLabel("apartment")).toBe("Apartment");
    expect(formatPropertyTypeLabel("")).toBe("Property");
  });
});
