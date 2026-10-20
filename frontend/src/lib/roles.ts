import type { AppRole } from "@/types/database";

export const PLATFORM_LOGIN_ROLES: AppRole[] = [
  "super_admin",
  "landlord_admin",
  "utility_admin",
];

export const TENANT_ADMIN_ROLES: AppRole[] = ["landlord_admin", "utility_admin"];

type MembershipLike = {
  role: AppRole;
  status: string;
  tenant?: {
    status?: string;
    tenant_type?: string;
    slug?: string;
    subdomain?: string | null;
  } | null;
};

/** Platform landing login: Super Admin or tenant admin only. */
export function isPlatformAdminMembership(m: MembershipLike): boolean {
  if (m.status !== "active") return false;
  if (m.role === "super_admin" && m.tenant?.tenant_type === "platform") {
    return m.tenant.status === "active";
  }
  return (
    TENANT_ADMIN_ROLES.includes(m.role) &&
    m.tenant?.tenant_type !== "platform" &&
    (m.tenant?.status === "active" || m.tenant?.status === "pending")
  );
}

export function hasPlatformAdminAccess(
  memberships: MembershipLike[],
  isSuperAdmin: boolean,
): boolean {
  if (isSuperAdmin) return true;
  return memberships.some(isPlatformAdminMembership);
}

/** Active Super Admin on the platform tenant. */
export function isPlatformSuperAdmin(
  memberships: MembershipLike[],
): boolean {
  return memberships.some(
    (m) =>
      m.status === "active" &&
      m.role === "super_admin" &&
      m.tenant?.tenant_type === "platform",
  );
}

/**
 * Tenant portal access: only an active membership on THIS tenant.
 * Platform Super Admin is never allowed through tenant login — even if they
 * also have a row on this workspace.
 */
export function hasTenantWorkspaceAccess(
  memberships: MembershipLike[],
  tenantSlug: string,
): boolean {
  if (isPlatformSuperAdmin(memberships)) return false;
  return Boolean(findTenantMembership(memberships, tenantSlug));
}

/** Human-readable denial for tenant portal sign-in. */
export function tenantPortalAccessDenial(
  memberships: MembershipLike[],
  tenantSlug: string,
  workspaceName?: string,
): string | null {
  const label = workspaceName || tenantSlug;

  // Super Admin must use platform login only — never tenant portals.
  if (isPlatformSuperAdmin(memberships)) {
    return `Super Admin cannot sign in on “${label}”. Use platform login for platform tools.`;
  }

  if (hasTenantWorkspaceAccess(memberships, tenantSlug)) return null;

  if (memberships.length > 0) {
    return `This account belongs to another organization. Only “${label}” admins, staff, and members can sign in here.`;
  }
  return `No active membership for “${label}”. Only this organization’s users can sign in here.`;
}

export function findTenantMembership(
  memberships: MembershipLike[],
  tenantSlug: string,
): MembershipLike | null {
  const slug = tenantSlug.trim().toLowerCase();
  return (
    memberships.find(
      (m) =>
        m.status === "active" &&
        m.role !== "super_admin" &&
        m.tenant?.tenant_type !== "platform" &&
        (m.tenant?.status === "active" || m.tenant?.status === "pending") &&
        (m.tenant?.slug === slug || m.tenant?.subdomain === slug),
    ) ?? null
  );
}

type WorkspaceNavMembership = {
  role: AppRole;
  tenant: {
    slug: string;
    subdomain?: string | null;
    tenant_type: string;
  };
};

/** Role-aware home path inside a tenant workspace (keeps `?tenant=`). */
export function workspaceAppHomePath(membership: WorkspaceNavMembership): string {
  const slug = (membership.tenant.slug || membership.tenant.subdomain || "")
    .trim()
    .toLowerCase();
  const q = slug ? `?tenant=${encodeURIComponent(slug)}` : "";
  const type = membership.tenant.tenant_type;
  const role = membership.role;

  if (type === "water_company") {
    // Admin, staff, and customer all land on Overview.
    return `/app/water${q}`;
  }
  if (type === "electricity_company") return `/app/electricity${q}`;
  if (type === "landlord") {
    if (role === "renter") return `/app/renter${q}`;
    return `/app/landlord${q}`;
  }
  return `/app${q}`;
}
