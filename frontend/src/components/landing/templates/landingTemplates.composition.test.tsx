import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { CommunityConnect } from "./CommunityConnect";
import { CorporateTrust } from "./CorporateTrust";
import { MinimalClean } from "./MinimalClean";
import { ModernProfessional } from "./ModernProfessional";
import { ServiceShowcase } from "./ServiceShowcase";
import type { TenantLandingProps } from "./types";

vi.mock("@/theme/ThemeProvider", () => ({
  useTheme: () => ({ theme: "light", toggleTheme: vi.fn() }),
}));

const baseProps: Omit<TenantLandingProps, "templateId"> = {
  accent: "#1fa85a",
  secondary: "#0b1f3a",
  heroImage: "",
  displayName: "Darusalam-Properties",
  tagline: "Tagline",
  headline: "Welcome",
  footerText: "Footer copy",
  publicDescription: "About copy",
  contactEmail: "a@example.com",
  contactPhone: "615413872",
  address: "Mogadishu",
  websiteUrl: "",
  tenantType: "landlord",
  subdomain: "hodan-properties",
  brandMark: () => <span>Logo</span>,
  loginCard: () => <div>Login</div>,
  onPortalLogin: () => undefined,
  belowContent: <div data-testid="listings-slot">Listings</div>,
};

const templates = [
  { name: "modern_professional", Comp: ModernProfessional },
  { name: "corporate_trust", Comp: CorporateTrust },
  { name: "minimal_clean", Comp: MinimalClean },
  { name: "service_showcase", Comp: ServiceShowcase },
  { name: "community_connect", Comp: CommunityConnect },
] as const;

describe("landing templates composition", () => {
  for (const { name, Comp } of templates) {
    it(`${name}: section targets exist once and listings render before the footer`, () => {
      const { container } = render(
        <Comp {...baseProps} templateId={name} />,
      );

      for (const id of ["home", "about", "services", "contact", "available-homes"]) {
        // available-homes lives on the listings slot content when provided;
        // templates do not invent that id themselves — assert slot order vs footer.
        if (id === "available-homes") continue;
        const matches = container.querySelectorAll(`#${id}`);
        expect(matches.length, `${name} #${id}`).toBe(1);
      }

      const listings = container.querySelector('[data-testid="listings-slot"]');
      const footer = container.querySelector('[data-testid="site-footer"]');
      expect(listings).toBeTruthy();
      expect(footer).toBeTruthy();
      expect(
        Boolean(
          listings &&
            footer &&
            !!(listings.compareDocumentPosition(footer) & Node.DOCUMENT_POSITION_FOLLOWING),
        ),
        `${name}: listings must precede footer`,
      ).toBe(true);
    });

    it(`${name}: does not duplicate Contact or Services headings inside sections`, () => {
      const { container } = render(
        <Comp {...baseProps} templateId={name} />,
      );

      const contactSection = container.querySelector("#contact");
      const servicesSection = container.querySelector("#services");
      expect(contactSection).toBeTruthy();
      expect(servicesSection).toBeTruthy();

      const contactHeadings = contactSection!.querySelectorAll("h2");
      const servicesHeadings = servicesSection!.querySelectorAll("h2");
      expect(contactHeadings.length).toBe(1);
      expect(servicesHeadings.length).toBe(1);
    });
  }
});
