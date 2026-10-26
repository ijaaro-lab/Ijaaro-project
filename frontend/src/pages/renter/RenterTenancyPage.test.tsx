import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { RenterTenancyPage } from "./RenterTenancyPage";

const useAuth = vi.fn();
const from = vi.fn();

vi.mock("@/auth/AuthProvider", () => ({
  useAuth: () => useAuth(),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: (...args: unknown[]) => from(...args),
  },
}));

vi.mock("@/lib/propertyPhotos", () => ({
  fetchCoverPathsForProperties: vi.fn(async () => ({})),
  formatPropertyTypeLabel: (type: string) =>
    type ? type.charAt(0).toUpperCase() + type.slice(1) : "Property",
  createPropertyPhotoSignedUrl: vi.fn(async () => null),
}));

function chain(result: { data: unknown; error: null | { message: string } }) {
  const api: Record<string, unknown> = {};
  const self = () => api;
  api.select = self;
  api.eq = self;
  api.in = self;
  api.order = self;
  api.maybeSingle = () => Promise.resolve(result);
  api.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return api;
}

describe("RenterTenancyPage", () => {
  beforeEach(() => {
    useAuth.mockReset();
    from.mockReset();
    useAuth.mockReturnValue({
      user: { id: "renter-1" },
    });
  });

  it("shows not-found error when assignment is missing for this renter", async () => {
    from.mockImplementation(() => chain({ data: null, error: null }));

    render(
      <MemoryRouter initialEntries={["/app/renter/tenancy/missing"]}>
        <Routes>
          <Route path="/app/renter/tenancy/:id" element={<RenterTenancyPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText(/tenancy not found/i)).toBeTruthy();
    });
    expect(screen.getByRole("link", { name: /back to renter home/i })).toBeTruthy();
  });

  it("renders tenancy overview, empty schedule, and empty payment history from real scoped data", async () => {
    const assignment = {
      id: "asg-1",
      tenant_id: "ten-1",
      property_id: "prop-1",
      landlord_id: "ll-1",
      renter_id: "renter-1",
      rent_amount: 260,
      currency: "USD",
      due_day: 1,
      start_date: "2026-10-21",
      end_date: null,
      status: "active",
      notes: null,
      created_at: "2026-10-21T00:00:00Z",
      updated_at: "2026-10-21T00:00:00Z",
    };
    const property = {
      id: "prop-1",
      tenant_id: "ten-1",
      owner_id: "ll-1",
      current_renter_id: "renter-1",
      name: "Daarsalaam Villa",
      address_line: "Block 1",
      district: "Darusalam",
      city: null,
      property_type: "villa",
      description: null,
      rent_amount: 260,
      currency: "USD",
      status: "occupied",
      contact_phone: null,
      contact_email: null,
      created_by_tenant_id: null,
      created_source: "landlord",
      is_listed: true,
      created_at: "2026-10-01T00:00:00Z",
      updated_at: "2026-10-01T00:00:00Z",
    };

    from.mockImplementation((table: string) => {
      if (table === "rental_assignments") {
        return chain({ data: assignment, error: null });
      }
      if (table === "properties") {
        return chain({ data: property, error: null });
      }
      if (table === "rent_charges" || table === "rent_payments") {
        return chain({ data: [], error: null });
      }
      return chain({ data: null, error: null });
    });

    render(
      <MemoryRouter initialEntries={["/app/renter/tenancy/asg-1"]}>
        <Routes>
          <Route path="/app/renter/tenancy/:id" element={<RenterTenancyPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("Daarsalaam Villa")).toBeTruthy();
    });
    expect(screen.getByText("My tenancy")).toBeTruthy();
    expect(screen.getAllByText("Active").length).toBeGreaterThan(0);
    expect(screen.getByText(/no rent charges yet/i)).toBeTruthy();
    expect(screen.getByText(/no payments yet/i)).toBeTruthy();
    const paymentLinks = screen.getAllByRole("link", { name: /submit a rent payment/i });
    expect(paymentLinks.length).toBeGreaterThan(0);
    for (const link of paymentLinks) {
      expect(link).toHaveAttribute("href", "/app/renter/payments?assignment=asg-1");
    }
    expect(screen.getByRole("link", { name: /view payments/i })).toHaveAttribute(
      "href",
      "/app/renter/payments?assignment=asg-1",
    );
  });
});
