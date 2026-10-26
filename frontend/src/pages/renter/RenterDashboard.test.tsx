import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { RenterDashboard } from "./RenterDashboard";

const useAuth = vi.fn();
const from = vi.fn();
const signOut = vi.fn();
const navigate = vi.fn();

vi.mock("@/auth/AuthProvider", () => ({
  useAuth: () => useAuth(),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: (...args: unknown[]) => from(...args),
  },
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => navigate,
  };
});

function mockTableError(message: string, code = "42501") {
  const result = {
    data: null,
    error: { message, code },
  };
  const builder: Record<string, unknown> = {};
  const chain = () => builder;
  builder.select = chain;
  builder.eq = chain;
  builder.neq = chain;
  builder.order = chain;
  builder.limit = () => Promise.resolve(result);
  // Final awaited call may be order() without limit for assignments/charges.
  builder.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return builder;
}

describe("RenterDashboard RLS / load errors (RP-1.3.30)", () => {
  beforeEach(() => {
    useAuth.mockReset();
    from.mockReset();
    signOut.mockReset();
    navigate.mockReset();
    useAuth.mockReturnValue({
      user: { id: "u-renter-1" },
      profile: { full_name: "Test Renter", email: "renter@example.com" },
      signOut,
    });
  });

  it("shows permission errors inline and does not navigate or signOut", async () => {
    from.mockImplementation((table: string) => {
      void table;
      return mockTableError("permission denied for table rental_assignments", "42501");
    });

    render(
      <MemoryRouter>
        <RenterDashboard />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText(/permission denied/i)).toBeTruthy();
    });
    expect(navigate).not.toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
    // Dashboard chrome still present (not bounced to public landing).
    expect(screen.getByText(/welcome back, test renter/i)).toBeTruthy();
    expect(screen.getByText(/active tenancies/i)).toBeTruthy();
    expect(screen.getByRole("link", { name: /browse listings/i })).toBeTruthy();
    // Empty-state copy must not appear when the load failed.
    expect(screen.queryByText(/you.?re all caught up/i)).toBeNull();
    expect(screen.queryByText(/no tenancies yet/i)).toBeNull();
  });

  it("renders empty tenancy state without error when queries succeed with no rows", async () => {
    const empty = {
      data: [],
      error: null,
    };
    from.mockImplementation(() => {
      const builder: Record<string, unknown> = {};
      const chain = () => builder;
      builder.select = chain;
      builder.eq = chain;
      builder.neq = chain;
      builder.in = chain;
      builder.order = chain;
      builder.limit = () => Promise.resolve(empty);
      builder.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
        Promise.resolve(empty).then(resolve, reject);
      return builder;
    });

    render(
      <MemoryRouter>
        <RenterDashboard />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText(/no tenancies yet/i)).toBeTruthy();
    });
    expect(screen.getByText(/you.?re all caught up — no open charges/i)).toBeTruthy();
    expect(screen.queryByText(/permission denied/i)).toBeNull();
    expect(navigate).not.toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
  });
});
