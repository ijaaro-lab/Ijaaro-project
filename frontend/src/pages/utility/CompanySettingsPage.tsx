import { useAuth } from "@/auth/AuthProvider";
import { WorkspaceBrandingPage } from "@/pages/WorkspaceBrandingPage";
import { KIND_LABEL, KIND_TENANT_TYPE, type UtilityKind } from "./shared";

/**
 * Company settings for utility workspaces — reuses the secured branding/settings
 * workflow (admin-only RPC) under a water/electricity navigation label.
 */
export function CompanySettingsPage({ kind }: { kind: UtilityKind }) {
  const { activeMembership } = useAuth();
  const matchesKind = activeMembership?.tenant.tenant_type === KIND_TENANT_TYPE[kind];
  const isAdmin = activeMembership?.role === "utility_admin";
  const label = KIND_LABEL[kind];

  if (!activeMembership || !matchesKind) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-sm text-muted-foreground">
        Switch to a {label.toLowerCase()} company membership to manage settings.
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-sm text-muted-foreground">
        Company settings require utility admin access.
      </div>
    );
  }

  return <WorkspaceBrandingPage />;
}
