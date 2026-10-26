import {
  Activity,
  BarChart3,
  Building2,
  ClipboardList,
  CreditCard,
  Droplets,
  FileText,
  Gauge,
  Home,
  LayoutDashboard,
  Palette,
  Search,
  Shield,
  UserRound,
  Users,
  Zap,
} from "lucide-react";
import type { MembershipWithTenant } from "@/auth/AuthProvider";
import type { AppRole } from "@/types/database";
import type { UtilityKind } from "@/pages/utility/shared";

export type NavItem = {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  section?: string;
};

const UTILITY_KIND_TENANT_TYPE: Record<UtilityKind, string> = {
  water: "water_company",
  electricity: "electricity_company",
};

function utilityStaffNav(kind: UtilityKind): NavItem[] {
  const base = `/app/${kind}`;
  const label = kind === "water" ? "Water" : "Electricity";
  const Icon = kind === "water" ? Droplets : Zap;
  return [
    { to: base, label: `${label} dashboard`, icon: Icon },
    { to: `${base}/customers`, label: "Customers", icon: Users },
    { to: `${base}/meters`, label: "Meters", icon: Gauge },
    { to: `${base}/readings`, label: "Readings", icon: ClipboardList },
    { to: `${base}/bills`, label: "Bills", icon: FileText },
    { to: `${base}/payments`, label: "Payments", icon: CreditCard },
    { to: `${base}/reports`, label: "Reports", icon: BarChart3 },
  ];
}

function utilityCustomerNav(kind: UtilityKind): NavItem[] {
  const base = `/app/${kind}`;
  const label = kind === "water" ? "Water" : "Electricity";
  const Icon = kind === "water" ? Droplets : Zap;
  return [
    { to: base, label: `${label} dashboard`, icon: Icon },
    { to: `${base}/my-bills`, label: "My bills", icon: FileText },
    { to: `${base}/my-payments`, label: "My payments", icon: CreditCard },
  ];
}

/** Utility links only when the *active* membership matches that utility tenant. */
export function utilityNavForActiveMembership(
  active: MembershipWithTenant | null | undefined,
): NavItem[] {
  if (!active || active.status !== "active") return [];
  const type = active.tenant?.tenant_type;
  const kind = (["water", "electricity"] as UtilityKind[]).find(
    (k) => UTILITY_KIND_TENANT_TYPE[k] === type,
  );
  if (!kind) return [];

  if (active.role === "utility_admin" || active.role === "utility_staff") {
    return utilityStaffNav(kind);
  }
  if (active.role === "utility_customer") {
    return utilityCustomerNav(kind);
  }
  return [];
}

/** Branding is admin-only for the active landlord / utility workspace. */
export function canShowBrandingNav(
  active: MembershipWithTenant | null | undefined,
): boolean {
  if (!active || active.status !== "active") return false;
  const type = active.tenant?.tenant_type;
  if (active.role === "landlord_admin" && type === "landlord") return true;
  if (
    active.role === "utility_admin" &&
    (type === "water_company" || type === "electricity_company")
  ) {
    return true;
  }
  return false;
}

/**
 * Paths that must use NavLink `end` so parent dashboards are not active on child routes.
 */
export function navLinkUsesExactEnd(to: string): boolean {
  return (
    to === "/app" ||
    to === "/app/admin" ||
    to === "/app/landlord" ||
    to === "/app/renter" ||
    to === "/app/water" ||
    to === "/app/electricity"
  );
}

/**
 * Build sidebar items from Super Admin flag + *active* membership role/tenant.
 * Switching active membership must change landlord / utility / branding links.
 */
export function navForRole(
  role: AppRole | null,
  isSuperAdmin: boolean,
  activeMembership: MembershipWithTenant | null | undefined,
): NavItem[] {
  if (isSuperAdmin) {
    return [
      { to: "/app/admin", label: "Overview", icon: LayoutDashboard, section: "Platform" },
      { to: "/app/admin/tenants", label: "Tenants", icon: Shield, section: "Platform" },
      {
        to: "/app/admin/properties",
        label: "Properties",
        icon: Building2,
        section: "Operations",
      },
      { to: "/app/admin/water", label: "Water", icon: Droplets, section: "Operations" },
      {
        to: "/app/admin/electricity",
        label: "Electricity",
        icon: Zap,
        section: "Operations",
      },
      {
        to: "/app/admin/payments",
        label: "Payments",
        icon: CreditCard,
        section: "Operations",
      },
      {
        to: "/app/admin/reports",
        label: "Reports",
        icon: BarChart3,
        section: "Operations",
      },
      { to: "/app/admin/audit", label: "Audit", icon: Activity, section: "Security" },
      { to: "/app/account", label: "Account", icon: UserRound },
    ];
  }

  const items: NavItem[] = [{ to: "/app", label: "Overview", icon: LayoutDashboard }];

  if (role === "landlord_staff") {
    items.push(
      { to: "/app/landlord", label: "Dashboard", icon: Home },
      { to: "/app/landlord/properties", label: "Properties", icon: Building2 },
    );
  }
  if (role === "landlord_admin") {
    // Staff sits after Properties so it stays above the fold on short sidebars.
    items.push(
      { to: "/app/landlord", label: "Dashboard", icon: Home },
      { to: "/app/landlord/properties", label: "Properties", icon: Building2 },
      { to: "/app/landlord/staff", label: "Staff", icon: Users },
      { to: "/app/landlord/tenancies", label: "Tenancies", icon: ClipboardList },
      { to: "/app/landlord/renters", label: "Invite renter", icon: Users },
      { to: "/app/landlord/applications", label: "Applications", icon: ClipboardList },
      { to: "/app/landlord/payments", label: "Rent review", icon: CreditCard },
    );
  }
  if (role === "renter") {
    items.push(
      { to: "/app/renter", label: "Dashboard", icon: UserRound },
      { to: "/app/renter/browse", label: "Browse", icon: Search },
      { to: "/app/renter/payments", label: "Payments", icon: CreditCard },
    );
  }

  items.push(...utilityNavForActiveMembership(activeMembership));

  if (canShowBrandingNav(activeMembership)) {
    items.push({ to: "/app/branding", label: "Branding", icon: Palette });
  }

  items.push({ to: "/app/account", label: "Account", icon: UserRound });
  return items;
}
