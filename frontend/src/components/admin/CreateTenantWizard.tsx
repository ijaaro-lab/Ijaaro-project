import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  Building2,
  Check,
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
import { extractLogoColors } from "@/lib/extractLogoColors";
import { supabase } from "@/lib/supabase";
import { uploadPublicImage } from "@/lib/uploadImage";
import {
  DEFAULT_LANDING_TEMPLATE,
  type LandingTemplateId,
} from "@/lib/landingTemplates";
import type { AppRole, Tenant, TenantType } from "@/types/database";
import {
  defaultAdminRoleForTenantType,
  slugifyTenantName,
  tenantTypeLabel,
  tenantWorkspaceUrl,
} from "@/lib/tenant";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type Step = 1 | 2 | 3 | 4 | 5;

type CreatedResult = {
  tenant: Tenant;
  workspaceUrl: string;
  subdomain: string;
  adminEmail: string | null;
};

type Props = {
  onCreated?: (result: CreatedResult) => void;
  className?: string;
  compact?: boolean;
};

const typeCards: Array<{
  value: Exclude<TenantType, "platform">;
  title: string;
  body: string;
  icon: typeof Building2;
  accent: string;
}> = [
  {
    value: "landlord",
    title: "Landlord",
    body: "Property listings, tenancies, rent ledger — fully isolated workspace.",
    icon: Building2,
    accent: "border-brand-green/40 text-brand-green",
  },
  {
    value: "water_company",
    title: "Water company",
    body: "Customers, meters, bills, and payments for water only.",
    icon: Droplets,
    accent: "border-brand-water/40 text-brand-water",
  },
  {
    value: "electricity_company",
    title: "Electricity company",
    body: "Customers, meters, bills, and payments for electricity only.",
    icon: Zap,
    accent: "border-brand-power/50 text-brand-power",
  },
];

const defaultAccent: Record<Exclude<TenantType, "platform">, string> = {
  landlord: "#1fa85a",
  water_company: "#2b8cff",
  electricity_company: "#f5c400",
};

export function CreateTenantWizard({ onCreated, className, compact }: Props) {
  const { user } = useAuth();
  const logoRef = useRef<HTMLInputElement>(null);
  const heroRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>(1);
  const [name, setName] = useState("");
  const [tenantType, setTenantType] = useState<Exclude<TenantType, "platform"> | null>(
    null,
  );
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [adminEmail, setAdminEmail] = useState("");
  const [adminRole, setAdminRole] = useState<AppRole>("landlord_admin");
  const [lookupHint, setLookupHint] = useState<string | null>(null);
  const [adminReady, setAdminReady] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CreatedResult | null>(null);
  const submitLock = useRef(false);
  const [uploading, setUploading] = useState<"logo" | "hero" | null>(null);

  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [address, setAddress] = useState("");

  const [landingTemplate, setLandingTemplate] = useState<LandingTemplateId>(
    DEFAULT_LANDING_TEMPLATE,
  );
  const [displayName, setDisplayName] = useState("");
  const [tagline, setTagline] = useState("");
  const [heroHeadline, setHeroHeadline] = useState("");
  const [accentColor, setAccentColor] = useState(defaultAccent.landlord);
  const [secondaryColor, setSecondaryColor] = useState("#0b1f3a");
  const [tertiaryColor, setTertiaryColor] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [heroImageUrl, setHeroImageUrl] = useState("");
  const [footerText, setFooterText] = useState(
    "Official workspace portal — sign in to manage your organization.",
  );

  useEffect(() => {
    if (!tenantType) return;
    setAdminRole(defaultAdminRoleForTenantType(tenantType));
    setAccentColor(defaultAccent[tenantType]);
  }, [tenantType]);

  const onNameChange = (value: string) => {
    setName(value);
    if (!slugTouched) setSlug(slugifyTenantName(value));
    if (!displayName || displayName === name) setDisplayName(value);
  };

  const lookupAdmin = async () => {
    setLookupHint(null);
    setAdminReady(false);
    setError(null);
    const email = adminEmail.trim();
    if (!email) return;
    const { data, error: err } = await supabase.rpc("lookup_profile_by_email", {
      p_email: email,
    });
    if (err) {
      setError(err.message);
      return;
    }
    const rows = (data ?? []) as Array<{
      id: string;
      full_name: string;
      email: string | null;
    }>;
    if (rows.length === 0) {
      setLookupHint(
        "No profile found. Tenant admins must already have an IJAARO account.",
      );
      return;
    }
    const hit = rows[0];
    setLookupHint(`Found: ${hit.full_name} (${hit.email ?? email})`);
    setAdminReady(true);
  };

  const reset = () => {
    setStep(1);
    setName("");
    setSlug("");
    setSlugTouched(false);
    setTenantType(null);
    setAdminEmail("");
    setAdminRole("landlord_admin");
    setLookupHint(null);
    setAdminReady(false);
    setError(null);
    setResult(null);
    setCreating(false);
    submitLock.current = false;
    setContactEmail("");
    setContactPhone("");
    setAddress("");
    setLandingTemplate(DEFAULT_LANDING_TEMPLATE);
    setDisplayName("");
    setTagline("");
    setHeroHeadline("");
    setAccentColor(defaultAccent.landlord);
    setSecondaryColor("#0b1f3a");
    setTertiaryColor("");
    setLogoUrl("");
    setHeroImageUrl("");
    setFooterText(
      "Official workspace portal — sign in to manage your organization.",
    );
  };

  const onImageFile = async (kind: "logo" | "hero", file: File | null) => {
    if (!file) return;
    const folder = user?.id;
    if (!folder) {
      setError("Sign in required to upload images.");
      return;
    }
    setUploading(kind);
    setError(null);
    const palettePromise =
      kind === "logo" ? extractLogoColors(file) : Promise.resolve(null);
    const uploaded = await uploadPublicImage({
      bucket: "tenant-branding",
      folder,
      fileName: kind === "logo" ? "logo-draft" : "hero-draft",
      file,
    });
    const palette = await palettePromise;
    setUploading(null);
    if ("error" in uploaded) {
      setError(uploaded.error);
      return;
    }
    if (kind === "logo") {
      setLogoUrl(uploaded.url);
      if (palette) {
        setAccentColor(palette.primary);
        setSecondaryColor(palette.secondary);
        setTertiaryColor(palette.tertiary ?? "");
      }
    } else {
      setHeroImageUrl(uploaded.url);
    }
  };

  const createTenant = async () => {
    if (!tenantType || submitLock.current || creating) return;
    submitLock.current = true;
    setCreating(true);
    setError(null);
    const finalSlug = slug.trim().toLowerCase() || slugifyTenantName(name);
    const brandingPayload = {
      display_name: displayName.trim() || name.trim(),
      accent_color: accentColor.trim() || defaultAccent[tenantType],
      secondary_color: secondaryColor.trim() || "#0b1f3a",
      tertiary_color: tertiaryColor.trim() || null,
      tagline: tagline.trim(),
      hero_headline:
        heroHeadline.trim() ||
        `Welcome to ${displayName.trim() || name.trim()}`,
      footer_text: footerText.trim(),
      logo_url: logoUrl.trim() || null,
      hero_image_url: heroImageUrl.trim() || null,
      contact_email: contactEmail.trim() || null,
      contact_phone: contactPhone.trim() || null,
      address: address.trim() || null,
      landing_template: landingTemplate,
    };

    const { data, error: err } = await supabase.rpc("provision_tenant", {
      p_name: name.trim(),
      p_slug: finalSlug,
      p_tenant_type: tenantType,
      p_status: "active",
      p_owner_email: adminEmail.trim(),
      p_owner_role: adminRole,
      p_subdomain: finalSlug,
      p_activate: true,
      p_branding: brandingPayload,
    });

    if (err) {
      setCreating(false);
      submitLock.current = false;
      setError(err.message);
      return;
    }

    const payload = data as { tenant: Tenant } | null;
    const tenant = payload?.tenant;
    if (!tenant) {
      setCreating(false);
      submitLock.current = false;
      setError("Tenant created but response was empty.");
      return;
    }

    const subdomain = tenant.subdomain || tenant.slug;
    const created: CreatedResult = {
      tenant,
      subdomain,
      workspaceUrl: tenantWorkspaceUrl(subdomain),
      adminEmail: adminEmail.trim(),
    };
    setResult(created);
    setStep(5);
    setCreating(false);
    onCreated?.(created);
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (step === 1) {
      if (!tenantType) {
        setError("Select a tenant type to continue.");
        return;
      }
      setStep(2);
      return;
    }

    if (step === 2) {
      if (!adminEmail.trim()) {
        setError("Tenant admin email is required.");
        return;
      }
      if (!adminReady) {
        await lookupAdmin();
        const { data } = await supabase.rpc("lookup_profile_by_email", {
          p_email: adminEmail.trim(),
        });
        const rows = (data ?? []) as Array<{ id: string }>;
        if (rows.length === 0) {
          setError("Lookup a valid tenant admin profile before continuing.");
          return;
        }
        setAdminReady(true);
      }
      if (!contactEmail.trim()) setContactEmail(adminEmail.trim());
      setStep(3);
      return;
    }

    if (step === 3) {
      if (!name.trim() || !slug.trim()) {
        setError("Tenant name and slug are required.");
        return;
      }
      if (!displayName) setDisplayName(name.trim());
      setStep(4);
      return;
    }

    if (step === 4) {
      await createTenant();
    }
  };

  const steps = [
    { n: 1 as const, label: "Tenant type" },
    { n: 2 as const, label: "Admin" },
    { n: 3 as const, label: "Organization" },
    { n: 4 as const, label: "Landing template" },
    { n: 5 as const, label: "Workspace URL" },
  ];

  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-card",
        compact ? "p-4" : "p-5",
        className,
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-foreground">Create tenant</h3>
          {!compact && (
            <p className="mt-1 text-sm text-muted-foreground">
              Type → admin → name/slug → landing template →{" "}
              <code className="text-foreground">/?tenant=&lt;slug&gt;</code>
            </p>
          )}
        </div>
        {result && (
          <Button type="button" size="sm" variant="outline" onClick={reset}>
            Create another
          </Button>
        )}
      </div>

      <ol className="mt-4 flex flex-wrap gap-2">
        {steps.map((s) => (
          <li
            key={s.n}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium",
              step === s.n
                ? "bg-brand-navy text-white dark:bg-brand-blue"
                : step > s.n
                  ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
                  : "bg-muted text-muted-foreground",
            )}
          >
            {step > s.n ? <Check className="h-3 w-3" /> : <span>{s.n}</span>}
            {s.label}
          </li>
        ))}
      </ol>

      {error && (
        <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-200">
          {error}
        </p>
      )}

      {step === 5 && result ? (
        <div className="mt-5 space-y-4">
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">
            <p className="font-semibold">{result.tenant.name} is ready</p>
            <p className="mt-1 opacity-90">
              Type: {tenantTypeLabel(result.tenant.tenant_type)} · Admin:{" "}
              {result.adminEmail} · Template: {landingTemplate}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-muted/40 p-4">
            <p className="text-xs font-medium text-muted-foreground">
              Tenant workspace landing URL
            </p>
            <p className="mt-2 break-all font-mono text-sm font-semibold text-foreground">
              {result.workspaceUrl}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              Share with the tenant admin. Configure branding and template anytime from
              Workspace branding after they sign in.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => void navigator.clipboard.writeText(result.workspaceUrl)}
            >
              <Copy className="h-3.5 w-3.5" />
              Copy URL
            </Button>
            <a
              href={result.workspaceUrl}
              className="inline-flex h-8 items-center gap-1 rounded-lg bg-brand-navy px-3 text-xs font-semibold text-white hover:opacity-90 dark:bg-brand-blue"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Open landing
            </a>
            <a
              href={`/app/admin/tenants/${result.tenant.id}`}
              className="inline-flex h-8 items-center gap-1 rounded-lg border border-border px-3 text-xs font-semibold text-foreground hover:bg-muted"
            >
              Configure branding
            </a>
          </div>
        </div>
      ) : (
        <form onSubmit={(e) => void onSubmit(e)} className="mt-5 space-y-4">
          {step === 1 && (
            <div>
              <p className="mb-3 text-sm font-medium text-foreground">
                Choose the organization type
              </p>
              <div className="grid gap-3 md:grid-cols-3">
                {typeCards.map((card) => {
                  const selected = tenantType === card.value;
                  return (
                    <button
                      key={card.value}
                      type="button"
                      onClick={() => setTenantType(card.value)}
                      aria-pressed={selected}
                      className={cn(
                        "rounded-xl border p-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        selected
                          ? "border-brand-blue bg-brand-blue/5 ring-1 ring-brand-blue"
                          : "border-border hover:border-brand-blue/40",
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <card.icon className={cn("h-6 w-6", card.accent.split(" ").pop())} />
                        {selected && <Badge tone="info">Selected</Badge>}
                      </div>
                      <p className="mt-3 font-semibold text-foreground">{card.title}</p>
                      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                        {card.body}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium">
                  Tenant admin email (required)
                </label>
                <div className="flex gap-2">
                  <Input
                    type="email"
                    required
                    value={adminEmail}
                    onChange={(e) => {
                      setAdminEmail(e.target.value);
                      setAdminReady(false);
                      setLookupHint(null);
                    }}
                    placeholder="admin@company.com"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void lookupAdmin()}
                    disabled={!adminEmail.trim()}
                  >
                    Lookup
                  </Button>
                </div>
                {lookupHint && (
                  <p
                    className={cn(
                      "mt-2 text-xs",
                      adminReady ? "text-brand-blue" : "text-amber-700 dark:text-amber-300",
                    )}
                  >
                    {lookupHint}
                  </p>
                )}
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Admin role</label>
                <select
                  className="flex h-10 w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground"
                  value={adminRole}
                  onChange={(e) => setAdminRole(e.target.value as AppRole)}
                >
                  {tenantType === "landlord" ? (
                    <option value="landlord_admin">landlord_admin</option>
                  ) : (
                    <option value="utility_admin">utility_admin</option>
                  )}
                </select>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Creating: {tenantType ? tenantTypeLabel(tenantType) : "—"}
                </p>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-3">
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <Label className="mb-1">Organization name</Label>
                  <Input
                    required
                    value={name}
                    onChange={(e) => onNameChange(e.target.value)}
                    placeholder="Hodan Properties"
                  />
                </div>
                <div>
                  <Label className="mb-1">Public slug</Label>
                  <Input
                    required
                    pattern="^[a-z0-9]+(?:-[a-z0-9]+)*$"
                    value={slug}
                    onChange={(e) => {
                      setSlugTouched(true);
                      setSlug(e.target.value.toLowerCase());
                    }}
                    placeholder="hankaal"
                  />
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Link:{" "}
                    <span className="font-mono text-brand-blue">
                      {tenantWorkspaceUrl(slug || "slug")}
                    </span>
                  </p>
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <Label className="mb-1">Email</Label>
                  <Input
                    type="email"
                    value={contactEmail}
                    onChange={(e) => setContactEmail(e.target.value)}
                    placeholder={adminEmail || "hello@company.com"}
                  />
                </div>
                <div>
                  <Label className="mb-1">Phone</Label>
                  <Input
                    value={contactPhone}
                    onChange={(e) => setContactPhone(e.target.value)}
                    placeholder="61 000 0000"
                  />
                </div>
              </div>
              <div>
                <Label className="mb-1">Address</Label>
                <Textarea
                  rows={3}
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Street, district, city"
                />
              </div>
            </div>
          )}

          {step === 4 && tenantType && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Choose a landing template for{" "}
                <strong className="text-foreground">{name || "this tenant"}</strong>,
                upload a logo (colors are detected automatically), and optionally add a hero
                image.
              </p>
              <LandingTemplatePicker
                value={landingTemplate}
                onChange={setLandingTemplate}
                tenantType={tenantType}
              />
              <div className="grid gap-4 rounded-xl border border-border bg-muted/20 p-4 lg:grid-cols-2">
                <div className="space-y-4">
                  <div>
                    <Label>Organization logo</Label>
                    <p className="mb-2 text-xs text-muted-foreground">
                      Brand colors are detected from the logo.
                    </p>
                    <div className="flex flex-wrap items-center gap-3">
                      <div
                        className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full border border-dashed border-border bg-card"
                        style={{ borderColor: accentColor }}
                      >
                        {logoUrl ? (
                          <img
                            src={logoUrl}
                            alt=""
                            className="h-full w-full object-contain p-1"
                          />
                        ) : (
                          <ImagePlus className="h-5 w-5 text-muted-foreground" />
                        )}
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={uploading !== null || !user}
                        onClick={() => logoRef.current?.click()}
                      >
                        {uploading === "logo" ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <ImagePlus className="h-4 w-4" />
                        )}
                        Choose file
                      </Button>
                      <input
                        ref={logoRef}
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/gif"
                        className="hidden"
                        onChange={(e) =>
                          void onImageFile("logo", e.target.files?.[0] ?? null)
                        }
                      />
                    </div>
                  </div>
                  <div>
                    <Label>Hero image (optional)</Label>
                    <div className="mt-2 flex flex-wrap items-center gap-3">
                      <div className="flex h-16 w-28 items-center justify-center overflow-hidden rounded-lg border border-dashed border-border bg-card">
                        {heroImageUrl ? (
                          <img
                            src={heroImageUrl}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <ImagePlus className="h-5 w-5 text-muted-foreground" />
                        )}
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={uploading !== null || !user}
                        onClick={() => heroRef.current?.click()}
                      >
                        {uploading === "hero" ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <ImagePlus className="h-4 w-4" />
                        )}
                        Choose file
                      </Button>
                      <input
                        ref={heroRef}
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/gif"
                        className="hidden"
                        onChange={(e) =>
                          void onImageFile("hero", e.target.files?.[0] ?? null)
                        }
                      />
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div>
                      <Label className="mb-1">Primary</Label>
                      <div className="flex gap-2">
                        <input
                          type="color"
                          value={accentColor}
                          onChange={(e) => setAccentColor(e.target.value)}
                          className="h-10 w-10 cursor-pointer rounded border border-border bg-card"
                        />
                        <Input
                          value={accentColor}
                          onChange={(e) => setAccentColor(e.target.value)}
                        />
                      </div>
                    </div>
                    <div>
                      <Label className="mb-1">Secondary</Label>
                      <div className="flex gap-2">
                        <input
                          type="color"
                          value={secondaryColor}
                          onChange={(e) => setSecondaryColor(e.target.value)}
                          className="h-10 w-10 cursor-pointer rounded border border-border bg-card"
                        />
                        <Input
                          value={secondaryColor}
                          onChange={(e) => setSecondaryColor(e.target.value)}
                        />
                      </div>
                    </div>
                    <div>
                      <Label className="mb-1">Third</Label>
                      <div className="flex gap-2">
                        <input
                          type="color"
                          value={tertiaryColor || "#94a3b8"}
                          onChange={(e) => setTertiaryColor(e.target.value)}
                          className="h-10 w-10 cursor-pointer rounded border border-border bg-card"
                        />
                        <Input
                          value={tertiaryColor}
                          onChange={(e) => setTertiaryColor(e.target.value)}
                          placeholder="optional"
                        />
                      </div>
                    </div>
                  </div>
                </div>
                <div className="space-y-3">
                  <div>
                    <Label className="mb-1">Display name</Label>
                    <Input
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder={name || "Organization"}
                    />
                  </div>
                  <div>
                    <Label className="mb-1">Hero headline</Label>
                    <Input
                      value={heroHeadline}
                      onChange={(e) => setHeroHeadline(e.target.value)}
                      placeholder="Welcome to your workspace"
                    />
                  </div>
                  <div>
                    <Label className="mb-1">Short description</Label>
                    <Textarea
                      rows={3}
                      value={tagline}
                      onChange={(e) => setTagline(e.target.value)}
                      placeholder="Short description for the landing page"
                    />
                  </div>
                  <div>
                    <Label className="mb-1">Footer text</Label>
                    <Textarea
                      rows={2}
                      value={footerText}
                      onChange={(e) => setFooterText(e.target.value)}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
            <Button
              type="button"
              variant="ghost"
              disabled={step === 1 || creating}
              onClick={() => setStep((s) => (s - 1) as Step)}
            >
              Back
            </Button>
            <Button
              type="submit"
              disabled={
                creating ||
                (step === 1 && !tenantType) ||
                (step === 2 && !adminEmail.trim()) ||
                (step === 3 && (!name.trim() || !slug.trim()))
              }
            >
              {step === 4 ? (
                creating ? (
                  "Creating tenant…"
                ) : (
                  "Create tenant"
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
    </div>
  );
}
