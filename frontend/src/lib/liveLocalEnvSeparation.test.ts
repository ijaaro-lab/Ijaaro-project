import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Live env workflow (RP-1.3.18 cleanup)", () => {
  const frontendRoot = resolve(process.cwd());

  it("npm run dev uses vite --mode live and ensures .env.live.local", () => {
    const pkg = JSON.parse(
      readFileSync(resolve(frontendRoot, "package.json"), "utf8"),
    );
    expect(pkg.scripts["env:live"]).toContain("ensure-live-env.mjs");
    expect(pkg.scripts.dev).toContain("env:live");
    expect(pkg.scripts.dev).toContain("--mode live");
    expect(pkg.scripts.dev).toMatch(/--port\s+5173|--port=5173/);
  });

  it("local-only scripts were removed", () => {
    const pkg = JSON.parse(
      readFileSync(resolve(frontendRoot, "package.json"), "utf8"),
    );
    expect(pkg.scripts["dev:local"]).toBeUndefined();
    expect(pkg.scripts["env:local"]).toBeUndefined();
  });

  it("ensure-live-env writes .env.live.local from Live block in .env.local", () => {
    const src = readFileSync(
      resolve(frontendRoot, "scripts/ensure-live-env.mjs"),
      "utf8",
    );
    expect(src).toContain(".env.live.local");
    expect(src).toContain("tjadzwrcllsbkrkkkzjd");
    expect(src).toContain("VITE_ALLOW_REMOTE_SUPABASE=true");
    expect(src).not.toMatch(/writeFileSync\([^\)]*development\.local/);
  });
});
