import { findTenantMembership, workspaceAppHomePath } from "@/lib/roles";
import type { AppRole } from "@/types/database";

export type MyApplicationsNavMembership = {
  id: string;
  role: AppRole;
  status: string;
  tenant: {
    slug: string;
    subdomain?: string | null;
    tenant_type: string;
    status?: string;
  };
};

export type PortalDashboardDestination = {
  path: string;
  membershipId: string;
};

function findActiveWorkspaceMembership(
  memberships: MyApplicationsNavMembership[],
  tenantKey: string,
): MyApplicationsNavMembership | null {
  const key = tenantKey.trim().toLowerCase();
  if (!key) return null;
  // Same rules as findTenantMembership, but keep the row that includes `id`.
  if (!findTenantMembership(memberships, key)) return null;
  return (
    memberships.find(
      (m) =>
        m.status === "active" &&
        m.role !== "super_admin" &&
        m.tenant.tenant_type !== "platform" &&
        (m.tenant.status === "active" ||
          m.tenant.status === "pending" ||
          m.tenant.status == null) &&
        (m.tenant.slug === key || m.tenant.subdomain === key),
    ) ?? null
  );
}

/**
 * After my-applications sign-in (or for the accepted CTA): only active renters
 * on the requested landlord tenant get a private `/app/renter` destination.
 * Pending/rejected applicants (no matching membership) get null — stay on the page.
 */
export function resolveMyApplicationsRenterDestination(
  memberships: MyApplicationsNavMembership[],
  tenantKey: string,
): PortalDashboardDestination | null {
  const full = findActiveWorkspaceMembership(memberships, tenantKey);
  if (!full || full.role !== "renter") return null;
  if (full.tenant.tenant_type !== "landlord") return null;

  return {
    path: workspaceAppHomePath(full),
    membershipId: full.id,
  };
}

/**
 * Tenant portal home after memberships are freshly loaded.
 * Renters → `/app/renter?tenant=`; landlord admin/staff → `/app/landlord?tenant=`.
 * Missing / mismatched membership → null (caller must not invent a path).
 */
export function resolveTenantPortalDashboardDestination(
  memberships: MyApplicationsNavMembership[],
  tenantKey: string,
): PortalDashboardDestination | null {
  const full = findActiveWorkspaceMembership(memberships, tenantKey);
  if (!full) return null;

  if (full.tenant.tenant_type === "landlord") {
    if (
      full.role !== "renter" &&
      full.role !== "landlord_admin" &&
      full.role !== "landlord_staff"
    ) {
      return null;
    }
  }

  return {
    path: workspaceAppHomePath(full),
    membershipId: full.id,
  };
}
