/** Public workspace landing templates (stored in tenants.branding.landing_template). */

export type LandingTemplateId =
  | "modern_professional"
  | "corporate_trust"
  | "minimal_clean"
  | "service_showcase"
  | "community_connect";

/** Legacy IDs from earlier builds — still resolve for existing tenants. */
const LEGACY_TEMPLATE_MAP: Record<string, LandingTemplateId> = {
  aurora: "modern_professional",
  night: "modern_professional",
  nova: "modern_professional",
  formal: "corporate_trust",
  ledger: "corporate_trust",
  horizon: "minimal_clean",
  split: "service_showcase",
  atelier: "community_connect",
};

export type LandingTemplateMeta = {
  id: LandingTemplateId;
  name: string;
  blurb: string;
  /** Swatch colors for the picker card */
  swatch: [string, string, string];
  previewTone: "light" | "dark";
};

export const LANDING_TEMPLATES: LandingTemplateMeta[] = [
  {
    id: "modern_professional",
    name: "Modern Professional",
    blurb:
      "Full website: centered hero, nav, Portal Login, about, services, and contact.",
    swatch: ["#0b1f3a", "#f5c400", "#f5f8fc"],
    previewTone: "dark",
  },
  {
    id: "corporate_trust",
    name: "Corporate Trust",
    blurb:
      "Formal company site with trust band, media panel, and member portal.",
    swatch: ["#0b1f3a", "#c9a227", "#f8f5ef"],
    previewTone: "dark",
  },
  {
    id: "minimal_clean",
    name: "Minimal Clean",
    blurb:
      "Light spacious site — brand first, then services and portal sign-in.",
    swatch: ["#ffffff", "#2b8cff", "#0b1f3a"],
    previewTone: "light",
  },
  {
    id: "service_showcase",
    name: "Service Showcase",
    blurb:
      "Split marketing page that leads with services, then portal login.",
    swatch: ["#0b1f3a", "#1fa85a", "#eef3f8"],
    previewTone: "light",
  },
  {
    id: "community_connect",
    name: "Community Connect",
    blurb:
      "Welcoming community site with story hero, help sections, and portal.",
    swatch: ["#2c2418", "#1fa85a", "#faf6f1"],
    previewTone: "light",
  },
];

export const DEFAULT_LANDING_TEMPLATE: LandingTemplateId = "modern_professional";

export function isLandingTemplateId(value: unknown): value is LandingTemplateId {
  return (
    typeof value === "string" &&
    LANDING_TEMPLATES.some((t) => t.id === value)
  );
}

export function resolveLandingTemplateId(
  branding: Record<string, unknown> | null | undefined,
): LandingTemplateId {
  const raw = branding?.landing_template;
  if (isLandingTemplateId(raw)) return raw;
  if (typeof raw === "string" && raw in LEGACY_TEMPLATE_MAP) {
    return LEGACY_TEMPLATE_MAP[raw];
  }
  return DEFAULT_LANDING_TEMPLATE;
}

export function landingTemplateMeta(id: LandingTemplateId): LandingTemplateMeta {
  return (
    LANDING_TEMPLATES.find((t) => t.id === id) ??
    LANDING_TEMPLATES[0]
  );
}

export type LandingBrandingFields = {
  display_name?: string;
  tagline?: string;
  accent_color?: string;
  secondary_color?: string;
  /** Optional third brand color extracted from logo or set manually. */
  tertiary_color?: string | null;
  logo_url?: string | null;
  hero_image_url?: string | null;
  hero_headline?: string;
  footer_text?: string;
  landing_template?: LandingTemplateId;
  /** Optional public contact — only fields intended for the landing page. */
  public_description?: string;
  contact_email?: string;
  contact_phone?: string;
  address?: string;
  website_url?: string;
};

export function brandingString(
  branding: Record<string, unknown> | null | undefined,
  key: string,
): string {
  if (!branding) return "";
  const v = branding[key];
  return typeof v === "string" ? v : "";
}

export function isValidHexColor(value: string): boolean {
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value.trim());
}

export function isValidHttpUrl(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return true;
  try {
    const url = new URL(trimmed);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/** Sample branding for template gallery previews (never production tenant data). */
export function previewSampleBranding(
  templateId: LandingTemplateId,
): Required<
  Pick<
    LandingBrandingFields,
    | "display_name"
    | "tagline"
    | "hero_headline"
    | "footer_text"
    | "accent_color"
    | "secondary_color"
    | "public_description"
    | "contact_email"
    | "contact_phone"
    | "address"
  >
> & { landing_template: LandingTemplateId } {
  const meta = landingTemplateMeta(templateId);
  return {
    landing_template: templateId,
    display_name: "Sample Workspace",
    tagline: meta.blurb,
    hero_headline: `Welcome to ${meta.name}`,
    footer_text: "Preview only — sample content, not a live tenant.",
    accent_color: meta.swatch[1],
    secondary_color: meta.swatch[0] === "#ffffff" || meta.swatch[0] === "#f5f8fc"
      ? "#0b1f3a"
      : meta.swatch[0],
    public_description:
      "Public company information for visitors. Members use Portal Login for the secure workspace.",
    contact_email: "hello@example.com",
    contact_phone: "+252 61 000 0000",
    address: "Mogadishu, Somalia",
  };
}
