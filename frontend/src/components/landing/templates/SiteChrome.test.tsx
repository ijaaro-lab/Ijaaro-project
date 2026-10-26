import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { SITE_NAV_ITEMS, SiteFooter, SiteNav } from "./SiteChrome";

vi.mock("@/theme/ThemeProvider", () => ({
  useTheme: () => ({ theme: "light", toggleTheme: vi.fn() }),
}));

describe("SiteChrome navigation", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/?tenant=hodan-properties");
  });

  it("exposes Properties in header and footer navigation", () => {
    render(
      <>
        <SiteNav
          displayName="Darusalam"
          accent="#1fa85a"
          brandMark={<span>Mark</span>}
          tone="dark"
          onPortalLogin={() => undefined}
        />
        <SiteFooter displayName="Darusalam" footerText="Footer" accent="#1fa85a" />
      </>,
    );

    const headerNav = screen.getByRole("navigation", { name: "Primary" });
    const footerNav = screen.getByRole("navigation", { name: "Footer" });

    expect(within(headerNav).getByRole("link", { name: "Properties" })).toHaveAttribute(
      "href",
      "#available-homes",
    );
    expect(within(footerNav).getByRole("link", { name: "Properties" })).toHaveAttribute(
      "href",
      "#available-homes",
    );

    for (const item of SITE_NAV_ITEMS) {
      expect(within(headerNav).getByRole("link", { name: item.label })).toHaveAttribute(
        "href",
        item.href,
      );
      expect(within(footerNav).getByRole("link", { name: item.label })).toHaveAttribute(
        "href",
        item.href,
      );
    }
  });

  it("uses hash-only nav hrefs that do not replace the tenant query", () => {
    render(
      <>
        <SiteNav
          displayName="Darusalam"
          accent="#1fa85a"
          brandMark={<span>Mark</span>}
          tone="dark"
          onPortalLogin={() => undefined}
        />
        <SiteFooter displayName="Darusalam" footerText="Footer" accent="#1fa85a" />
      </>,
    );

    expect(window.location.search).toBe("?tenant=hodan-properties");

    const headerNav = screen.getByRole("navigation", { name: "Primary" });
    const footerNav = screen.getByRole("navigation", { name: "Footer" });
    for (const item of SITE_NAV_ITEMS) {
      const headerHref = within(headerNav)
        .getByRole("link", { name: item.label })
        .getAttribute("href");
      const footerHref = within(footerNav)
        .getByRole("link", { name: item.label })
        .getAttribute("href");
      expect(headerHref).toBe(item.href);
      expect(footerHref).toBe(item.href);
      expect(headerHref?.startsWith("#")).toBe(true);
      expect(headerHref?.includes("tenant=")).toBe(false);
    }
  });

  it("marks the active section from the hash instead of always highlighting Home", () => {
    window.history.replaceState({}, "", "/?tenant=hodan-properties#services");
    render(
      <SiteNav
        displayName="Darusalam"
        accent="#1fa85a"
        brandMark={<span>Mark</span>}
        tone="dark"
        onPortalLogin={() => undefined}
      />,
    );

    const headerNav = screen.getByRole("navigation", { name: "Primary" });
    expect(within(headerNav).getByRole("link", { name: "Services" })).toHaveAttribute(
      "aria-current",
      "true",
    );
    expect(within(headerNav).getByRole("link", { name: "Home" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("opens and closes the mobile menu, and closes after selecting a link", () => {
    render(
      <SiteNav
        displayName="Darusalam"
        accent="#1fa85a"
        brandMark={<span>Mark</span>}
        tone="dark"
        onPortalLogin={() => undefined}
      />,
    );

    const openBtn = screen.getByRole("button", { name: /Open navigation menu/i });
    expect(openBtn).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("navigation", { name: "Mobile primary" })).toBeNull();

    fireEvent.click(openBtn);
    expect(screen.getByRole("button", { name: /Close navigation menu/i })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    const mobileNav = screen.getByRole("navigation", { name: "Mobile primary" });
    expect(within(mobileNav).getByRole("link", { name: "Properties" })).toBeTruthy();

    fireEvent.click(within(mobileNav).getByRole("link", { name: "About" }));
    expect(screen.queryByRole("navigation", { name: "Mobile primary" })).toBeNull();
    expect(screen.getByRole("button", { name: /Open navigation menu/i })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  it("closes the mobile menu with Escape", () => {
    render(
      <SiteNav
        displayName="Darusalam"
        accent="#1fa85a"
        brandMark={<span>Mark</span>}
        tone="dark"
        onPortalLogin={() => undefined}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Open navigation menu/i }));
    expect(screen.getByRole("navigation", { name: "Mobile primary" })).toBeTruthy();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("navigation", { name: "Mobile primary" })).toBeNull();
  });

  it("invokes Portal Login from the header", () => {
    const onPortalLogin = vi.fn();
    render(
      <SiteNav
        displayName="Darusalam"
        accent="#1fa85a"
        brandMark={<span>Mark</span>}
        tone="dark"
        onPortalLogin={onPortalLogin}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Portal Login/i }));
    expect(onPortalLogin).toHaveBeenCalledTimes(1);
  });
});
