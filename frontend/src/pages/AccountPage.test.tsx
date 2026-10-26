import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AccountPage } from "./AccountPage";

const updateUser = vi.fn();
const from = vi.fn();
const useAuth = vi.fn();

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      updateUser: (...args: unknown[]) => updateUser(...args),
    },
    from: (...args: unknown[]) => from(...args),
    rpc: vi.fn(),
  },
}));

vi.mock("@/auth/AuthProvider", () => ({
  useAuth: () => useAuth(),
}));

describe("AccountPage change password", () => {
  beforeEach(() => {
    updateUser.mockReset();
    from.mockReset();
    useAuth.mockReset();
    useAuth.mockReturnValue({
      user: { id: "u1" },
      profile: {
        id: "u1",
        full_name: "Jane",
        email: "jane@example.com",
        phone: null,
        username: "jane_doe",
        avatar_url: null,
      },
      refreshProfile: vi.fn(),
      refreshMemberships: vi.fn(),
      isSuperAdmin: false,
      activeMembership: null,
    });
    updateUser.mockResolvedValue({ data: {}, error: null });
  });

  it("rejects mismatch and does not call updateUser", async () => {
    render(
      <MemoryRouter>
        <AccountPage />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText(/^new password$/i), {
      target: { value: "password1" },
    });
    fireEvent.change(screen.getByLabelText(/confirm password/i), {
      target: { value: "password2" },
    });
    fireEvent.click(screen.getByRole("button", { name: /update password/i }));

    expect(await screen.findByText(/do not match/i)).toBeInTheDocument();
    expect(updateUser).not.toHaveBeenCalled();
  });

  it("shows success after password update", async () => {
    render(
      <MemoryRouter>
        <AccountPage />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText(/^new password$/i), {
      target: { value: "password1" },
    });
    fireEvent.change(screen.getByLabelText(/confirm password/i), {
      target: { value: "password1" },
    });
    fireEvent.click(screen.getByRole("button", { name: /update password/i }));

    await waitFor(() =>
      expect(updateUser).toHaveBeenCalledWith({ password: "password1" }),
    );
    expect(await screen.findByText(/password updated/i)).toBeInTheDocument();
  });

  it("shows failure state from Auth", async () => {
    updateUser.mockResolvedValue({ data: {}, error: { message: "session expired" } });

    render(
      <MemoryRouter>
        <AccountPage />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText(/^new password$/i), {
      target: { value: "password1" },
    });
    fireEvent.change(screen.getByLabelText(/confirm password/i), {
      target: { value: "password1" },
    });
    fireEvent.click(screen.getByRole("button", { name: /update password/i }));

    expect(await screen.findByText(/session expired/i)).toBeInTheDocument();
  });
});
