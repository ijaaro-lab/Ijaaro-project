import { useEffect, useState, type FormEvent } from "react";
import { Eye, EyeOff, Loader2, LogIn } from "lucide-react";
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { brandingString } from "@/lib/landingTemplates";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import {
  hasPlatformAdminAccess,
  hasTenantWorkspaceAccess,
  isPlatformSuperAdmin,
  tenantPortalAccessDenial,
  workspaceAppHomePath,
} from "@/lib/roles";
import type { AppRole, Tenant, TenantMembership, TenantType } from "@/types/database";

type WorkspacePreview = {
  name: string;
  slug: string;
  tenant_type: TenantType;
  branding: Record<string, unknown>;
};

export function LoginPage() {
  const {
    signIn,
    signOut,
    session,
    loading,
    isSuperAdmin,
    memberships,
    setActiveMembershipId,
    refreshMemberships,
  } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const tenantSlug = params.get("tenant")?.trim().toLowerCase() || null;
  const isPlatformLogin = !tenantSlug;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [workspace, setWorkspace] = useState<WorkspacePreview | null>(null);
  const notice = (location.state as { notice?: string } | null)?.notice ?? null;

  useEffect(() => {
    if (!tenantSlug) {
      setWorkspace(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      const { data } = await supabase.rpc("resolve_tenant_workspace", {
        p_key: tenantSlug,
      });
      if (!cancelled && data) {
        setWorkspace(data as WorkspacePreview);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tenantSlug]);

  const destinationAfterAuth = (
    rows?: Array<TenantMembership & { tenant: Tenant }>,
    opts?: { superAdmin?: boolean },
  ) => {
    const next = params.get("next")?.trim();
    if (next && next.startsWith("/") && !next.startsWith("//")) return next;
    const from = (location.state as { from?: string } | null)?.from;
    if (from && from.startsWith("/") && !from.startsWith("//")) return from;
    const superAdmin = opts?.superAdmin ?? isSuperAdmin;
    if (superAdmin && !tenantSlug) return "/app/admin";

    const source = rows ?? memberships;
    if (tenantSlug) {
      const match = source.find(
        (m) => m.tenant.slug === tenantSlug || m.tenant.subdomain === tenantSlug,
      );
      if (match) return workspaceAppHomePath(match);
      return `/app?tenant=${encodeURIComponent(tenantSlug)}`;
    }

    const first = source[0];
    if (first) return workspaceAppHomePath(first);
    return "/app";
  };

  useEffect(() => {
    if (!tenantSlug || memberships.length === 0) return;
    const match = memberships.find(
      (m) => m.tenant.slug === tenantSlug || m.tenant.subdomain === tenantSlug,
    );
    if (match) setActiveMembershipId(match.id);
  }, [tenantSlug, memberships, setActiveMembershipId]);

  useEffect(() => {
    if (loading || !session || !isPlatformLogin) return;
    if (memberships.length === 0) return;
    if (!hasPlatformAdminAccess(memberships, isSuperAdmin)) {
      void signOut();
      setError(
        "Platform login is only for Super Admin and tenant admins. Use your workspace URL for member access.",
      );
    }
  }, [
    loading,
    session,
    isPlatformLogin,
    memberships,
    isSuperAdmin,
    signOut,
  ]);

  const loadMembershipsNow = async () => {
    const { data } = await supabase
      .from("tenant_memberships")
      .select("*, tenant:tenants(*)")
      .eq("status", "active");

    return ((data ?? []) as Array<TenantMembership & { tenant: Tenant | Tenant[] | null }>)
      .map((row) => {
        const tenant = Array.isArray(row.tenant) ? row.tenant[0] : row.tenant;
        return { ...row, tenant } as TenantMembership & { tenant: Tenant };
      })
      .filter((r) => r.tenant);
  };

  const assertAllowed = (
    rows: Array<TenantMembership & { tenant: Tenant }>,
  ): string | null => {
    const superAdmin = rows.some(
      (m) =>
        m.role === "super_admin" &&
        m.tenant.tenant_type === "platform" &&
        m.tenant.status === "active",
    );

    if (isPlatformLogin) {
      if (!hasPlatformAdminAccess(rows, superAdmin)) {
        return "Platform login is only for Super Admin and tenant admins. Use your workspace URL for member access.";
      }
      return null;
    }

    // Tenant login: Super Admin must use /login (platform), never tenant portals.
    if (superAdmin || isPlatformSuperAdmin(rows)) {
      return "This account is not registered.";
    }

    if (!hasTenantWorkspaceAccess(rows, tenantSlug!)) {
      return (
        tenantPortalAccessDenial(rows, tenantSlug!, workspace?.name) ||
        "This account is not registered."
      );
    }
    return null;
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const result = await signIn(email.trim(), password);
    if (result.error) {
      setSubmitting(false);
      setError(result.error);
      return;
    }

    const rows = await loadMembershipsNow();
    await refreshMemberships();
    const denied = assertAllowed(rows);
    if (denied) {
      await signOut();
      setSubmitting(false);
      setError(denied);
      return;
    }

    const superAdmin = rows.some(
      (m) =>
        m.role === ("super_admin" as AppRole) &&
        m.tenant.tenant_type === "platform" &&
        m.tenant.status === "active",
    );
    if (tenantSlug) {
      const match = rows.find(
        (m) => m.tenant.slug === tenantSlug || m.tenant.subdomain === tenantSlug,
      );
      if (match) setActiveMembershipId(match.id);
    }

    setSubmitting(false);
    navigate(destinationAfterAuth(rows, { superAdmin }));
  };

  const sessionAllowedHere = isPlatformLogin
    ? hasPlatformAdminAccess(memberships, isSuperAdmin)
    : Boolean(tenantSlug && hasTenantWorkspaceAccess(memberships, tenantSlug));

  if (!loading && session && sessionAllowedHere) {
    return <Navigate to={destinationAfterAuth()} replace />;
  }

  const branding = workspace?.branding ?? {};
  const tenantDisplay =
    brandingString(branding, "display_name") || workspace?.name || tenantSlug;
  const tenantLogo = brandingString(branding, "logo_url");
  const accent = brandingString(branding, "accent_color") || "#f5c400";
  const ctaColor = tenantSlug ? accent : "#f5c400";
  const ctaText = tenantSlug ? "#ffffff" : "#0b1f3a";
  const homeHref = tenantSlug ? `/?tenant=${encodeURIComponent(tenantSlug)}` : "/";

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#e8eef5] px-4 py-8 dark:bg-[#0a1524]">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: tenantSlug
            ? `radial-gradient(ellipse 70% 45% at 50% -10%, ${accent}28, transparent 55%), linear-gradient(180deg, #f4f7fb 0%, #e8eef5 100%)`
            : "radial-gradient(ellipse 70% 45% at 50% -10%, rgba(245,196,0,0.22), transparent 55%), radial-gradient(ellipse 50% 40% at 100% 100%, rgba(43,140,255,0.12), transparent 50%), linear-gradient(180deg, #f4f7fb 0%, #e8eef5 100%)",
        }}
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.35] dark:opacity-[0.12]"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%230b1f3a' fill-opacity='0.04'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")",
        }}
        aria-hidden
      />

      <div className="absolute right-4 top-4 z-10">
        <ThemeToggle />
      </div>

      <div className="relative w-full max-w-[380px] overflow-hidden rounded-2xl border border-[#d5e0ec]/90 bg-white/95 shadow-[0_20px_50px_-24px_rgba(11,31,58,0.4)] backdrop-blur-sm dark:border-border dark:bg-card/95 dark:shadow-[0_20px_50px_-24px_rgba(0,0,0,0.7)]">
        <div
          className="h-[3px] w-full"
          style={{ backgroundColor: ctaColor }}
          aria-hidden
        />

        <div className="px-6 pb-5 pt-5 sm:px-7 sm:pb-6 sm:pt-6">
          <div className="mb-5 text-center">
            <Link to={homeHref} className="inline-flex justify-center">
              {tenantLogo ? (
                <img
                  src={tenantLogo}
                  alt={tenantDisplay || "Workspace"}
                  className="mx-auto h-9 w-auto max-w-[200px] object-contain"
                />
              ) : (
                <>
                  <img
                    src="/brand/ijaaro-logo.png"
                    alt="IJAARO"
                    className="mx-auto h-9 w-auto object-contain dark:hidden"
                  />
                  <img
                    src="/brand/ijaaro-logo-on-dark.png"
                    alt="IJAARO"
                    className="mx-auto hidden h-9 w-auto object-contain dark:block"
                  />
                </>
              )}
            </Link>

            <h1 className="mt-4 font-display text-[1.375rem] font-bold tracking-tight text-brand-navy dark:text-foreground">
              Sign in
            </h1>
            <p className="mt-1 text-[13px] text-muted-foreground">
              {tenantSlug
                ? `${tenantDisplay} workspace`
                : "Platform admin sign in"}
            </p>
          </div>

          {!isSupabaseConfigured && (
            <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
              Configure Supabase environment variables before signing in.
            </div>
          )}

          {notice && (
            <p
              role="status"
              className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100"
            >
              {notice}
            </p>
          )}

          <form className="space-y-3" onSubmit={(e) => void onSubmit(e)}>
            <div>
              <label
                htmlFor="login-email"
                className="mb-1 block text-[13px] font-semibold text-brand-navy dark:text-foreground"
              >
                {isPlatformLogin ? "Admin email" : "Email"}
              </label>
              <Input
                id="login-email"
                type="email"
                autoComplete="email"
                required
                placeholder={isPlatformLogin ? "admin@example.com" : "you@example.com"}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={submitting}
                className="h-10 border-[#d0dce8] bg-white shadow-none focus-visible:ring-brand-blue dark:bg-muted"
              />
            </div>

            <div>
              <label
                htmlFor="login-password"
                className="mb-1 block text-[13px] font-semibold text-brand-navy dark:text-foreground"
              >
                Password
              </label>
              <div className="relative">
                <Input
                  id="login-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={submitting}
                  className="h-10 border-[#d0dce8] bg-white pr-10 shadow-none focus-visible:ring-brand-blue dark:bg-muted"
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {error && (
              <p
                role="alert"
                className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
              >
                {error}
              </p>
            )}

            <Button
              className="mt-1 h-10 w-full gap-2 rounded-lg text-sm font-bold shadow-[0_8px_20px_-10px_rgba(245,196,0,0.7)] transition hover:brightness-[0.97] active:scale-[0.99]"
              type="submit"
              disabled={submitting || loading}
              style={{ backgroundColor: ctaColor, color: ctaText }}
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Signing in…
                </>
              ) : (
                <>
                  Sign In
                  <LogIn className="h-4 w-4" />
                </>
              )}
            </Button>
          </form>

          <div className="mt-5 border-t border-[#e8eef4] pt-4 text-center dark:border-border">
            {isPlatformLogin ? (
              <>
                <p className="text-[12px] leading-relaxed text-muted-foreground">
                  Members sign in from their own workspace page.
                </p>
                <p className="mt-2.5 text-[13px] text-brand-navy dark:text-foreground">
                  New organization?{" "}
                  <Link
                    to="/create-workspace"
                    className="font-semibold text-[#c9a000] underline-offset-2 hover:underline dark:text-brand-power"
                  >
                    Create a workspace
                  </Link>
                </p>
              </>
            ) : (
              <>
                <p className="text-[12px] leading-relaxed text-muted-foreground">
                  Only active memberships can open this workspace.
                </p>
                <p className="mt-2.5 text-[13px] text-muted-foreground">
                  Platform operators:{" "}
                  <Link
                    to="/login"
                    className="font-semibold text-[#c9a000] underline-offset-2 hover:underline dark:text-brand-power"
                  >
                    Admin sign in
                  </Link>
                </p>
              </>
            )}
            <p className="mt-3.5 text-[11px] text-muted-foreground/80">Privacy · Terms</p>
          </div>
        </div>
      </div>
    </div>
  );
}
