import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { validateUsernameInput } from "./username";

describe("landlord-scoped username strategy (RP-1.3.2)", () => {
  it("keeps existing format validation", () => {
    expect(validateUsernameInput("abdirahman")).toEqual({
      ok: true,
      username: "abdirahman",
    });
  });

  it("tracked 20261019160000 migration is a no-op (cannot create global username index)", () => {
    const path = resolve(
      process.cwd(),
      "../supabase/migrations/20261019160000_profiles_username.sql",
    );
    const sql = readFileSync(path, "utf8");
    expect(sql).toMatch(/SUPERSEDED NO-OP|RP-1\.3\.4/i);
    expect(sql).not.toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_lower_uidx/);
    expect(sql).not.toMatch(/ALTER TABLE public\.profiles\s+ADD COLUMN IF NOT EXISTS username/i);
  });

  it("archives the rejected global-username draft outside executable migrations", () => {
    const path = resolve(
      process.cwd(),
      "../supabase/migrations/20261019160000_profiles_username.SUPERSEDED.md",
    );
    const md = readFileSync(path, "utf8");
    expect(md).toContain("profiles_username_lower_uidx");
    expect(md).toMatch(/DO NOT RUN|Archived draft/i);
  });

  it("replacement migration uses tenant-scoped unique indexes, not global profiles.username", () => {
    const path = resolve(
      process.cwd(),
      "../supabase/migrations/20261020090000_renter_applications_landlord_usernames.sql",
    );
    const sql = readFileSync(path, "utf8");
    expect(sql).toContain("tenant_renter_usernames");
    expect(sql).toContain("tenant_renter_usernames_tenant_username_lower_uidx");
    expect(sql).toContain("rental_applications");
    expect(sql).toContain("list_landlord_public_listings");
    expect(sql).not.toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_lower_uidx/);
    expect(sql).not.toMatch(/ALTER TABLE public\.profiles\s+ADD COLUMN IF NOT EXISTS username/i);
  });
});
