import { LogIn, Users } from "lucide-react";
import { ContactSection, ServicesSection } from "./PublicSections";
import { HeroOverline, SiteFooter, SiteNav } from "./SiteChrome";
import type { TenantLandingProps } from "./types";

export function CommunityConnect(props: TenantLandingProps) {
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
    <div className="min-h-screen bg-[#f7f3ec] text-[#2c2418] dark:bg-[#15110c] dark:text-[#f7f3ec]">
      <SiteNav
        displayName={displayName}
        accent={accent}
        brandMark={brandMark("sm", false)}
        hasLogo={props.hasLogo}
        preview={preview}
        tone="dark"
        className="bg-[#f7f3ec]/90 dark:bg-[#15110c]/90"
        onPortalLogin={onPortalLogin}
      />

      <section id="home" className="scroll-mt-20 mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:py-20">
        <div className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div>
            <HeroOverline tenantType={tenantType} accent={accent} />
            <h1 className="mt-3 font-display text-4xl font-extrabold tracking-tight sm:text-5xl">
              {displayName}
            </h1>
            <p className="mt-4 text-xl leading-snug opacity-90">{headline}</p>
            <p className="mt-4 max-w-lg text-sm leading-relaxed opacity-70">
              {tagline || publicDescription}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => onPortalLogin?.()}
                className="inline-flex h-11 items-center gap-2 rounded-xl px-5 text-sm font-bold text-white"
                style={{ backgroundColor: accent }}
              >
                Portal Login
                <LogIn className="h-4 w-4" />
              </button>
              <a
                href="#about"
                className="inline-flex h-11 items-center gap-2 rounded-xl border border-current/20 px-5 text-sm font-semibold opacity-80 hover:opacity-100"
              >
                <Users className="h-4 w-4" />
                Our community
              </a>
            </div>
          </div>
          <div className="overflow-hidden rounded-3xl shadow-lg">
            {heroImage ? (
              <img src={heroImage} alt="" className="aspect-[5/4] w-full object-cover" />
            ) : (
              <div
                className="flex aspect-[5/4] flex-col justify-end p-8 text-white"
                style={{
                  background: `linear-gradient(160deg, ${accent}, ${secondary || "#2c2418"})`,
                }}
              >
                {brandMark("lg", true)}
                <p className="font-display text-2xl font-bold">Welcome</p>
                <p className="mt-2 text-sm text-white/80">
                  Customer-focused information and secure member access.
                </p>
              </div>
            )}
          </div>
        </div>
      </section>

      <section
        id="about"
        className="scroll-mt-20 border-y border-[#2c2418]/10 bg-white dark:border-border dark:bg-card"
      >
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
          <h2 className="font-display text-2xl font-bold">About us</h2>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed opacity-70">
            {publicDescription ||
              `${displayName} serves its community with public information and a private member portal.`}
          </p>
        </div>
      </section>

      <section id="services" className="scroll-mt-20 mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <h2 className="font-display text-2xl font-bold">How we help</h2>
        <ServicesSection className="mt-8" tenantType={tenantType} accent={accent} />
      </section>

      <section id="contact" className="scroll-mt-20 mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <h2 className="font-display text-2xl font-bold">Talk to us</h2>
        <ContactSection
          className="mt-6"
          email={contactEmail}
          phone={contactPhone}
          address={address}
          website={websiteUrl}
        />
      </section>

      <SiteFooter
        displayName={displayName}
        footerText={footerText}
        accent={accent}
        tone="light"
      />
    </div>
  );
}
