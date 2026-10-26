import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { BrowseListingsPage } from "./BrowseListingsPage";

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
          in: () => ({
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

const hodanListing = {
  id: "b507f6d1-6962-43d7-b8ba-04abab2939cd",
  name: "Daarusalaam Villa – Block 1, Unit 4-A",
  district: "Daarusalam",
  city: "Mogadishu",
  property_type: "other",
  status: "available",
  rent_amount: 260,
  currency: "USD",
};

describe("BrowseListingsPage tenant-scoped RPC (RP-1.3.32 F1)", () => {
  beforeEach(() => {
    useAuth.mockReset();
    rpc.mockReset();
  });

  it("calls list_landlord_public_listings with hodan-properties and never marketplace", async () => {
    useAuth.mockReturnValue({
      activeMembership: {
        tenant_id: "tenant-hodan",
        tenant: { slug: "hodan-properties", subdomain: "hodan-properties" },
      },
    });
    rpc.mockResolvedValue({ data: [hodanListing], error: null });

    render(
      <MemoryRouter initialEntries={["/app/renter/browse?tenant=hodan-properties"]}>
        <BrowseListingsPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText(/Daarusalaam Villa/i)).toBeTruthy();
    });

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("list_landlord_public_listings", {
      p_tenant_key: "hodan-properties",
    });
    expect(rpc.mock.calls.some((c) => c[0] === "list_marketplace_listings")).toBe(false);

    const link = screen.getByRole("link", { name: /Daarusalaam Villa/i });
    expect(link.getAttribute("href")).toBe(
      `/app/renter/browse/${hodanListing.id}`,
    );
    expect(screen.getByLabelText(/No photo available/i)).toBeTruthy();
    expect(screen.getByTestId("browse-result-count").textContent).toMatch(/1 property/i);
  });

  it("fails closed when tenant key is missing and never calls marketplace", async () => {
    useAuth.mockReturnValue({ activeMembership: null });
    render(
      <MemoryRouter initialEntries={["/app/renter/browse"]}>
        <BrowseListingsPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText(/Missing workspace/i)).toBeTruthy();
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("applies client district filter without changing RPC", async () => {
    useAuth.mockReturnValue({
      activeMembership: {
        tenant_id: "tenant-hodan",
        tenant: { slug: "hodan-properties", subdomain: "hodan-properties" },
      },
    });
    rpc.mockResolvedValue({
      data: [
        hodanListing,
        {
          ...hodanListing,
          id: "other-id",
          name: "Other Unit",
          district: "Wadajir",
        },
      ],
      error: null,
    });

    render(
      <MemoryRouter initialEntries={["/app/renter/browse?tenant=hodan-properties"]}>
        <BrowseListingsPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText(/Daarusalaam Villa/i)).toBeTruthy();
    });

    fireEvent.change(screen.getByPlaceholderText(/District/i), {
      target: { value: "Daarusalam" },
    });

    await waitFor(() => {
      expect(screen.getByText(/Daarusalaam Villa/i)).toBeTruthy();
      expect(screen.queryByText(/Other Unit/i)).toBeNull();
    });
    expect(rpc).toHaveBeenCalledWith("list_landlord_public_listings", {
      p_tenant_key: "hodan-properties",
    });
  });
});
