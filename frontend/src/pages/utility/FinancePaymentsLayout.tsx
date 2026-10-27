import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider";
import { WorkspaceTabs } from "@/components/layout/WorkspaceTabs";
import { KIND_LABEL, type UtilityKind } from "./shared";

export function FinancePaymentsLayout({ kind }: { kind: UtilityKind }) {
  const { activeMembership } = useAuth();
  const location = useLocation();
  const base = `/app/${kind}`;
  const tenantSearch = activeMembership?.tenant.slug
    ? `?tenant=${encodeURIComponent(activeMembership.tenant.slug)}`
    : "";

  const tabs = [
    { to: `${base}/bills`, label: "Bills" },
    { to: `${base}/payments`, label: "Payments" },
    { to: `${base}/meters`, label: "Meters" },
    { to: `${base}/readings`, label: "Readings" },
    { to: `${base}/reports`, label: "Reports" },
  ];

  if (location.pathname === `${base}/finance` || location.pathname === `${base}/finance/`) {
    return <Navigate to={`${base}/bills${tenantSearch}`} replace />;
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <p className="text-sm text-muted-foreground">
          {KIND_LABEL[kind]} billing, payment review, meters, readings, and reports.
        </p>
        <WorkspaceTabs tabs={tabs} tenantSearch={tenantSearch} />
      </div>
      <Outlet />
    </div>
  );
}
