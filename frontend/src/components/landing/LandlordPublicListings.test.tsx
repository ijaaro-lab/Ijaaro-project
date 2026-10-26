import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { LandlordPublicListings } from "./LandlordPublicListings";

const rpc = vi.fn();
const fetchPublicListingCovers = vi.fn();

vi.mock("@/lib/supabase", () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpc(...args),
  },
}));

vi.mock("@/lib/publicListingPhotos", () => ({
  fetchPublicListingCovers: (...args: unknown[]) => fetchPublicListingCovers(...args),
}));

const listing = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Guriga Abdirahman",
  district: "Daarusalam",
  city: "Mogadishu",
  property_type: "house",
  status: "available",
  rent_amount: 270,
  currency: "USD",
};

function renderListings(tenantKey = "hodan-properties") {
  return render(
    <MemoryRouter>
      <LandlordPublicListings tenantKey={tenantKey} accent="#1fa85a" />
    </MemoryRouter>,
  );
}

describe("LandlordPublicListings", () => {
  beforeEach(() => {
    rpc.mockReset();
    fetchPublicListingCovers.mockReset();
    fetchPublicListingCovers.mockResolvedValue({});
  });

  it("calls list_landlord_public_listings with the tenant key only", async () => {
    rpc.mockResolvedValue({ data: [listing], error: null });
    renderListings();

    await waitFor(() => {
      expect(screen.getByText("Guriga Abdirahman")).toBeTruthy();
    });

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("list_landlord_public_listings", {
      p_tenant_key: "hodan-properties",
    });
    expect(rpc.mock.calls.some((c) => c[0] === "list_marketplace_listings")).toBe(false);
  });

  it("batches cover photo requests and renders the returned cover URL", async () => {
    rpc.mockResolvedValue({ data: [listing], error: null });
    fetchPublicListingCovers.mockResolvedValue({
      [listing.id]: "https://cdn.example/cover.jpg",
    });
    renderListings();

    await waitFor(() => {
      expect(screen.getByText("Guriga Abdirahman")).toBeTruthy();
    });

    await waitFor(() => {
      expect(fetchPublicListingCovers).toHaveBeenCalledWith("hodan-properties", [listing.id]);
    });

    await waitFor(() => {
      const img = screen.getByRole("img", { name: /Guriga Abdirahman cover photo/i });
      expect(img).toHaveAttribute("src", "https://cdn.example/cover.jpg");
    });

    expect(screen.getByText(/Daarusalam,\s*Mogadishu/i)).toBeTruthy();
    expect(screen.getByText("House")).toBeTruthy();
    expect(screen.getByText(/\$270/)).toBeTruthy();
    expect(screen.getByText("available")).toBeTruthy();
    expect(document.getElementById("available-homes")).toBeTruthy();
  });

  it("falls back to the placeholder when no cover URL is returned", async () => {
    rpc.mockResolvedValue({ data: [listing], error: null });
    fetchPublicListingCovers.mockResolvedValue({});
    renderListings();

    await waitFor(() => {
      expect(screen.getByLabelText(/No photo available/i)).toBeTruthy();
    });
  });

  it("keeps tenant context on detail and apply links", async () => {
    rpc.mockResolvedValue({ data: [listing], error: null });
    renderListings();

    await waitFor(() => {
      expect(screen.getByRole("link", { name: /View details/i })).toBeTruthy();
    });

    expect(screen.getByRole("link", { name: /View details/i })).toHaveAttribute(
      "href",
      `/listings/${listing.id}?tenant=hodan-properties`,
    );
    expect(screen.getByRole("link", { name: /Apply to Rent/i })).toHaveAttribute(
      "href",
      `/apply?tenant=hodan-properties&property=${listing.id}`,
    );
  });

  it("shows empty and error states without calling cover photo APIs", async () => {
    rpc.mockResolvedValueOnce({ data: [], error: null });
    const { unmount } = renderListings();
    await waitFor(() => {
      expect(screen.getByText(/No published available properties/i)).toBeTruthy();
    });
    expect(fetchPublicListingCovers).not.toHaveBeenCalled();
    unmount();

    rpc.mockResolvedValueOnce({ data: null, error: { message: "boom" } });
    renderListings();
    await waitFor(() => {
      expect(screen.getByText(/Could not load listings/i)).toBeTruthy();
      expect(screen.getByText(/boom/i)).toBeTruthy();
    });
    expect(fetchPublicListingCovers).not.toHaveBeenCalled();
  });
});
