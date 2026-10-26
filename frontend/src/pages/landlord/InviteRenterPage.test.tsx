import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { InviteRenterPage } from "./InviteRenterPage";

const rpc = vi.fn();
const invoke = vi.fn();
const useAuth = vi.fn();

vi.mock("@/lib/supabase", () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpc(...args),
    functions: {
      invoke: (...args: unknown[]) => invoke(...args),
    },
  },
}));

vi.mock("@/auth/AuthProvider", () => ({
  useAuth: () => useAuth(),
}));

const tenantId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const renterId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function renderPage() {
  return render(
    <MemoryRouter>
      <InviteRenterPage />
    </MemoryRouter>,
  );
}

describe("InviteRenterPage", () => {
  beforeEach(() => {
    rpc.mockReset();
    invoke.mockReset();
    useAuth.mockReset();
    useAuth.mockReturnValue({
      activeMembership: {
        id: "mem-1",
        tenant_id: tenantId,
        role: "landlord_admin",
        status: "active",
        tenant: { id: tenantId, name: "Acme Rentals", tenant_type: "landlord" },
      },
    });
    rpc.mockImplementation((fn: string) => {
      if (fn === "list_same_tenant_member_profiles") {
        return Promise.resolve({ data: [], error: null });
      }
      return Promise.resolve({ data: null, error: null });
    });
  });

  it("shows validation error for invalid user id without calling manage_membership", async () => {
    renderPage();
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith("list_same_tenant_member_profiles", {
        p_tenant_id: tenantId,
      }),
    );

    fireEvent.change(screen.getByLabelText(/renter user id/i), {
      target: { value: "not-a-uuid" },
    });
    fireEvent.click(screen.getByRole("button", { name: /link existing user/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/valid user id/i);
    expect(rpc.mock.calls.some((c) => c[0] === "manage_membership")).toBe(false);
  });

  it("calls manage_membership on the active tenant and shows success", async () => {
    rpc.mockImplementation((fn: string) => {
      if (fn === "list_same_tenant_member_profiles") {
        return Promise.resolve({ data: [], error: null });
      }
      if (fn === "manage_membership") {
        return Promise.resolve({ data: { id: "m1" }, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    });

    renderPage();
    await waitFor(() => expect(rpc).toHaveBeenCalled());

    fireEvent.change(screen.getByLabelText(/renter user id/i), {
      target: { value: renterId },
    });
    fireEvent.click(screen.getByRole("button", { name: /link existing user/i }));

    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith("manage_membership", {
        p_tenant_id: tenantId,
        p_user_id: renterId,
        p_role: "renter",
        p_status: "active",
      }),
    );
    expect(await screen.findByRole("status")).toHaveTextContent(/renter membership saved/i);
  });

  it("surfaces actionable RPC errors and does not claim success", async () => {
    rpc.mockImplementation((fn: string) => {
      if (fn === "list_same_tenant_member_profiles") {
        return Promise.resolve({ data: [], error: null });
      }
      if (fn === "manage_membership") {
        return Promise.resolve({ data: null, error: { message: "not authorized" } });
      }
      return Promise.resolve({ data: null, error: null });
    });

    renderPage();
    await waitFor(() => expect(rpc).toHaveBeenCalled());

    fireEvent.change(screen.getByLabelText(/renter user id/i), {
      target: { value: renterId },
    });
    fireEvent.click(screen.getByRole("button", { name: /link existing user/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/not authorized/i);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("blocks landlord_staff from submitting invites", async () => {
    useAuth.mockReturnValue({
      activeMembership: {
        id: "mem-staff",
        tenant_id: tenantId,
        role: "landlord_staff",
        status: "active",
        tenant: { id: tenantId, name: "Acme Rentals", tenant_type: "landlord" },
      },
    });

    renderPage();
    expect(await screen.findByText(/only a landlord admin can invite/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /link existing user/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /provision renter/i })).toBeDisabled();
  });

  it("provisions via edge function with hard-coded renter path and no activation URL", async () => {
    invoke.mockResolvedValue({
      data: {
        ok: true,
        user_id: renterId,
        username: "jane_doe",
        role: "renter",
        membership_status: "active",
        message: "Renter provisioned.",
      },
      error: null,
    });

    renderPage();
    await waitFor(() => expect(rpc).toHaveBeenCalled());

    fireEvent.change(screen.getByLabelText(/full name/i), {
      target: { value: "Jane Doe" },
    });
    fireEvent.change(screen.getByLabelText(/^username$/i), {
      target: { value: "jane_doe" },
    });
    fireEvent.change(screen.getByLabelText(/^email$/i), {
      target: { value: "jane@example.com" },
    });
    fireEvent.change(screen.getByLabelText(/^phone$/i), {
      target: { value: "+252611111111" },
    });
    fireEvent.click(screen.getByRole("button", { name: /provision renter/i }));

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("provision-renter", {
        body: {
          tenant_id: tenantId,
          full_name: "Jane Doe",
          username: "jane_doe",
          email: "jane@example.com",
          phone: "+252611111111",
        },
      }),
    );
    const body = invoke.mock.calls[0][1].body as Record<string, unknown>;
    expect(body.role).toBeUndefined();
    expect(JSON.stringify(invoke.mock.calls[0])).not.toMatch(/action_link|password/i);
    expect(await screen.findByRole("status")).toHaveTextContent(/renter provisioned/i);
  });

  it("does not show success when provisioning is blocked", async () => {
    invoke.mockResolvedValue({
      data: {
        error:
          "Secure activation email delivery is not verified for this environment. Provisioning is blocked.",
        code: "email_delivery_unverified",
      },
      error: { message: "Edge Function returned a non-2xx status code" },
    });

    renderPage();
    await waitFor(() => expect(rpc).toHaveBeenCalled());

    fireEvent.change(screen.getByLabelText(/full name/i), {
      target: { value: "Jane Doe" },
    });
    fireEvent.change(screen.getByLabelText(/^username$/i), {
      target: { value: "jane_doe" },
    });
    fireEvent.change(screen.getByLabelText(/^email$/i), {
      target: { value: "jane@example.com" },
    });
    fireEvent.change(screen.getByLabelText(/^phone$/i), {
      target: { value: "+252611111111" },
    });
    fireEvent.click(screen.getByRole("button", { name: /provision renter/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/delivery is not verified/i);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("prevents duplicate provision invokes on rapid repeated submits", async () => {
    const deferred: {
      resolve: (value: unknown) => void;
    } = { resolve: () => undefined };

    invoke.mockImplementation(
      () =>
        new Promise((resolve) => {
          deferred.resolve = resolve;
        }),
    );

    renderPage();
    await waitFor(() => expect(rpc).toHaveBeenCalled());

    fireEvent.change(screen.getByLabelText(/full name/i), {
      target: { value: "Jane Doe" },
    });
    fireEvent.change(screen.getByLabelText(/^username$/i), {
      target: { value: "jane_doe" },
    });
    fireEvent.change(screen.getByLabelText(/^email$/i), {
      target: { value: "jane@example.com" },
    });
    fireEvent.change(screen.getByLabelText(/^phone$/i), {
      target: { value: "+252611111111" },
    });

    const submit = screen.getByRole("button", { name: /provision renter/i });
    fireEvent.click(submit);
    fireEvent.click(submit);
    fireEvent.click(submit);

    expect(invoke).toHaveBeenCalledTimes(1);

    deferred.resolve({
      data: {
        ok: true,
        user_id: renterId,
        username: "jane_doe",
        role: "renter",
        membership_status: "active",
        message: "Renter provisioned.",
      },
      error: null,
    });

    expect(await screen.findByRole("status")).toHaveTextContent(/renter provisioned/i);
  });

  it("opens row Actions menu with View, Edit, and Delete for landlord_admin", async () => {
    rpc.mockImplementation((fn: string) => {
      if (fn === "list_same_tenant_member_profiles") {
        return Promise.resolve({
          data: [
            {
              user_id: renterId,
              full_name: "Jane Doe",
              email: "jane@example.com",
              membership_status: "active",
            },
          ],
          error: null,
        });
      }
      return Promise.resolve({ data: null, error: null });
    });

    renderPage();
    expect((await screen.findAllByText("Jane Doe")).length).toBeGreaterThan(0);

    fireEvent.click(screen.getAllByRole("button", { name: /actions for jane doe/i })[0]!);
    const menu = await screen.findByRole("menu");
    expect(within(menu).getByRole("menuitem", { name: /^View$/i })).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: /^Edit$/i })).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: /^Delete$/i })).toBeInTheDocument();
  });

  it("View opens a details dialog from existing list data without new RPCs", async () => {
    rpc.mockImplementation((fn: string) => {
      if (fn === "list_same_tenant_member_profiles") {
        return Promise.resolve({
          data: [
            {
              user_id: renterId,
              full_name: "Jane Doe",
              email: "jane@example.com",
              membership_status: "active",
            },
          ],
          error: null,
        });
      }
      return Promise.resolve({ data: null, error: null });
    });

    renderPage();
    await screen.findAllByText("Jane Doe");
    const listCallsBefore = rpc.mock.calls.length;

    fireEvent.click(screen.getAllByRole("button", { name: /actions for jane doe/i })[0]!);
    fireEvent.click(within(await screen.findByRole("menu")).getByRole("menuitem", { name: /^View$/i }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Jane Doe")).toBeInTheDocument();
    expect(within(dialog).getByText("jane@example.com")).toBeInTheDocument();
    expect(within(dialog).getByText(renterId)).toBeInTheDocument();
    expect(rpc.mock.calls.length).toBe(listCallsBefore);
  });

  it("Edit reports that profile editing is unavailable without mutating membership", async () => {
    rpc.mockImplementation((fn: string) => {
      if (fn === "list_same_tenant_member_profiles") {
        return Promise.resolve({
          data: [
            {
              user_id: renterId,
              full_name: "Jane Doe",
              email: "jane@example.com",
              membership_status: "active",
            },
          ],
          error: null,
        });
      }
      return Promise.resolve({ data: null, error: null });
    });

    renderPage();
    await screen.findAllByText("Jane Doe");

    fireEvent.click(screen.getAllByRole("button", { name: /actions for jane doe/i })[0]!);
    fireEvent.click(within(await screen.findByRole("menu")).getByRole("menuitem", { name: /^Edit$/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/editing renter profile/i);
    expect(rpc.mock.calls.some((c) => c[0] === "manage_membership")).toBe(false);
  });

  it("Delete confirms then disables membership via manage_membership", async () => {
    rpc.mockImplementation((fn: string) => {
      if (fn === "list_same_tenant_member_profiles") {
        return Promise.resolve({
          data: [
            {
              user_id: renterId,
              full_name: "Jane Doe",
              email: "jane@example.com",
              membership_status: "active",
            },
          ],
          error: null,
        });
      }
      if (fn === "manage_membership") {
        return Promise.resolve({ data: { id: "m1" }, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    });

    renderPage();
    await screen.findAllByText("Jane Doe");

    fireEvent.click(screen.getAllByRole("button", { name: /actions for jane doe/i })[0]!);
    fireEvent.click(within(await screen.findByRole("menu")).getByRole("menuitem", { name: /^Delete$/i }));

    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: /^Delete$/i }));

    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith("manage_membership", {
        p_tenant_id: tenantId,
        p_user_id: renterId,
        p_role: "renter",
        p_status: "disabled",
      }),
    );
    expect(await screen.findByRole("status")).toHaveTextContent(/membership disabled/i);
  });

  it("hides Delete for landlord_staff while keeping View and Edit", async () => {
    useAuth.mockReturnValue({
      activeMembership: {
        id: "mem-staff",
        tenant_id: tenantId,
        role: "landlord_staff",
        status: "active",
        tenant: { id: tenantId, name: "Acme Rentals", tenant_type: "landlord" },
      },
    });
    rpc.mockImplementation((fn: string) => {
      if (fn === "list_same_tenant_member_profiles") {
        return Promise.resolve({
          data: [
            {
              user_id: renterId,
              full_name: "Jane Doe",
              email: "jane@example.com",
              membership_status: "active",
            },
          ],
          error: null,
        });
      }
      return Promise.resolve({ data: null, error: null });
    });

    renderPage();
    await screen.findAllByText("Jane Doe");

    fireEvent.click(screen.getAllByRole("button", { name: /actions for jane doe/i })[0]!);
    const menu = await screen.findByRole("menu");
    expect(within(menu).getByRole("menuitem", { name: /^View$/i })).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: /^Edit$/i })).toBeInTheDocument();
    expect(within(menu).queryByRole("menuitem", { name: /^Delete$/i })).not.toBeInTheDocument();
  });
});
