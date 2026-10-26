import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("property photo identity immutability migration (M1)", () => {
  const path = resolve(
    process.cwd(),
    "../supabase/migrations/20261022200000_property_photo_identity_immutable.sql",
  );
  const sql = readFileSync(path, "utf8");

  it("defines protect_property_photo_identity with search_path and immutability checks", () => {
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.protect_property_photo_identity()");
    expect(sql).toMatch(/SET search_path = public/);
    expect(sql).toContain("property_photos.property_id is immutable");
    expect(sql).toContain("property_photos.storage_path is immutable");
    expect(sql).toContain("ijaaro.internal");
  });

  it("attaches a BEFORE UPDATE trigger on property_photos", () => {
    expect(sql).toContain("CREATE TRIGGER property_photos_protect_identity");
    expect(sql).toMatch(/BEFORE UPDATE ON public\.property_photos/);
  });
});
