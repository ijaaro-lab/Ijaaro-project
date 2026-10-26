import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildApplySignupEmailRedirectTo,
  defaultSignupEmailRedirectTo,
  resolveSignupEmailRedirectTo,
} from "./signupEmailRedirect";

const ORIGIN = "http://127.0.0.1:5173";
const TENANT = "hodan-properties";
const PROPERTY = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";

function listSrcFiles(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "dist") continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) listSrcFiles(p, acc);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name)) acc.push(p);
  }
  return acc;
}

describe("signupEmailRedirect (RP-1.3.20)", () => {
  it("defaults non-renter signup confirmation to same-origin /login", () => {
    expect(defaultSignupEmailRedirectTo(ORIGIN)).toBe(`${ORIGIN}/login`);
    expect(resolveSignupEmailRedirectTo(ORIGIN)).toBe(`${ORIGIN}/login`);
    expect(resolveSignupEmailRedirectTo(ORIGIN, null)).toBe(`${ORIGIN}/login`);
    expect(resolveSignupEmailRedirectTo(ORIGIN, "   ")).toBe(`${ORIGIN}/login`);
  });

  it("builds renter apply return URL with tenant and property (encoded)", () => {
    const built = buildApplySignupEmailRedirectTo(
      ORIGIN,
      "Hodan-Properties",
      PROPERTY,
    );
    expect(built).toBe(
      `${ORIGIN}/apply?tenant=hodan-properties&property=${encodeURIComponent(PROPERTY)}`,
    );

    const encoded = buildApplySignupEmailRedirectTo(ORIGIN, "acme & co", "id with spaces");
    expect(encoded).toBeTruthy();
    const parsed = new URL(encoded!);
    expect(parsed.origin).toBe(ORIGIN);
    expect(parsed.pathname).toBe("/apply");
    expect(parsed.searchParams.get("tenant")).toBe("acme & co");
    expect(parsed.searchParams.get("property")).toBe("id with spaces");
    expect(encoded).toContain("tenant=acme+%26+co");
    expect(encoded).toContain("property=id+with+spaces");
  });

  it("resolve accepts a valid apply candidate and normalizes it", () => {
    const candidate = `${ORIGIN}/apply?tenant=${TENANT}&property=${PROPERTY}&extra=drop`;
    const resolved = resolveSignupEmailRedirectTo(ORIGIN, candidate);
    expect(resolved).toBe(
      `${ORIGIN}/apply?tenant=${TENANT}&property=${encodeURIComponent(PROPERTY)}`,
    );
    expect(resolved).not.toContain("extra=");
  });

  it("rejects or ignores external and malformed return URLs", () => {
    expect(
      resolveSignupEmailRedirectTo(ORIGIN, "https://evil.example/apply?tenant=x&property=y"),
    ).toBe(`${ORIGIN}/login`);

    expect(
      resolveSignupEmailRedirectTo(ORIGIN, `${ORIGIN}/login?next=/apply`),
    ).toBe(`${ORIGIN}/login`);

    expect(
      resolveSignupEmailRedirectTo(ORIGIN, `${ORIGIN}/apply?tenant=${TENANT}`),
    ).toBe(`${ORIGIN}/login`);

    expect(
      resolveSignupEmailRedirectTo(ORIGIN, `${ORIGIN}/apply?property=${PROPERTY}`),
    ).toBe(`${ORIGIN}/login`);

    expect(resolveSignupEmailRedirectTo(ORIGIN, "not a url")).toBe(`${ORIGIN}/login`);

    expect(
      resolveSignupEmailRedirectTo(
        ORIGIN,
        `${ORIGIN}/app/admin?tenant=${TENANT}&property=${PROPERTY}`,
      ),
    ).toBe(`${ORIGIN}/login`);

    expect(buildApplySignupEmailRedirectTo(ORIGIN, "", PROPERTY)).toBeNull();
    expect(buildApplySignupEmailRedirectTo(ORIGIN, TENANT, "  ")).toBeNull();
  });

  it("ApplyToRentPage wires apply redirect into signUp; AuthProvider validates", () => {
    const frontendRoot = resolve(process.cwd());
    const applySrc = readFileSync(
      resolve(frontendRoot, "src/pages/ApplyToRentPage.tsx"),
      "utf8",
    );
    const authSrc = readFileSync(
      resolve(frontendRoot, "src/auth/AuthProvider.tsx"),
      "utf8",
    );

    expect(applySrc).toContain("buildApplySignupEmailRedirectTo");
    expect(applySrc).toMatch(/signUp\([\s\S]*emailRedirectTo/);
    expect(applySrc).toContain("tenantKey");
    expect(applySrc).toContain("propertyId");

    expect(authSrc).toContain("resolveSignupEmailRedirectTo");
    expect(authSrc).toContain("options?.emailRedirectTo");
  });

  it("confirmation redirect path does not submit applications or assign roles", () => {
    const frontendRoot = resolve(process.cwd());
    const redirectSrc = readFileSync(
      resolve(frontendRoot, "src/lib/signupEmailRedirect.ts"),
      "utf8",
    );
    const authSrc = readFileSync(
      resolve(frontendRoot, "src/auth/AuthProvider.tsx"),
      "utf8",
    );
    const applySrc = readFileSync(
      resolve(frontendRoot, "src/pages/ApplyToRentPage.tsx"),
      "utf8",
    );

    expect(redirectSrc).not.toMatch(/submit_rental_application/);
    expect(redirectSrc).not.toMatch(/tenant_memberships|super_admin|landlord_admin/);
    expect(authSrc).not.toMatch(/submit_rental_application/);

    expect(applySrc).toContain('rpc("submit_rental_application"');
    const ensureIdx = applySrc.indexOf("const ensureSession");
    const submitIdx = applySrc.indexOf('rpc("submit_rental_application"');
    expect(ensureIdx).toBeGreaterThan(-1);
    expect(submitIdx).toBeGreaterThan(ensureIdx);
    expect(applySrc).toMatch(/if \(needsConfirmation\) \{[\s\S]*?return false;/);
  });

  it("only ApplyToRentPage calls auth signUp (non-renter default preserved)", () => {
    const frontendRoot = resolve(process.cwd());
    const callers: string[] = [];
    for (const file of listSrcFiles(resolve(frontendRoot, "src"))) {
      if (file.replace(/\\/g, "/").endsWith("/auth/AuthProvider.tsx")) continue;
      const text = readFileSync(file, "utf8");
      if (!text.includes("useAuth")) continue;
      if (!/\bsignUp\b/.test(text)) continue;
      // Call site: signUp(… as used by ApplyToRentPage
      if (/await\s+signUp\s*\(/.test(text) || /[^a-zA-Z_]signUp\s*\(\s*email/.test(text)) {
        callers.push(file.replace(/\\/g, "/").split("/src/")[1]!);
      }
    }
    expect(callers).toEqual(["pages/ApplyToRentPage.tsx"]);
  });
});
