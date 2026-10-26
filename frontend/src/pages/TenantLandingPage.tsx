import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Building2, Droplets, LayoutDashboard, X, Zap } from "lucide-react";
import { useAuth } from "@/auth/AuthProvider";
import {
  friendlyAuthError,
  LandingLoginCard,
} from "@/components/landing/LandingLoginCard";
import { LandlordPublicListings } from "@/components/landing/LandlordPublicListings";
import { TenantLandingTemplate } from "@/components/landing/templates";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/theme/ThemeProvider";
import { resolveTenantPortalDashboardDestination } from "@/lib/myApplicationsNav";
import {
  isPlatformSuperAdmin,
  tenantPortalAccessDenial,
} from "@/lib/roles";
import {
  brandingString,
  resolveLandingTemplateId,
} from "@/lib/landingTemplates";
import { supabase } from "@/lib/supabase";
import { scrollToHashTarget } from "@/lib/scrollToHashTarget";
import { platformHomeUrl, resolveTenantKeyFromLocation } from "@/lib/tenant";
import { cn } from "@/lib/utils";
import type { Session } from "@supabase/supabase-js";
import type { TenantStatus, TenantType } from "@/types/database";

type WorkspaceInfo = {
  id: string;
  name: string;
  slug: string;
  subdomain: string;
  tenant_type: TenantType;
  status: TenantStatus;
  branding: Record<string, unknown>;
};

type LoginState = {
  email: string;
  password: string;
  error: string | null;
  submitting: boolean;
};

export function TenantLandingPage({ tenantKey }: { tenantKey?: string }) {
  const key =
    tenantKey?.trim().toLowerCase() ||
    resolveTenantKeyFromLocation() ||
    "";

  const {
    session,
    loading: authLoading,
    memberships,
    isSuperAdmin,
    signIn,
    signOut,
    refreshMemberships,
    setActiveMembershipId,
  } = useAuth();
  const navigate = useNavigate();
  const { theme } = useTheme();

  const [workspace, setWorkspace] = useState<WorkspaceInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [portalOpen, setPortalOpen] = useState(false);
  const [login, setLogin] = useState<LoginState>({
    email: "",
    password: "",
    error: null,
    submitting: false,
  });
  const [enteringDashboard, setEnteringDashboard] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!key) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const rpc = supabase.rpc("resolve_tenant_workspace", { p_key: key });
        const timeout = new Promise<{ data: null; error: { message: string } }>(
          (resolve) =>
            setTimeout(
              () => resolve({ data: null, error: { message: "Timed out" } }),
              12000,
            ),
        );
        const { data, error: rpcError } = await Promise.race([rpc, timeout]);
        if (cancelled) return;
        if (rpcError || !data) {
          setNotFound(true);
          setWorkspace(null);
        } else {
          setWorkspace(data as WorkspaceInfo);
          setNotFound(false);
        }
      } catch {
        if (!cancelled) {
          setNotFound(true);
          setWorkspace(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [key]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.location.hash === "#portal") setPortalOpen(true);
  }, []);

  // Native hash scroll runs before async workspace chrome mounts `#available-homes`.
  // Re-apply the hash target once the public landing is ready.
  useEffect(() => {
    if (loading || authLoading || !workspace) return;
    return scrollToHashTarget();
  }, [loading, authLoading, workspace]);

  useEffect(() => {
    if (!portalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPortalOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [portalOpen]);

  // Super Admin never enters via tenant portal — even with an existing session.
  const memberMatch =
    key && session && !isSuperAdmin && !isPlatformSuperAdmin(memberships)
      ? memberships.find(
          (row) =>
            row.status === "active" &&
            row.role !== "super_admin" &&
            (row.tenant.slug === key || row.tenant.subdomain === key),
        ) ?? null
      : null;

  const stayOnLandingAfterSignOut = async () => {
    await signOut();
    setLogin({ email: "", password: "", error: null, submitting: false });
    setPortalOpen(true);
  };

  /**
   * Fresh memberships + confirmed workspace home; never invents a path.
   * Prefer a known session (sign-in response / React) over a storage getSession()
   * that can race with auth-state callbacks and briefly return null.
   */
  const resolveFreshPortalDestination = async (
    knownSession?: Session | null,
  ) => {
    let current = knownSession ?? session ?? null;
    if (!current?.user) {
      const {
        data: { session: fromStorage },
      } = await supabase.auth.getSession();
      current = fromStorage;
    }
    if (!current?.user) {
      return { kind: "no_session" as const };
    }

    const rows = await refreshMemberships(current.user.id);
    if (
      isPlatformSuperAdmin(rows) ||
      tenantPortalAccessDenial(rows, key, workspace?.name)
    ) {
      return { kind: "denied" as const };
    }

    const dest = resolveTenantPortalDashboardDestination(rows, key);
    if (!dest) {
      return { kind: "no_membership" as const };
    }
    return { kind: "ok" as const, dest };
  };

  const enterDashboard = async () => {
    if (!key || !session || enteringDashboard) return;
    setEnteringDashboard(true);
    setLogin((s) => ({ ...s, error: null }));
    try {
      const result = await resolveFreshPortalDestination();
      if (result.kind === "ok") {
        setActiveMembershipId(result.dest.membershipId);
        setPortalOpen(false);
        navigate(result.dest.path, { replace: true });
        return;
      }
      // Keep a valid session: do not sign out when memberships are still empty/mismatched.
      setPortalOpen(true);
      setLogin((s) => ({
        ...s,
        error:
          result.kind === "no_session"
            ? "Your session expired. Please sign in again."
            : "Could not open the dashboard for this workspace yet. Try again in a moment, or sign out and sign back in.",
      }));
    } catch {
      setPortalOpen(true);
      setLogin((s) => ({
        ...s,
        error: "Could not open the dashboard. Please try again.",
      }));
    } finally {
      setEnteringDashboard(false);
    }
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!key) return;
    setLogin((s) => ({ ...s, submitting: true, error: null }));

    try {
      const result = await signIn(login.email.trim(), login.password);
      if (result.error) {
        setPortalOpen(true);
        setLogin((s) => ({
          ...s,
          submitting: false,
          error: friendlyAuthError(result.error) || result.error,
        }));
        return;
      }

      const resolved = await resolveFreshPortalDestination(result.session);
      if (resolved.kind === "ok") {
        // Gate navigation on client JWT readiness so ProtectedRoute + PostgREST
        // do not race a React-only session (RP-1.3.31 / 42501 as anon).
        const {
          data: { session: clientSession },
        } = await supabase.auth.getSession();
        if (!clientSession?.user) {
          setPortalOpen(true);
          setLogin((s) => ({
            ...s,
            submitting: false,
            error:
              "Could not confirm your session yet. Please try again in a moment.",
          }));
          return;
        }
        setActiveMembershipId(resolved.dest.membershipId);
        setLogin((s) => ({ ...s, submitting: false, error: null }));
        setPortalOpen(false);
        navigate(resolved.dest.path, { replace: true });
        return;
      }

      // Transient missing session after Auth success must not wipe the session.
      if (resolved.kind === "no_session") {
        setPortalOpen(true);
        setLogin((s) => ({
          ...s,
          submitting: false,
          error:
            "Could not confirm your session yet. Please try again in a moment.",
        }));
        return;
      }

      // Confirmed session but no usable membership on this tenant.
      await signOut();
      setPortalOpen(true);
      setLogin((s) => ({
        ...s,
        submitting: false,
        error: "This account is not registered.",
      }));
    } catch {
      setPortalOpen(true);
      setLogin((s) => ({
        ...s,
        submitting: false,
        error: "Something went wrong while signing in. Please try again.",
      }));
    }
  };

  if (loading || authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">
        Loading workspace…
      </div>
    );
  }

  if (notFound || !workspace) {
    return (
      <div className="relative flex min-h-screen flex-col items-center justify-center bg-background px-4 text-center">
        <img
          src="/brand/ijaaro-logo.png"
          alt="IJAARO"
          className="mb-6 h-12 w-auto object-contain dark:hidden"
        />
        <img
          src="/brand/ijaaro-logo-on-dark.png"
          alt="IJAARO"
          className="mb-6 hidden h-12 w-auto object-contain dark:block"
        />
        <h1 className="font-display text-2xl font-bold text-foreground">
          Workspace not found
        </h1>
        <p className="mt-2 max-w-md text-sm text-muted-foreground">
          No active workspace matches{" "}
          <code className="text-foreground">{key || "—"}</code>.
        </p>
        <a href={platformHomeUrl()} className="mt-6 inline-flex">
          <Button variant="primary">Back to IJAARO</Button>
        </a>
      </div>
    );
  }

  const branding = workspace.branding ?? {};
  const templateId = resolveLandingTemplateId(branding);
  const displayName =
    brandingString(branding, "display_name") || workspace.name;
  const tagline =
    brandingString(branding, "tagline") ||
    `${workspace.tenant_type.replace(/_/g, " ")} workspace on IJAARO`;
  const headline =
    brandingString(branding, "hero_headline") || `Welcome to ${displayName}`;
  const footerText =
    brandingString(branding, "footer_text") ||
    "Official workspace portal — sign in to manage your organization.";
  const accent =
    brandingString(branding, "accent_color") ||
    (workspace.tenant_type === "water_company"
      ? "#2b8cff"
      : workspace.tenant_type === "electricity_company"
        ? "#f5c400"
        : "#1fa85a");
  const secondary = brandingString(branding, "secondary_color") || "#0b1f3a";
  const logoUrl = brandingString(branding, "logo_url");
  const heroImage = brandingString(branding, "hero_image_url");
  const publicDescription = brandingString(branding, "public_description");
  const contactEmail = brandingString(branding, "contact_email");
  const contactPhone = brandingString(branding, "contact_phone");
  const address = brandingString(branding, "address");
  const websiteUrl = brandingString(branding, "website_url");

  const TypeIcon =
    workspace.tenant_type === "water_company"
      ? Droplets
      : workspace.tenant_type === "electricity_company"
        ? Zap
        : Building2;

  const hasLogo = Boolean(logoUrl?.trim());

  const loginCard = (
    tone: "light" | "dark" = "light",
    className?: string,
    options?: { onClose?: () => void; closeDisabled?: boolean },
  ) => {
    const darkTone = tone === "dark";
    return memberMatch ? (
      <div
        className={cn(
          "relative overflow-hidden rounded-[1.35rem] border backdrop-blur-md",
          darkTone
            ? "border-white/10 bg-[#0c1628]/92 text-white shadow-[0_0_0_1px_rgba(59,130,246,0.18),0_24px_60px_-20px_rgba(0,0,0,0.65)]"
            : "border-[#dce6f0] bg-white text-[#0b1f3a] shadow-[0_24px_50px_-24px_rgba(11,31,58,0.35)]",
          className,
        )}
      >
        {options?.onClose ? (
          <button
            type="button"
            className={cn(
              "absolute right-3.5 top-3.5 z-10 flex h-8 w-8 items-center justify-center rounded-md transition-colors",
              darkTone
                ? "text-white/45 hover:bg-white/10 hover:text-white"
                : "text-muted-foreground hover:bg-black/5 hover:text-foreground",
            )}
            aria-label="Close sign-in"
            disabled={options.closeDisabled}
            onClick={options.onClose}
          >
            <X className="h-4 w-4" strokeWidth={2} />
          </button>
        ) : null}
        <div className="px-6 py-7 text-center sm:px-8 sm:py-8">
          {hasLogo ? (
            <div
              className={cn(
                "mx-auto mb-4 flex h-[4.5rem] w-[4.5rem] items-center justify-center rounded-2xl p-2 shadow-sm",
                darkTone ? "bg-white" : "bg-white ring-1 ring-[#e8eef4]",
              )}
            >
              <img
                src={logoUrl}
                alt={displayName}
                className="h-full w-full object-contain"
              />
            </div>
          ) : (
            <p
              className={cn(
                "mb-3 font-display text-[1.25rem] font-bold tracking-tight",
                darkTone ? "text-white" : "text-[#0b1f3a]",
              )}
            >
              {displayName}
            </p>
          )}
          <h2
            className={cn(
              "text-[1.2rem] font-bold tracking-tight sm:text-[1.3rem]",
              darkTone ? "text-white" : "text-[#0b1f3a]",
            )}
          >
            Welcome back
          </h2>
          <p
            className={cn(
              "mt-2 text-[13px]",
              darkTone ? "text-white/55" : "text-muted-foreground",
            )}
          >
            You are signed in as a member of this workspace.
          </p>
          {login.error ? (
            <p
              role="alert"
              className={cn(
                "mt-3 rounded-lg border px-3 py-2 text-[13px]",
                darkTone
                  ? "border-red-400/30 bg-red-500/10 text-red-100"
                  : "border-red-200 bg-red-50 text-red-700",
              )}
            >
              {login.error}
            </p>
          ) : null}
          <Button
            className="mt-5 h-11 w-full gap-2 rounded-xl text-sm font-bold text-white shadow-[0_10px_24px_-12px_rgba(0,0,0,0.45)] transition hover:brightness-[1.05]"
            type="button"
            style={{ backgroundColor: accent }}
            disabled={enteringDashboard || options?.closeDisabled}
            onClick={() => void enterDashboard()}
          >
            <LayoutDashboard className="h-4 w-4" />
            {enteringDashboard ? "Opening…" : "Enter dashboard"}
          </Button>
          <button
            type="button"
            className={cn(
              "mt-3.5 w-full text-center text-[12px] underline underline-offset-2",
              darkTone
                ? "text-white/45 hover:text-white/70"
                : "text-muted-foreground hover:text-foreground",
            )}
            disabled={enteringDashboard}
            onClick={() => void stayOnLandingAfterSignOut()}
          >
            Sign out
          </button>
        </div>
      </div>
    ) : (
      <LandingLoginCard
        className={className}
        tone={tone}
        accent={accent}
        logoUrl={logoUrl || null}
        email={login.email}
        password={login.password}
        error={login.error}
        submitting={login.submitting}
        displayName={displayName}
        onEmail={(v) =>
          setLogin((s) => ({ ...s, email: v, error: null }))
        }
        onPassword={(v) =>
          setLogin((s) => ({ ...s, password: v, error: null }))
        }
        onSubmit={(e) => void onSubmit(e)}
        onClose={options?.onClose}
        closeDisabled={options?.closeDisabled}
      />
    );
  };

  const brandMark = (size: "sm" | "lg" = "lg", onDark = true) =>
    logoUrl ? (
      <img
        src={logoUrl}
        alt={displayName}
        className={cn(
          "w-auto shrink-0 object-contain",
          size === "lg" ? "mb-6 h-14 max-w-[200px]" : "h-9 max-w-[120px]",
        )}
      />
    ) : (
      <div
        className={cn(
          "inline-flex shrink-0 items-center justify-center rounded-full",
          size === "lg" ? "mb-6 h-14 w-14" : "h-9 w-9",
          onDark
            ? "bg-white/15 ring-1 ring-white/20"
            : "bg-foreground/5 ring-1 ring-border",
        )}
        style={{ color: accent }}
        aria-hidden
      >
        <TypeIcon
          className={cn(
            size === "lg" ? "h-7 w-7" : "h-4 w-4",
            onDark && "text-white",
          )}
        />
      </div>
    );

  return (
    <>
      <TenantLandingTemplate
        templateId={templateId}
        accent={accent}
        secondary={secondary}
        heroImage={heroImage}
        displayName={displayName}
        tagline={tagline}
        headline={headline}
        footerText={footerText}
        publicDescription={publicDescription}
        contactEmail={contactEmail}
        contactPhone={contactPhone}
        address={address}
        websiteUrl={websiteUrl}
        tenantType={workspace.tenant_type}
        subdomain={workspace.subdomain || workspace.slug}
        hasLogo={hasLogo}
        brandMark={brandMark}
        loginCard={loginCard}
        onPortalLogin={() => {
          setLogin((s) => ({ ...s, error: null }));
          setPortalOpen(true);
        }}
        belowContent={
          workspace.tenant_type === "landlord" ? (
            <>
              <LandlordPublicListings tenantKey={key} accent={accent} />
              <div className="mx-auto max-w-6xl px-4 pb-12 sm:px-6">
                <div
                  className="rounded-2xl border border-border bg-card px-5 py-6 shadow-sm sm:flex sm:items-center sm:justify-between sm:gap-6 sm:px-6 sm:py-7"
                  data-testid="application-status-cta"
                >
                  <div className="min-w-0 max-w-xl">
                    <h2 className="font-display text-lg font-semibold tracking-tight text-foreground sm:text-xl">
                      Track Your Rental Application
                    </h2>
                    <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                      View your application status and any updates from the property manager.
                    </p>
                  </div>
                  <Link
                    to={`/my-applications?tenant=${encodeURIComponent(key)}`}
                    className="mt-4 inline-flex shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:mt-0"
                  >
                    <Button
                      type="button"
                      variant="outline"
                      className="h-11 w-full px-5 text-sm font-semibold sm:w-auto"
                    >
                      View Application Status
                    </Button>
                  </Link>
                </div>
              </div>
            </>
          ) : undefined
        }
      />

      {portalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[#0a1524]/60 p-4 py-10 backdrop-blur-sm sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="portal-login-title"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !login.submitting) {
              setPortalOpen(false);
            }
          }}
        >
          <div className="relative my-auto w-full max-w-[26rem]">
            <p id="portal-login-title" className="sr-only">
              Workspace sign-in for {displayName}
            </p>
            {loginCard(theme, undefined, {
              onClose: () => setPortalOpen(false),
              closeDisabled: login.submitting,
            })}
          </div>
        </div>
      )}
    </>
  );
}
