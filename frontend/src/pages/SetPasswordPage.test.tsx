import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { SetPasswordPage } from "./SetPasswordPage";

const updateUser = vi.fn();
const signOut = vi.fn();
const refreshMemberships = vi.fn();
const useAuth = vi.fn();
const navigate = vi.fn();

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      updateUser: (...args: unknown[]) => updateUser(...args),
    },
  },
}));

vi.mock("@/auth/AuthProvider", () => ({
  useAuth: () => useAuth(),
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => navigate,
  };
});

const renterMembership = {
  status: "active",
  role: "renter",
  tenant: {
    slug: "hodan-properties",
    subdomain: "hodan-properties",
    tenant_type: "landlord",
    status: "active",
  },
};

describe("SetPasswordPage", () => {
  beforeEach(() => {
    updateUser.mockReset();
    signOut.mockReset();
    refreshMemberships.mockReset();
    navigate.mockReset();
    useAuth.mockReset();
    useAuth.mockReturnValue({
      session: { user: { id: "u1" } },
      loading: false,
      signOut,
      refreshMemberships,
    });
    updateUser.mockResolvedValue({ data: {}, error: null });
    signOut.mockResolvedValue(undefined);
    refreshMemberships.mockResolvedValue([]);
  });

  it("rejects password mismatch without calling updateUser", async () => {
    render(
      <MemoryRouter>
        <SetPasswordPage />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText(/^new password$/i), {
      target: { value: "password1" },
    });
    fireEvent.change(screen.getByLabelText(/confirm password/i), {
      target: { value: "password2" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save password/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/do not match/i);
    expect(updateUser).not.toHaveBeenCalled();
  });

  it("redirects a renter invitee to workspace login after success", async () => {
    refreshMemberships.mockResolvedValue([renterMembership]);

    render(
      <MemoryRouter>
        <SetPasswordPage />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText(/^new password$/i), {
      target: { value: "password1" },
    });
    fireEvent.change(screen.getByLabelText(/confirm password/i), {
      target: { value: "password1" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save password/i }));

    await waitFor(() =>
      expect(updateUser).toHaveBeenCalledWith({ password: "password1" }),
    );
    expect(refreshMemberships).toHaveBeenCalledWith("u1");
    expect(signOut).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith(
      "/login?tenant=hodan-properties",
      expect.objectContaining({
        replace: true,
        state: expect.objectContaining({
          notice: expect.stringMatching(/password saved/i),
        }),
      }),
    );
  });

  it("honors a matching ?tenant= hint and URL-encodes the slug", async () => {
    refreshMemberships.mockResolvedValue([
      {
        status: "active",
        role: "renter",
        tenant: {
          slug: "acme-co",
          tenant_type: "landlord",
          status: "active",
        },
      },
    ]);

    render(
      <MemoryRouter initialEntries={["/set-password?tenant=acme-co"]}>
        <SetPasswordPage />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText(/^new password$/i), {
      target: { value: "password1" },
    });
    fireEvent.change(screen.getByLabelText(/confirm password/i), {
      target: { value: "password1" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save password/i }));

    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith(
        "/login?tenant=acme-co",
        expect.objectContaining({ replace: true }),
      ),
    );
  });

  it("falls back to /login when workspace context is missing", async () => {
    refreshMemberships.mockResolvedValue([]);

    render(
      <MemoryRouter>
        <SetPasswordPage />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText(/^new password$/i), {
      target: { value: "password1" },
    });
    fireEvent.change(screen.getByLabelText(/confirm password/i), {
      target: { value: "password1" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save password/i }));

    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith(
        "/login",
        expect.objectContaining({ replace: true }),
      ),
    );
  });

  it("ignores invalid tenant hints that do not match memberships", async () => {
    refreshMemberships.mockResolvedValue([renterMembership]);

    render(
      <MemoryRouter initialEntries={["/set-password?tenant=https://evil.example"]}>
        <SetPasswordPage />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText(/^new password$/i), {
      target: { value: "password1" },
    });
    fireEvent.change(screen.getByLabelText(/confirm password/i), {
      target: { value: "password1" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save password/i }));

    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith(
        "/login?tenant=hodan-properties",
        expect.objectContaining({ replace: true }),
      ),
    );
  });

  it("surfaces updateUser failures without navigating", async () => {
    updateUser.mockResolvedValue({ data: {}, error: { message: "weak password" } });

    render(
      <MemoryRouter>
        <SetPasswordPage />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText(/^new password$/i), {
      target: { value: "password1" },
    });
    fireEvent.change(screen.getByLabelText(/confirm password/i), {
      target: { value: "password1" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save password/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/weak password/i);
    expect(navigate).not.toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
    expect(refreshMemberships).not.toHaveBeenCalled();
  });

  it("keeps platform-only admins on /login after password setup", async () => {
    refreshMemberships.mockResolvedValue([
      {
        status: "active",
        role: "super_admin",
        tenant: {
          slug: "platform",
          tenant_type: "platform",
          status: "active",
        },
      },
    ]);

    render(
      <MemoryRouter>
        <SetPasswordPage />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText(/^new password$/i), {
      target: { value: "password1" },
    });
    fireEvent.change(screen.getByLabelText(/confirm password/i), {
      target: { value: "password1" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save password/i }));

    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith(
        "/login",
        expect.objectContaining({ replace: true }),
      ),
    );
  });
});
