import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ProtectedRoute } from "./ProtectedRoute";

const useAuth = vi.fn();

vi.mock("@/auth/AuthProvider", () => ({
  useAuth: () => useAuth(),
}));

describe("ProtectedRoute tenant bounce (RP-1.3.28 / RP-1.3.30)", () => {
  beforeEach(() => {
    useAuth.mockReset();
  });

  it("exact redirect: session null on /app/renter?tenant= → /?tenant= (public tenant homepage)", () => {
    useAuth.mockReturnValue({ session: null, loading: false });

    render(
      <MemoryRouter initialEntries={["/app/renter?tenant=hodan-properties"]}>
        <Routes>
          <Route element={<ProtectedRoute />}>
            <Route path="/app/renter" element={<div>Renter dashboard</div>} />
          </Route>
          <Route path="/" element={<div>Tenant landing</div>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText("Tenant landing")).toBeTruthy();
    expect(screen.queryByText("Renter dashboard")).toBeNull();
  });

  it("renders outlet when React session is present", () => {
    useAuth.mockReturnValue({
      session: { user: { id: "u1" } },
      loading: false,
    });

    render(
      <MemoryRouter initialEntries={["/app/renter?tenant=hodan-properties"]}>
        <Routes>
          <Route element={<ProtectedRoute />}>
            <Route path="/app/renter" element={<div>Renter dashboard</div>} />
          </Route>
          <Route path="/" element={<div>Tenant landing</div>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText("Renter dashboard")).toBeTruthy();
    expect(screen.queryByText("Tenant landing")).toBeNull();
  });

  it("waits while auth loading is true (no bounce yet)", () => {
    useAuth.mockReturnValue({ session: null, loading: true });

    render(
      <MemoryRouter initialEntries={["/app/renter?tenant=hodan-properties"]}>
        <Routes>
          <Route element={<ProtectedRoute />}>
            <Route path="/app/renter" element={<div>Renter dashboard</div>} />
          </Route>
          <Route path="/" element={<div>Tenant landing</div>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText(/loading session/i)).toBeTruthy();
    expect(screen.queryByText("Tenant landing")).toBeNull();
    expect(screen.queryByText("Renter dashboard")).toBeNull();
  });
});
