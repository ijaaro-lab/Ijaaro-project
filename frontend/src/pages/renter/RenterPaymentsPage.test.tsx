import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { RenterPaymentsPage } from "./RenterPaymentsPage";

const from = vi.fn();
const useAuth = vi.fn();

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: (...args: unknown[]) => from(...args),
  },
}));

vi.mock("@/auth/AuthProvider", () => ({
  useAuth: () => useAuth(),
}));

function listChain(result: { data: unknown; error: null | { message: string } }) {
  const api: Record<string, unknown> = {};
  const self = () => api;
  api.select = self;
  api.eq = self;
  api.gt = self;
  api.order = () => Promise.resolve(result);
  api.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve);
  return api;
}

const openCharge = {
  id: "charge-open",
  tenant_id: "tenant-1",
  assignment_id: "asg-1",
  property_id: "prop-1",
  renter_id: "renter-1",
  period_start: "2026-11-01",
  period_end: "2026-11-30",
  due_date: "2026-12-01",
  amount_due: 260,
  amount_paid: 0,
  balance: 260,
  status: "due",
};

describe("RenterPaymentsPage", () => {
  beforeEach(() => {
    from.mockReset();
    useAuth.mockReset();
    useAuth.mockReturnValue({
      user: { id: "renter-1" },
    });
  });

  it("shows stored rejection reason on the renter's own payment history", async () => {
    from.mockImplementation((table: string) => {
      if (table === "rent_charges") {
        return listChain({ data: [], error: null });
      }
      if (table === "rent_payments") {
        return listChain({
          data: [
            {
              id: "pay-rej",
              amount: 260,
              currency: "USD",
              method: "mobile_money",
              status: "rejected",
              submitted_at: "2026-10-21T08:00:00.000Z",
              rejection_reason: "unclear proof",
            },
          ],
          error: null,
        });
      }
      return listChain({ data: [], error: null });
    });

    render(
      <MemoryRouter>
        <RenterPaymentsPage />
      </MemoryRouter>,
    );

    // Desktop table + mobile cards both render the same rejection copy.
    expect((await screen.findAllByText(/Rejected: unclear proof/)).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Rejected").length).toBeGreaterThan(0);
  });

  it("lists a valid unpaid charge and enables submit", async () => {
    from.mockImplementation((table: string) => {
      if (table === "rent_charges") {
        return listChain({ data: [openCharge], error: null });
      }
      if (table === "rent_payments") {
        return listChain({ data: [], error: null });
      }
      return listChain({ data: [], error: null });
    });

    render(
      <MemoryRouter>
        <RenterPaymentsPage />
      </MemoryRouter>,
    );

    const select = await screen.findByLabelText(/rent charge/i);
    expect(select).not.toBeDisabled();
    expect(select).toHaveValue("charge-open");
    expect(screen.getByLabelText(/^amount/i)).not.toBeDisabled();
    expect(screen.getByLabelText(/^amount/i)).toHaveValue(260);
    expect(screen.getByRole("button", { name: /submit payment/i })).not.toBeDisabled();
  });

  it("keeps the form disabled when no open balance remains after a paid charge", async () => {
    // Page loads charges with .gt("balance", 0); fully paid charges are excluded by the query.
    from.mockImplementation((table: string) => {
      if (table === "rent_charges") {
        return listChain({ data: [], error: null });
      }
      if (table === "rent_payments") {
        return listChain({
          data: [
            {
              id: "pay-paid",
              amount: 260,
              currency: "USD",
              method: "mobile_money",
              status: "paid",
              submitted_at: "2026-10-21T09:00:00.000Z",
              rejection_reason: null,
            },
            {
              id: "pay-rej",
              amount: 260,
              currency: "USD",
              method: "mobile_money",
              status: "rejected",
              submitted_at: "2026-10-21T08:00:00.000Z",
              rejection_reason: "lacagta weli ima soo gaarin walal",
            },
          ],
          error: null,
        });
      }
      return listChain({ data: [], error: null });
    });

    render(
      <MemoryRouter>
        <RenterPaymentsPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText(/no open rent balance to pay/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/rent charge/i)).toBeDisabled();
    expect(screen.getByLabelText(/^amount/i)).toBeDisabled();
    expect(screen.getByRole("button", { name: /submit payment/i })).toBeDisabled();
    // A rejected submission remains in history and must not unlock the form.
    expect(screen.getAllByText(/Rejected: lacagta weli ima soo gaarin walal/).length).toBeGreaterThan(0);
  });

  it("rejects amounts that exceed the selected charge balance", async () => {
    from.mockImplementation((table: string) => {
      if (table === "rent_charges") {
        return listChain({ data: [openCharge], error: null });
      }
      if (table === "rent_payments") {
        return listChain({ data: [], error: null });
      }
      return listChain({ data: [], error: null });
    });

    render(
      <MemoryRouter>
        <RenterPaymentsPage />
      </MemoryRouter>,
    );

    const amount = await screen.findByLabelText(/^amount/i);
    fireEvent.change(amount, { target: { value: "999" } });
    fireEvent.click(screen.getByRole("button", { name: /submit payment/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/exceeds outstanding balance/i);
  });

  it("disables submit when eligible charges are empty", async () => {
    from.mockImplementation((table: string) => {
      if (table === "rent_charges") {
        return listChain({ data: [], error: null });
      }
      if (table === "rent_payments") {
        return listChain({ data: [], error: null });
      }
      return listChain({ data: [], error: null });
    });

    render(
      <MemoryRouter>
        <RenterPaymentsPage />
      </MemoryRouter>,
    );

    expect(await screen.findByRole("button", { name: /submit payment/i })).toBeDisabled();
    expect(screen.getByLabelText(/rent charge/i)).toBeDisabled();
  });
});
