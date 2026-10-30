/** Build a URL-safe tenant slug from a display name. */
export function slugifyTenantName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

/** Subdomains that are never tenant workspaces. */
const RESERVED_SUBDOMAINS = new Set([
  "www",
  "app",
  "api",
  "cdn",
  "static",
  "mail",
  "ftp",
  "staging",
  "dev",
  "status",
  "docs",
  "admin",
]);

function isLocalDevHost(hostname: string): boolean {
  const host = hostname.trim().toLowerCase();
  return (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host.endsWith(".localhost")
  );
}

/** Preview / platform hosts must not be treated as SaaS base domains. */
function isManagedPlatformHost(hostname: string): boolean {
  const host = hostname.trim().toLowerCase();
  return (
    host.endsWith(".vercel.app") ||
    host.endsWith(".vercel.sh") ||
    host.endsWith(".now.sh")
  );
}

/**
 * Infer production apex from the current host when env is unset.
 * `hodan.ijaaro.online` → `ijaaro.online`; `ijaaro.online` → `ijaaro.online`.
 */
export function inferTenantBaseFromHost(hostname: string): string | null {
  const host = hostname.trim().toLowerCase();
  if (!host || isLocalDevHost(host) || isManagedPlatformHost(host)) return null;
  const parts = host.split(".").filter(Boolean);
  if (parts.length < 2) return null;
  if (parts.length === 2) return host;
  return parts.slice(1).join(".");
}

/** Canonical IJAARO apex used when env/host inference is unavailable. */
export const PRODUCTION_TENANT_BASE_DOMAIN = "ijaaro.online";

/**
 * Production SaaS base domain, e.g. `ijaaro.online` → `slug.ijaaro.online`.
 * Prefers `VITE_TENANT_BASE_DOMAIN`, then live host inference, then prod default.
 */
export function tenantBaseDomain(
  hostname: string = typeof window !== "undefined" ? window.location.hostname : "",
): string | null {
  const raw = (import.meta.env.VITE_TENANT_BASE_DOMAIN as string | undefined)?.trim();
  if (raw) return raw;
  const inferred = hostname ? inferTenantBaseFromHost(hostname) : null;
  if (inferred) return inferred;
  // Production builds must never fall back to ?tenant= for workspace URLs.
  if (import.meta.env.PROD) return PRODUCTION_TENANT_BASE_DOMAIN;
  return null;
}

/** Relative workspace entry: `/?tenant=hankaal` */
export function tenantWorkspacePath(slug: string): string {
  return `/?tenant=${encodeURIComponent(slug.trim().toLowerCase())}`;
}

/**
 * Absolute platform marketing/home URL (no tenant subdomain / ?tenant=).
 * Local subdomain → `http://localhost:5173/`
 * Production → `https://ijaaro.online/` (or current apex origin)
 */
export function platformHomeUrl(
  origin: string = typeof window !== "undefined" ? window.location.origin : "",
): string {
  const base = tenantBaseDomain();
  if (base) {
    const protocol =
      typeof window !== "undefined" ? window.location.protocol : "https:";
    return `${protocol}//${base}/`;
  }

  if (typeof window !== "undefined" && isLocalDevHost(window.location.hostname)) {
    const { protocol, port } = window.location;
    const portPart = port ? `:${port}` : "";
    return `${protocol}//localhost${portPart}/`;
  }

  // Query-param mode: strip ?tenant= and land on /
  try {
    const url = new URL(origin || "http://localhost/");
    url.pathname = "/";
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return "/";
  }
}

/**
 * Absolute workspace URL for sharing after provision.
 *
 * Local → `http://hankaal.localhost:5173/` (subdomain host)
 * Fallback → `http://localhost:5173/?tenant=hankaal`
 * Production → `https://hankaal.ijaaro.online`
 */
export function tenantWorkspaceUrl(
  slugOrSubdomain: string,
  origin: string = typeof window !== "undefined" ? window.location.origin : "",
): string {
  const key = slugOrSubdomain.trim().toLowerCase();
  const base = tenantBaseDomain();

  // Real DNS subdomain when a production base domain is known
  if (base) {
    const protocol =
      typeof window !== "undefined" ? window.location.protocol : "https:";
    return `${protocol}//${key}.${base}`;
  }

  // Local SaaS mode: real subdomain host (*.localhost → 127.0.0.1)
  if (typeof window !== "undefined" && isLocalDevHost(window.location.hostname)) {
    const { protocol, port } = window.location;
    const portPart = port ? `:${port}` : "";
    return `${protocol}//${key}.localhost${portPart}/`;
  }

  // Fallback: query-param entry
  return `${origin}${tenantWorkspacePath(key)}`;
}

/**
 * Human label for the tenant host key.
 * Local: `hankaal.localhost:5173`
 * Prod: `hankaal.ijaaro.online`
 */
export function tenantSubdomainLabel(subdomain: string): string {
  const key = subdomain.trim().toLowerCase();
  const base = tenantBaseDomain();
  if (base) return `${key}.${base}`;
  if (typeof window !== "undefined" && isLocalDevHost(window.location.hostname)) {
    const port = window.location.port ? `:${window.location.port}` : "";
    return `${key}.localhost${port}`;
  }
  return `/?tenant=${key}`;
}

/** Read tenant key from host (`slug.base` or `slug.localhost`). */
export function readTenantSlugFromHost(
  hostname: string = typeof window !== "undefined" ? window.location.hostname : "",
): string | null {
  const host = hostname.trim().toLowerCase();
  if (!host || isManagedPlatformHost(host)) return null;

  const base = tenantBaseDomain(host)?.toLowerCase();
  if (base && (host === base || host.endsWith(`.${base}`))) {
    if (host === base) return null;
    const sub = host.slice(0, -(base.length + 1));
    if (sub && !sub.includes(".") && !RESERVED_SUBDOMAINS.has(sub)) return sub;
    return null;
  }

  if (host.endsWith(".localhost")) {
    const sub = host.slice(0, -".localhost".length);
    if (sub && !sub.includes(".") && !RESERVED_SUBDOMAINS.has(sub)) return sub;
  }

  return null;
}

export function readTenantSlugFromSearch(search: string): string | null {
  const raw = new URLSearchParams(search).get("tenant")?.trim().toLowerCase();
  return raw || null;
}

export function resolveTenantKeyFromLocation(
  search: string = typeof window !== "undefined" ? window.location.search : "",
  hostname: string = typeof window !== "undefined" ? window.location.hostname : "",
): string | null {
  return readTenantSlugFromSearch(search) ?? readTenantSlugFromHost(hostname);
}

/**
 * Portal tenant key for tenant-scoped renter browse/detail RPCs.
 * Prefer active membership slug/subdomain (TenantSlugSync), then URL/host.
 * Returns null when unresolved — callers must fail closed (no marketplace fallback).
 */
export function resolvePortalTenantKey(options?: {
  membershipSlug?: string | null;
  membershipSubdomain?: string | null;
  search?: string;
  hostname?: string;
}): string | null {
  const fromMembership =
    options?.membershipSlug?.trim().toLowerCase() ||
    options?.membershipSubdomain?.trim().toLowerCase() ||
    "";
  if (fromMembership) return fromMembership;
  return resolveTenantKeyFromLocation(options?.search, options?.hostname);
}

export function tenantTypeLabel(type: string): string {
  switch (type) {
    case "landlord":
      return "Landlord";
    case "water_company":
      return "Water company";
    case "electricity_company":
      return "Electricity company";
    case "platform":
      return "Platform";
    default:
      return type;
  }
}

export function defaultAdminRoleForTenantType(
  type: string,
): "landlord_admin" | "utility_admin" {
  return type === "landlord" ? "landlord_admin" : "utility_admin";
}
