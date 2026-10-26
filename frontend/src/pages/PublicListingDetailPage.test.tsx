import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { PublicListingDetailPage } from "./PublicListingDetailPage";

const rpc = vi.fn();
const from = vi.fn();
const createSignedUrl = vi.fn();
const fetchPublicListingGallery = vi.fn();

vi.mock("@/lib/supabase", () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpc(...args),
    from: (...args: unknown[]) => from(...args),
    storage: {
      from: () => ({
        createSignedUrl: (...args: unknown[]) => createSignedUrl(...args),
      }),
    },
  },
}));

vi.mock("@/lib/publicListingPhotos", () => ({
  fetchPublicListingGallery: (...args: unknown[]) => fetchPublicListingGallery(...args),
}));

vi.mock("@/lib/propertyPhotos", async () => {
  const actual = await vi.importActual<typeof import("@/lib/propertyPhotos")>(
    "@/lib/propertyPhotos",
  );
  return {
    ...actual,
    fetchPropertyPhotoRows: vi.fn(async () => {
      throw new Error("fetchPropertyPhotoRows must not be called from public detail");
    }),
    createPropertyPhotoSignedUrl: vi.fn(async () => {
      throw new Error("createPropertyPhotoSignedUrl must not be called from public detail");
    }),
    fetchCoverPathsForProperties: vi.fn(async () => {
      throw new Error("fetchCoverPathsForProperties must not be called from public detail");
    }),
  };
});

const listing = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Guriga Abdirahman",
  district: "Daarusalam",
  city: "Mogadishu",
  neighborhood: "Xamar Weyne",
  bedrooms: 4,
  kitchens: 1,
  bathrooms: 2,
  property_type: "house",
  status: "available",
  rent_amount: 270,
  currency: "USD",
  address_line: "Daarusalam Road",
  description: "A quiet family home.",
  contact_phone: "615413872",
  contact_email: "inquiry@example.com",
};

function renderDetail(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/listings/:id" element={<PublicListingDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("PublicListingDetailPage", () => {
  beforeEach(() => {
    rpc.mockReset();
    from.mockReset();
    createSignedUrl.mockReset();
    fetchPublicListingGallery.mockReset();
    fetchPublicListingGallery.mockResolvedValue([]);
  });

  it("renders gallery URLs from the public photo function and never uses private helpers", async () => {
    rpc.mockResolvedValue({ data: [listing], error: null });
    fetchPublicListingGallery.mockResolvedValue([
      {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        url: "https://cdn.example/one.jpg",
        sort_order: 0,
      },
      {
        id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        url: "https://cdn.example/two.jpg",
        sort_order: 1,
      },
    ]);
    renderDetail(`/listings/${listing.id}?tenant=hodan-properties`);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Guriga Abdirahman" })).toBeTruthy();
    });

    expect(rpc).toHaveBeenCalledWith("get_landlord_public_listing", {
      p_tenant_key: "hodan-properties",
      p_property_id: listing.id,
    });
    expect(from).not.toHaveBeenCalled();
    expect(createSignedUrl).not.toHaveBeenCalled();

    await waitFor(() => {
      expect(fetchPublicListingGallery).toHaveBeenCalledWith("hodan-properties", listing.id);
    });

    await waitFor(() => {
      expect(screen.getByTestId("property-gallery")).toBeTruthy();
      expect(screen.getByRole("img", { name: /Guriga Abdirahman/i })).toHaveAttribute(
        "src",
        "https://cdn.example/one.jpg",
      );
    });

    expect(screen.getByText(/\$270/)).toBeTruthy();
    expect(screen.getByText(/Daarusalam,\s*Mogadishu\s*·\s*Xaafadda Xamar Weyne/i)).toBeTruthy();
    expect(screen.getByText("Daarusalam Road")).toBeTruthy();
    expect(screen.getByText("A quiet family home.")).toBeTruthy();
    expect(screen.getAllByText("House").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Available").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("4 qol")).toBeTruthy();
    expect(screen.getAllByText("Xamar Weyne").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Tirada qolalka jiifka")).toBeTruthy();
    expect(screen.getByText("Sharaxaadda guriga")).toBeTruthy();

    expect(
      screen.getByRole("link", { name: /Back to available properties/i }),
    ).toHaveAttribute("href", "/?tenant=hodan-properties#available-homes");

    expect(screen.getByRole("link", { name: /Apply to Rent/i })).toHaveAttribute(
      "href",
      `/apply?tenant=hodan-properties&property=${listing.id}`,
    );

    expect(screen.getByRole("link", { name: "615413872" })).toHaveAttribute(
      "href",
      "tel:615413872",
    );
    expect(screen.getByRole("link", { name: "inquiry@example.com" })).toHaveAttribute(
      "href",
      "mailto:inquiry@example.com",
    );
  });

  it("shows Lama sheegin for missing room counts and location fields (not 0)", async () => {
    rpc.mockResolvedValue({
      data: [
        {
          ...listing,
          neighborhood: null,
          bedrooms: null,
          kitchens: null,
          bathrooms: null,
          district: null,
          description: null,
        },
      ],
      error: null,
    });
    renderDetail(`/listings/${listing.id}?tenant=hodan-properties`);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Guriga Abdirahman" })).toBeTruthy();
    });

    expect(screen.getAllByText(/Mogadishu/i).length).toBeGreaterThanOrEqual(1);
    // Header location omits Xaafadda when neighborhood is missing (label still exists in details grid).
    expect(screen.queryByText(/·\s*Xaafadda/i)).toBeNull();
    expect(screen.getAllByText("Lama sheegin").length).toBeGreaterThanOrEqual(4);
    expect(screen.queryByText("0 qol")).toBeNull();
  });

  it("shows the gallery placeholder when no public photos are returned", async () => {
    rpc.mockResolvedValue({ data: [listing], error: null });
    fetchPublicListingGallery.mockResolvedValue([]);
    renderDetail(`/listings/${listing.id}?tenant=hodan-properties`);

    await waitFor(() => {
      expect(screen.getByTestId("property-gallery-empty")).toBeTruthy();
      expect(screen.getByLabelText(/No photo available/i)).toBeTruthy();
    });
  });

  it("does not request photos when the listing is unavailable", async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    renderDetail(`/listings/${listing.id}?tenant=hodan-properties`);

    await waitFor(() => {
      expect(screen.getByText(/This listing is not available/i)).toBeTruthy();
    });
    expect(fetchPublicListingGallery).not.toHaveBeenCalled();
  });

  it("omits inquiry contacts when phone and email are absent", async () => {
    rpc.mockResolvedValue({
      data: [
        {
          ...listing,
          contact_phone: null,
          contact_email: null,
        },
      ],
      error: null,
    });
    renderDetail(`/listings/${listing.id}?tenant=hodan-properties`);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Guriga Abdirahman" })).toBeTruthy();
    });

    expect(screen.queryByRole("heading", { name: /Inquiry contact/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /tel:/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /mailto:/i })).toBeNull();
  });
});
