import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { PropertyDetailPage } from "./PropertyDetailPage";

const rpc = vi.fn();
const from = vi.fn();

vi.mock("@/lib/supabase", () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpc(...args),
    from: (...args: unknown[]) => from(...args),
  },
}));

vi.mock("@/auth/AuthProvider", () => ({
  useAuth: () => ({
    user: { id: "ll-1" },
    activeMembership: {
      tenant_id: "tenant-a",
      role: "landlord_admin",
      tenant: { tenant_type: "landlord" },
    },
  }),
}));

const propertyId = "prop-1";
const assignmentId = "asg-1";

function chain(result: { data: unknown; error: null }) {
  const api: Record<string, unknown> = {
    then: (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve),
  };
  const self = () => api;
  api.select = self;
  api.eq = self;
  api.in = self;
  api.order = self;
  api.maybeSingle = () => Promise.resolve(result);
  return api;
}

describe("PropertyDetailPage move-out", () => {
  beforeEach(() => {
    rpc.mockReset();
    from.mockReset();
    from.mockImplementation((table: string) => {
      if (table === "properties") {
        return chain({
          data: {
            id: propertyId,
            tenant_id: "tenant-a",
            name: "Move Out Test",
            address_line: "1 Test",
            rent_amount: 100,
            currency: "USD",
            status: "occupied",
            property_type: "apartment",
            district: null,
            city: null,
            is_listed: false,
            description: null,
          },
          error: null,
        });
      }
      if (table === "property_photos") {
        return chain({ data: [], error: null });
      }
      if (table === "rental_assignments") {
        return chain({
          data: {
            id: assignmentId,
            status: "active",
            rent_amount: 100,
            currency: "USD",
            due_day: 1,
            start_date: "2026-10-01",
            property_id: propertyId,
            tenant_id: "tenant-a",
          },
          error: null,
        });
      }
      return chain({ data: null, error: null });
    });
    rpc.mockImplementation((fn: string) => {
      if (fn === "list_same_tenant_member_profiles") {
        return Promise.resolve({ data: [], error: null });
      }
      if (fn === "complete_move_out") {
        return Promise.resolve({ data: { assignment: { id: assignmentId } }, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    });
  });

  it("disables Complete move-out while the RPC is in flight and reports success only once", async () => {
    let resolveMoveOut!: (value: { data: unknown; error: null }) => void;
    const moveOutPending = new Promise<{ data: unknown; error: null }>((resolve) => {
      resolveMoveOut = resolve;
    });

    rpc.mockImplementation((fn: string) => {
      if (fn === "list_same_tenant_member_profiles") {
        return Promise.resolve({ data: [], error: null });
      }
      if (fn === "complete_move_out") {
        return moveOutPending;
      }
      return Promise.resolve({ data: null, error: null });
    });

    render(
      <MemoryRouter initialEntries={[`/app/landlord/properties/${propertyId}`]}>
        <Routes>
          <Route path="/app/landlord/properties/:id" element={<PropertyDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    const btn = await screen.findByRole("button", { name: /^complete move-out$/i });
    fireEvent.click(btn);

    const inFlight = await screen.findByRole("button", { name: /completing move-out/i });
    expect(inFlight).toBeDisabled();
    // fireEvent ignores disabled; production guard must still collapse duplicate RPC starts
    fireEvent.click(inFlight);
    expect(rpc.mock.calls.filter((c) => c[0] === "complete_move_out")).toHaveLength(1);

    resolveMoveOut({ data: { assignment: { id: assignmentId } }, error: null });

    await waitFor(() =>
      expect(rpc.mock.calls.filter((c) => c[0] === "complete_move_out")).toHaveLength(1),
    );
    expect(await screen.findByText(/move-out completed; property set to available/i)).toBeInTheDocument();
  });

  it("shows RPC error without success copy", async () => {
    let resolveMoveOut!: (value: { data: null; error: { message: string } }) => void;
    const moveOutPending = new Promise<{ data: null; error: { message: string } }>((resolve) => {
      resolveMoveOut = resolve;
    });

    rpc.mockImplementation((fn: string) => {
      if (fn === "list_same_tenant_member_profiles") {
        return Promise.resolve({ data: [], error: null });
      }
      if (fn === "complete_move_out") {
        return moveOutPending;
      }
      return Promise.resolve({ data: null, error: null });
    });

    render(
      <MemoryRouter initialEntries={[`/app/landlord/properties/${propertyId}`]}>
        <Routes>
          <Route path="/app/landlord/properties/:id" element={<PropertyDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole("button", { name: /^complete move-out$/i }));
    expect(await screen.findByRole("button", { name: /completing move-out/i })).toBeDisabled();

    resolveMoveOut({
      data: null,
      error: { message: "only active assignments can be completed" },
    });

    expect(await screen.findByText(/only active assignments can be completed/i)).toBeInTheDocument();
    expect(screen.queryByText(/move-out completed/i)).toBeNull();
    expect(await screen.findByRole("button", { name: /^complete move-out$/i })).toBeEnabled();
  });
});
