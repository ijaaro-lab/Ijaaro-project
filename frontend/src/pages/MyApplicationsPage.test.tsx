import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { MyApplicationsPage } from "./MyApplicationsPage";

const signIn = vi.fn();
const refreshMemberships = vi.fn();
const setActiveMembershipId = vi.fn();
const useAuth = vi.fn();
const navigate = vi.fn();
const rpc = vi.fn();

vi.mock("@/lib/supabase", () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpc(...args),
  },
}));

vi.mock("@/auth/AuthProvider", () => ({
  useAuth: () => useAuth(),
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

function renderPage(path = "/my-applications?tenant=hodan-properties") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/my-applications" element={<MyApplicationsPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("MyApplicationsPage navigation (RP-1.3.22)", () => {
  beforeEach(() => {
    signIn.mockReset();
    refreshMemberships.mockReset();
    setActiveMembershipId.mockReset();
    navigate.mockReset();
    useAuth.mockReset();
    rpc.mockReset();
    rpc.mockResolvedValue({ data: [], error: null });
  });

  it("after successful sign-in as active renter, navigates to /app/renter?tenant=", async () => {
    useAuth.mockReturnValue({
      session: null,
      loading: false,
      signIn,
      user: null,
      memberships: [],
      refreshMemberships,
      setActiveMembershipId,
    });
    signIn.mockResolvedValue({ error: null });
    refreshMemberships.mockResolvedValue([renterMembership]);

    renderPage();
    fireEvent.change(screen.getByLabelText(/^email$/i), {
      target: { value: "renter@example.com" },
    });
    fireEvent.change(screen.getByLabelText(/^password$/i), {
      target: { value: "password1" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^sign in$/i }));

    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith("/app/renter?tenant=hodan-properties", {
        replace: true,
      });
    });
    expect(setActiveMembershipId).toHaveBeenCalledWith("mem-renter-1");
    expect(navigate.mock.calls[0][0]).not.toMatch(/^\/login/);
  });

  it("pending/rejected (no renter membership) stay on my-applications after sign-in", async () => {
    useAuth.mockReturnValue({
      session: null,
      loading: false,
      signIn,
      user: null,
      memberships: [],
      refreshMemberships,
      setActiveMembershipId,
    });
    signIn.mockResolvedValue({ error: null });
    refreshMemberships.mockResolvedValue([]);

    renderPage();
    fireEvent.change(screen.getByLabelText(/^email$/i), {
      target: { value: "pending@example.com" },
    });
    fireEvent.change(screen.getByLabelText(/^password$/i), {
      target: { value: "password1" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^sign in$/i }));

    await waitFor(() => expect(refreshMemberships).toHaveBeenCalled());
    expect(navigate).not.toHaveBeenCalled();
    expect(setActiveMembershipId).not.toHaveBeenCalled();
  });

  it("accepted Open portal CTA links to /app/renter?tenant=", async () => {
    rpc.mockResolvedValue({
      data: [
        {
          id: "app-1",
          tenant_id: "t1",
          property_id: "p1",
          requested_username: "ahmed",
          message: null,
          status: "accepted",
          reviewed_at: null,
          created_at: new Date().toISOString(),
          property_name: "Flat A",
          property_district: null,
          property_city: null,
        },
      ],
      error: null,
    });

    useAuth.mockReturnValue({
      session: { user: { id: "u1" } },
      loading: false,
      signIn,
      user: { id: "u1" },
      memberships: [renterMembership],
      refreshMemberships,
      setActiveMembershipId,
    });

    renderPage();

    expect(
      await screen.findByRole("heading", { name: /My Rental Applications/i }),
    ).toBeTruthy();
    expect(
      screen.getByText(/Review the rental applications you have submitted/i),
    ).toBeTruthy();

    const link = await screen.findByRole("link", { name: /open portal/i });
    expect(link).toHaveAttribute("href", "/app/renter?tenant=hodan-properties");
    expect(screen.getByText("accepted")).toBeTruthy();
    expect(screen.getByText("Flat A")).toBeTruthy();
  });

  it("shows empty-state browse CTA that preserves tenant and available-homes hash", async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    useAuth.mockReturnValue({
      session: { user: { id: "u1" } },
      loading: false,
      signIn,
      user: { id: "u1" },
      memberships: [],
      refreshMemberships,
      setActiveMembershipId,
    });

    renderPage();

    expect(await screen.findByTestId("applications-empty-state")).toBeTruthy();
    expect(
      screen.getByRole("heading", {
        name: /You haven’t submitted any rental applications yet/i,
      }),
    ).toBeTruthy();
    const browse = screen.getByRole("link", { name: /Browse Available Properties/i });
    expect(browse).toHaveAttribute("href", "/?tenant=hodan-properties#available-homes");
    expect(browse.tabIndex).not.toBe(-1);
  });

  it("keeps pending and rejected statuses unchanged on application cards", async () => {
    rpc.mockResolvedValue({
      data: [
        {
          id: "app-pending",
          tenant_id: "t1",
          property_id: "p1",
          requested_username: "sara",
          message: null,
          status: "pending",
          reviewed_at: null,
          created_at: new Date().toISOString(),
          property_name: "Unit B",
          property_district: "Hodan",
          property_city: "Mogadishu",
        },
        {
          id: "app-rejected",
          tenant_id: "t1",
          property_id: "p2",
          requested_username: "omar",
          message: null,
          status: "rejected",
          reviewed_at: null,
          created_at: new Date().toISOString(),
          property_name: "Unit C",
          property_district: null,
          property_city: null,
        },
      ],
      error: null,
    });
    useAuth.mockReturnValue({
      session: { user: { id: "u1" } },
      loading: false,
      signIn,
      user: { id: "u1" },
      memberships: [],
      refreshMemberships,
      setActiveMembershipId,
    });

    renderPage();

    expect(await screen.findByText("Unit B")).toBeTruthy();
    expect(screen.getByText("pending")).toBeTruthy();
    expect(screen.getByText("rejected")).toBeTruthy();
    expect(screen.getByRole("link", { name: /reapply/i })).toHaveAttribute(
      "href",
      "/apply?tenant=hodan-properties&property=p2",
    );
    expect(screen.getByRole("link", { name: /Back to workspace/i })).toHaveAttribute(
      "href",
      "/?tenant=hodan-properties",
    );
  });
});
