import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PropertyFormPage } from "./PropertyFormPage";

const authState = vi.hoisted(() => ({
  user: { id: "user-1" },
  activeMembership: {
    tenant_id: "tenant-1",
    role: "landlord_admin" as "landlord_admin" | "landlord_staff",
    tenant: { tenant_type: "landlord", name: "Acme Homes" },
  },
}));

const navigate = vi.fn();

vi.mock("@/auth/AuthProvider", () => ({
  useAuth: () => authState,
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => navigate,
  };
});

vi.mock("@/lib/propertyPhotos", () => ({
  createPropertyPhotoSignedUrl: vi.fn(async () => null),
  PROPERTY_PHOTO_SIGNED_URL_SECONDS: 3600,
}));

const from = vi.fn();
vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: (...args: unknown[]) => from(...args),
    storage: {
      from: () => ({
        upload: vi.fn(),
        remove: vi.fn(),
      }),
    },
  },
}));

const EXPECTED_DISTRICTS = [
  "Abdiaziz",
  "Bondhere",
  "Daynile",
  "Dharkenley",
  "Hamar Jajab",
  "Hamar Weyne",
  "Hodan",
  "Howlwadaag",
  "Heliwaa",
  "Karaan",
  "Kaxda",
  "Shangani",
  "Shibis",
  "Waberi",
  "Wadajir",
  "Wardhiigley",
  "Yaaqshiid",
  "Garasbaaley",
  "Gubadley",
  "Daarusalam",
];

function renderCreateForm() {
  return render(
    <MemoryRouter initialEntries={["/app/landlord/properties/new"]}>
      <Routes>
        <Route path="/app/landlord/properties/new" element={<PropertyFormPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

function mockInsertCapture() {
  const insertPayloads: Record<string, unknown>[] = [];
  const api: Record<string, unknown> = {};
  api.insert = vi.fn((payload: Record<string, unknown>) => {
    insertPayloads.push(payload);
    return api;
  });
  api.select = vi.fn(() => api);
  api.single = vi.fn(() => Promise.resolve({ data: { id: "prop-new" }, error: null }));
  from.mockImplementation(() => api);
  return { insertPayloads, api };
}

function optionValues(select: HTMLElement): string[] {
  return within(select)
    .getAllByRole("option")
    .map((opt) => (opt as HTMLOptionElement).value)
    .filter((v) => v !== "");
}

describe("PropertyFormPage — rooms and neighborhood", () => {
  beforeEach(() => {
    from.mockReset();
    navigate.mockReset();
    authState.activeMembership.role = "landlord_admin";
  });

  it("renders professional labels and placeholders for room, district, and neighborhood fields", () => {
    mockInsertCapture();
    renderCreateForm();

    expect(screen.getByLabelText(/^Number of Bedrooms$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Number of Kitchens$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Number of Bathrooms$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^District$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Neighborhood \(Xaafad\)/i)).toBeInTheDocument();

    expect(screen.getByLabelText(/^Number of Bedrooms$/i)).toHaveDisplayValue("Choose bedrooms");
    expect(screen.getByLabelText(/^Number of Kitchens$/i)).toHaveDisplayValue("Choose kitchens");
    expect(screen.getByLabelText(/^Number of Bathrooms$/i)).toHaveDisplayValue("Choose bathrooms");
    expect(screen.getByLabelText(/^District$/i)).toHaveDisplayValue("Choose a district");
    expect(screen.getByPlaceholderText("Enter neighborhood name")).toBeInTheDocument();
  });

  it("uses a District select with the 20 Mogadishu districts", () => {
    mockInsertCapture();
    renderCreateForm();

    const district = screen.getByLabelText(/^District$/i);
    expect(district.tagName).toBe("SELECT");
    expect(optionValues(district)).toEqual(EXPECTED_DISTRICTS);
  });

  it("uses Bedrooms, Kitchen, and Bathrooms selects with options 1–10", () => {
    mockInsertCapture();
    renderCreateForm();

    const expected = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"];
    for (const label of [
      /^Number of Bedrooms$/i,
      /^Number of Kitchens$/i,
      /^Number of Bathrooms$/i,
    ]) {
      const select = screen.getByLabelText(label);
      expect(select.tagName).toBe("SELECT");
      expect(optionValues(select)).toEqual(expected);
    }
  });

  it("includes district and room selects in the create payload", async () => {
    const { insertPayloads } = mockInsertCapture();
    renderCreateForm();

    fireEvent.change(screen.getByLabelText(/Address/i), {
      target: { value: "12 Lake Rd" },
    });
    fireEvent.change(screen.getByLabelText(/^District$/i), {
      target: { value: "Hodan" },
    });
    fireEvent.change(screen.getByLabelText(/^Number of Bedrooms$/i), {
      target: { value: "3" },
    });
    fireEvent.change(screen.getByLabelText(/^Number of Kitchens$/i), {
      target: { value: "1" },
    });
    fireEvent.change(screen.getByLabelText(/^Number of Bathrooms$/i), {
      target: { value: "2" },
    });
    fireEvent.change(screen.getByLabelText(/Neighborhood \(Xaafad\)/i), {
      target: { value: "Xamar Weyne" },
    });

    fireEvent.click(screen.getByRole("button", { name: /Create property/i }));

    await waitFor(() => {
      expect(insertPayloads.length).toBe(1);
    });

    expect(insertPayloads[0]).toMatchObject({
      address_line: "12 Lake Rd",
      district: "Hodan",
      bedrooms: 3,
      kitchens: 1,
      bathrooms: 2,
      neighborhood: "Xamar Weyne",
      tenant_id: "tenant-1",
      owner_id: "user-1",
    });
  });

  it("sends null for empty district, room counts, and neighborhood (no invented defaults)", async () => {
    const { insertPayloads } = mockInsertCapture();
    renderCreateForm();

    fireEvent.change(screen.getByLabelText(/Address/i), {
      target: { value: "12 Lake Rd" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Create property/i }));

    await waitFor(() => {
      expect(insertPayloads.length).toBe(1);
    });

    expect(insertPayloads[0]).toMatchObject({
      district: null,
      bedrooms: null,
      kitchens: null,
      bathrooms: null,
      neighborhood: null,
    });
  });
});
