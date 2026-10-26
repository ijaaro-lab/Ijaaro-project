import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { TenantLandingPage } from "./TenantLandingPage";

const signIn = vi.fn();
const signOut = vi.fn();
const refreshMemberships = vi.fn();
const setActiveMembershipId = vi.fn();
const useAuth = vi.fn();
const navigate = vi.fn();
const getSession = vi.fn();
const rpc = vi.fn();

vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: true,
  supabase: {
    auth: {
      getSession: (...args: unknown[]) => getSession(...args),
    },
    rpc: (...args: unknown[]) => rpc(...args),
  },
}));

vi.mock("@/auth/AuthProvider", () => ({
  useAuth: () => useAuth(),
}));

vi.mock("@/theme/ThemeProvider", () => ({
  useTheme: () => ({ theme: "light" }),
}));

vi.mock("@/components/landing/LandlordPublicListings", () => ({
  LandlordPublicListings: () => (
    <section id="available-homes" data-testid="public-listings">
      Listings
    </section>
  ),
}));

vi.mock("@/components/landing/templates", () => ({
  TenantLandingTemplate: (props: {
    onPortalLogin?: () => void;
    belowContent?: ReactNode;
  }) => (
    <div>
      <button type="button" onClick={() => props.onPortalLogin?.()}>
        Portal Login
      </button>
      {props.belowContent}
      <footer data-testid="site-footer">Footer</footer>
    </div>
  ),
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => navigate,
  };
});

const renterMembership = {
  id: "mem-renter-1",
  role: "renter" as const,
  status: "active",
  tenant: {
    id: "t1",
    name: "Hodan",
    slug: "hodan-properties",
    subdomain: "hodan-properties",
    tenant_type: "landlord" as const,
    status: "active" as const,
    branding: {},
    settings: {},
    created_at: "",
    updated_at: "",
  },
  tenant_id: "t1",
  user_id: "u1",
  invited_by: null,
  created_at: "",
  updated_at: "",
};

const landlordMembership = {
  ...renterMembership,
  id: "mem-ll-1",
  role: "landlord_admin" as const,
  user_id: "u-ll",
};

const signedInSession = { user: { id: "u1" } };

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/?tenant=hodan-properties"]}>
      <Routes>
        <Route path="/" element={<TenantLandingPage tenantKey="hodan-properties" />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("TenantLandingPage public landlord composition", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/?tenant=hodan-properties");
    useAuth.mockReset();
    rpc.mockReset();
    rpc.mockResolvedValue({
      data: {
        id: "t1",
        name: "Hodan",
        slug: "hodan-properties",
        subdomain: "hodan-properties",
        tenant_type: "landlord",
        status: "active",
        branding: {},
      },
      error: null,
    });
    useAuth.mockReturnValue({
      session: null,
      loading: false,
      memberships: [],
      isSuperAdmin: false,
      signIn,
      signOut,
      refreshMemberships,
      setActiveMembershipId,
    });
  });

  it("passes listings belowContent so available homes render before the footer", async () => {
    renderPage();
    const listings = await screen.findByTestId("public-listings");
    const footer = screen.getByTestId("site-footer");
    expect(
      listings.compareDocumentPosition(footer) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(listings.id).toBe("available-homes");
  });

  it("still opens Portal Login modal", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /portal login/i }));
    expect(await screen.findByRole("dialog")).toBeTruthy();
  });

  it("renders the application-status CTA with dynamic tenant destination", async () => {
    renderPage();
    const cta = await screen.findByTestId("application-status-cta");
    expect(cta).toBeTruthy();
    expect(screen.getByRole("heading", { name: /Track Your Rental Application/i })).toBeTruthy();
    expect(
      screen.getByText(/View your application status and any updates from the property manager/i),
    ).toBeTruthy();
    const action = screen.getByRole("link", { name: /View Application Status/i });
    expect(action).toHaveAttribute("href", "/my-applications?tenant=hodan-properties");
    expect(action.tabIndex).not.toBe(-1);
  });

  it("scrolls to #available-homes after workspace chrome mounts", async () => {
    window.history.replaceState({}, "", "/?tenant=hodan-properties#available-homes");
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      writable: true,
      value: scrollIntoView,
    });

    renderPage();
    const listings = await screen.findByTestId("public-listings");
    expect(listings.id).toBe("available-homes");
    expect(window.location.search).toBe("?tenant=hodan-properties");
    expect(window.location.hash).toBe("#available-homes");

    await waitFor(() => {
      expect(scrollIntoView).toHaveBeenCalled();
    });
    window.history.replaceState({}, "", "/?tenant=hodan-properties");
  });
});

describe("TenantLandingPage Enter dashboard (RP-1.3.26)", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/?tenant=hodan-properties");
    signIn.mockReset();
    signOut.mockReset();
    refreshMemberships.mockReset();
    setActiveMembershipId.mockReset();
    navigate.mockReset();
    useAuth.mockReset();
    getSession.mockReset();
    rpc.mockReset();
    rpc.mockResolvedValue({
      data: {
        id: "t1",
        name: "Hodan",
        slug: "hodan-properties",
        subdomain: "hodan-properties",
        tenant_type: "landlord",
        status: "active",
        branding: {},
      },
      error: null,
    });
    getSession.mockResolvedValue({
      data: { session: { user: { id: "u1" } } },
    });
  });

  it("refreshes memberships then navigates active renter to /app/renter?tenant=", async () => {
    useAuth.mockReturnValue({
      session: { user: { id: "u1" } },
      loading: false,
      memberships: [renterMembership],
      isSuperAdmin: false,
      signIn,
      signOut,
      refreshMemberships,
      setActiveMembershipId,
    });
    refreshMemberships.mockResolvedValue([renterMembership]);

    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /portal login/i }));
    fireEvent.click(await screen.findByRole("button", { name: /enter dashboard/i }));

    await waitFor(() => {
      expect(refreshMemberships).toHaveBeenCalled();
      expect(navigate).toHaveBeenCalledWith("/app/renter?tenant=hodan-properties", {
        replace: true,
      });
    });
    expect(setActiveMembershipId).toHaveBeenCalledWith("mem-renter-1");
    expect(signOut).not.toHaveBeenCalled();
  });

  it("does not navigate or sign out when membership refresh returns empty (race)", async () => {
    useAuth.mockReturnValue({
      session: { user: { id: "u1" } },
      loading: false,
      memberships: [renterMembership],
      isSuperAdmin: false,
      signIn,
      signOut,
      refreshMemberships,
      setActiveMembershipId,
    });
    refreshMemberships.mockResolvedValue([]);

    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /portal login/i }));
    fireEvent.click(await screen.findByRole("button", { name: /enter dashboard/i }));

    await waitFor(() => expect(refreshMemberships).toHaveBeenCalled());
    expect(navigate).not.toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
    expect(await screen.findByRole("alert")).toBeTruthy();
  });

  it("does not navigate for mismatched tenant membership", async () => {
    useAuth.mockReturnValue({
      session: { user: { id: "u1" } },
      loading: false,
      memberships: [renterMembership],
      isSuperAdmin: false,
      signIn,
      signOut,
      refreshMemberships,
      setActiveMembershipId,
    });
    refreshMemberships.mockResolvedValue([
      {
        ...renterMembership,
        tenant: { ...renterMembership.tenant, slug: "other-landlord", subdomain: "other-landlord" },
      },
    ]);

    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /portal login/i }));
    fireEvent.click(await screen.findByRole("button", { name: /enter dashboard/i }));

    await waitFor(() => expect(refreshMemberships).toHaveBeenCalled());
    expect(navigate).not.toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
  });

  it("preserves landlord navigation to /app/landlord?tenant=", async () => {
    useAuth.mockReturnValue({
      session: { user: { id: "u-ll" } },
      loading: false,
      memberships: [landlordMembership],
      isSuperAdmin: false,
      signIn,
      signOut,
      refreshMemberships,
      setActiveMembershipId,
    });
    getSession.mockResolvedValue({
      data: { session: { user: { id: "u-ll" } } },
    });
    refreshMemberships.mockResolvedValue([landlordMembership]);

    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /portal login/i }));
    fireEvent.click(await screen.findByRole("button", { name: /enter dashboard/i }));

    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith("/app/landlord?tenant=hodan-properties", {
        replace: true,
      });
    });
    expect(signOut).not.toHaveBeenCalled();
  });
});

describe("TenantLandingPage password submit (RP-1.3.29)", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/?tenant=hodan-properties");
    signIn.mockReset();
    signOut.mockReset();
    refreshMemberships.mockReset();
    setActiveMembershipId.mockReset();
    navigate.mockReset();
    useAuth.mockReset();
    getSession.mockReset();
    rpc.mockReset();
    rpc.mockResolvedValue({
      data: {
        id: "t1",
        name: "Hodan",
        slug: "hodan-properties",
        subdomain: "hodan-properties",
        tenant_type: "landlord",
        status: "active",
        branding: {},
      },
      error: null,
    });
    getSession.mockResolvedValue({
      data: { session: { user: { id: "u1" } } },
    });
    // No React session yet — password form path (memberMatch absent).
    useAuth.mockReturnValue({
      session: null,
      loading: false,
      memberships: [],
      isSuperAdmin: false,
      signIn,
      signOut,
      refreshMemberships,
      setActiveMembershipId,
    });
  });

  async function submitPortalPassword() {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /portal login/i }));
    fireEvent.change(await screen.findByLabelText(/^email$/i), {
      target: { value: "renter@example.com" },
    });
    fireEvent.change(document.getElementById("tenant-password") as HTMLInputElement, {
      target: { value: "not-a-real-secret" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^sign in$/i }));
  }

  it("after Auth success + active renter membership, navigates to /app/renter and does not signOut", async () => {
    signIn.mockResolvedValue({ error: null, session: signedInSession });
    refreshMemberships.mockResolvedValue([renterMembership]);
    // Client JWT present for pre-navigate coherence gate (RP-1.3.31).
    getSession.mockResolvedValue({ data: { session: signedInSession } });

    await submitPortalPassword();

    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith("/app/renter?tenant=hodan-properties", {
        replace: true,
      });
    });
    expect(refreshMemberships).toHaveBeenCalledWith("u1");
    expect(signOut).not.toHaveBeenCalled();
    expect(setActiveMembershipId).toHaveBeenCalledWith("mem-renter-1");
  });

  it("uses sign-in session for membership resolve; still requires client JWT before navigate", async () => {
    signIn.mockResolvedValue({ error: null, session: signedInSession });
    refreshMemberships.mockResolvedValue([renterMembership]);
    // First getSession inside resolve may be skipped (known session); gate before navigate uses client.
    getSession.mockResolvedValue({ data: { session: signedInSession } });

    await submitPortalPassword();

    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith("/app/renter?tenant=hodan-properties", {
        replace: true,
      });
    });
    expect(refreshMemberships).toHaveBeenCalledWith("u1");
    expect(signOut).not.toHaveBeenCalled();
  });

  it("does not navigate or signOut when client JWT is missing after successful resolve", async () => {
    signIn.mockResolvedValue({ error: null, session: signedInSession });
    refreshMemberships.mockResolvedValue([renterMembership]);
    getSession.mockResolvedValue({ data: { session: null } });

    await submitPortalPassword();

    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(navigate).not.toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
    expect(refreshMemberships).toHaveBeenCalledWith("u1");
  });

  it("does not signOut on transient no_session after Auth success", async () => {
    signIn.mockResolvedValue({ error: null, session: null });
    getSession.mockResolvedValue({ data: { session: null } });
    refreshMemberships.mockResolvedValue([renterMembership]);

    await submitPortalPassword();

    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(signOut).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
    expect(refreshMemberships).not.toHaveBeenCalled();
  });

  it("after Auth success but empty membership refresh, signs out and does not navigate", async () => {
    signIn.mockResolvedValue({ error: null, session: signedInSession });
    refreshMemberships.mockResolvedValue([]);

    await submitPortalPassword();

    await waitFor(() => expect(signOut).toHaveBeenCalled());
    expect(navigate).not.toHaveBeenCalled();
    expect(await screen.findByRole("alert")).toBeTruthy();
  });
});
