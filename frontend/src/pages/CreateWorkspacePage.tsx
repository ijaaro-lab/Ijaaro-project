import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  Building2,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Droplets,
  ExternalLink,
  ImagePlus,
  Loader2,
  Zap,
} from "lucide-react";
import { useAuth } from "@/auth/AuthProvider";
import { LandingTemplatePicker } from "@/components/landing/LandingTemplatePicker";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { extractLogoColors } from "@/lib/extractLogoColors";
import { supabase } from "@/lib/supabase";
import { uploadPublicImage } from "@/lib/uploadImage";
import {
  DEFAULT_LANDING_TEMPLATE,
  resolveLandingTemplateId,
  type LandingTemplateId,
} from "@/lib/landingTemplates";
import {
  slugifyTenantName,
  tenantSubdomainLabel,
  tenantTypeLabel,
  tenantWorkspaceUrl,
} from "@/lib/tenant";
import { cn } from "@/lib/utils";
import type { Tenant, TenantType } from "@/types/database";

const DRAFT_KEY = "ijaaro.create_workspace.draft";

type FlowStep = 0 | 1 | 2 | 3 | 4;

type BrandingForm = {
  displayName: string;
  accentColor: string;
  secondaryColor: string;
  tertiaryColor: string;
  tagline: string;
  heroHeadline: string;
  footerText: string;
  logoUrl: string;
  heroImageUrl: string;
  landingTemplate: LandingTemplateId;
};

type CreatedWorkspace = {
  tenant: Tenant;
  subdomain: string;
  workspaceUrl: string;
};

const typeCards: Array<{
  value: TenantType;
  title: string;
  body: string;
  icon: typeof Building2;
  accent: string;
}> = [
  {
    value: "landlord",
    title: "Landlord",
    body: "Properties, tenancies, rent ledger — your isolated landlord workspace.",
    icon: Building2,
    accent: "text-brand-green",
  },
  {
    value: "water_company",
    title: "Water company",
    body: "Customers, meters, water bills, and payment review.",
    icon: Droplets,
    accent: "text-brand-water",
  },
  {
    value: "electricity_company",
    title: "Electricity company",
    body: "Customers, meters, electricity bills, and payment review.",
    icon: Zap,
    accent: "text-brand-power",
  },
];

const stepper = [
  { n: 1, label: "Admin account" },
  { n: 2, label: "Organization" },
  { n: 3, label: "Landing template" },
];

const defaultAccent: Record<Exclude<TenantType, "platform">, string> = {
  landlord: "#1fa85a",
  water_company: "#2b8cff",
  electricity_company: "#f5c400",
};

export function CreateWorkspacePage() {
  const { session, user, loading, signIn, refreshMemberships } = useAuth();
  const logoInputRef = useRef<HTMLInputElement>(null);
  const heroInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<FlowStep>(0);
  const [tenantType, setTenantType] = useState<TenantType | null>(null);
  const [uploading, setUploading] = useState<"logo" | "hero" | null>(null);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  const [orgName, setOrgName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [address, setAddress] = useState("");

  const [branding, setBranding] = useState<BrandingForm>({
    displayName: "",
    accentColor: "#1fa85a",
    secondaryColor: "#0b1f3a",
    tertiaryColor: "",
    tagline: "",
    heroHeadline: "",
    footerText: "Official workspace portal — sign in to manage your organization.",
    logoUrl: "",
    heroImageUrl: "",
    landingTemplate: DEFAULT_LANDING_TEMPLATE,
  });

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CreatedWorkspace | null>(null);

  // Resume draft after sign-in (e.g. user returned mid-flow)
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const draft = JSON.parse(raw) as {
        tenantType?: TenantType;
        fullName?: string;
        email?: string;
        orgName?: string;
        slug?: string;
        slugTouched?: boolean;
        contactEmail?: string;
        contactPhone?: string;
        address?: string;
        branding?: Partial<BrandingForm>;
        step?: FlowStep;
      };
      if (draft.tenantType) setTenantType(draft.tenantType);
      if (draft.fullName) setFullName(draft.fullName);
      if (draft.email) setEmail(draft.email);
      if (draft.orgName) setOrgName(draft.orgName);
      if (draft.slug) setSlug(draft.slug);
      if (draft.slugTouched) setSlugTouched(true);
      if (draft.contactEmail) setContactEmail(draft.contactEmail);
      if (draft.contactPhone) setContactPhone(draft.contactPhone);
      if (draft.address) setAddress(draft.address);
      if (draft.branding) {
        setBranding((prev) => ({
          ...prev,
          ...draft.branding,
          landingTemplate: resolveLandingTemplateId({
            landing_template:
              draft.branding?.landingTemplate ?? prev.landingTemplate,
          }),
        }));
      }
      if (session && draft.tenantType && (draft.step ?? 0) >= 1) {
        setStep(Math.max(draft.step ?? 2, 2) as FlowStep);
      } else if (draft.tenantType && draft.step && draft.step > 0) {
        setStep(draft.step);
      }
    } catch {
      /* ignore corrupt draft */
    }
  }, [session]);

  useEffect(() => {
    if (step === 0 || step === 4) return;
    try {
      sessionStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({
          tenantType,
          fullName,
          email,
          orgName,
          slug,
          slugTouched,
          contactEmail,
          contactPhone,
          address,
          branding,
          step,
        }),
      );
    } catch {
      /* ignore quota */
    }
  }, [
    step,
    tenantType,
    fullName,
    email,
    orgName,
    slug,
    slugTouched,
    contactEmail,
    contactPhone,
    address,
    branding,
  ]);

  const onOrgNameChange = (value: string) => {
    setOrgName(value);
    if (!slugTouched) setSlug(slugifyTenantName(value));
    if (!branding.displayName || branding.displayName === orgName) {
      setBranding((b) => ({ ...b, displayName: value }));
    }
  };

  const pickType = (type: TenantType) => {
    setTenantType(type);
    setBranding((b) => ({
      ...b,
      accentColor: defaultAccent[type as Exclude<TenantType, "platform">] ?? "#1677c8",
    }));
    setError(null);
    setStep(1);
  };

  const onImageFile = async (kind: "logo" | "hero", file: File | null) => {
    if (!file) return;
    const ownerId = user?.id;
    if (!ownerId) {
      setError("Sign in first, then upload your image.");
      return;
    }
    setUploading(kind);
    setError(null);

    const palettePromise =
      kind === "logo" ? extractLogoColors(file) : Promise.resolve(null);

    const result = await uploadPublicImage({
      bucket: "tenant-branding",
      folder: ownerId,
      fileName: kind === "logo" ? "logo" : "hero",
      file,
    });

    const palette = await palettePromise;
    setUploading(null);

    if ("error" in result) {
      setError(result.error);
      return;
    }

    if (kind === "logo") {
      setBranding((b) => ({
        ...b,
        logoUrl: result.url,
        ...(palette
          ? {
              accentColor: palette.primary,
              secondaryColor: palette.secondary,
              tertiaryColor: palette.tertiary ?? "",
            }
          : {}),
      }));
    } else {
      setBranding((b) => ({ ...b, heroImageUrl: result.url }));
    }
  };

  const provision = async () => {
    if (!tenantType) return;
    setSubmitting(true);
    setError(null);

    const finalSlug = slug.trim().toLowerCase() || slugifyTenantName(orgName);
    const brandingPayload = {
      display_name: branding.displayName.trim() || orgName.trim(),
      accent_color:
        branding.accentColor.trim() ||
        defaultAccent[tenantType as Exclude<TenantType, "platform">],
      secondary_color: branding.secondaryColor.trim() || "#0b1f3a",
      tertiary_color: branding.tertiaryColor.trim() || null,
      tagline: branding.tagline.trim(),
      hero_headline:
        branding.heroHeadline.trim() ||
        `Welcome to ${branding.displayName.trim() || orgName.trim()}`,
      footer_text: branding.footerText.trim(),
      logo_url: branding.logoUrl.trim() || null,
      hero_image_url: branding.heroImageUrl.trim() || null,
      contact_email: contactEmail.trim() || null,
      contact_phone: contactPhone.trim() || null,
      address: address.trim() || null,
      landing_template: branding.landingTemplate,
    };

    const { data, error: err } = await supabase.rpc("self_provision_tenant", {
      p_name: orgName.trim(),
      p_slug: finalSlug,
      p_tenant_type: tenantType,
      p_subdomain: finalSlug,
      p_branding: brandingPayload,
    });

    setSubmitting(false);

    if (err) {
      setError(err.message);
      return;
    }

    const payload = data as {
      tenant: Tenant;
      workspace?: { subdomain: string; slug: string };
    } | null;

    const tenant = payload?.tenant;
    if (!tenant) {
      setError("Workspace created but response was empty.");
      return;
    }

    await refreshMemberships();
    const subdomain = tenant.subdomain || tenant.slug;
    const workspaceUrl = tenantWorkspaceUrl(subdomain);
    setResult({
      tenant,
      subdomain,
      workspaceUrl,
    });
    try {
      sessionStorage.removeItem(DRAFT_KEY);
    } catch {
      /* ignore */
    }
    setStep(4);
    // Open the public tenant landing (subdomain portal) — not the dashboard.
    window.location.assign(workspaceUrl);
  };

  const registerAndSignIn = async () => {
    const { data, error: fnErr } = await supabase.functions.invoke(
      "register-workspace-admin",
      {
        body: {
          email: email.trim().toLowerCase(),
          password,
          full_name: fullName.trim(),
        },
      },
    );

    if (fnErr) {
      // functions.invoke wraps non-2xx; try to read body message
      const ctx = (fnErr as { context?: Response }).context;
      let message = fnErr.message;
      if (ctx) {
        try {
          const body = (await ctx.json()) as { error?: string };
          if (body?.error) message = body.error;
        } catch {
          /* keep default */
        }
      }
      return { error: message };
    }

    const payload = data as { ok?: boolean; error?: string } | null;
    if (!payload?.ok) {
      return { error: payload?.error ?? "Could not create admin account." };
    }

    const { error: signErr } = await signIn(email.trim().toLowerCase(), password);
    if (signErr) return { error: signErr };
    return { error: null };
  };

  const onContinue = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (step === 1) {
      if (!fullName.trim()) {
        setError("Full name is required.");
        return;
      }
      if (!email.trim()) {
        setError("Email is required.");
        return;
      }
      if (password.length < 8) {
        setError("Password must be at least 8 characters.");
        return;
      }
      if (password !== confirm) {
        setError("Passwords do not match.");
        return;
      }

      // If already signed in, skip account creation
      if (session) {
        if (!contactEmail.trim()) {
          setContactEmail(email.trim() || session.user?.email || "");
        }
        setStep(2);
        return;
      }

      setSubmitting(true);
      const { error: regErr } = await registerAndSignIn();
      setSubmitting(false);

      if (regErr) {
        setError(regErr);
        return;
      }
      if (!contactEmail.trim()) setContactEmail(email.trim());
      setStep(2);
      return;
    }

    if (step === 2) {
      if (!orgName.trim() || !slug.trim()) {
        setError("Organization name and subdomain are required.");
        return;
      }
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug.trim())) {
        setError("Subdomain must be lowercase letters, numbers, and hyphens.");
        return;
      }
      if (!branding.displayName.trim()) {
        setBranding((b) => ({ ...b, displayName: orgName.trim() }));
      }
      setStep(3);
      return;
    }

    if (step === 3) {
      await provision();
    }
  };

  const stepperActive = step === 0 ? 0 : Math.min(step, 3);

  return (
    <div className="min-h-screen bg-background">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[radial-gradient(ellipse_at_top,_rgba(22,119,200,0.12),_transparent_60%)]"
        aria-hidden
      />

      <header className="relative z-10 mx-auto flex max-w-3xl items-center justify-between px-4 py-5 sm:px-6">
        <Link to="/" className="flex items-center gap-2">
          <img
            src="/brand/ijaaro-logo.png"
            alt="IJAARO"
            className="h-10 w-auto object-contain dark:hidden"
          />
          <img
            src="/brand/ijaaro-logo-on-dark.png"
            alt="IJAARO"
            className="hidden h-10 w-auto object-contain dark:block"
          />
        </Link>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Link
            to="/login"
            className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" />
            Sign in
          </Link>
        </div>
      </header>

      <main
        className={cn(
          "relative z-10 mx-auto px-4 pb-16 sm:px-6",
          step === 3 ? "max-w-5xl" : "max-w-3xl",
        )}
      >
        {tenantType && step > 0 && step < 4 && (
          <div className="mb-6 rounded-lg border border-border bg-card px-4 py-2.5 text-sm text-muted-foreground">
            Workspace type:{" "}
            <span className="font-semibold text-foreground">
              {tenantTypeLabel(tenantType)}
            </span>
          </div>
        )}

        {step > 0 && step < 4 && (
          <ol className="mb-10 flex flex-wrap items-center justify-center gap-2 sm:gap-4">
            {stepper.map((s, i) => {
              const active = stepperActive === s.n;
              const done = stepperActive > s.n;
              return (
                <li key={s.n} className="flex items-center gap-2 sm:gap-4">
                  {i > 0 && (
                    <span className="hidden h-px w-8 bg-border sm:block" aria-hidden />
                  )}
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "flex h-8 w-8 items-center justify-center rounded-full border-2 text-sm font-bold",
                        active && "border-brand-blue text-brand-blue",
                        done && "border-brand-green bg-brand-green text-white",
                        !active && !done && "border-border text-muted-foreground",
                      )}
                    >
                      {done ? <Check className="h-4 w-4" /> : s.n}
                    </span>
                    <span
                      className={cn(
                        "text-xs font-semibold uppercase tracking-wide",
                        active ? "text-brand-blue" : "text-muted-foreground",
                      )}
                    >
                      {s.label}
                    </span>
                  </div>
                </li>
              );
            })}
          </ol>
        )}

        {error && (
          <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
            {error.toLowerCase().includes("already exists") && (
              <>
                {" "}
                <Link
                  to={`/login?next=${encodeURIComponent("/create-workspace")}`}
                  className="font-semibold underline"
                >
                  Sign in
                </Link>
              </>
            )}
          </p>
        )}

        {/* Step 0 — type */}
        {step === 0 && (
          <div>
            <h1 className="font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              Choose your workspace type
            </h1>
            <p className="mt-3 max-w-xl text-muted-foreground">
              Pick how you will use IJAARO. You will create one admin account, then set up
              your organization and landing page.
            </p>
            <div className="mt-8 grid gap-4 sm:grid-cols-3">
              {typeCards.map((card) => (
                <button
                  key={card.value}
                  type="button"
                  onClick={() => pickType(card.value)}
                  className="rounded-xl border border-border bg-card p-5 text-left transition hover:border-brand-blue/50 hover:shadow-md"
                >
                  <card.icon className={cn("h-7 w-7", card.accent)} />
                  <p className="mt-3 font-display text-lg font-semibold text-foreground">
                    {card.title}
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {card.body}
                  </p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 4 — success */}
        {step === 4 && result && (
          <div className="space-y-5">
            <h1 className="font-display text-3xl font-bold text-foreground">
              Your workspace landing is ready
            </h1>
            <p className="text-muted-foreground">
              Opening your public portal… Share this subdomain with your team. Only
              your admin and invited members can sign in there.
            </p>
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
              <p className="font-semibold">
                {tenantTypeLabel(result.tenant.tenant_type)} · Active · Subdomain
              </p>
              <p className="mt-1 font-mono text-xs">
                {tenantSubdomainLabel(result.subdomain)}
              </p>
            </div>
            <div className="rounded-xl border border-border bg-card p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Tenant landing URL
              </p>
              <p className="mt-2 break-all font-mono text-sm font-semibold text-foreground">
                {result.workspaceUrl}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => void navigator.clipboard.writeText(result.workspaceUrl)}
                >
                  <Copy className="h-3.5 w-3.5" />
                  Copy URL
                </Button>
                <a href={result.workspaceUrl}>
                  <Button type="button" size="sm" variant="primary">
                    <ExternalLink className="h-3.5 w-3.5" />
                    Open landing page
                  </Button>
                </a>
              </div>
            </div>
          </div>
        )}

        {/* Steps 1–3 form */}
        {step >= 1 && step <= 3 && (
          <form onSubmit={(e) => void onContinue(e)} className="space-y-6">
            {step === 1 && (
              <>
                <div>
                  <h1 className="font-display text-3xl font-bold tracking-tight text-foreground">
                    Create your admin account
                  </h1>
                  <p className="mt-2 text-muted-foreground">
                    This is the primary account for your organization. After this you will
                    set up the workspace and landing page.
                  </p>
                </div>
                {session ? (
                  <div className="rounded-lg border border-brand-blue/30 bg-brand-blue/5 px-4 py-3 text-sm text-foreground">
                    You are already signed in. Continue to set up your organization, or{" "}
                    <button
                      type="button"
                      className="font-semibold text-brand-blue underline"
                      onClick={() => setStep(0)}
                    >
                      change workspace type
                    </button>
                    .
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="fullName">Full name</Label>
                      <Input
                        id="fullName"
                        required
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        placeholder="Amina Hassan"
                        autoComplete="name"
                      />
                    </div>
                    <div>
                      <Label htmlFor="email">Email</Label>
                      <Input
                        id="email"
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="admin@company.com"
                        autoComplete="email"
                      />
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <Label htmlFor="password">Password</Label>
                        <Input
                          id="password"
                          type="password"
                          required
                          minLength={8}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          autoComplete="new-password"
                        />
                      </div>
                      <div>
                        <Label htmlFor="confirm">Confirm</Label>
                        <Input
                          id="confirm"
                          type="password"
                          required
                          minLength={8}
                          value={confirm}
                          onChange={(e) => setConfirm(e.target.value)}
                          autoComplete="new-password"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}

            {step === 2 && (
              <>
                <div>
                  <h1 className="font-display text-3xl font-bold tracking-tight text-foreground">
                    Set up your organization
                  </h1>
                  <p className="mt-2 text-muted-foreground">
                    {email.trim() || session?.user?.email
                      ? `Admin: ${email.trim() || session?.user?.email} — next you will choose a landing template.`
                      : "Choose a name, subdomain, and public contact details for your workspace."}
                  </p>
                </div>
                <div className="space-y-4 rounded-xl border border-border bg-card p-5">
                  <div>
                    <Label htmlFor="orgName">Organization name</Label>
                    <Input
                      id="orgName"
                      required
                      className="mt-1"
                      value={orgName}
                      onChange={(e) => onOrgNameChange(e.target.value)}
                      placeholder="Hodan Properties"
                    />
                  </div>
                  <div>
                    <Label htmlFor="slug">Public slug</Label>
                    <Input
                      id="slug"
                      required
                      className="mt-1"
                      pattern="^[a-z0-9]+(?:-[a-z0-9]+)*$"
                      value={slug}
                      onChange={(e) => {
                        setSlugTouched(true);
                        setSlug(e.target.value.toLowerCase());
                      }}
                      placeholder="hodan"
                    />
                    <p className="mt-2 text-xs text-muted-foreground">
                      Link:{" "}
                      <span className="font-mono text-brand-blue">
                        {tenantWorkspaceUrl(slug || "slug")}
                      </span>
                    </p>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <Label htmlFor="contactEmail">Email</Label>
                      <Input
                        id="contactEmail"
                        type="email"
                        className="mt-1"
                        value={contactEmail}
                        onChange={(e) => setContactEmail(e.target.value)}
                        placeholder={email || "hello@company.com"}
                      />
                    </div>
                    <div>
                      <Label htmlFor="contactPhone">Phone</Label>
                      <Input
                        id="contactPhone"
                        className="mt-1"
                        value={contactPhone}
                        onChange={(e) => setContactPhone(e.target.value)}
                        placeholder="61 000 0000"
                      />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="address">Address</Label>
                    <Textarea
                      id="address"
                      className="mt-1"
                      rows={3}
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      placeholder="Street, district, city"
                    />
                  </div>
                </div>
              </>
            )}

            {step === 3 && (
              <>
                <div>
                  <h1 className="font-display text-3xl font-bold tracking-tight text-foreground">
                    Choose a landing template
                  </h1>
                  <p className="mt-2 text-muted-foreground">
                    Pick a layout, upload your logo (colors are detected automatically), and
                    optionally add a hero image. After create you get{" "}
                    <code className="text-foreground">
                      {tenantSubdomainLabel(slug || "slug")}
                    </code>
                    .
                  </p>
                </div>
                <div className="space-y-6">
                  <LandingTemplatePicker
                    value={branding.landingTemplate}
                    onChange={(id) =>
                      setBranding((b) => ({ ...b, landingTemplate: id }))
                    }
                    tenantType={
                      (tenantType as Exclude<TenantType, "platform">) ||
                      "landlord"
                    }
                  />

                  <div className="grid gap-6 rounded-xl border border-border bg-card p-5 lg:grid-cols-2">
                    <div className="space-y-5">
                      <div>
                        <Label>Organization logo *</Label>
                        <p className="mb-2 text-xs text-muted-foreground">
                          PNG, JPG, WebP or GIF · max 2MB. Brand colors are detected from the
                          logo.
                        </p>
                        <div className="flex flex-wrap items-center gap-4">
                          <div
                            className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border border-dashed border-border bg-muted/40"
                            style={{ borderColor: branding.accentColor }}
                          >
                            {branding.logoUrl ? (
                              <img
                                src={branding.logoUrl}
                                alt="Logo preview"
                                className="h-full w-full object-contain p-1"
                              />
                            ) : (
                              <ImagePlus className="h-7 w-7 text-muted-foreground" />
                            )}
                          </div>
                          <div className="space-y-2">
                            <Button
                              type="button"
                              variant="outline"
                              disabled={uploading !== null || !user}
                              onClick={() => logoInputRef.current?.click()}
                            >
                              {uploading === "logo" ? (
                                <>
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                  Uploading…
                                </>
                              ) : (
                                <>
                                  <ImagePlus className="h-4 w-4" />
                                  Choose file
                                </>
                              )}
                            </Button>
                            {branding.logoUrl && (
                              <button
                                type="button"
                                className="block text-xs text-muted-foreground underline hover:text-foreground"
                                onClick={() =>
                                  setBranding((b) => ({ ...b, logoUrl: "" }))
                                }
                              >
                                Remove logo
                              </button>
                            )}
                            <input
                              ref={logoInputRef}
                              type="file"
                              accept="image/jpeg,image/png,image/webp,image/gif"
                              className="hidden"
                              onChange={(e) =>
                                void onImageFile("logo", e.target.files?.[0] ?? null)
                              }
                            />
                          </div>
                        </div>
                      </div>

                      <div>
                        <Label>Hero image (optional)</Label>
                        <p className="mb-2 text-xs text-muted-foreground">
                          Shown on templates that support a hero media panel.
                        </p>
                        <div className="flex flex-wrap items-center gap-4">
                          <div className="flex h-20 w-32 items-center justify-center overflow-hidden rounded-lg border border-dashed border-border bg-muted/40">
                            {branding.heroImageUrl ? (
                              <img
                                src={branding.heroImageUrl}
                                alt="Hero preview"
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <ImagePlus className="h-7 w-7 text-muted-foreground" />
                            )}
                          </div>
                          <div className="space-y-2">
                            <Button
                              type="button"
                              variant="outline"
                              disabled={uploading !== null || !user}
                              onClick={() => heroInputRef.current?.click()}
                            >
                              {uploading === "hero" ? (
                                <>
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                  Uploading…
                                </>
                              ) : (
                                <>
                                  <ImagePlus className="h-4 w-4" />
                                  Choose file
                                </>
                              )}
                            </Button>
                            {branding.heroImageUrl && (
                              <button
                                type="button"
                                className="block text-xs text-muted-foreground underline hover:text-foreground"
                                onClick={() =>
                                  setBranding((b) => ({ ...b, heroImageUrl: "" }))
                                }
                              >
                                Remove hero
                              </button>
                            )}
                            <input
                              ref={heroInputRef}
                              type="file"
                              accept="image/jpeg,image/png,image/webp,image/gif"
                              className="hidden"
                              onChange={(e) =>
                                void onImageFile("hero", e.target.files?.[0] ?? null)
                              }
                            />
                          </div>
                        </div>
                      </div>

                      <div>
                        <p className="mb-2 text-sm font-medium text-foreground">
                          Brand colors
                        </p>
                        <div className="grid gap-3 sm:grid-cols-3">
                          <div>
                            <Label htmlFor="accent">Primary color</Label>
                            <div className="mt-1 flex gap-2">
                              <input
                                id="accent"
                                type="color"
                                value={branding.accentColor}
                                onChange={(e) =>
                                  setBranding((b) => ({
                                    ...b,
                                    accentColor: e.target.value,
                                  }))
                                }
                                className="h-10 w-12 cursor-pointer rounded border border-border bg-card"
                              />
                              <Input
                                value={branding.accentColor}
                                onChange={(e) =>
                                  setBranding((b) => ({
                                    ...b,
                                    accentColor: e.target.value,
                                  }))
                                }
                                placeholder="#1fa85a"
                              />
                            </div>
                          </div>
                          <div>
                            <Label htmlFor="secondary">Secondary color</Label>
                            <div className="mt-1 flex gap-2">
                              <input
                                id="secondary"
                                type="color"
                                value={branding.secondaryColor}
                                onChange={(e) =>
                                  setBranding((b) => ({
                                    ...b,
                                    secondaryColor: e.target.value,
                                  }))
                                }
                                className="h-10 w-12 cursor-pointer rounded border border-border bg-card"
                              />
                              <Input
                                value={branding.secondaryColor}
                                onChange={(e) =>
                                  setBranding((b) => ({
                                    ...b,
                                    secondaryColor: e.target.value,
                                  }))
                                }
                                placeholder="#0b1f3a"
                              />
                            </div>
                          </div>
                          <div>
                            <Label htmlFor="tertiary">Third color</Label>
                            <div className="mt-1 flex gap-2">
                              <input
                                id="tertiary"
                                type="color"
                                value={branding.tertiaryColor || "#94a3b8"}
                                onChange={(e) =>
                                  setBranding((b) => ({
                                    ...b,
                                    tertiaryColor: e.target.value,
                                  }))
                                }
                                className="h-10 w-12 cursor-pointer rounded border border-border bg-card"
                              />
                              <Input
                                value={branding.tertiaryColor}
                                onChange={(e) =>
                                  setBranding((b) => ({
                                    ...b,
                                    tertiaryColor: e.target.value,
                                  }))
                                }
                                placeholder="optional"
                              />
                            </div>
                          </div>
                        </div>
                        <p className="mt-2 text-xs text-muted-foreground">
                          Upload a logo to auto-fill primary, secondary, and a third color when
                          the logo has them.
                        </p>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div>
                        <Label htmlFor="displayName">Display name</Label>
                        <Input
                          id="displayName"
                          className="mt-1"
                          value={branding.displayName}
                          onChange={(e) =>
                            setBranding((b) => ({ ...b, displayName: e.target.value }))
                          }
                          placeholder={orgName || "Your company"}
                        />
                      </div>
                      <div>
                        <Label htmlFor="heroHeadline">Hero headline</Label>
                        <Input
                          id="heroHeadline"
                          className="mt-1"
                          value={branding.heroHeadline}
                          onChange={(e) =>
                            setBranding((b) => ({
                              ...b,
                              heroHeadline: e.target.value,
                            }))
                          }
                          placeholder="Welcome to your workspace"
                        />
                      </div>
                      <div>
                        <Label htmlFor="tagline">Short description</Label>
                        <Textarea
                          id="tagline"
                          className="mt-1"
                          rows={3}
                          value={branding.tagline}
                          onChange={(e) =>
                            setBranding((b) => ({ ...b, tagline: e.target.value }))
                          }
                          placeholder="Short public description for the landing page"
                        />
                      </div>
                      <div>
                        <Label htmlFor="footerText">Footer text</Label>
                        <Textarea
                          id="footerText"
                          className="mt-1"
                          rows={2}
                          value={branding.footerText}
                          onChange={(e) =>
                            setBranding((b) => ({ ...b, footerText: e.target.value }))
                          }
                        />
                      </div>
                    </div>
                  </div>

                  <div
                    className="rounded-xl border border-border bg-card p-5"
                    style={{ borderTopWidth: 4, borderTopColor: branding.accentColor }}
                  >
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Preview · {branding.landingTemplate}
                    </p>
                    <div className="mt-3 flex items-center gap-3">
                      {branding.logoUrl ? (
                        <img
                          src={branding.logoUrl}
                          alt=""
                          className="h-10 w-10 rounded-lg object-contain"
                        />
                      ) : null}
                      <div>
                        <p className="font-display text-xl font-bold text-foreground">
                          {branding.displayName || orgName || "Your company"}
                        </p>
                        <p className="mt-0.5 text-sm text-muted-foreground">
                          {branding.heroHeadline ||
                            branding.tagline ||
                            "Your landing headline appears here."}
                        </p>
                      </div>
                    </div>
                    {branding.heroImageUrl ? (
                      <img
                        src={branding.heroImageUrl}
                        alt=""
                        className="mt-4 h-28 w-full rounded-lg object-cover"
                      />
                    ) : null}
                    <div className="mt-3 flex flex-wrap gap-2">
                      <span
                        className="h-5 w-5 rounded-full border border-border"
                        style={{ backgroundColor: branding.accentColor }}
                        title="Primary"
                      />
                      <span
                        className="h-5 w-5 rounded-full border border-border"
                        style={{ backgroundColor: branding.secondaryColor }}
                        title="Secondary"
                      />
                      {branding.tertiaryColor ? (
                        <span
                          className="h-5 w-5 rounded-full border border-border"
                          style={{ backgroundColor: branding.tertiaryColor }}
                          title="Third"
                        />
                      ) : null}
                    </div>
                    <p className="mt-3 font-mono text-xs text-muted-foreground">
                      Link: {tenantWorkspaceUrl(slug || "slug")}
                    </p>
                  </div>
                </div>
              </>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
              <Button
                type="button"
                variant="ghost"
                disabled={submitting}
                onClick={() => {
                  setError(null);
                  if (step === 1) setStep(0);
                  else setStep((s) => (s - 1) as FlowStep);
                }}
              >
                <ChevronLeft className="h-4 w-4" />
                Back
              </Button>
              <Button type="submit" disabled={submitting}>
                {step === 3 ? (
                  submitting ? (
                    "Creating workspace…"
                  ) : (
                    "Create workspace"
                  )
                ) : (
                  <>
                    Continue
                    <ChevronRight className="h-4 w-4" />
                  </>
                )}
              </Button>
            </div>
          </form>
        )}

        {!loading && !session && step === 0 && (
          <p className="mt-10 text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link to="/login" className="font-semibold text-brand-blue hover:underline">
              Sign in
            </Link>
          </p>
        )}
      </main>
    </div>
  );
}
