/** Loopback hosts allowed for local Vite development without an explicit override. */
export function isLoopbackSupabaseHost(hostname: string): boolean {
  const host = hostname.trim().toLowerCase();
  return host === "127.0.0.1" || host === "localhost";
}

/**
 * DEV-only guard: reject accidental hosted Supabase targets during local `vite` serve.
 * Production builds are unaffected. Opt-in remote: VITE_ALLOW_REMOTE_SUPABASE=true.
 */
export function assertDevSupabaseTarget(
  urlRaw: string | undefined,
  options: {
    isDev: boolean;
    allowRemote?: boolean;
  },
): { ok: true; url: string } | { ok: false; error: string } {
  const url = (urlRaw ?? "").trim();
  if (!url) {
    return {
      ok: false,
      error:
        "Missing VITE_SUPABASE_URL. Set Live values in frontend/.env.local (see frontend/.env.example), then run `npm run env:live` / `npm run dev`.",
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, error: "VITE_SUPABASE_URL is not a valid URL." };
  }

  if (!options.isDev) {
    return { ok: true, url };
  }

  if (options.allowRemote) {
    return { ok: true, url };
  }

  if (!isLoopbackSupabaseHost(parsed.hostname)) {
    return {
      ok: false,
      error:
        `Refusing non-local Supabase host "${parsed.hostname}" during development. ` +
        `Set VITE_ALLOW_REMOTE_SUPABASE=true intentionally (required for Live), or use a loopback URL.`,
    };
  }

  return { ok: true, url };
}
