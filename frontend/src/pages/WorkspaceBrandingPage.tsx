import { useEffect, useRef, useState, type FormEvent } from "react";
import { ImagePlus, Loader2 } from "lucide-react";
import { useAuth } from "@/auth/AuthProvider";
import { LandingTemplatePicker } from "@/components/landing/LandingTemplatePicker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { extractLogoColors } from "@/lib/extractLogoColors";
import {
  brandingString,
  isLandingTemplateId,
  isValidHexColor,
  isValidHttpUrl,
  resolveLandingTemplateId,
  type LandingTemplateId,
} from "@/lib/landingTemplates";
import { supabase } from "@/lib/supabase";
import { tenantWorkspaceUrl } from "@/lib/tenant";
import { uploadPublicImage } from "@/lib/uploadImage";
import type { TenantType } from "@/types/database";

export function WorkspaceBrandingPage() {
  const { isSuperAdmin, activeMembership, refreshMemberships } = useAuth();
  const logoRef = useRef<HTMLInputElement>(null);
  const heroRef = useRef<HTMLInputElement>(null);

  const canEdit =
    isSuperAdmin ||
    activeMembership?.role === "landlord_admin" ||
    activeMembership?.role === "utility_admin";

  const tenant = activeMembership?.tenant;
  const branding = (tenant?.branding ?? {}) as Record<string, unknown>;

  const [displayName, setDisplayName] = useState("");
  const [tagline, setTagline] = useState("");
  const [heroHeadline, setHeroHeadline] = useState("");
  const [footerText, setFooterText] = useState("");
  const [publicDescription, setPublicDescription] = useState("");
  const [accentColor, setAccentColor] = useState("#1fa85a");
  const [secondaryColor, setSecondaryColor] = useState("#0b1f3a");
  const [tertiaryColor, setTertiaryColor] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [address, setAddress] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [heroImageUrl, setHeroImageUrl] = useState("");
  const [landingTemplate, setLandingTemplate] = useState<LandingTemplateId>(
    resolveLandingTemplateId(branding),
  );
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<"logo" | "hero" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!tenant) return;
    const b = (tenant.branding ?? {}) as Record<string, unknown>;
    setDisplayName(brandingString(b, "display_name") || tenant.name);
    setTagline(brandingString(b, "tagline"));
    setHeroHeadline(brandingString(b, "hero_headline"));
    setFooterText(brandingString(b, "footer_text"));
    setPublicDescription(brandingString(b, "public_description"));
    setAccentColor(brandingString(b, "accent_color") || "#1fa85a");
    setSecondaryColor(brandingString(b, "secondary_color") || "#0b1f3a");
    setTertiaryColor(brandingString(b, "tertiary_color"));
    setContactEmail(brandingString(b, "contact_email"));
    setContactPhone(brandingString(b, "contact_phone"));
    setAddress(brandingString(b, "address"));
    setWebsiteUrl(brandingString(b, "website_url"));
    setLogoUrl(brandingString(b, "logo_url"));
    setHeroImageUrl(brandingString(b, "hero_image_url"));
    setLandingTemplate(resolveLandingTemplateId(b));
  }, [tenant]);

  if (!tenant || !activeMembership) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
        Select a workspace membership to edit branding.
      </div>
    );
  }

  if (!canEdit) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
        Only landlord or utility admins can update workspace branding.
      </div>
    );
  }

  const tenantType = tenant.tenant_type as Exclude<TenantType, "platform">;
  const workspaceUrl = tenantWorkspaceUrl(tenant.subdomain || tenant.slug);

  const onUpload = async (kind: "logo" | "hero", file: File | null) => {
    if (!file) return;
    setUploading(kind);
    setError(null);
    setMessage(null);
    const palettePromise =
      kind === "logo" ? extractLogoColors(file) : Promise.resolve(null);
    const result = await uploadPublicImage({
      bucket: "tenant-branding",
      folder: tenant.id,
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
      setLogoUrl(result.url);
      if (palette) {
        setAccentColor(palette.primary);
        setSecondaryColor(palette.secondary);
        setTertiaryColor(palette.tertiary ?? "");
        setMessage(
          "Logo uploaded — brand colors detected from the logo. Save to publish.",
        );
        return;
      }
    } else {
      setHeroImageUrl(result.url);
    }
    setMessage(`${kind === "logo" ? "Logo" : "Hero image"} uploaded — save to publish.`);
  };

  const onSave = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);

    if (!isValidHexColor(accentColor) || !isValidHexColor(secondaryColor)) {
      setError("Accent and secondary colors must be valid hex values (e.g. #1fa85a).");
      return;
    }
    if (tertiaryColor.trim() && !isValidHexColor(tertiaryColor)) {
      setError("Third color must be a valid hex value (e.g. #0891B2) or left blank.");
      return;
    }
    if (!isValidHttpUrl(websiteUrl)) {
      setError("Website URL must start with http:// or https://.");
      return;
    }
    if (!isLandingTemplateId(landingTemplate)) {
      setError("Select a valid landing template.");
      return;
    }

    setSaving(true);
    const payload = {
      display_name: displayName.trim().slice(0, 120),
      tagline: tagline.trim().slice(0, 200),
      hero_headline: heroHeadline.trim().slice(0, 160),
      footer_text: footerText.trim().slice(0, 240),
      public_description: publicDescription.trim().slice(0, 600),
      accent_color: accentColor.trim(),
      secondary_color: secondaryColor.trim(),
      tertiary_color: tertiaryColor.trim() || null,
      contact_email: contactEmail.trim().slice(0, 160),
      contact_phone: contactPhone.trim().slice(0, 60),
      address: address.trim().slice(0, 240),
      website_url: websiteUrl.trim().slice(0, 240),
      logo_url: logoUrl || null,
      hero_image_url: heroImageUrl || null,
      landing_template: landingTemplate,
    };

    const { error: err } = await supabase.rpc("update_tenant_branding", {
      p_tenant_id: tenant.id,
      p_branding: payload,
    });
    setSaving(false);
    if (err) {
      setError(err.message);
      return;
    }
    await refreshMemberships();
    setMessage("Branding saved. Public landing and login will use these values.");
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h2 className="font-display text-2xl font-bold text-foreground">
          Workspace branding
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Public landing and login for{" "}
          <a
            href={workspaceUrl}
            className="font-medium text-brand-blue hover:underline"
            target="_blank"
            rel="noreferrer"
          >
            {workspaceUrl}
          </a>
          . Only approved public fields are shown to visitors.
        </p>
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
        >
          {error}
        </p>
      )}
      {message && (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">
          {message}
        </p>
      )}

      <form onSubmit={(e) => void onSave(e)} className="space-y-6">
        <section className="rounded-xl border border-border bg-card p-5">
          <h3 className="font-display text-base font-semibold">Landing template</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Five reusable designs. Changing the template does not delete tenant data.
          </p>
          <div className="mt-4">
            <LandingTemplatePicker
              value={landingTemplate}
              onChange={setLandingTemplate}
              tenantType={tenantType}
            />
          </div>
        </section>

        <section className="rounded-xl border border-border bg-card p-5">
          <h3 className="font-display text-base font-semibold">Identity & colors</h3>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="display-name">Display name</Label>
              <Input
                id="display-name"
                className="mt-1"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                maxLength={120}
              />
            </div>
            <div>
              <Label htmlFor="hero-headline">Hero headline</Label>
              <Input
                id="hero-headline"
                className="mt-1"
                value={heroHeadline}
                onChange={(e) => setHeroHeadline(e.target.value)}
                maxLength={160}
              />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="tagline">Tagline</Label>
              <Input
                id="tagline"
                className="mt-1"
                value={tagline}
                onChange={(e) => setTagline(e.target.value)}
                maxLength={200}
              />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="public-description">Public description</Label>
              <Textarea
                id="public-description"
                className="mt-1"
                value={publicDescription}
                onChange={(e) => setPublicDescription(e.target.value)}
                maxLength={600}
                rows={3}
              />
            </div>
            <div>
              <Label htmlFor="accent">Primary color</Label>
              <div className="mt-1 flex gap-2">
                <input
                  type="color"
                  value={accentColor}
                  onChange={(e) => setAccentColor(e.target.value)}
                  className="h-10 w-12 cursor-pointer rounded border border-border bg-card"
                />
                <Input
                  id="accent"
                  value={accentColor}
                  onChange={(e) => setAccentColor(e.target.value)}
                />
              </div>
            </div>
            <div>
              <Label htmlFor="secondary">Secondary color</Label>
              <div className="mt-1 flex gap-2">
                <input
                  type="color"
                  value={secondaryColor}
                  onChange={(e) => setSecondaryColor(e.target.value)}
                  className="h-10 w-12 cursor-pointer rounded border border-border bg-card"
                />
                <Input
                  id="secondary"
                  value={secondaryColor}
                  onChange={(e) => setSecondaryColor(e.target.value)}
                />
              </div>
            </div>
            <div>
              <Label htmlFor="tertiary">Third color</Label>
              <div className="mt-1 flex gap-2">
                <input
                  type="color"
                  value={tertiaryColor || "#94a3b8"}
                  onChange={(e) => setTertiaryColor(e.target.value)}
                  className="h-10 w-12 cursor-pointer rounded border border-border bg-card"
                />
                <Input
                  id="tertiary"
                  value={tertiaryColor}
                  onChange={(e) => setTertiaryColor(e.target.value)}
                  placeholder="optional"
                />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Uploading a logo auto-fills primary, secondary, and third when available.
              </p>
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="footer">Footer text</Label>
              <Input
                id="footer"
                className="mt-1"
                value={footerText}
                onChange={(e) => setFooterText(e.target.value)}
                maxLength={240}
              />
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-border bg-card p-5">
          <h3 className="font-display text-base font-semibold">Public contact</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Shown only on the public landing page. Leave blank to hide.
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="contact-email">Contact email</Label>
              <Input
                id="contact-email"
                type="email"
                className="mt-1"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="contact-phone">Contact phone</Label>
              <Input
                id="contact-phone"
                className="mt-1"
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="address">Address</Label>
              <Input
                id="address"
                className="mt-1"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="website">Website URL</Label>
              <Input
                id="website"
                className="mt-1"
                value={websiteUrl}
                onChange={(e) => setWebsiteUrl(e.target.value)}
                placeholder="https://"
              />
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-border bg-card p-5">
          <h3 className="font-display text-base font-semibold">Images</h3>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-sm font-medium">Logo</p>
              {logoUrl ? (
                <img
                  src={logoUrl}
                  alt=""
                  className="mt-2 h-16 w-auto max-w-full object-contain"
                />
              ) : (
                <div className="mt-2 flex h-16 items-center justify-center rounded-lg border border-dashed border-border text-xs text-muted-foreground">
                  No logo — type icon fallback
                </div>
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-3"
                disabled={uploading === "logo"}
                onClick={() => logoRef.current?.click()}
              >
                {uploading === "logo" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ImagePlus className="h-4 w-4" />
                )}
                Upload logo
              </Button>
              <input
                ref={logoRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="hidden"
                onChange={(e) => void onUpload("logo", e.target.files?.[0] ?? null)}
              />
            </div>
            <div>
              <p className="text-sm font-medium">Hero image</p>
              {heroImageUrl ? (
                <img
                  src={heroImageUrl}
                  alt=""
                  className="mt-2 h-16 w-full rounded-lg object-cover"
                />
              ) : (
                <div className="mt-2 flex h-16 items-center justify-center rounded-lg border border-dashed border-border text-xs text-muted-foreground">
                  Optional hero media
                </div>
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-3"
                disabled={uploading === "hero"}
                onClick={() => heroRef.current?.click()}
              >
                {uploading === "hero" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ImagePlus className="h-4 w-4" />
                )}
                Upload hero
              </Button>
              <input
                ref={heroRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="hidden"
                onChange={(e) => void onUpload("hero", e.target.files?.[0] ?? null)}
              />
            </div>
          </div>
        </section>

        <div className="flex flex-wrap gap-3">
          <Button type="submit" disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving…
              </>
            ) : (
              "Save branding"
            )}
          </Button>
          <a
            href={workspaceUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-10 items-center rounded-lg border border-border px-4 text-sm font-medium hover:bg-muted"
          >
            Open public landing
          </a>
        </div>
      </form>
    </div>
  );
}
