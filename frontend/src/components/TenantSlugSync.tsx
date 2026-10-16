import { useEffect } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider";
import { resolveTenantKeyFromLocation } from "@/lib/tenant";

/**
 * Keeps `?tenant=<slug>` in sync with the active membership.
 * - Incoming URL / host key selects the matching workspace.
 * - Navigating inside `/app/*` preserves the tenant query so deep links keep working.
 * Isolation still comes from RLS + membership — this only picks the workspace in view.
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

  // Keep `?tenant=` on app routes so NavLinks / refresh / shareable URLs stay correct.
  useEffect(() => {
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
