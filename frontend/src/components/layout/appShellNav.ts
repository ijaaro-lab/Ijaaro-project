import {
  Activity,
  BarChart3,
  Building2,
  ClipboardList,
  CreditCard,
  Droplets,
  FileText,
  Home,
  LayoutDashboard,
  Search,
  Settings,
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
  /** When set, NavLink is active if pathname matches any prefix (or exact `to`). */
  activePrefixes?: string[];
};

const UTILITY_KIND_TENANT_TYPE: Record<UtilityKind, string> = {
  water: "water_company",
  electricity: "electricity_company",
};

function utilityFinancePrefixes(kind: UtilityKind): string[] {
  const base = `/app/${kind}`;
  return [
    `${base}/finance`,
    `${base}/bills`,
    `${base}/payments`,
    `${base}/meters`,
    `${base}/readings`,
    `${base}/reports`,
  ];
}

function utilityStaffNav(kind: UtilityKind, isAdmin: boolean): NavItem[] {
  const base = `/app/${kind}`;
  const items: NavItem[] = [
    { to: base, label: "Overview", icon: LayoutDashboard },
    { to: `${base}/customers`, label: "Customers", icon: Users },
    {
      to: `${base}/finance`,
      label: "Finance & Payments",
      icon: CreditCard,
      activePrefixes: utilityFinancePrefixes(kind),
    },
  ];
  if (isAdmin) {
    items.push({ to: `${base}/staff`, label: "Staff", icon: Users });
  }
  return items;
}

function utilityCustomerNav(kind: UtilityKind): NavItem[] {
  const base = `/app/${kind}`;
  const Icon = kind === "water" ? Droplets : Zap;
  return [
    { to: base, label: "Overview", icon: Icon },
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

  if (active.role === "utility_admin") {
    return utilityStaffNav(kind, true);
  }
  if (active.role === "utility_staff") {
    return utilityStaffNav(kind, false);
  }
  if (active.role === "utility_customer") {
    return utilityCustomerNav(kind);
  }
  return [];
}

/** Company settings (branding) is admin-only for the active landlord / utility workspace. */
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

/** Whether a nav item should appear active for the current pathname. */
export function navItemIsActive(item: NavItem, pathname: string): boolean {
  if (item.activePrefixes?.length) {
    return item.activePrefixes.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
    );
  }
  if (navLinkUsesExactEnd(item.to)) {
    return pathname === item.to || pathname === `${item.to}/`;
  }
  return pathname === item.to || pathname.startsWith(`${item.to}/`);
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

  const items: NavItem[] = [];

  if (role === "landlord_staff") {
    items.push(
      { to: "/app/landlord", label: "Overview", icon: Home },
      { to: "/app/landlord/properties", label: "Properties", icon: Building2 },
    );
  } else if (role === "landlord_admin") {
    items.push(
      { to: "/app/landlord", label: "Overview", icon: Home },
      { to: "/app/landlord/properties", label: "Properties", icon: Building2 },
      { to: "/app/landlord/applications", label: "Applications", icon: ClipboardList },
      {
        to: "/app/landlord/tenancies",
        label: "Tenancies & Rent",
        icon: CreditCard,
        activePrefixes: [
          "/app/landlord/tenancies",
          "/app/landlord/payments",
          "/app/landlord/renters",
        ],
      },
      { to: "/app/landlord/staff", label: "Staff", icon: Users },
    );
  } else if (role === "renter") {
    items.push(
      { to: "/app/renter", label: "Overview", icon: UserRound },
      { to: "/app/renter/browse", label: "Browse", icon: Search },
      { to: "/app/renter/payments", label: "Payments", icon: CreditCard },
    );
  } else if (
    role !== "utility_admin" &&
    role !== "utility_staff" &&
    role !== "utility_customer"
  ) {
    items.push({ to: "/app", label: "Overview", icon: LayoutDashboard });
  }

  items.push(...utilityNavForActiveMembership(activeMembership));

  if (canShowBrandingNav(activeMembership)) {
    items.push({
      to: "/app/branding",
      label: "Company Settings",
      icon: Settings,
    });
  }

  items.push({ to: "/app/account", label: "Account", icon: UserRound });
  return items;
}
