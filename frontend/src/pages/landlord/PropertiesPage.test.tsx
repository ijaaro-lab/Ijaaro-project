import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  formatPropertyDeleteFailure,
  isPropertyDeletable,
  PropertiesPage,
  propertyDeleteBlockedMessage,
} from "./PropertiesPage";
import type { Property } from "@/types/database";

const authState = vi.hoisted(() => ({
  activeMembership: {
    tenant_id: "tenant-1",
    role: "landlord_admin" as "landlord_admin" | "landlord_staff",
    tenant: { tenant_type: "landlord", name: "Acme Homes" },
  },
}));

vi.mock("@/auth/AuthProvider", () => ({
  useAuth: () => authState,
}));

vi.mock("@/lib/propertyPhotos", () => ({
  createPropertyPhotoSignedUrl: vi.fn(async () => null),
  fetchCoverPathsForProperties: vi.fn(async () => ({})),
}));

const from = vi.fn();
vi.mock("@/lib/supabase", () => ({
  supabase: { from: (...args: unknown[]) => from(...args) },
}));

const baseProperty = {
  id: "prop-1",
  tenant_id: "tenant-1",
  owner_id: "user-1",
  current_renter_id: null as string | null,
  name: "Sunset Flat",
  address_line: "12 Lake Rd",
  district: "Central",
  city: "Nairobi",
  neighborhood: null as string | null,
  bedrooms: null as number | null,
  kitchens: null as number | null,
  bathrooms: null as number | null,
  property_type: "apartment" as const,
  description: null,
  rent_amount: 500,
  currency: "USD",
  status: "available" as const,
  contact_phone: null,
  contact_email: null,
  created_by_tenant_id: "tenant-1",
  created_source: "landlord",
  is_listed: true,
  created_at: "2026-10-01T00:00:00.000Z",
  updated_at: "2026-10-01T00:00:00.000Z",
};

function asProperty(overrides: Partial<Property> = {}): Property {
  return { ...baseProperty, ...overrides };
}

/** Mock properties table: list via select/eq/order; delete via delete/eq/eq/select. */
function mockPropertiesTable(options: {
  list: Property[];
  onDelete?: () => { data: unknown; error: unknown };
}) {
  let deleteStarted = false;
  const deleteEqArgs: unknown[][] = [];
  const deleteFn = vi.fn(() => {
    deleteStarted = true;
    return api;
  });

  const api: Record<string, unknown> = {};
  api.select = vi.fn(() => {
    if (deleteStarted) {
      return Promise.resolve(options.onDelete?.() ?? { data: [{ id: "prop-1" }], error: null });
    }
    return api;
  });
  api.eq = vi.fn((...args: unknown[]) => {
    if (deleteStarted) deleteEqArgs.push(args);
    return api;
  });
  api.order = vi.fn(() => Promise.resolve({ data: options.list, error: null }));
  api.delete = deleteFn;

  from.mockImplementation(() => api);
  return { deleteFn, deleteEqArgs };
}

async function openActionsMenu() {
  // Mobile + desktop layouts both render actions; jsdom does not apply Tailwind breakpoints.
  const buttons = await waitFor(() => {
    const found = screen.getAllByRole("button", { name: /Property actions/i });
    expect(found.length).toBeGreaterThan(0);
    return found;
  });
  fireEvent.click(buttons[0]!);
  return screen.getByRole("menu");
}

describe("isPropertyDeletable / delete messaging", () => {
  it("allows vacant available properties without a current renter", () => {
    expect(isPropertyDeletable(asProperty())).toBe(true);
    expect(isPropertyDeletable(asProperty({ status: "vacant" }))).toBe(true);
  });

  it("blocks occupied or currently rented properties", () => {
    expect(
      isPropertyDeletable(asProperty({ status: "occupied", current_renter_id: "renter-1" })),
    ).toBe(false);
    expect(isPropertyDeletable(asProperty({ current_renter_id: "renter-1" }))).toBe(false);
    expect(propertyDeleteBlockedMessage(asProperty({ status: "occupied" }))).toMatch(/occupied/i);
  });

  it("formats FK and empty-result delete failures", () => {
    expect(formatPropertyDeleteFailure("violates foreign key constraint", 0)).toMatch(
      /related records/i,
    );
    expect(formatPropertyDeleteFailure(null, 0)).toMatch(/could not delete/i);
  });
});

describe("PropertiesPage delete action", () => {
  beforeEach(() => {
    from.mockReset();
    authState.activeMembership.role = "landlord_admin";
    authState.activeMembership.tenant_id = "tenant-1";
  });

  it("shows Delete for landlord_admin", async () => {
    mockPropertiesTable({ list: [asProperty()] });
    render(
      <MemoryRouter>
        <PropertiesPage />
      </MemoryRouter>,
    );
    const menu = await openActionsMenu();
    expect(within(menu).getByRole("menuitem", { name: /^Delete$/i })).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: /^View$/i })).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: /^Edit$/i })).toBeInTheDocument();
  });

  it("does not show Delete for landlord_staff", async () => {
    authState.activeMembership.role = "landlord_staff";
    mockPropertiesTable({ list: [asProperty()] });
    render(
      <MemoryRouter>
        <PropertiesPage />
      </MemoryRouter>,
    );
    const menu = await openActionsMenu();
    expect(within(menu).queryByRole("menuitem", { name: /^Delete$/i })).not.toBeInTheDocument();
  });

  it("Cancel closes the dialog without deleting", async () => {
    const { deleteFn } = mockPropertiesTable({ list: [asProperty()] });

    render(
      <MemoryRouter>
        <PropertiesPage />
      </MemoryRouter>,
    );

    const menu = await openActionsMenu();
    fireEvent.click(within(menu).getByRole("menuitem", { name: /^Delete$/i }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/Sunset Flat/i)).toBeInTheDocument();
    expect(within(dialog).getByText(/cannot be undone/i)).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: /^Cancel$/i }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(deleteFn).not.toHaveBeenCalled();
    expect(screen.getAllByText("Sunset Flat").length).toBeGreaterThan(0);
  });

  it("successful deletion removes the property from the list", async () => {
    const { deleteFn } = mockPropertiesTable({
      list: [asProperty()],
      onDelete: () => ({ data: [{ id: "prop-1" }], error: null }),
    });

    render(
      <MemoryRouter>
        <PropertiesPage />
      </MemoryRouter>,
    );

    const menu = await openActionsMenu();
    fireEvent.click(within(menu).getByRole("menuitem", { name: /^Delete$/i }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: /^Delete$/i }));

    await waitFor(() => {
      expect(screen.queryByText("Sunset Flat")).not.toBeInTheDocument();
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(deleteFn).toHaveBeenCalledTimes(1);
  });

  it("does not call delete for occupied properties", async () => {
    const { deleteFn } = mockPropertiesTable({
      list: [
        asProperty({
          status: "occupied",
          current_renter_id: "renter-1",
          name: "Occupied Unit",
        }),
      ],
    });

    render(
      <MemoryRouter>
        <PropertiesPage />
      </MemoryRouter>,
    );

    const menu = await openActionsMenu();
    fireEvent.click(within(menu).getByRole("menuitem", { name: /^Delete$/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/occupied or assigned/i);
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(deleteFn).not.toHaveBeenCalled();
    expect(screen.getAllByText("Occupied Unit").length).toBeGreaterThan(0);
  });

  it("does not call delete when current_renter_id is set", async () => {
    const { deleteFn } = mockPropertiesTable({
      list: [
        asProperty({
          status: "available",
          current_renter_id: "renter-9",
          name: "Renter Linked",
        }),
      ],
    });

    render(
      <MemoryRouter>
        <PropertiesPage />
      </MemoryRouter>,
    );

    const menu = await openActionsMenu();
    fireEvent.click(within(menu).getByRole("menuitem", { name: /^Delete$/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/occupied or assigned/i);
    });
    expect(deleteFn).not.toHaveBeenCalled();
  });

  it("shows a clear error when the database rejects deletion", async () => {
    mockPropertiesTable({
      list: [asProperty()],
      onDelete: () => ({
        data: null,
        error: { message: "violates foreign key constraint on rental_assignments" },
      }),
    });

    render(
      <MemoryRouter>
        <PropertiesPage />
      </MemoryRouter>,
    );

    const menu = await openActionsMenu();
    fireEvent.click(within(menu).getByRole("menuitem", { name: /^Delete$/i }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: /^Delete$/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/related records still exist/i);
    });
    expect(screen.getAllByText("Sunset Flat").length).toBeGreaterThan(0);
  });

  it("shows an error when delete returns no rows (RLS / no-op)", async () => {
    mockPropertiesTable({
      list: [asProperty()],
      onDelete: () => ({ data: [], error: null }),
    });

    render(
      <MemoryRouter>
        <PropertiesPage />
      </MemoryRouter>,
    );

    const menu = await openActionsMenu();
    fireEvent.click(within(menu).getByRole("menuitem", { name: /^Delete$/i }));
    fireEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", { name: /^Delete$/i }),
    );

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/could not delete this property/i);
    });
    expect(screen.getAllByText("Sunset Flat").length).toBeGreaterThan(0);
  });

  it("scopes delete to property id and tenant id", async () => {
    const { deleteEqArgs } = mockPropertiesTable({
      list: [asProperty()],
      onDelete: () => ({ data: [{ id: "prop-1" }], error: null }),
    });

    render(
      <MemoryRouter>
        <PropertiesPage />
      </MemoryRouter>,
    );

    const menu = await openActionsMenu();
    fireEvent.click(within(menu).getByRole("menuitem", { name: /^Delete$/i }));
    fireEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", { name: /^Delete$/i }),
    );

    await waitFor(() => {
      expect(screen.queryByText("Sunset Flat")).not.toBeInTheDocument();
    });
    expect(deleteEqArgs).toEqual([
      ["id", "prop-1"],
      ["tenant_id", "tenant-1"],
    ]);
  });

  it("prevents duplicate delete submissions while processing", async () => {
    let resolveDelete!: (value: { data: unknown; error: null }) => void;
    const pending = new Promise<{ data: unknown; error: null }>((resolve) => {
      resolveDelete = resolve;
    });
    let deleteCalls = 0;

    from.mockImplementation(() => {
      let deleteStarted = false;
      const api: Record<string, unknown> = {};
      api.select = vi.fn(() => {
        if (deleteStarted) return pending;
        return api;
      });
      api.eq = vi.fn(() => api);
      api.order = vi.fn(() => Promise.resolve({ data: [asProperty()], error: null }));
      api.delete = vi.fn(() => {
        deleteStarted = true;
        deleteCalls += 1;
        return api;
      });
      return api;
    });

    render(
      <MemoryRouter>
        <PropertiesPage />
      </MemoryRouter>,
    );

    const menu = await openActionsMenu();
    fireEvent.click(within(menu).getByRole("menuitem", { name: /^Delete$/i }));
    const dialog = await screen.findByRole("dialog");
    const confirmBtn = within(dialog).getByRole("button", { name: /^Delete$/i });
    fireEvent.click(confirmBtn);
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(within(dialog).getByRole("button", { name: /Deleting/i })).toBeDisabled();
    });
    expect(deleteCalls).toBe(1);

    resolveDelete({ data: [{ id: "prop-1" }], error: null });

    await waitFor(() => {
      expect(screen.queryByText("Sunset Flat")).not.toBeInTheDocument();
    });
  });
});
