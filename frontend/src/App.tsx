import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "@/auth/AuthProvider";
import {
  ProtectedRoute,
  RoleRoute,
  SuperAdminRoute,
} from "@/auth/ProtectedRoute";
import { AppShell } from "@/components/layout/AppShell";
import { TenantSlugSync } from "@/components/TenantSlugSync";
import { AppLoading } from "@/components/ui/app-loading";
import { workspaceAppHomePath } from "@/lib/roles";
import { resolveTenantKeyFromLocation } from "@/lib/tenant";
import { LandingPage } from "@/pages/LandingPage";
import { LoginPage } from "@/pages/LoginPage";
import { SignupPage } from "@/pages/SignupPage";
import { CreateWorkspacePage } from "@/pages/CreateWorkspacePage";
import { TenantLandingPage } from "@/pages/TenantLandingPage";
import { OverviewPage } from "@/pages/OverviewPage";
import { SuperAdminDashboard } from "@/pages/admin/SuperAdminDashboard";
import { TenantsPage } from "@/pages/admin/TenantsPage";
import { TenantDetailPage } from "@/pages/admin/TenantDetailPage";
import { AdminPropertiesPage } from "@/pages/admin/AdminPropertiesPage";
import { AdminUtilityOpsPage } from "@/pages/admin/AdminUtilityOpsPage";
import { AdminPaymentsPage } from "@/pages/admin/AdminPaymentsPage";
import { AdminReportsPage } from "@/pages/admin/AdminReportsPage";
import { AuditPage } from "@/pages/admin/AuditPage";
import { LandlordHome } from "@/pages/landlord/LandlordHome";
import { PropertiesPage } from "@/pages/landlord/PropertiesPage";
import { PropertyFormPage } from "@/pages/landlord/PropertyFormPage";
import { PropertyDetailPage } from "@/pages/landlord/PropertyDetailPage";
import { TenanciesPage } from "@/pages/landlord/TenanciesPage";
import { TenancyDetailPage } from "@/pages/landlord/TenancyDetailPage";
import { PaymentsReviewPage } from "@/pages/landlord/PaymentsReviewPage";
import { StaffMembersPage } from "@/pages/landlord/StaffMembersPage";
import { RenterDashboard } from "@/pages/renter/RenterDashboard";
import { BrowseListingsPage } from "@/pages/renter/BrowseListingsPage";
import { ListingDetailPage } from "@/pages/renter/ListingDetailPage";
import { RenterPaymentsPage } from "@/pages/renter/RenterPaymentsPage";
import { RenterTenancyPage } from "@/pages/renter/RenterTenancyPage";
import { UtilityDashboard } from "@/pages/utility/UtilityDashboard";
import { CustomersPage } from "@/pages/utility/CustomersPage";
import { CustomerDetailPage } from "@/pages/utility/CustomerDetailPage";
import { MetersPage } from "@/pages/utility/MetersPage";
import { ReadingsPage } from "@/pages/utility/ReadingsPage";
import { BillsPage } from "@/pages/utility/BillsPage";
import { PaymentsReviewPage as UtilityPaymentsReviewPage } from "@/pages/utility/PaymentsReviewPage";
import { ReportsPage } from "@/pages/utility/ReportsPage";
import { CustomerBillsPage } from "@/pages/utility/CustomerBillsPage";
import { CustomerPaymentsPage } from "@/pages/utility/CustomerPaymentsPage";
import { ConnectionsPage } from "@/pages/utility/ConnectionsPage";
import { StaffPage } from "@/pages/utility/StaffPage";
import { NotificationsPage } from "@/pages/utility/NotificationsPage";
import { CompanySettingsPage } from "@/pages/utility/CompanySettingsPage";
import { AccountPage } from "@/pages/AccountPage";
import { WorkspaceBrandingPage } from "@/pages/WorkspaceBrandingPage";

function HomeEntry() {
  const { session, loading, isSuperAdmin, memberships } = useAuth();
  const tenantSlug = resolveTenantKeyFromLocation();

  if (loading) {
    return <AppLoading />;
  }

  // Workspace portal: `/?tenant=<slug>` or `slug.localhost` / `slug.<base>`.
  // Always show the public landing (with login). Do NOT skip to dashboard —
  // that was hiding the tenant landing right after create.
  if (tenantSlug) {
    return <TenantLandingPage tenantKey={tenantSlug} />;
  }

  if (session) {
    if (isSuperAdmin) return <Navigate to="/app/admin" replace />;
    const first = memberships[0];
    if (first) return <Navigate to={workspaceAppHomePath(first)} replace />;
    return <Navigate to="/app" replace />;
  }
  return <LandingPage />;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <TenantSlugSync />
        <Routes>
          <Route path="/" element={<HomeEntry />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/create-workspace" element={<CreateWorkspacePage />} />

          <Route element={<ProtectedRoute />}>
            <Route path="/app" element={<AppShell />}>
              <Route index element={<OverviewPage />} />
              <Route path="account" element={<AccountPage />} />
              <Route path="branding" element={<WorkspaceBrandingPage />} />
              <Route
                element={
                  <RoleRoute
                    allow={["landlord_admin", "landlord_staff"]}
                    tenantTypes={["landlord"]}
                    message="Landlord tools require an active landlord admin or staff membership."
                  />
                }
              >
                <Route path="landlord" element={<LandlordHome />} />
                <Route path="landlord/properties" element={<PropertiesPage />} />
                <Route path="landlord/properties/new" element={<PropertyFormPage />} />
                <Route path="landlord/properties/:id" element={<PropertyDetailPage />} />
                <Route path="landlord/properties/:id/edit" element={<PropertyFormPage />} />
              </Route>

              <Route
                element={
                  <RoleRoute
                    allow={["landlord_admin"]}
                    tenantTypes={["landlord"]}
                    message="This landlord admin tool requires an active landlord admin membership."
                  />
                }
              >
                <Route path="landlord/staff" element={<StaffMembersPage />} />
                <Route path="landlord/tenancies" element={<TenanciesPage />} />
                <Route path="landlord/tenancies/:id" element={<TenancyDetailPage />} />
                <Route path="landlord/payments" element={<PaymentsReviewPage />} />
              </Route>

              <Route
                element={
                  <RoleRoute
                    allow={["renter", "landlord_admin", "landlord_staff"]}
                    tenantTypes={["landlord"]}
                    message="Renter tools require an active renter or landlord membership."
                  />
                }
              >
                <Route path="renter" element={<RenterDashboard />} />
                <Route path="renter/browse" element={<BrowseListingsPage />} />
                <Route path="renter/browse/:id" element={<ListingDetailPage />} />
                <Route path="renter/payments" element={<RenterPaymentsPage />} />
                <Route path="renter/tenancy/:id" element={<RenterTenancyPage />} />
              </Route>

              <Route
                element={
                  <RoleRoute
                    allow={[
                      "utility_admin",
                      "utility_staff",
                      "utility_customer",
                    ]}
                    tenantTypes={["water_company"]}
                    message="Water company tools require an active membership on a water workspace."
                  />
                }
              >
                <Route path="water" element={<UtilityDashboard kind="water" />} />
                <Route path="water/customers" element={<CustomersPage kind="water" />} />
                <Route path="water/customers/:id" element={<CustomerDetailPage kind="water" />} />
                <Route path="water/connections" element={<ConnectionsPage kind="water" />} />
                <Route path="water/meters" element={<MetersPage kind="water" />} />
                <Route path="water/readings" element={<ReadingsPage kind="water" />} />
                <Route path="water/bills" element={<BillsPage kind="water" />} />
                <Route path="water/payments" element={<UtilityPaymentsReviewPage kind="water" />} />
                <Route path="water/staff" element={<StaffPage kind="water" />} />
                <Route path="water/reports" element={<ReportsPage kind="water" />} />
                <Route path="water/notifications" element={<NotificationsPage kind="water" />} />
                <Route path="water/settings" element={<CompanySettingsPage kind="water" />} />
                <Route path="water/my-bills" element={<CustomerBillsPage kind="water" />} />
                <Route path="water/my-payments" element={<CustomerPaymentsPage kind="water" />} />
              </Route>

              <Route
                element={
                  <RoleRoute
                    allow={[
                      "utility_admin",
                      "utility_staff",
                      "utility_customer",
                    ]}
                    tenantTypes={["electricity_company"]}
                    message="Electricity company tools require an active membership on an electricity workspace."
                  />
                }
              >
                <Route path="electricity" element={<UtilityDashboard kind="electricity" />} />
                <Route path="electricity/customers" element={<CustomersPage kind="electricity" />} />
                <Route path="electricity/customers/:id" element={<CustomerDetailPage kind="electricity" />} />
                <Route path="electricity/connections" element={<ConnectionsPage kind="electricity" />} />
                <Route path="electricity/meters" element={<MetersPage kind="electricity" />} />
                <Route path="electricity/readings" element={<ReadingsPage kind="electricity" />} />
                <Route path="electricity/bills" element={<BillsPage kind="electricity" />} />
                <Route path="electricity/payments" element={<UtilityPaymentsReviewPage kind="electricity" />} />
                <Route path="electricity/staff" element={<StaffPage kind="electricity" />} />
                <Route path="electricity/reports" element={<ReportsPage kind="electricity" />} />
                <Route path="electricity/notifications" element={<NotificationsPage kind="electricity" />} />
                <Route path="electricity/settings" element={<CompanySettingsPage kind="electricity" />} />
                <Route path="electricity/my-bills" element={<CustomerBillsPage kind="electricity" />} />
                <Route path="electricity/my-payments" element={<CustomerPaymentsPage kind="electricity" />} />
              </Route>

              <Route element={<SuperAdminRoute />}>
                <Route path="admin" element={<SuperAdminDashboard />} />
                <Route path="admin/tenants" element={<TenantsPage />} />
                <Route path="admin/tenants/:tenantId" element={<TenantDetailPage />} />
                <Route path="admin/properties" element={<AdminPropertiesPage />} />
                <Route path="admin/water" element={<AdminUtilityOpsPage kind="water" />} />
                <Route
                  path="admin/electricity"
                  element={<AdminUtilityOpsPage kind="electricity" />}
                />
                <Route path="admin/payments" element={<AdminPaymentsPage />} />
                <Route path="admin/reports" element={<AdminReportsPage />} />
                <Route path="admin/audit" element={<AuditPage />} />
              </Route>
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
