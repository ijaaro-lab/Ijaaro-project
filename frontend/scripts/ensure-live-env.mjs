/**
 * Ensures frontend/.env.live.local exists for `vite --mode live` (port 5173).
 *
 * Sources Live URL + anon key + remote-allow flag from gitignored `.env.local`
 * (intended hosted project tjadzwrcllsbkrkkkzjd). Never prints secret values.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const LIVE_REF = "tjadzwrcllsbkrkkkzjd";
const LIVE_HOST = `${LIVE_REF}.supabase.co`;

const __dirname = dirname(fileURLToPath(import.meta.url));
const frontendRoot = resolve(__dirname, "..");
const sourcePath = resolve(frontendRoot, ".env.local");
const outPath = resolve(frontendRoot, ".env.live.local");

function fail(msg) {
  console.error(`[env:live] ${msg}`);
  process.exit(1);
}

function parseEnvLines(text) {
  /** @type {{ key: string, value: string }[]} */
  const entries = [];
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
    entries.push({ key, value });
  }
  return entries;
}

function jwtRef(jwt) {
  try {
    const parts = String(jwt || "").split(".");
    if (parts.length < 2) return "";
    let payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    while (payload.length % 4) payload += "=";
    const json = JSON.parse(Buffer.from(payload, "base64").toString("utf8"));
    return String(json.ref || "");
  } catch {
    return "";
  }
}

if (!existsSync(sourcePath)) {
  fail(
    `Missing ${sourcePath}. Add Live VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY / VITE_ALLOW_REMOTE_SUPABASE=true for ${LIVE_HOST}.`,
  );
}

const entries = parseEnvLines(readFileSync(sourcePath, "utf8"));

let liveUrl = "";
let liveAnon = "";
let allowRemote = "";

for (let i = 0; i < entries.length; i++) {
  const { key, value } = entries[i];
  if (key === "VITE_SUPABASE_URL") {
    try {
      const u = new URL(value);
      if (u.hostname.toLowerCase() === LIVE_HOST) {
        liveUrl = `${u.protocol}//${u.hostname}`;
        // Prefer the anon key that appears after this URL before the next URL assignment.
        for (let j = i + 1; j < entries.length; j++) {
          if (entries[j].key === "VITE_SUPABASE_URL") break;
          if (entries[j].key === "VITE_SUPABASE_ANON_KEY" && !liveAnon) {
            liveAnon = entries[j].value;
          }
          if (entries[j].key === "VITE_ALLOW_REMOTE_SUPABASE" && !allowRemote) {
            allowRemote = entries[j].value;
          }
        }
      }
    } catch {
      // ignore invalid URL lines
    }
  }
  if (key === "VITE_ALLOW_REMOTE_SUPABASE" && liveUrl && !allowRemote) {
    allowRemote = value;
  }
}

if (!liveUrl) {
  fail(
    `No VITE_SUPABASE_URL for host ${LIVE_HOST} in .env.local. Add the Live URL before running npm run dev.`,
  );
}

if (!liveAnon) {
  fail(
    "No VITE_SUPABASE_ANON_KEY found next to the Live URL in .env.local. Add the public anon/publishable key (not service_role).",
  );
}

const ref = jwtRef(liveAnon);
if (ref && ref !== LIVE_REF) {
  fail(
    `Live anon key JWT ref "${ref}" does not match intended project ${LIVE_REF}.`,
  );
}
if (!ref) {
  fail(
    `Live anon key JWT has empty/missing ref; expected ${LIVE_REF}. Use the hosted project's anon key.`,
  );
}

if (String(allowRemote).toLowerCase() !== "true") {
  fail(
    "VITE_ALLOW_REMOTE_SUPABASE=true is required next to the Live block in .env.local (fail-closed remote guard).",
  );
}

const body = [
  "# Generated for vite --mode live (npm run dev → port 5173).",
  "# Sourced from .env.local Live block. Do not commit.",
  `VITE_SUPABASE_URL=${liveUrl}`,
  `VITE_SUPABASE_ANON_KEY=${liveAnon}`,
  "VITE_ALLOW_REMOTE_SUPABASE=true",
  "",
].join("\n");

mkdirSync(frontendRoot, { recursive: true });
writeFileSync(outPath, body, { encoding: "utf8", mode: 0o600 });

console.log(`[env:live] Wrote ${outPath}`);
console.log(`[env:live] VITE_SUPABASE_URL host=${LIVE_HOST}`);
console.log("[env:live] Anon key written (value not printed).");
console.log("[env:live] VITE_ALLOW_REMOTE_SUPABASE=true");
