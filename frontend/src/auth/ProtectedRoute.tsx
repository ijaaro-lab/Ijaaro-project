import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider";
import type { AppRole } from "@/types/database";
import {
  readTenantSlugFromHost,
  tenantWorkspacePath,
} from "@/lib/tenant";

export function ProtectedRoute() {
  const { session, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">
        Loading session…
      </div>
    );
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
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground">
        Checking authorization…
      </div>
    );
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
  const { loading, memberships, isSuperAdmin } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground">
        Checking authorization…
      </div>
    );
  }

  // Platform Super Admin uses /app/admin only — never tenant role areas.
  if (isSuperAdmin) {
    return <Navigate to="/app/admin" replace />;
  }

  const ok = memberships.some(
    (m) =>
      m.status === "active" &&
      m.role !== "super_admin" &&
      allow.includes(m.role) &&
      m.tenant?.tenant_type !== "platform" &&
      (!tenantTypes ||
        tenantTypes.includes(m.tenant?.tenant_type ?? "")),
  );

  if (!ok) {
    return <UnauthorizedNotice message={message} />;
  }

  return <Outlet />;
}
