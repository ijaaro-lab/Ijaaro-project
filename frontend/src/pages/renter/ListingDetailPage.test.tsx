import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ListingDetailPage } from "./ListingDetailPage";

const useAuth = vi.fn();
const rpc = vi.fn();

vi.mock("@/auth/AuthProvider", () => ({
  useAuth: () => useAuth(),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpc(...args),
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            order: async () => ({ data: [], error: null }),
          }),
        }),
      }),
    }),
    storage: {
      from: () => ({
        createSignedUrl: async () => ({ data: null, error: { message: "none" } }),
      }),
    },
  },
}));

const hodanDetail = {
  id: "b507f6d1-6962-43d7-b8ba-04abab2939cd",
  name: "Daarusalaam Villa – Block 1, Unit 4-A",
  district: "Daarusalam",
  city: "Mogadishu",
  property_type: "other",
  status: "available",
  rent_amount: 260,
  currency: "USD",
  address_line: "Darusalam",
  description: "Well maintained home",
  contact_phone: "615413872",
  contact_email: "inquiry@example.com",
  bedrooms: 4,
  kitchens: 1,
  bathrooms: 2,
  neighborhood: "Gubta",
};

function renderDetail(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/app/renter/browse/:id" element={<ListingDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ListingDetailPage tenant-scoped RPC (RP-1.3.32 F1)", () => {
  beforeEach(() => {
    useAuth.mockReset();
    rpc.mockReset();
  });

  it("calls get_landlord_public_listing with tenant key and property id", async () => {
    useAuth.mockReturnValue({
      activeMembership: {
        tenant_id: "tenant-hodan",
        tenant: { slug: "hodan-properties", subdomain: "hodan-properties" },
      },
    });
    rpc.mockResolvedValue({ data: [hodanDetail], error: null });

    renderDetail(`/app/renter/browse/${hodanDetail.id}?tenant=hodan-properties`);

    await waitFor(() => {
      expect(screen.getByText(/Daarusalaam Villa/i)).toBeTruthy();
    });

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("get_landlord_public_listing", {
      p_tenant_key: "hodan-properties",
      p_property_id: hodanDetail.id,
    });
    expect(rpc.mock.calls.some((c) => c[0] === "get_marketplace_listing")).toBe(false);
    expect(screen.getByText(/Darusalam/i)).toBeTruthy();
    expect(screen.getByText(/Well maintained home/i)).toBeTruthy();
    expect(screen.getByText(/^Bedrooms$/i)).toBeTruthy();
    expect(screen.getByText(/^Kitchens$/i)).toBeTruthy();
    expect(screen.getByText(/^Bathrooms$/i)).toBeTruthy();
    expect(screen.getByText(/^Neighborhood$/i)).toBeTruthy();
    expect(screen.getByText("4")).toBeTruthy();
    expect(screen.getByText("1")).toBeTruthy();
    expect(screen.getByText("2")).toBeTruthy();
    expect(screen.getByText("Gubta")).toBeTruthy();
    expect(screen.getByTestId("property-gallery-empty")).toBeTruthy();
  });

  it("shows em dash when room counts and neighborhood are missing", async () => {
    useAuth.mockReturnValue({
      activeMembership: {
        tenant_id: "tenant-hodan",
        tenant: { slug: "hodan-properties", subdomain: "hodan-properties" },
      },
    });
    rpc.mockResolvedValue({
      data: [
        {
          ...hodanDetail,
          bedrooms: null,
          kitchens: null,
          bathrooms: null,
          neighborhood: null,
        },
      ],
      error: null,
    });

    renderDetail(`/app/renter/browse/${hodanDetail.id}?tenant=hodan-properties`);

    await waitFor(() => {
      expect(screen.getByText(/Daarusalaam Villa/i)).toBeTruthy();
    });

    expect(screen.getByText(/^Bedrooms$/i)).toBeTruthy();
    expect(screen.getByText(/^Kitchens$/i)).toBeTruthy();
    expect(screen.getByText(/^Bathrooms$/i)).toBeTruthy();
    expect(screen.getByText(/^Neighborhood$/i)).toBeTruthy();
    expect(screen.queryByText("Gubta")).toBeNull();
    // Four missing fields render "—" (plus any other em dashes on the page).
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(4);
  });

  it("shows unavailable when cross-tenant property id returns empty", async () => {
    useAuth.mockReturnValue({
      activeMembership: {
        tenant_id: "tenant-hodan",
        tenant: { slug: "hodan-properties", subdomain: "hodan-properties" },
      },
    });
    rpc.mockResolvedValue({ data: [], error: null });

    renderDetail(
      "/app/renter/browse/d0a46190-398b-41e6-928d-b3e6f69347e1?tenant=hodan-properties",
    );

    await waitFor(() => {
      expect(screen.getByText(/This listing is unavailable/i)).toBeTruthy();
    });
    expect(rpc).toHaveBeenCalledWith("get_landlord_public_listing", {
      p_tenant_key: "hodan-properties",
      p_property_id: "d0a46190-398b-41e6-928d-b3e6f69347e1",
    });
    expect(rpc.mock.calls.some((c) => c[0] === "get_marketplace_listing")).toBe(false);
  });

  it("fails closed when tenant key is missing and never calls marketplace", async () => {
    useAuth.mockReturnValue({ activeMembership: null });
    renderDetail(`/app/renter/browse/${hodanDetail.id}`);

    await waitFor(() => {
      expect(screen.getByText(/Missing workspace/i)).toBeTruthy();
    });
    expect(rpc).not.toHaveBeenCalled();
  });
});
