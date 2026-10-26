import type { ReactNode } from "react";
import type { TenantType } from "@/types/database";
import type { LandingTemplateId } from "@/lib/landingTemplates";

export type TenantLandingProps = {
  templateId: LandingTemplateId;
  accent: string;
  secondary: string;
  heroImage: string;
  displayName: string;
  tagline: string;
  headline: string;
  footerText: string;
  publicDescription: string;
  contactEmail: string;
  contactPhone: string;
  address: string;
  websiteUrl: string;
  tenantType: TenantType;
  subdomain: string;
  /** True when tenant uploaded a logo — templates should prefer logo over name. */
  hasLogo?: boolean;
  brandMark: (size?: "sm" | "lg", onDark?: boolean) => ReactNode;
  loginCard: (tone?: "light" | "dark", className?: string) => ReactNode;
  /** Opens the focused workspace sign-in modal (Portal Login). */
  onPortalLogin?: () => void;
  /** When true, render compact preview chrome (gallery). */
  preview?: boolean;
  /**
   * Optional content rendered after Contact and before the site footer
   * (e.g. landlord public listings). Keeps the footer as the last chrome section.
   */
  belowContent?: ReactNode;
};
