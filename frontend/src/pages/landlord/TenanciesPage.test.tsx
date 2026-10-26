import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { TenanciesPage } from "./TenanciesPage";

const rpc = vi.fn();
const from = vi.fn();
const useAuth = vi.fn();

vi.mock("@/lib/supabase", () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpc(...args),
    from: (...args: unknown[]) => from(...args),
  },
}));

vi.mock("@/lib/propertyPhotos", () => ({
  createPropertyPhotoSignedUrl: vi.fn(async () => null),
  fetchCoverPathsForProperties: vi.fn(async () => ({})),
}));

vi.mock("@/auth/AuthProvider", () => ({
  useAuth: () => useAuth(),
}));

const tenantId = "tenant-a";
const otherTenantId = "tenant-b";
const assignmentId = "65cb54fe-6620-4428-9efc-e6b653295a95";
const propertyId = "b507f6d1-6962-43d7-b8ba-04abab2939cd";
const renterId = "678a3c6b-9893-43e7-a0ae-fb1d582dbd29";

function listChain(result: { data: unknown; error: null | { message: string } }) {
  const api: Record<string, unknown> = {};
  const self = () => api;
  api.select = self;
  api.eq = self;
  api.order = () => Promise.resolve(result);
  api.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve);
  return api;
}

describe("TenanciesPage display", () => {
  beforeEach(() => {
    rpc.mockReset();
    from.mockReset();
    useAuth.mockReset();
    useAuth.mockReturnValue({
      activeMembership: {
        tenant_id: tenantId,
        role: "landlord_admin",
        tenant: { tenant_type: "landlord" },
      },
    });
  });

  it("shows renter and property names as primary labels with short ids secondary", async () => {
    from.mockImplementation((table: string) => {
      if (table === "rental_assignments") {
        return listChain({
          data: [
            {
              id: assignmentId,
              tenant_id: tenantId,
              property_id: propertyId,
              renter_id: renterId,
              rent_amount: 260,
              currency: "USD",
              start_date: "2026-10-21",
              end_date: null,
              status: "active",
            },
          ],
          error: null,
        });
      }
      if (table === "properties") {
        return listChain({
          data: [{ id: propertyId, name: "Daarusalaam Villa", address_line: "Block 1" }],
          error: null,
        });
      }
      return listChain({ data: [], error: null });
    });
    rpc.mockImplementation((fn: string, args: { p_tenant_id: string }) => {
      expect(fn).toBe("list_same_tenant_member_profiles");
      expect(args.p_tenant_id).toBe(tenantId);
      return Promise.resolve({
        data: [{ user_id: renterId, full_name: "Som Via", email: "som@example.com" }],
        error: null,
      });
    });

    render(
      <MemoryRouter>
        <TenanciesPage />
      </MemoryRouter>,
    );

    expect((await screen.findAllByRole("link", { name: "Som Via" })).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Daarusalaam Villa").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/65cb54fe… · property b507f6d1…/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/^Property b507f6d1/)).not.toBeInTheDocument();
  });

  it("falls back when property or renter related records are missing", async () => {
    from.mockImplementation((table: string) => {
      if (table === "rental_assignments") {
        return listChain({
          data: [
            {
              id: assignmentId,
              tenant_id: tenantId,
              property_id: propertyId,
              renter_id: renterId,
              rent_amount: 100,
              currency: "USD",
              start_date: "2026-10-01",
              end_date: null,
              status: "completed",
            },
          ],
          error: null,
        });
      }
      if (table === "properties") {
        return listChain({ data: [], error: null });
      }
      return listChain({ data: [], error: null });
    });
    rpc.mockResolvedValue({ data: [], error: null });

    render(
      <MemoryRouter>
        <TenanciesPage />
      </MemoryRouter>,
    );

    expect((await screen.findAllByRole("link", { name: "Unknown renter" })).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Unknown property").length).toBeGreaterThan(0);
  });

  it("renders View, Edit, and Delete action controls for each tenancy", async () => {
    from.mockImplementation((table: string) => {
      if (table === "rental_assignments") {
        return listChain({
          data: [
            {
              id: assignmentId,
              tenant_id: tenantId,
              property_id: propertyId,
              renter_id: renterId,
              rent_amount: 260,
              currency: "USD",
              start_date: "2026-10-21",
              end_date: null,
              status: "active",
            },
          ],
          error: null,
        });
      }
      if (table === "properties") {
        return listChain({
          data: [{ id: propertyId, name: "Daarusalaam Villa", address_line: "Block 1" }],
          error: null,
        });
      }
      return listChain({ data: [], error: null });
    });
    rpc.mockResolvedValue({
      data: [{ user_id: renterId, full_name: "Som Via", email: "som@example.com" }],
      error: null,
    });

    render(
      <MemoryRouter>
        <TenanciesPage />
      </MemoryRouter>,
    );

    expect(
      (await screen.findAllByRole("link", { name: /view tenancy/i })).length,
    ).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: /edit tenancy/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: /end tenancy/i }).length).toBeGreaterThan(0);
  });

  it("scopes assignment and property queries to the active tenant", async () => {
    const eqSpy = vi.fn();
    from.mockImplementation((table: string) => {
      const api: Record<string, unknown> = {};
      const self = () => api;
      api.select = self;
      api.eq = (col: string, val: string) => {
        eqSpy(table, col, val);
        return api;
      };
      api.order = () => Promise.resolve({ data: [], error: null });
      api.then = (resolve: (v: unknown) => unknown) =>
        Promise.resolve({ data: [], error: null }).then(resolve);
      return api;
    });
    rpc.mockResolvedValue({ data: [], error: null });

    render(
      <MemoryRouter>
        <TenanciesPage />
      </MemoryRouter>,
    );

    await waitFor(() => expect(rpc).toHaveBeenCalled());
    expect(eqSpy).toHaveBeenCalledWith("rental_assignments", "tenant_id", tenantId);
    expect(eqSpy).toHaveBeenCalledWith("properties", "tenant_id", tenantId);
    expect(eqSpy).not.toHaveBeenCalledWith("rental_assignments", "tenant_id", otherTenantId);
    expect(rpc).toHaveBeenCalledWith("list_same_tenant_member_profiles", {
      p_tenant_id: tenantId,
    });
  });
});
