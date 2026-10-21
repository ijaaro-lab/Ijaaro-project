import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, Link, useNavigate } from "react-router-dom";
import {
  Activity,
  BarChart3,
  Building2,
  ClipboardList,
  CreditCard,
  Droplets,
  Home,
  LayoutDashboard,
  LogOut,
  Menu,
  Palette,
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCw,
  Search,
  Settings,
  Shield,
  UserRound,
  Users,
  X,
  Zap,
} from "lucide-react";
import { useAuth, type MembershipWithTenant } from "@/auth/AuthProvider";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { UserAvatar } from "@/components/ui/user-avatar";
import {
  readTenantSlugFromHost,
  readTenantSlugFromSearch,
  tenantWorkspacePath,
} from "@/lib/tenant";
import { brandingString } from "@/lib/uploadImage";
import { cn } from "@/lib/utils";
import type { AppRole } from "@/types/database";
import type { UtilityKind } from "@/pages/utility/shared";

type NavItem = {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  section?: string;
  end?: boolean;
};

const SIDEBAR_COLLAPSE_KEY = "ijaaro-sidebar-collapsed";

const UTILITY_KIND_TENANT_TYPE: Record<UtilityKind, string> = {
  water: "water_company",
  electricity: "electricity_company",
};

function utilityAdminNav(kind: UtilityKind): NavItem[] {
  const base = `/app/${kind}`;
  return [
    { to: base, label: "Overview", icon: LayoutDashboard, section: "Workspace", end: true },
    { to: `${base}/customers`, label: "Customers", icon: Users, section: "Workspace" },
    {
      to: `${base}/payments`,
      label: "Finance & Payments",
      icon: CreditCard,
      section: "Workspace",
    },
    { to: `${base}/reports`, label: "Reports", icon: BarChart3, section: "Management" },
    { to: `${base}/staff`, label: "Staff", icon: Shield, section: "Management" },
    { to: `${base}/settings`, label: "Company Settings", icon: Settings, section: "Management" },
  ];
}

function utilityStaffNav(kind: UtilityKind): NavItem[] {
  const base = `/app/${kind}`;
  return [
    { to: base, label: "Overview", icon: LayoutDashboard, section: "Workspace", end: true },
    { to: `${base}/customers`, label: "Customers", icon: Users, section: "Workspace" },
    {
      to: `${base}/payments`,
      label: "Finance & Payments",
      icon: CreditCard,
      section: "Workspace",
    },
    { to: `${base}/reports`, label: "Reports", icon: BarChart3, section: "Workspace" },
  ];
}

function utilityCustomerNav(kind: UtilityKind): NavItem[] {
  const base = `/app/${kind}`;
  const OverviewIcon = kind === "water" ? Droplets : Zap;
  return [
    { to: base, label: "Overview", icon: OverviewIcon, end: true, section: "Workspace" },
    {
      to: `${base}/my-payments`,
      label: "Finance & Payments",
      icon: CreditCard,
      section: "Workspace",
    },
  ];
}

function utilityOpsNav(kind: UtilityKind, role: AppRole): NavItem[] {
  if (role === "utility_admin") return utilityAdminNav(kind);
  if (role === "utility_staff") return utilityStaffNav(kind);
  return utilityStaffNav(kind);
}

function navForContext(
  role: AppRole | null,
  isSuperAdmin: boolean,
  memberships: MembershipWithTenant[],
  activeMembership: MembershipWithTenant | null,
): NavItem[] {
  if (isSuperAdmin) {
    return [
      { to: "/app/admin", label: "Overview", icon: LayoutDashboard, section: "Platform", end: true },
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
    ];
  }

  const active = activeMembership;
  if (active) {
    const t = active.tenant.tenant_type;
    const r = active.role;
    if (
      (t === "water_company" || t === "electricity_company") &&
      (r === "utility_admin" || r === "utility_staff")
    ) {
      const kind: UtilityKind = t === "water_company" ? "water" : "electricity";
      return utilityOpsNav(kind, r);
    }
    if (
      (t === "water_company" || t === "electricity_company") &&
      r === "utility_customer"
    ) {
      const kind: UtilityKind = t === "water_company" ? "water" : "electricity";
      return utilityCustomerNav(kind);
    }
  }

  const items: NavItem[] = [{ to: "/app", label: "Overview", icon: LayoutDashboard, end: true }];

  if (role === "landlord_admin" || role === "landlord_staff") {
    items.push(
      { to: "/app/landlord", label: "Dashboard", icon: Home },
      { to: "/app/landlord/properties", label: "Properties", icon: Building2 },
      { to: "/app/landlord/tenancies", label: "Tenancies", icon: ClipboardList },
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

  (["water", "electricity"] as UtilityKind[]).forEach((kind) => {
    const tenantType = UTILITY_KIND_TENANT_TYPE[kind];
    const staffMembership = memberships.find(
      (m) =>
        m.tenant.tenant_type === tenantType &&
        (m.role === "utility_admin" || m.role === "utility_staff"),
    );
    const isCustomer = memberships.some(
      (m) => m.tenant.tenant_type === tenantType && m.role === "utility_customer",
    );
    if (staffMembership) items.push(...utilityOpsNav(kind, staffMembership.role));
    else if (isCustomer) items.push(...utilityCustomerNav(kind));
  });

  const canBrand = memberships.some(
    (m) => m.role === "landlord_admin" || m.role === "utility_admin",
  );
  if (canBrand) {
    items.push({ to: "/app/branding", label: "Branding", icon: Palette });
  }

  return items;
}

function utilityPageTitle(pathname: string, kind: UtilityKind): string | null {
  const base = `/app/${kind}`;
  if (pathname !== base && !pathname.startsWith(`${base}/`)) return null;
  const label = kind === "water" ? "Water" : "Electricity";
  if (pathname.startsWith(`${base}/customers`)) return "Customers";
  if (pathname.startsWith(`${base}/connections`)) return "Houses";
  if (pathname.startsWith(`${base}/meters`)) return `${label} Meters`;
  if (pathname.startsWith(`${base}/readings`)) return "Meter Readings";
  if (pathname.startsWith(`${base}/bills`)) return "Bills & Billing";
  if (pathname.startsWith(`${base}/payments`)) return "Finance & Payments";
  if (pathname.startsWith(`${base}/staff`)) return "Staff";
  if (pathname.startsWith(`${base}/reports`)) return "Reports";
  if (pathname.startsWith(`${base}/notifications`)) return "Notifications";
  if (pathname.startsWith(`${base}/settings`)) return "Company Settings";
  if (pathname.startsWith(`${base}/my-bills`)) return `My ${label.toLowerCase()} bills`;
  if (pathname.startsWith(`${base}/my-payments`)) return "Finance & Payments";
  if (pathname === base || pathname === `${base}/`) return "Overview";
  return `${label} Company Workspace`;
}

function pageTitle(pathname: string, isSuperAdmin: boolean) {
  if (pathname.startsWith("/app/account")) return "Account";
  if (pathname.startsWith("/app/branding")) return "Workspace branding";
  if (pathname.startsWith("/app/admin/tenants")) return "Tenants";
  if (pathname.startsWith("/app/admin/properties")) return "Properties";
  if (pathname.startsWith("/app/admin/water")) return "Water";
  if (pathname.startsWith("/app/admin/electricity")) return "Electricity";
  if (pathname.startsWith("/app/admin/payments")) return "Payments";
  if (pathname.startsWith("/app/admin/reports")) return "Reports";
  if (pathname.startsWith("/app/admin/audit")) return "Audit history";
  if (pathname === "/app/admin" || pathname === "/app/admin/") return "Overview";
  if (pathname.startsWith("/app/admin")) return "Platform dashboard";
  if (pathname.startsWith("/app/landlord/properties")) return "Properties";
  if (pathname.startsWith("/app/landlord/tenancies")) return "Tenancies";
  if (pathname.startsWith("/app/landlord/payments")) return "Rent payment review";
  if (pathname.startsWith("/app/landlord")) return "Landlord rental";
  if (pathname.startsWith("/app/renter/browse")) return "Browse listings";
  if (pathname.startsWith("/app/renter/payments")) return "Rent payments";
  if (pathname.startsWith("/app/renter")) return "Renter workspace";
  const waterTitle = utilityPageTitle(pathname, "water");
  if (waterTitle) return waterTitle;
  const electricityTitle = utilityPageTitle(pathname, "electricity");
  if (electricityTitle) return electricityTitle;
  if (isSuperAdmin) return "Platform console";
  return "Workspace";
}

function roleDisplay(isSuperAdmin: boolean, role: AppRole | null): string {
  if (isSuperAdmin) return "Super Admin";
  if (!role) return "Member";
  if (role === "utility_admin" || role === "landlord_admin") return "Admin";
  return role.replace(/_/g, " ");
}

function groupNav(items: NavItem[]): { section: string; items: NavItem[] }[] {
  return items.reduce<{ section: string; items: NavItem[] }[]>((acc, item) => {
    const section = item.section ?? "";
    const last = acc[acc.length - 1];
    if (last && last.section === section) last.items.push(item);
    else acc.push({ section, items: [item] });
    return acc;
  }, []);
}

function BrandMark({
  tenantLogo,
  tenantDisplay,
  workspaceSubtitle,
  collapsed,
  isSuperAdmin,
}: {
  tenantLogo: string;
  tenantDisplay: string;
  workspaceSubtitle: string;
  collapsed: boolean;
  isSuperAdmin: boolean;
}) {
  if (isSuperAdmin || !tenantLogo) {
    if (collapsed) {
      return (
        <div className="mx-auto flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl bg-white/10 p-1 ring-1 ring-white/15">
          <img
            src="/brand/ijaaro-logo-on-dark.png"
            alt="IJAARO"
            className="h-full w-full object-contain"
            onError={(e) => {
              (e.target as HTMLImageElement).src = "/brand/ijaaro-logo-white.png";
            }}
          />
        </div>
      );
    }
    return (
      <div className="px-0.5">
        <img
          src="/brand/ijaaro-logo-on-dark.png"
          alt="IJAARO"
          className="h-8 w-auto max-w-full object-contain object-left"
          onError={(e) => {
            (e.target as HTMLImageElement).src = "/brand/ijaaro-logo-white.png";
          }}
        />
        <p className="mt-1.5 text-[11px] leading-snug text-white/50">{workspaceSubtitle}</p>
      </div>
    );
  }

  if (collapsed) {
    return (
      <div
        className="mx-auto flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl bg-white/10 ring-1 ring-white/15"
        title={tenantDisplay || "Workspace"}
      >
        <img
          src={tenantLogo}
          alt={tenantDisplay || "Workspace"}
          className="h-full w-full object-contain p-1"
        />
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white/10 p-1.5 ring-1 ring-white/15">
        <img
          src={tenantLogo}
          alt={tenantDisplay || "Workspace"}
          className="h-full w-full object-contain"
        />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-display text-[13px] font-bold leading-tight tracking-tight text-white">
          {tenantDisplay || "Workspace"}
        </p>
        <p className="mt-0.5 truncate text-[10px] leading-snug text-white/50">
          {workspaceSubtitle}
        </p>
      </div>
    </div>
  );
}

export function AppShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const {
    profile,
    primaryRole,
    isSuperAdmin,
    activeMembership,
    signOut,
    memberships,
    setActiveMembershipId,
    refreshMemberships,
    refreshProfile,
  } = useAuth();
  const nav = navForContext(primaryRole, isSuperAdmin, memberships, activeMembership);
  const title = pageTitle(location.pathname, isSuperAdmin);
  const displayName = profile?.full_name || profile?.email || "User";
  const roleLabel = roleDisplay(isSuperAdmin, primaryRole);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_COLLAPSE_KEY) === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname, location.search]);

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_COLLAPSE_KEY, collapsed ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [collapsed]);

  const handleSignOut = async () => {
    const slug =
      activeMembership?.tenant.slug ||
      activeMembership?.tenant.subdomain ||
      readTenantSlugFromSearch(location.search) ||
      readTenantSlugFromHost() ||
      "";
    const hostSlug = readTenantSlugFromHost();
    await signOut();
    if (hostSlug) {
      navigate("/", { replace: true });
      return;
    }
    if (slug && !isSuperAdmin) {
      navigate(tenantWorkspacePath(slug), { replace: true });
      return;
    }
    navigate("/", { replace: true });
  };

  const branding = (activeMembership?.tenant.branding ?? {}) as Record<string, unknown>;
  const tenantLogo = brandingString(branding, "logo_url");
  const tenantDisplay =
    brandingString(branding, "display_name") || activeMembership?.tenant.name || "";

  const tenantSearch = activeMembership?.tenant.slug
    ? `?tenant=${encodeURIComponent(activeMembership.tenant.slug)}`
    : "";

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([refreshMemberships(), refreshProfile()]);
    } finally {
      setRefreshing(false);
    }
  };

  const isUtilityWorkspace =
    !isSuperAdmin &&
    (activeMembership?.tenant.tenant_type === "water_company" ||
      activeMembership?.tenant.tenant_type === "electricity_company") &&
    (activeMembership?.role === "utility_admin" ||
      activeMembership?.role === "utility_staff" ||
      activeMembership?.role === "utility_customer");

  const mainNav = nav.filter(
    (item) => item.to !== "/app/account" && item.to !== "/app/branding",
  );
  const navSections = groupNav(mainNav);

  const workspaceSubtitle = isSuperAdmin
    ? "Super Admin console"
    : isUtilityWorkspace
      ? activeMembership?.tenant.tenant_type === "water_company"
        ? "Water Company Workspace"
        : "Electricity Company Workspace"
      : tenantDisplay || "Smart Utility Platform";

  const isElectricityWorkspace =
    isUtilityWorkspace &&
    activeMembership?.tenant.tenant_type === "electricity_company";
  const navAccentRing = isElectricityWorkspace
    ? "shadow-[inset_0_0_0_1px_rgba(245,196,0,0.35)]"
    : "shadow-[inset_0_0_0_1px_rgba(43,140,255,0.35)]";

  const renderSidebar = (opts: { collapsed: boolean; showCollapseToggle: boolean }) => {
    const slim = opts.collapsed;

    const linkClass = ({ isActive }: { isActive: boolean }) =>
      cn(
        "group relative flex items-center rounded-xl text-sm font-medium text-white/65 transition-all duration-150",
        slim ? "justify-center px-0 py-2.5" : "gap-3 px-3 py-2.5",
        "hover:bg-white/10 hover:text-white",
        isActive &&
          cn(
            "bg-white/[0.12] text-white before:absolute before:left-0 before:top-1/2 before:h-5 before:w-[3px] before:-translate-y-1/2 before:rounded-r-full",
            navAccentRing,
            isElectricityWorkspace ? "before:bg-brand-power" : "before:bg-brand-water",
          ),
      );

    return (
      <>
        <div
          className={cn(
            "relative z-10 shrink-0 border-b border-white/10",
            slim ? "px-2 py-3" : "px-3.5 py-3.5",
          )}
        >
          <BrandMark
            tenantLogo={tenantLogo}
            tenantDisplay={tenantDisplay}
            workspaceSubtitle={workspaceSubtitle}
            collapsed={slim}
            isSuperAdmin={isSuperAdmin}
          />
          {opts.showCollapseToggle && (
            <button
              type="button"
              onClick={() => setCollapsed((c) => !c)}
              className={cn(
                "mt-3 flex h-8 w-full items-center justify-center gap-2 rounded-lg text-white/45 transition hover:bg-white/10 hover:text-white",
                !slim && "justify-start px-2.5 text-xs font-medium",
              )}
              title={slim ? "Expand sidebar" : "Collapse sidebar"}
              aria-label={slim ? "Expand sidebar" : "Collapse sidebar"}
            >
              {slim ? (
                <PanelLeftOpen className="h-4 w-4" />
              ) : (
                <>
                  <PanelLeftClose className="h-4 w-4 shrink-0" />
                  <span>Collapse</span>
                </>
              )}
            </button>
          )}
        </div>

        <nav
          className={cn(
            "sidebar-scroll relative z-10 flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto overflow-x-hidden",
            slim ? "px-1.5 py-2" : "px-2.5 py-3",
          )}
        >
          {navSections.map((group) => (
            <div key={group.section || "main"} className="space-y-0.5">
              {group.section && !slim ? (
                <p className="px-3 pb-1.5 pt-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/30">
                  {group.section}
                </p>
              ) : null}
              {slim && group.section ? (
                <div className="mx-auto mb-1 h-px w-6 bg-white/10" aria-hidden />
              ) : null}
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={`${item.to}${tenantSearch}`}
                  title={slim ? item.label : undefined}
                  end={
                    item.end ??
                    (item.to === "/app" ||
                      item.to === "/app/admin" ||
                      item.to === "/app/water" ||
                      item.to === "/app/electricity")
                  }
                  className={linkClass}
                >
                  <item.icon
                    className={cn(
                      "h-[18px] w-[18px] shrink-0 transition",
                      isElectricityWorkspace
                        ? "text-brand-power/90 group-hover:text-brand-power group-[.active]:text-brand-power"
                        : "text-brand-water/90 group-hover:text-brand-water group-[.active]:text-brand-water",
                    )}
                  />
                  {!slim && <span className="truncate">{item.label}</span>}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div
          className={cn(
            "relative z-10 shrink-0 space-y-0.5 border-t border-white/10",
            slim ? "px-1.5 py-2" : "px-2.5 py-2.5",
          )}
        >
          {!isUtilityWorkspace && nav.some((item) => item.to === "/app/branding") && (
            <NavLink
              to={`/app/branding${tenantSearch}`}
              title={slim ? "Branding" : undefined}
              className={linkClass}
            >
              <Palette className="h-[18px] w-[18px] shrink-0 text-brand-water/90" />
              {!slim && <span>Branding</span>}
            </NavLink>
          )}
          <NavLink
            to={`/app/account${tenantSearch}`}
            title={slim ? "Account" : undefined}
            className={linkClass}
          >
            <UserRound className="h-[18px] w-[18px] shrink-0 text-brand-water/90" />
            {!slim && <span>Account</span>}
          </NavLink>
          <button
            type="button"
            onClick={() => void handleSignOut()}
            title={slim ? "Sign out" : undefined}
            className={cn(
              "flex w-full items-center rounded-xl text-left text-sm font-medium text-white/65 transition-colors hover:bg-white/10 hover:text-white",
              slim ? "justify-center px-0 py-2.5" : "gap-3 px-3 py-2.5",
            )}
          >
            <LogOut className="h-[18px] w-[18px] shrink-0" />
            {!slim && <span>Sign out</span>}
          </button>
        </div>
      </>
    );
  };

  return (
    <div className="flex h-svh overflow-hidden bg-background">
      {/* Desktop sidebar */}
      <aside
        className={cn(
          "relative hidden h-full shrink-0 flex-col overflow-hidden bg-sidebar text-white transition-[width] duration-200 ease-out lg:flex",
          collapsed ? "w-[72px]" : "w-[260px]",
        )}
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-50"
          style={{
            background:
              "radial-gradient(ellipse 90% 55% at 0% 0%, rgba(43,140,255,0.2), transparent 55%), radial-gradient(ellipse 70% 45% at 100% 100%, rgba(31,168,90,0.1), transparent 50%)",
          }}
        />
        {renderSidebar({ collapsed, showCollapseToggle: true })}
      </aside>

      {/* Mobile drawer — always expanded labels */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"
            aria-label="Close menu"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="relative flex h-full w-[min(288px,88vw)] flex-col overflow-hidden bg-sidebar text-white shadow-2xl">
            <div
              className="pointer-events-none absolute inset-0 opacity-50"
              style={{
                background:
                  "radial-gradient(ellipse 80% 50% at 0% 0%, rgba(43,140,255,0.2), transparent 55%)",
              }}
            />
            <button
              type="button"
              className="absolute right-2.5 top-3.5 z-20 rounded-lg p-2 text-white/60 hover:bg-white/10 hover:text-white"
              onClick={() => setMobileOpen(false)}
              aria-label="Close navigation"
            >
              <X className="h-4 w-4" />
            </button>
            {renderSidebar({ collapsed: false, showCollapseToggle: false })}
          </aside>
        </div>
      )}

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border/80 bg-card/95 px-3 backdrop-blur-sm sm:px-5">
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground lg:hidden"
              onClick={() => setMobileOpen(true)}
              aria-label="Open navigation"
            >
              <Menu className="h-5 w-5" />
            </button>
            <button
              type="button"
              className="hidden h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground lg:flex"
              onClick={() => setCollapsed((c) => !c)}
              title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {collapsed ? (
                <PanelLeftOpen className="h-4 w-4" />
              ) : (
                <PanelLeftClose className="h-4 w-4" />
              )}
            </button>
            <div className="min-w-0">
              <h1 className="truncate font-display text-base font-semibold text-foreground">
                {title}
              </h1>
              <p className="truncate text-[11px] text-muted-foreground">
                {isSuperAdmin
                  ? "Secure tenant provisioning & audit oversight"
                  : activeMembership
                    ? `${activeMembership.tenant.name} · isolated tenant`
                    : "Role-aware workspace"}
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            {memberships.length > 1 && !isSuperAdmin && (
              <select
                className="h-9 max-w-[140px] rounded-lg border border-border bg-card px-2 text-sm sm:max-w-none"
                value={activeMembership?.id ?? ""}
                onChange={(e) => setActiveMembershipId(e.target.value || null)}
              >
                {memberships.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.tenant.name} ({m.role})
                  </option>
                ))}
              </select>
            )}

            <div className="flex items-center gap-1.5">
              <ThemeToggle variant="ghost" />
              <button
                type="button"
                onClick={() => void onRefresh()}
                disabled={refreshing}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-60"
                title="Refresh"
                aria-label="Refresh"
              >
                <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
              </button>
            </div>

            <div className="hidden h-8 w-px bg-border sm:block" />

            <Link
              to={`/app/account${tenantSearch}`}
              className="flex items-center gap-3 rounded-xl py-1.5 pl-1 pr-1.5 transition hover:bg-muted/60"
            >
              <div className="hidden text-right sm:block">
                <p className="text-sm font-semibold leading-tight text-foreground">{displayName}</p>
                <p className="text-[11px] capitalize leading-tight text-muted-foreground">
                  {roleLabel}
                </p>
              </div>
              <UserAvatar
                name={profile?.full_name}
                email={profile?.email}
                avatarUrl={profile?.avatar_url}
                size="md"
                className="ring-border"
              />
            </Link>
          </div>
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-[radial-gradient(ellipse_at_top,_rgba(43,140,255,0.04),_transparent_55%)] p-4 sm:p-5 dark:bg-[radial-gradient(ellipse_at_top,_rgba(43,140,255,0.06),_transparent_50%)]">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
