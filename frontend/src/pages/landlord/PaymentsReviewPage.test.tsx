import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PaymentsReviewPage } from "./PaymentsReviewPage";

const rpc = vi.fn();
const from = vi.fn();
const createSignedUrl = vi.fn();
const useAuth = vi.fn();
const windowOpen = vi.fn();

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

vi.mock("@/auth/AuthProvider", () => ({
  useAuth: () => useAuth(),
}));

const tenantId = "tenant-a";
const otherTenantId = "tenant-b";
const paymentId = "pay-1";
const propertyId = "prop-1";
const payerId = "renter-1";
const proofPath = `${tenantId}/assign-1/abc123.png`;

const pendingPayment = {
  id: paymentId,
  tenant_id: tenantId,
  rent_charge_id: "charge-1",
  property_id: propertyId,
  assignment_id: "assign-1",
  payer_id: payerId,
  amount: 260,
  currency: "USD",
  method: "mobile_money",
  reference: "1234",
  proof_path: proofPath,
  status: "pending",
  submitted_at: "2026-10-21T08:00:00.000Z",
  rejection_reason: null,
};

function listChain(result: { data: unknown; error: null | { message: string } }) {
  const api: Record<string, unknown> = {};
  const self = () => api;
  api.select = self;
  api.eq = self;
  api.order = () => Promise.resolve(result);
  api.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve);
  return api;
}

describe("PaymentsReviewPage", () => {
  beforeEach(() => {
    rpc.mockReset();
    from.mockReset();
    createSignedUrl.mockReset();
    useAuth.mockReset();
    windowOpen.mockReset();
    vi.stubGlobal("open", windowOpen);

    useAuth.mockReturnValue({
      activeMembership: {
        tenant_id: tenantId,
        role: "landlord_admin",
        permissions: {},
        tenant: { tenant_type: "landlord" },
      },
    });

    createSignedUrl.mockResolvedValue({
      data: { signedUrl: "https://example.test/signed-proof" },
      error: null,
    });
  });

  function mockLoads(opts?: {
    payment?: typeof pendingPayment;
    propertyName?: string | null;
    photoPath?: string | null;
    renterName?: string | null;
  }) {
    const payment = opts?.payment ?? pendingPayment;
    from.mockImplementation((table: string) => {
      if (table === "rent_payments") {
        return listChain({ data: [payment], error: null });
      }
      if (table === "properties") {
        return listChain({
          data: [
            {
              id: propertyId,
              name: opts?.propertyName === undefined ? "Daarusalaam Villa" : opts.propertyName,
              address_line: "Block 1",
            },
          ],
          error: null,
        });
      }
      if (table === "property_photos") {
        const path = opts?.photoPath === undefined ? null : opts.photoPath;
        return listChain({
          data: path
            ? [{ property_id: propertyId, storage_path: path, sort_order: 0 }]
            : [],
          error: null,
        });
      }
      return listChain({ data: [], error: null });
    });

    rpc.mockImplementation((fn: string, args: { p_tenant_id?: string }) => {
      if (fn === "list_same_tenant_member_profiles") {
        expect(args.p_tenant_id).toBe(tenantId);
        return Promise.resolve({
          data: [
            {
              user_id: payerId,
              full_name: opts?.renterName === undefined ? "Som Via" : opts.renterName,
              email: "som@example.com",
            },
          ],
          error: null,
        });
      }
      return Promise.resolve({ data: null, error: null });
    });
  }

  it("shows renter and property names without raw proof storage path", async () => {
    mockLoads({ photoPath: `${tenantId}/${propertyId}/cover.jpg` });

    render(<PaymentsReviewPage />);

    expect(await screen.findByText("Som Via")).toBeInTheDocument();
    expect(screen.getByText(/Daarusalaam Villa/)).toBeInTheDocument();
    expect(screen.getByText(/\$260\.00/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /view payment proof/i })).toBeInTheDocument();
    expect(screen.queryByText(proofPath)).not.toBeInTheDocument();
    expect(screen.queryByText(new RegExp(tenantId))).not.toBeInTheDocument();
  });

  it("uses a neutral placeholder when property photo is missing", async () => {
    mockLoads({ photoPath: null });

    render(<PaymentsReviewPage />);

    expect(await screen.findByText("Som Via")).toBeInTheDocument();
    expect(screen.getByLabelText("No property photo")).toBeInTheDocument();
    expect(screen.getByText("No photo")).toBeInTheDocument();
  });

  it("opens proof via signed URL without rendering the storage path", async () => {
    mockLoads();

    render(<PaymentsReviewPage />);
    fireEvent.click(await screen.findByRole("button", { name: /view payment proof/i }));

    await waitFor(() => {
      expect(createSignedUrl).toHaveBeenCalledWith(proofPath, 10 * 60);
      expect(windowOpen).toHaveBeenCalledWith(
        "https://example.test/signed-proof",
        "_blank",
        "noopener,noreferrer",
      );
    });
    expect(screen.queryByText(proofPath)).not.toBeInTheDocument();
  });

  it("blocks reject when reason is empty and does not call review RPC", async () => {
    mockLoads();

    render(<PaymentsReviewPage />);
    expect(await screen.findByText("Som Via")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^reject$/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "A rejection reason is required.",
    );
    expect(rpc).not.toHaveBeenCalledWith("review_rent_payment", expect.anything());
  });

  it("blocks reject for whitespace-only reason", async () => {
    mockLoads();

    render(<PaymentsReviewPage />);
    const input = await screen.findByLabelText("Rejection reason");
    fireEvent.change(input, { target: { value: "   \t  " } });

    fireEvent.click(screen.getByRole("button", { name: /^reject$/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "A rejection reason is required.",
    );
    expect(rpc).not.toHaveBeenCalledWith("review_rent_payment", expect.anything());
  });

  it("submits trimmed rejection reason to review_rent_payment", async () => {
    mockLoads();
    rpc.mockImplementation((fn: string, args: Record<string, unknown>) => {
      if (fn === "list_same_tenant_member_profiles") {
        return Promise.resolve({
          data: [{ user_id: payerId, full_name: "Som Via", email: "som@example.com" }],
          error: null,
        });
      }
      if (fn === "review_rent_payment") {
        expect(args).toEqual({
          p_payment_id: paymentId,
          p_decision: "reject",
          p_rejection_reason: "unclear proof",
        });
        return Promise.resolve({ data: { payment: { status: "rejected" } }, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    });

    render(<PaymentsReviewPage />);
    const input = await screen.findByLabelText("Rejection reason");
    fireEvent.change(input, { target: { value: "  unclear proof  " } });
    fireEvent.click(screen.getByRole("button", { name: /^reject$/i }));

    await waitFor(() => {
      expect(rpc).toHaveBeenCalledWith("review_rent_payment", {
        p_payment_id: paymentId,
        p_decision: "reject",
        p_rejection_reason: "unclear proof",
      });
    });
  });

  it("scopes list_same_tenant_member_profiles to the active tenant only", async () => {
    mockLoads();
    render(<PaymentsReviewPage />);
    await screen.findByText("Som Via");

    expect(rpc).toHaveBeenCalledWith("list_same_tenant_member_profiles", {
      p_tenant_id: tenantId,
    });
    expect(rpc).not.toHaveBeenCalledWith("list_same_tenant_member_profiles", {
      p_tenant_id: otherTenantId,
    });
  });
});
