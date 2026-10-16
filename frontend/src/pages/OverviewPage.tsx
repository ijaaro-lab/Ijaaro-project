import { Navigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider";
import { Badge } from "@/components/ui/badge";
import { workspaceAppHomePath } from "@/lib/roles";

export function OverviewPage() {
  const { profile, memberships, isSuperAdmin, primaryRole, activeMembership } =
    useAuth();

  if (isSuperAdmin) {
    return <Navigate to="/app/admin" replace />;
  }

  // Single-workspace users go straight to their role dashboard.
  if (activeMembership && memberships.length === 1) {
    return <Navigate to={workspaceAppHomePath(activeMembership)} replace />;
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Signed in as {profile?.full_name || profile?.email}. Dashboards reflect your
        active memberships only.
      </p>

      <div className="grid gap-2 md:grid-cols-3">
        <div className="rounded-lg border border-border bg-card px-3 py-2">
          <div className="text-[10px] font-medium text-muted-foreground">Primary role</div>
          <div className="font-display text-lg font-bold leading-tight">{primaryRole ?? "none"}</div>
        </div>
        <div className="rounded-lg border border-border bg-card px-3 py-2">
          <div className="text-[10px] font-medium text-muted-foreground">Memberships</div>
          <div className="font-display text-lg font-bold leading-tight">{memberships.length}</div>
        </div>
        <div className="rounded-lg border border-border bg-card px-3 py-2">
          <div className="text-[10px] font-medium text-muted-foreground">Access</div>
          <div className="mt-0.5">
            <Badge tone="neutral">Tenant user</Badge>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card">
        <div className="border-b border-border px-4 py-3">
          <h3 className="text-sm font-semibold">Your tenant memberships</h3>
        </div>
        {memberships.length === 0 ? (
          <div className="px-4 py-6 text-sm text-muted-foreground">
            No active memberships yet. Ask a Super Admin to invite you.
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {memberships.map((m) => (
              <li key={m.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                <div>
                  <div className="font-medium">{m.tenant.name}</div>
                  <div className="text-muted-foreground">
                    {m.tenant.tenant_type} · {m.tenant.slug}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone="info">{m.role}</Badge>
                  <Badge tone={m.tenant.status === "active" ? "success" : "warning"}>
                    {m.tenant.status}
                  </Badge>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
