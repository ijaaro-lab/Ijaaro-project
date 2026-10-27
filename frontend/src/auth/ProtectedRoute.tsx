import { Navigate, Outlet, useLocation, useSearchParams } from "react-router-dom";
import { useAuth, type MembershipWithTenant } from "@/auth/AuthProvider";
import type { AppRole } from "@/types/database";
import {
  readTenantSlugFromHost,
  tenantWorkspacePath,
} from "@/lib/tenant";

/**
 * Authorize tenant RoleRoutes against the *active* membership only.
 * Another tenant's membership must not unlock a route after workspace switch.
 * Super Admin is handled separately (platform console redirect).
 */
export function activeMembershipAllowsRoute(
  activeMembership: MembershipWithTenant | null | undefined,
  allow: AppRole[],
  tenantTypes?: string[],
): boolean {
  const m = activeMembership;
  if (!m) return false;
  if (m.status !== "active") return false;
  if (m.role === "super_admin") return false;
  if (!allow.includes(m.role)) return false;
  if (m.tenant?.tenant_type === "platform") return false;
  if (tenantTypes && !tenantTypes.includes(m.tenant?.tenant_type ?? "")) {
    return false;
  }
  return true;
}

function AuthChecking({ fullScreen = false }: { fullScreen?: boolean }) {
  return (
    <div
      className={
        fullScreen
          ? "flex min-h-screen items-center justify-center bg-background text-muted-foreground"
          : "flex min-h-[40vh] items-center justify-center text-muted-foreground"
      }
      role="status"
      aria-live="polite"
    >
      Loading…
    </div>
  );
}

/** True while `?tenant=` / host slug points at a membership that is not active yet. */
export function isWorkspaceSwitchPending(
  memberships: MembershipWithTenant[],
  activeMembership: MembershipWithTenant | null | undefined,
  tenantSlug: string | null | undefined,
): boolean {
  const slug = tenantSlug?.trim().toLowerCase();
  if (!slug || memberships.length === 0) return false;
  const match = memberships.find(
    (m) => m.tenant.slug === slug || m.tenant.subdomain === slug,
  );
  if (!match) return false;
  return match.id !== activeMembership?.id;
}

export function ProtectedRoute() {
  const { session, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <AuthChecking fullScreen />;
  }

  if (!session) {
    const tenantFromQuery = new URLSearchParams(location.search)
      .get("tenant")
      ?.trim()
      .toLowerCase();
    const tenantFromHost = readTenantSlugFromHost();
    // After sign-out from a tenant app, return to that tenant's landing — not platform bank.
    if (tenantFromHost) {
      return <Navigate to="/" replace />;
    }
    if (tenantFromQuery) {
      return <Navigate to={tenantWorkspacePath(tenantFromQuery)} replace />;
    }
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: `${location.pathname}${location.search}` }}
      />
    );
  }

  return <Outlet />;
}

function UnauthorizedNotice({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-8">
      <h2 className="font-display text-xl font-semibold text-foreground">Unauthorized</h2>
      <p className="mt-2 text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

export function SuperAdminRoute() {
  const { isSuperAdmin, loading } = useAuth();

  if (loading) {
    return <AuthChecking />;
  }

  if (!isSuperAdmin) {
    return (
      <UnauthorizedNotice message="Platform administration requires an active Super Admin membership on the platform tenant." />
    );
  }

  return <Outlet />;
}

/** Defense-in-depth UI gate. Database RLS/RPCs remain the source of truth. */
export function RoleRoute({
  allow,
  tenantTypes,
  message,
}: {
  allow: AppRole[];
  tenantTypes?: string[];
  message: string;
}) {
  const { loading, activeMembership, isSuperAdmin, memberships } = useAuth();
  const [params] = useSearchParams();
  const tenantSlug = params.get("tenant");

  if (loading) {
    return <AuthChecking />;
  }

  // Platform Super Admin uses /app/admin only — never tenant role areas.
  if (isSuperAdmin) {
    return <Navigate to="/app/admin" replace />;
  }

  // TenantSlugSync applies URL workspace on the next effect tick — wait so we
  // do not flash Unauthorized for the previous (or null) active membership.
  if (isWorkspaceSwitchPending(memberships, activeMembership, tenantSlug)) {
    return <AuthChecking />;
  }

  const ok = activeMembershipAllowsRoute(activeMembership, allow, tenantTypes);

  if (!ok) {
    return <UnauthorizedNotice message={message} />;
  }

  return <Outlet />;
}
