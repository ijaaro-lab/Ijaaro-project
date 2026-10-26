/**
 * Start Vite against isolated local Supabase (127.0.0.1:54321).
 *
 * Reads frontend/.env.isolated into process.env (highest Vite priority) so
 * gitignored .env.local Live values cannot win. Does not modify any .env file.
 *
 * Usage (from frontend/): npm run dev:isolated
 * Default port 5174 so Live-backed `npm run dev` (5173) can stay separate.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const frontendRoot = resolve(__dirname, "..");
const isolatedPath = resolve(frontendRoot, ".env.isolated");
const port = process.env.IJAARO_ISOLATED_VITE_PORT || "5174";

function fail(msg) {
  console.error(`[dev:isolated] ${msg}`);
  process.exit(1);
}

function parseEnv(text) {
  /** @type {Record<string, string>} */
  const out = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

if (!existsSync(isolatedPath)) {
  fail(`Missing ${isolatedPath}. Create it with local loopback VITE_SUPABASE_* (see .env.example notes).`);
}

const isolated = parseEnv(readFileSync(isolatedPath, "utf8"));
const url = isolated.VITE_SUPABASE_URL || isolated.IJAARO_ISOLATED_SUPABASE_URL;
const anon = isolated.VITE_SUPABASE_ANON_KEY || isolated.IJAARO_ISOLATED_ANON_KEY;

if (!url || !anon) {
  fail("Isolated env must define VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (or IJAARO_ISOLATED_* equivalents).");
}

let host;
try {
  host = new URL(url).hostname;
} catch {
  fail("Isolated VITE_SUPABASE_URL is not a valid URL.");
}

if (host !== "127.0.0.1" && host !== "localhost") {
  fail(`Refusing non-local Supabase host "${host}". Isolated QA must use 127.0.0.1 or localhost.`);
}

const env = {
  ...process.env,
  ...isolated,
  VITE_SUPABASE_URL: url,
  VITE_SUPABASE_ANON_KEY: anon,
  // Loopback does not require remote allow; clear any Live override from the parent shell.
  VITE_ALLOW_REMOTE_SUPABASE: "false",
};

console.log(`[dev:isolated] Target ${url} (host=${host}) on http://127.0.0.1:${port}`);
console.log("[dev:isolated] Not using Live. Do not send invitations from this session.");

const child = spawn(
  process.platform === "win32" ? "npx.cmd" : "npx",
  ["vite", "--port", port, "--strictPort", "--host", "127.0.0.1"],
  {
    cwd: frontendRoot,
    env,
    stdio: "inherit",
    shell: process.platform === "win32",
  },
);

child.on("exit", (code) => process.exit(code ?? 1));
