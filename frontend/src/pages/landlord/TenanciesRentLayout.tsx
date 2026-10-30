import { Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider";
import { WorkspaceTabs } from "@/components/layout/WorkspaceTabs";
import { tenantSearchSuffix } from "@/lib/tenant";

const TABS = [
  { to: "/app/landlord/tenancies", label: "Tenancies", end: true },
  { to: "/app/landlord/payments", label: "Rent review" },
  { to: "/app/landlord/renters", label: "Invite renter" },
];

export function TenanciesRentLayout() {
  const { activeMembership } = useAuth();
  const location = useLocation();
  const tenantSearch = tenantSearchSuffix(activeMembership?.tenant.slug);

  // Detail pages keep the tab chrome for context switching.
  const showTabs =
    location.pathname.startsWith("/app/landlord/tenancies") ||
    location.pathname.startsWith("/app/landlord/payments") ||
    location.pathname.startsWith("/app/landlord/renters");

  return (
    <div className="space-y-4">
      {showTabs ? (
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">
            Manage active tenancies, review rent submissions, and invite renters.
          </p>
          <WorkspaceTabs tabs={TABS} tenantSearch={tenantSearch} />
        </div>
      ) : null}
      <Outlet />
    </div>
  );
}
