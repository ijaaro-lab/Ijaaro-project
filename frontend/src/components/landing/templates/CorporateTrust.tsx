import { ContactSection, ServicesSection } from "./PublicSections";
import {
  HeroOverline,
  PortalCtaRow,
  SiteFooter,
  SiteNav,
} from "./SiteChrome";
import type { TenantLandingProps } from "./types";

export function CorporateTrust(props: TenantLandingProps) {
  const {
    accent,
    secondary,
    heroImage,
    displayName,
    tagline,
    headline,
    footerText,
    publicDescription,
    contactEmail,
    contactPhone,
    address,
    websiteUrl,
    tenantType,
    subdomain,
    brandMark,
    onPortalLogin,
    preview,
  } = props;

  return (
    <div className="min-h-screen bg-[#f7f5f0] text-[#0b1f3a] dark:bg-[#0a1524] dark:text-foreground">
      <div
        className="px-4 py-1.5 text-center text-[11px] font-medium tracking-wide text-white"
        style={{ backgroundColor: secondary || "#0b1f3a" }}
      >
        Official portal · {subdomain}
      </div>

      <div style={{ backgroundColor: secondary || "#0b1f3a" }}>
        <SiteNav
          displayName={displayName}
          accent={accent}
          brandMark={brandMark("sm", true)}
          hasLogo={props.hasLogo}
          preview={preview}
          tone="light"
          onPortalLogin={onPortalLogin}
        />
      </div>

      <section
        id="home"
        className="relative overflow-hidden text-white"
        style={{
          background: `linear-gradient(135deg, ${secondary || "#0b1f3a"} 0%, #061018 100%)`,
        }}
      >
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[1.15fr_0.85fr] lg:items-center lg:py-24">
          <div>
            <div className="mb-5 h-1 w-14 rounded-full" style={{ background: accent }} />
            <HeroOverline tenantType={tenantType} accent={accent} />
            <h1 className="mt-3 font-display text-4xl font-extrabold tracking-tight sm:text-5xl">
              {displayName}
            </h1>
            <p className="mt-3 text-xl text-white/85">{headline}</p>
            <p className="mt-4 max-w-lg text-sm leading-relaxed text-white/65">
              {tagline || publicDescription}
            </p>
            <PortalCtaRow
              className="mt-8"
              accent={accent}
              secondaryLabel="Contact office"
              onPortalLogin={onPortalLogin}
            />
          </div>
          <div className="overflow-hidden rounded-2xl border border-white/15 bg-white/5 shadow-2xl">
            {heroImage ? (
              <img src={heroImage} alt="" className="aspect-[4/3] w-full object-cover" />
            ) : (
              <div
                className="flex aspect-[4/3] items-end p-6"
                style={{
                  background: `linear-gradient(160deg, ${accent}55, transparent 60%), #122033`,
                }}
              >
                <p className="font-display text-lg font-semibold text-white">
                  Trusted operations for {displayName}
                </p>
              </div>
            )}
          </div>
        </div>
      </section>

      <section
        id="about"
        className="scroll-mt-20 border-b border-black/5 bg-white dark:border-border dark:bg-card"
      >
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
          <h2 className="font-display text-2xl font-bold">About the organization</h2>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground">
            {publicDescription ||
              `${displayName} provides secure access for its own staff and customers only.`}
          </p>
        </div>
      </section>

      <section id="services" className="scroll-mt-20 mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <h2 className="font-display text-2xl font-bold">Services</h2>
        <ServicesSection className="mt-6" tenantType={tenantType} accent={accent} />
      </section>

      <section id="contact" className="scroll-mt-20 mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <h2 className="font-display text-2xl font-bold">Contact</h2>
        <ContactSection
          className="mt-4"
          email={contactEmail}
          phone={contactPhone}
          address={address}
          website={websiteUrl}
        />
      </section>

      <SiteFooter displayName={displayName} footerText={footerText} accent={accent} />
    </div>
  );
}
