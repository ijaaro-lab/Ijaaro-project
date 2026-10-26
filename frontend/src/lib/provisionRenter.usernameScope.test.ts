import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Static regression: provision-renter must use landlord-scoped username storage.
 * Full Edge deploy is out of scope for RP-1.3.4.
 */
describe("provision-renter landlord-scoped username (source)", () => {
  const indexPath = resolve(
    process.cwd(),
    "../supabase/functions/provision-renter/index.ts",
  );
  const source = readFileSync(indexPath, "utf8");

  it("looks up usernames on tenant_renter_usernames scoped by tenant_id", () => {
    expect(source).toContain('from("tenant_renter_usernames")');
    expect(source).toContain('.eq("tenant_id", tenantId)');
    expect(source).toContain('.eq("username", username)');
  });

  it("reserves usernames via tenant_renter_usernames insert, not profiles.username", () => {
    expect(source).toContain(".from(\"tenant_renter_usernames\").insert");
    // Profile upsert must not write a username column.
    const profileUpsert = source.match(
      /from\("profiles"\)\.upsert\(\s*\{([\s\S]*?)\}\s*,/,
    );
    expect(profileUpsert?.[1] ?? "").not.toMatch(/\busername\s*,/);
    expect(profileUpsert?.[1] ?? "").not.toMatch(/\busername\s*:/);
  });

  it("also rejects usernames reserved by pending/accepted rental applications", () => {
    expect(source).toContain('from("rental_applications")');
    expect(source).toContain('.in("status", ["pending", "accepted"])');
  });

  it("does not query profiles by username for uniqueness", () => {
    expect(source).not.toMatch(
      /from\("profiles"\)[\s\S]{0,120}\.eq\("username"/,
    );
  });
});
