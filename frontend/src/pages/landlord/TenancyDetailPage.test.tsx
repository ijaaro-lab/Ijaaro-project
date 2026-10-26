import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { TenancyDetailPage } from "./TenancyDetailPage";

const rpc = vi.fn();
const from = vi.fn();
const useAuth = vi.fn();
const fetchCoverPathsForProperties = vi.fn();
const createPropertyPhotoSignedUrl = vi.fn();

vi.mock("@/lib/supabase", () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpc(...args),
    from: (...args: unknown[]) => from(...args),
  },
}));

vi.mock("@/auth/AuthProvider", () => ({
  useAuth: () => useAuth(),
}));

vi.mock("@/lib/propertyPhotos", () => ({
  fetchCoverPathsForProperties: (...args: unknown[]) => fetchCoverPathsForProperties(...args),
  createPropertyPhotoSignedUrl: (...args: unknown[]) => createPropertyPhotoSignedUrl(...args),
}));

const tenantId = "tenant-a";
const assignmentId = "65cb54fe-6620-4428-9efc-e6b653295a95";
const propertyId = "b507f6d1-6962-43d7-b8ba-04abab2939cd";
const renterId = "678a3c6b-9893-43e7-a0ae-fb1d582dbd29";

type Result = { data: unknown; error: null | { message: string } };

function makeQuery(final: Result, onEq?: (col: string, val: string) => void) {
  const api: Record<string, unknown> = {};
  const self = () => api;
  api.select = self;
  api.eq = (col: string, val: string) => {
    onEq?.(col, val);
    return api;
  };
  api.order = () => Promise.resolve(final);
  api.maybeSingle = () => Promise.resolve(final);
  api.then = (resolve: (v: unknown) => unknown) => Promise.resolve(final).then(resolve);
  return api;
}

function renderDetail() {
  return render(
    <MemoryRouter initialEntries={[`/app/landlord/tenancies/${assignmentId}`]}>
      <Routes>
        <Route path="/app/landlord/tenancies/:id" element={<TenancyDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

function mockActiveTenancyQueries() {
  from.mockImplementation((table: string) => {
    if (table === "rental_assignments") {
      return makeQuery({
        data: {
          id: assignmentId,
          tenant_id: tenantId,
          property_id: propertyId,
          renter_id: renterId,
          rent_amount: 260,
          currency: "USD",
          due_day: 1,
          start_date: "2026-10-21",
          end_date: null,
          status: "active",
        },
        error: null,
      });
    }
    if (table === "properties") {
      return makeQuery({
        data: { id: propertyId, name: "Daarusalaam Villa", address_line: "Block 1" },
        error: null,
      });
    }
    if (table === "rent_charges" || table === "rent_payments") {
      return makeQuery({ data: [], error: null });
    }
    return makeQuery({ data: null, error: null });
  });
  rpc.mockResolvedValue({
    data: [{ user_id: renterId, full_name: "Som Via", email: "som@example.com" }],
    error: null,
  });
}

describe("TenancyDetailPage display", () => {
  beforeEach(() => {
    rpc.mockReset();
    from.mockReset();
    useAuth.mockReset();
    fetchCoverPathsForProperties.mockReset();
    createPropertyPhotoSignedUrl.mockReset();
    fetchCoverPathsForProperties.mockResolvedValue({});
    createPropertyPhotoSignedUrl.mockResolvedValue(null);
    useAuth.mockReturnValue({
      activeMembership: {
        tenant_id: tenantId,
        role: "landlord_admin",
        tenant: { tenant_type: "landlord" },
      },
    });
  });

  it("shows renter and property names as primary labels", async () => {
    const assignmentEqs: Array<[string, string]> = [];
    from.mockImplementation((table: string) => {
      if (table === "rental_assignments") {
        return makeQuery(
          {
            data: {
              id: assignmentId,
              tenant_id: tenantId,
              property_id: propertyId,
              renter_id: renterId,
              rent_amount: 260,
              currency: "USD",
              due_day: 1,
              start_date: "2026-10-21",
              end_date: null,
              status: "active",
            },
            error: null,
          },
          (col, val) => assignmentEqs.push([col, val]),
        );
      }
      if (table === "properties") {
        return makeQuery({
          data: { id: propertyId, name: "Daarusalaam Villa", address_line: "Block 1" },
          error: null,
        });
      }
      if (table === "rent_charges" || table === "rent_payments") {
        return makeQuery({ data: [], error: null });
      }
      return makeQuery({ data: null, error: null });
    });
    rpc.mockResolvedValue({
      data: [{ user_id: renterId, full_name: "Som Via", email: "som@example.com" }],
      error: null,
    });

    renderDetail();

    expect(await screen.findByRole("heading", { name: "Som Via" })).toBeInTheDocument();
    expect(screen.getAllByText("Daarusalaam Villa").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole("link", { name: "Daarusalaam Villa" })).toHaveAttribute(
      "href",
      `/app/landlord/properties/${propertyId}`,
    );
    expect(screen.getByText(/Tenancy 65cb54fe… · property b507f6d1…/)).toBeInTheDocument();
    expect(assignmentEqs).toEqual([
      ["id", assignmentId],
      ["tenant_id", tenantId],
    ]);
    expect(rpc).toHaveBeenCalledWith("list_same_tenant_member_profiles", {
      p_tenant_id: tenantId,
    });
    expect(fetchCoverPathsForProperties).toHaveBeenCalledWith(tenantId, [propertyId]);
    expect(screen.getByRole("img", { name: /Daarusalaam Villa thumbnail/i })).toBeInTheDocument();
  });

  it("renders the property cover image when a cover path is available", async () => {
    const coverPath = `${tenantId}/${propertyId}/cover.jpg`;
    mockActiveTenancyQueries();
    fetchCoverPathsForProperties.mockResolvedValue({ [propertyId]: coverPath });
    createPropertyPhotoSignedUrl.mockResolvedValue("https://cdn.example/signed-cover.jpg");

    renderDetail();

    const img = await screen.findByRole("img", { name: "Daarusalaam Villa" });
    expect(img).toHaveAttribute("src", "https://cdn.example/signed-cover.jpg");
    expect(createPropertyPhotoSignedUrl).toHaveBeenCalledWith(coverPath);
  });

  it("falls back when related property or renter is missing", async () => {
    from.mockImplementation((table: string) => {
      if (table === "rental_assignments") {
        return makeQuery({
          data: {
            id: assignmentId,
            tenant_id: tenantId,
            property_id: propertyId,
            renter_id: renterId,
            rent_amount: 100,
            currency: "USD",
            due_day: null,
            start_date: "2026-10-01",
            end_date: "2026-10-10",
            status: "completed",
          },
          error: null,
        });
      }
      if (table === "properties") {
        return makeQuery({ data: null, error: null });
      }
      return makeQuery({ data: [], error: null });
    });
    rpc.mockResolvedValue({ data: [], error: null });

    renderDetail();

    expect(await screen.findByRole("heading", { name: "Unknown renter" })).toBeInTheDocument();
    expect(screen.getAllByText("Unknown property").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole("img", { name: /Unknown property thumbnail/i })).toBeInTheDocument();
  });

  it("does not load a foreign-tenant assignment for the active workspace", async () => {
    from.mockImplementation((table: string) => {
      if (table === "rental_assignments") {
        return makeQuery({ data: null, error: null });
      }
      return makeQuery({ data: [], error: null });
    });
    rpc.mockResolvedValue({ data: [], error: null });

    renderDetail();

    expect(await screen.findByText(/tenancy not found or unauthorized/i)).toBeInTheDocument();
    await waitFor(() => expect(from).toHaveBeenCalledWith("rental_assignments"));
    expect(rpc).not.toHaveBeenCalled();
    expect(fetchCoverPathsForProperties).not.toHaveBeenCalled();
  });
});
