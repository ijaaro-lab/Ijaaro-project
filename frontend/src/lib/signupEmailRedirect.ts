/**
 * Safe construction / validation of Supabase Auth `emailRedirectTo` for signUp.
 * Only same-origin `/apply?tenant=&property=` is accepted as an override; otherwise
 * callers keep the historical default `{origin}/login`.
 */

export function defaultSignupEmailRedirectTo(origin: string): string {
  const base = new URL(origin);
  return new URL("/login", base.origin).toString();
}

/** Build the renter apply return URL, or null if tenant/property are missing. */
export function buildApplySignupEmailRedirectTo(
  origin: string,
  tenantKey: string,
  propertyId: string,
): string | null {
  const tenant = tenantKey.trim().toLowerCase();
  const property = propertyId.trim();
  if (!tenant || !property) return null;

  let base: URL;
  try {
    base = new URL(origin);
  } catch {
    return null;
  }
  if (base.protocol !== "http:" && base.protocol !== "https:") return null;

  const url = new URL("/apply", base.origin);
  url.searchParams.set("tenant", tenant);
  url.searchParams.set("property", property);
  return url.toString();
}

/**
 * Resolve the URL passed to Supabase `emailRedirectTo`.
 * Invalid, external, or non-apply candidates are ignored (fallback `/login`).
 */
export function resolveSignupEmailRedirectTo(
  origin: string,
  candidate?: string | null,
): string {
  let originUrl: URL;
  try {
    originUrl = new URL(origin);
  } catch {
    // Last-resort stable default if origin itself is unusable in tests/edge cases.
    return "http://localhost/login";
  }

  const fallback = defaultSignupEmailRedirectTo(originUrl.origin);
  if (candidate == null || !String(candidate).trim()) return fallback;

  let candidateUrl: URL;
  try {
    candidateUrl = new URL(candidate);
  } catch {
    return fallback;
  }

  if (candidateUrl.origin !== originUrl.origin) return fallback;
  if (candidateUrl.pathname !== "/apply") return fallback;

  const tenant = candidateUrl.searchParams.get("tenant")?.trim().toLowerCase() ?? "";
  const property = candidateUrl.searchParams.get("property")?.trim() ?? "";
  if (!tenant || !property) return fallback;

  return (
    buildApplySignupEmailRedirectTo(originUrl.origin, tenant, property) ?? fallback
  );
}
