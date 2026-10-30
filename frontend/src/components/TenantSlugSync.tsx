import { useEffect } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider";
import {
  resolveTenantKeyFromLocation,
  tenantWorkspaceUrl,
  usesTenantSearchParam,
} from "@/lib/tenant";

/**
 * Syncs active membership from host / `?tenant=`.
 * Production: host slug only (`slug.ijaaro.online`); never appends `?tenant=`.
 * Local: keeps `?tenant=` on `/app/*` for deep links.
 */
export function TenantSlugSync() {
  const [params] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { memberships, setActiveMembershipId, activeMembership, isSuperAdmin } =
    useAuth();

  const slugFromUrl =
    params.get("tenant")?.trim().toLowerCase() ||
    resolveTenantKeyFromLocation(window.location.search, window.location.hostname);

  // Production: upgrade legacy `/?tenant=slug` links to the real subdomain.
  useEffect(() => {
    if (usesTenantSearchParam()) return;
    const fromQuery = params.get("tenant")?.trim().toLowerCase();
    if (!fromQuery) return;
    const target = tenantWorkspaceUrl(fromQuery);
    const here = `${window.location.protocol}//${window.location.host}${location.pathname}`;
    if (target.replace(/\/$/, "") === here.replace(/\/$/, "")) {
      // Already on the right host — strip the query param.
      const next = new URLSearchParams(params);
      next.delete("tenant");
      const search = next.toString();
      navigate(
        {
          pathname: location.pathname,
          search: search ? `?${search}` : "",
          hash: location.hash,
        },
        { replace: true },
      );
      return;
    }
    window.location.replace(
      `${target}${location.pathname === "/" ? "" : location.pathname}${location.hash || ""}`,
    );
  }, [params, location.pathname, location.hash, navigate]);

  // Select membership when URL/host carries a tenant key.
  useEffect(() => {
    if (!slugFromUrl || memberships.length === 0) return;

    const match = memberships.find(
      (m) => m.tenant.slug === slugFromUrl || m.tenant.subdomain === slugFromUrl,
    );
    if (match && match.id !== activeMembership?.id) {
      setActiveMembershipId(match.id);
    }
  }, [slugFromUrl, memberships, activeMembership?.id, setActiveMembershipId]);

  // Local only: keep `?tenant=` on app routes.
  useEffect(() => {
    if (!usesTenantSearchParam()) return;
    if (isSuperAdmin) return;
    if (!location.pathname.startsWith("/app")) return;
    if (!activeMembership?.tenant.slug) return;

    const desired = activeMembership.tenant.slug;
    const current = params.get("tenant")?.trim().toLowerCase() || null;
    if (current === desired) return;

    const next = new URLSearchParams(params);
    next.set("tenant", desired);
    navigate(
      { pathname: location.pathname, search: `?${next.toString()}`, hash: location.hash },
      { replace: true },
    );
  }, [
    isSuperAdmin,
    activeMembership?.tenant.slug,
    location.pathname,
    location.hash,
    params,
    navigate,
  ]);

  return null;
}
