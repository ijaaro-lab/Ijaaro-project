/**
 * Resolve post–set-password login destination for invite activation.
 *
 * Tenant keys come only from the caller's verified memberships (and an optional
 * `?tenant=` hint that must match a membership). Never trust arbitrary URLs.
 * Production login links use `https://slug.ijaaro.online/login` (no query param).
 */

import { tenantWorkspaceUrl, usesTenantSearchParam } from "@/lib/tenant";

export type MembershipForLoginRedirect = {
  status: string;
  role: string;
  tenant?: {
    slug?: string | null;
    subdomain?: string | null;
    tenant_type?: string | null;
    status?: string | null;
  } | null;
};

/** URL-safe workspace slug: lowercase letters, digits, single hyphens; no schemes/paths. */
export function normalizeTenantLoginSlug(
  raw: string | null | undefined,
): string | null {
  const slug = (raw ?? "").trim().toLowerCase();
  if (!slug || slug.length > 64) return null;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return null;
  return slug;
}

export function workspaceLoginPathForSlug(slug: string): string {
  const normalized = normalizeTenantLoginSlug(slug);
  if (!normalized) return "/login";
  if (!usesTenantSearchParam()) {
    return `${tenantWorkspaceUrl(normalized).replace(/\/$/, "")}/login`;
  }
  return `/login?tenant=${encodeURIComponent(normalized)}`;
}

function collectWorkspaceKeys(
  memberships: MembershipForLoginRedirect[],
): { all: Set<string>; renter: Set<string> } {
  const all = new Set<string>();
  const renter = new Set<string>();

  for (const m of memberships) {
    if (m.status !== "active") continue;
    const tenant = m.tenant;
    if (!tenant || tenant.tenant_type === "platform") continue;
    if (
      tenant.status != null &&
      tenant.status !== "active" &&
      tenant.status !== "pending"
    ) {
      continue;
    }

    const key =
      normalizeTenantLoginSlug(tenant.slug) ??
      normalizeTenantLoginSlug(tenant.subdomain);
    if (!key) continue;

    all.add(key);
    if (m.role === "renter") renter.add(key);
  }

  return { all, renter };
}

/**
 * Pick `/login?tenant=<slug>` when workspace context is unambiguous; else `/login`.
 */
export function resolveSetPasswordSuccessLoginPath(input: {
  memberships: MembershipForLoginRedirect[];
  /** Optional `?tenant=` on `/set-password` — used only if it matches a membership. */
  preferredTenantHint?: string | null;
}): string {
  const { all, renter } = collectWorkspaceKeys(input.memberships);
  const hint = normalizeTenantLoginSlug(input.preferredTenantHint);

  if (hint && all.has(hint)) {
    return workspaceLoginPathForSlug(hint);
  }

  if (all.size === 1) {
    return workspaceLoginPathForSlug([...all][0]!);
  }

  if (renter.size === 1) {
    return workspaceLoginPathForSlug([...renter][0]!);
  }

  return "/login";
}
