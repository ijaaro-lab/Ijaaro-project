import { ContactSection, ServicesSection } from "./PublicSections";
import {
  HeroOverline,
  PortalCtaRow,
  SiteFooter,
  SiteNav,
} from "./SiteChrome";
import type { TenantLandingProps } from "./types";

export function ServiceShowcase(props: TenantLandingProps) {
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
    brandMark,
    onPortalLogin,
    preview,
  } = props;

  return (
    <div className="min-h-screen bg-background">
      <SiteNav
        displayName={displayName}
        accent={accent}
        brandMark={brandMark("sm", false)}
        hasLogo={props.hasLogo}
        preview={preview}
        tone="dark"
        onPortalLogin={onPortalLogin}
      />

      <section
        id="home"
        className="scroll-mt-20 border-b border-border"
        style={{
          background: `linear-gradient(105deg, ${secondary || "#0b1f3a"} 0%, ${secondary || "#0b1f3a"} 48%, #f5f8fc 48%)`,
        }}
      >
        <div className="mx-auto grid max-w-6xl lg:grid-cols-2">
          <div className="px-4 py-16 text-white sm:px-8 lg:py-24">
            {brandMark("lg", true)}
            <HeroOverline tenantType={tenantType} accent={accent} />
            <h1 className="mt-3 font-display text-4xl font-extrabold tracking-tight sm:text-5xl">
              {headline}
            </h1>
            {!props.hasLogo && (
              <p className="mt-2 text-lg font-medium text-white/90">{displayName}</p>
            )}
            <p className="mt-4 max-w-md text-sm leading-relaxed text-white/75">
              {tagline || publicDescription}
            </p>
            <PortalCtaRow
              className="mt-8"
              accent={accent}
              secondaryLabel="Our services"
              secondaryHref="#services"
              onPortalLogin={onPortalLogin}
            />
          </div>
          <div className="flex items-center justify-center bg-muted/30 px-4 py-12 sm:px-8">
            {heroImage ? (
              <img
                src={heroImage}
                alt=""
                className="h-64 w-full max-w-md rounded-2xl object-cover shadow-lg sm:h-80"
              />
            ) : (
              <div
                className="flex h-64 w-full max-w-md flex-col justify-end rounded-2xl p-6 shadow-lg sm:h-80"
                style={{
                  background: `linear-gradient(145deg, ${accent}33, ${secondary || "#0b1f3a"}22)`,
                }}
              >
                <p className="font-display text-xl font-bold text-foreground">
                  Service-first portal
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  Public services here — members sign in via Portal Login.
                </p>
              </div>
            )}
          </div>
        </div>
      </section>

      <section id="about" className="scroll-mt-20 mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <h2 className="font-display text-2xl font-bold">About {displayName}</h2>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          {publicDescription ||
            `${displayName} publishes public service information here. Only this organization’s members can open the portal.`}
        </p>
      </section>

      <section id="services" className="scroll-mt-20 border-y border-border bg-card">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
          <h2 className="font-display text-2xl font-bold">Services & benefits</h2>
          <ServicesSection className="mt-8" tenantType={tenantType} accent={accent} />
        </div>
      </section>

      <section id="contact" className="scroll-mt-20 mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <div className="grid gap-8 lg:grid-cols-2">
          <div>
            <h2 className="font-display text-2xl font-bold">Get in touch</h2>
            <ContactSection
              className="mt-6"
              email={contactEmail}
              phone={contactPhone}
              address={address}
              website={websiteUrl}
            />
          </div>
          <div
            className="rounded-2xl p-6 text-white"
            style={{ backgroundColor: secondary || "#0b1f3a" }}
          >
            <p className="font-display text-lg font-semibold">Need workspace access?</p>
            <p className="mt-2 text-sm text-white/70">
              Ask your organization admin for a membership, then use Portal Login.
            </p>
            <button
              type="button"
              onClick={() => onPortalLogin?.()}
              className="mt-6 inline-flex h-10 items-center rounded-lg px-4 text-sm font-bold text-[#0b1f3a]"
              style={{ backgroundColor: accent }}
            >
              Go to portal
            </button>
          </div>
        </div>
      </section>

      <SiteFooter displayName={displayName} footerText={footerText} accent={accent} />
    </div>
  );
}
