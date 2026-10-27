import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { StaffDashboard } from "./StaffDashboard";

const authState = vi.hoisted(() => ({
  user: { id: "user-1" },
  profile: { full_name: "Sam Staff", email: "sam@example.com" },
  activeMembership: {
    tenant_id: "tenant-1",
    role: "landlord_staff" as const,
    tenant: { tenant_type: "landlord", name: "Acme Homes" },
  },
}));

vi.mock("@/auth/AuthProvider", () => ({
  useAuth: () => authState,
}));

const from = vi.fn();
vi.mock("@/lib/supabase", () => ({
  supabase: { from: (...args: unknown[]) => from(...args) },
}));

function chain(data: unknown, error: unknown = null) {
  const result = { data, error };
  const api: Record<string, unknown> = {};
  api.select = vi.fn(() => api);
  api.eq = vi.fn(() => api);
  api.order = vi.fn(() => Promise.resolve(result));
  return api;
}

describe("StaffDashboard", () => {
  beforeEach(() => {
    from.mockReset();
    authState.activeMembership.role = "landlord_staff";
  });

  it("shows property metrics and create action for staff", async () => {
    from.mockImplementation(() =>
      chain([
        {
          id: "p1",
          name: "Unit A",
          address_line: "1 Main",
          owner_id: "user-1",
          is_listed: true,
          status: "available",
          rent_amount: 100,
          currency: "USD",
          district: "Central",
          city: null,
        },
      ]),
    );

    render(
      <MemoryRouter>
        <StaffDashboard />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("Unit A")).toBeInTheDocument();
    });
    expect(screen.getByRole("link", { name: /Create property/i })).toHaveAttribute(
      "href",
      "/app/landlord/properties/new",
    );
    expect(screen.getByText("Properties")).toBeInTheDocument();
    expect(screen.getAllByText("Published").length).toBeGreaterThan(0);
  });

  it("blocks non-staff memberships", () => {
    from.mockImplementation(() => chain([]));
    (authState.activeMembership as { role: string }).role = "landlord_admin";
    render(
      <MemoryRouter>
        <StaffDashboard />
      </MemoryRouter>,
    );
    expect(
      screen.getByText(/Staff dashboard is available for landlord staff/i),
    ).toBeInTheDocument();
  });
});
