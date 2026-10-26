/**
 * Isolated Supabase target guard for mutating security tests.
 * Prefer IJAARO_ISOLATED_* / local URL; refuse remote project hosts.
 */
import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";

loadEnv({ path: resolve(process.cwd(), ".env.isolated") });
loadEnv({ path: resolve(process.cwd(), ".env.local") });
loadEnv({ path: resolve(process.cwd(), "../.env.local") });

function isIsolatedUrl(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const host = new URL(url).hostname;
    return host === "127.0.0.1" || host === "localhost";
  } catch {
    return false;
  }
}

export const isolatedUrl =
  process.env.IJAARO_ISOLATED_SUPABASE_URL ??
  process.env.VITE_SUPABASE_URL ??
  process.env.SUPABASE_URL;

export const isolatedAnon =
  process.env.IJAARO_ISOLATED_ANON_KEY ??
  process.env.VITE_SUPABASE_ANON_KEY ??
  process.env.SUPABASE_ANON_KEY;

export const isolatedService =
  process.env.IJAARO_ISOLATED_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

export const isIsolatedTarget = isIsolatedUrl(isolatedUrl);

export const isolatedConfigured = Boolean(
  isIsolatedTarget && isolatedUrl && isolatedAnon && isolatedService,
);
