import { useState } from "react";
import { NavLink, Outlet, useLocation, Link, useNavigate } from "react-router-dom";
import {
  Activity,
  BarChart3,
  Bell,
  Building2,
  ClipboardList,
  CreditCard,
  Droplets,
  FileText,
  Gauge,
  Home,
  LayoutDashboard,
  LogOut,
  Palette,
  RefreshCw,
  Search,
  Shield,
  UserRound,
  Users,
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

function utilityNavForMemberships(memberships: MembershipWithTenant[]): NavItem[] {
  const items: NavItem[] = [];
  (["water", "electricity"] as UtilityKind[]).forEach((kind) => {
    const tenantType = UTILITY_KIND_TENANT_TYPE[kind];
    const isStaff = memberships.some(
      (m) =>
        m.tenant.tenant_type === tenantType &&
        (m.role === "utility_admin" || m.role === "utility_staff"),
    );
    const isCustomer = memberships.some(
      (m) => m.tenant.tenant_type === tenantType && m.role === "utility_customer",
    );
    if (isStaff) items.push(...utilityStaffNav(kind));
    else if (isCustomer) items.push(...utilityCustomerNav(kind));
  });
  return items;
}

function navForRole(
  role: AppRole | null,
  isSuperAdmin: boolean,
  memberships: MembershipWithTenant[],
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
  const hasUtilityMembership = memberships.some(
    (m) =>
      m.role === "utility_admin" ||
      m.role === "utility_staff" ||
      m.role === "utility_customer",
  );
  if (hasUtilityMembership) {
    items.push(...utilityNavForMemberships(memberships));
  }

  const canBrand = memberships.some(
    (m) => m.role === "landlord_admin" || m.role === "utility_admin",
  );
  if (canBrand) {
    items.push({ to: "/app/branding", label: "Branding", icon: Palette });
  }

  items.push({ to: "/app/account", label: "Account", icon: UserRound });
  return items;
}

function utilityPageTitle(pathname: string, kind: UtilityKind): string | null {
  const base = `/app/${kind}`;
  if (pathname !== base && !pathname.startsWith(`${base}/`)) return null;
  const label = kind === "water" ? "Water" : "Electricity";
  if (pathname.startsWith(`${base}/customers`)) return `${label} customers`;
  if (pathname.startsWith(`${base}/meters`)) return `${label} meters`;
  if (pathname.startsWith(`${base}/readings`)) return `${label} meter readings`;
  if (pathname.startsWith(`${base}/bills`)) return `${label} bills`;
  if (pathname.startsWith(`${base}/payments`)) return `${label} payment review`;
  if (pathname.startsWith(`${base}/reports`)) return `${label} reports`;
  if (pathname.startsWith(`${base}/my-bills`)) return `My ${label.toLowerCase()} bills`;
  if (pathname.startsWith(`${base}/my-payments`)) return `My ${label.toLowerCase()} payments`;
  return `${label} company`;
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
  const nav = navForRole(primaryRole, isSuperAdmin, memberships);
  const title = pageTitle(location.pathname, isSuperAdmin);
  const displayName = profile?.full_name || profile?.email || "User";
  const roleLabel = roleDisplay(isSuperAdmin, primaryRole);

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

  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([refreshMemberships(), refreshProfile()]);
    } finally {
      setRefreshing(false);
    }
  };

  const navClass = ({ isActive }: { isActive: boolean }) =>
    cn(
      "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-white/70 transition-all duration-150 hover:bg-white/10 hover:text-white",
      isActive &&
        "bg-gradient-to-r from-brand-water/25 to-white/10 text-white shadow-[inset_0_0_0_1px_rgba(43,140,255,0.25)]",
    );

  const mainNav = nav.filter(
    (item) => item.to !== "/app/account" && item.to !== "/app/branding",
  );
  const navSections = isSuperAdmin
    ? mainNav.reduce<{ section: string; items: NavItem[] }[]>((acc, item) => {
        const section = item.section ?? "Menu";
        const last = acc[acc.length - 1];
        if (last && last.section === section) last.items.push(item);
        else acc.push({ section, items: [item] });
        return acc;
      }, [])
    : [{ section: "", items: mainNav }];

  return (
    <div className="flex h-svh overflow-hidden bg-background">
      <aside className="relative flex h-full w-[264px] shrink-0 flex-col overflow-hidden bg-sidebar text-white">
        <div
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            background:
              "radial-gradient(ellipse 80% 50% at 0% 0%, rgba(43,140,255,0.18), transparent 55%), radial-gradient(ellipse 60% 40% at 100% 100%, rgba(31,168,90,0.12), transparent 50%)",
          }}
        />
        <div className="relative shrink-0 border-b border-white/10 px-4 py-3.5">
          {tenantLogo && !isSuperAdmin ? (
            <img
              src={tenantLogo}
              alt={tenantDisplay || "Workspace"}
              className="h-9 w-auto max-w-full object-contain object-left"
            />
          ) : (
            <img
              src="/brand/ijaaro-logo-on-dark.png"
              alt="IJAARO"
              className="h-9 w-auto max-w-full object-contain object-left"
              onError={(e) => {
                (e.target as HTMLImageElement).src = "/brand/ijaaro-logo-white.png";
              }}
            />
          )}
          <p className="mt-1.5 px-1 text-[11px] leading-snug text-white/55">
            {isSuperAdmin
              ? "Super Admin console"
              : tenantDisplay || "Smart Utility Platform"}
          </p>
        </div>

        <nav className="relative flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overflow-x-hidden p-3">
          {navSections.map((group) => (
            <div key={group.section || "main"} className="space-y-1">
              {group.section ? (
                <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/35">
                  {group.section}
                </p>
              ) : null}
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={`${item.to}${tenantSearch}`}
                  end={
                    item.to === "/app" ||
                    item.to === "/app/admin" ||
                    item.to === "/app/water" ||
                    item.to === "/app/electricity"
                  }
                  className={navClass}
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  {item.label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className="relative shrink-0 space-y-1 border-t border-white/10 p-3">
          {nav.some((item) => item.to === "/app/branding") && (
            <NavLink to={`/app/branding${tenantSearch}`} className={navClass}>
              <Palette className="h-4 w-4 shrink-0" />
              Branding
            </NavLink>
          )}
          <NavLink to={`/app/account${tenantSearch}`} className={navClass}>
            <UserRound className="h-4 w-4 shrink-0" />
            Account
          </NavLink>
          <button
            type="button"
            onClick={() => void handleSignOut()}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-white/70 transition-colors hover:bg-white/10 hover:text-white"
          >
            <LogOut className="h-4 w-4 shrink-0" />
            Sign out
          </button>
        </div>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-border/80 bg-card/95 px-5 backdrop-blur-sm">
          <div className="min-w-0">
            <h1 className="font-display text-base font-semibold text-foreground">{title}</h1>
            <p className="truncate text-[11px] text-muted-foreground">
              {isSuperAdmin
                ? "Secure tenant provisioning & audit oversight"
                : activeMembership
                  ? `${activeMembership.tenant.name} · isolated tenant`
                  : "Role-aware workspace"}
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-3">
            {memberships.length > 1 && !isSuperAdmin && (
              <select
                className="h-9 rounded-lg border border-border bg-card px-2 text-sm"
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
              <button
                type="button"
                className="relative flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground"
                title="Notifications"
                aria-label="Notifications"
              >
                <Bell className="h-4 w-4" />
                <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-red-500" />
              </button>
            </div>

            <div className="hidden h-8 w-px bg-border sm:block" />

            <Link
              to={`/app/account${tenantSearch}`}
              className="flex items-center gap-3 rounded-xl py-1.5 pl-1 pr-1.5 transition hover:bg-muted/60"
            >
              <div className="hidden text-right sm:block">
                <p className="text-sm font-semibold leading-tight text-foreground">
                  {displayName}
                </p>
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
