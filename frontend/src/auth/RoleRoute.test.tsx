import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import {
  RoleRoute,
  SuperAdminRoute,
  activeMembershipAllowsRoute,
} from "./ProtectedRoute";
import type { MembershipWithTenant } from "./AuthProvider";
import type { AppRole, TenantType } from "@/types/database";

const useAuth = vi.fn();

vi.mock("@/auth/AuthProvider", () => ({
  useAuth: () => useAuth(),
}));

function mem(partial: {
  id: string;
  role: AppRole;
  status?: "active" | "disabled" | "invited";
  tenantType?: TenantType;
  tenantId?: string;
}): MembershipWithTenant {
  const tenantType = partial.tenantType ?? "landlord";
  const tenantId = partial.tenantId ?? `tenant-${partial.id}`;
  return {
    id: partial.id,
    tenant_id: tenantId,
    user_id: "user-1",
    role: partial.role,
    status: partial.status ?? "active",
    permissions: {},
    invited_by: null,
    created_at: "",
    updated_at: "",
    tenant: {
      id: tenantId,
      name: `Tenant ${partial.id}`,
      slug: `slug-${partial.id}`,
      subdomain: `slug-${partial.id}`,
      tenant_type: tenantType,
      status: "active",
      branding: {},
      settings: {},
      created_at: "",
      updated_at: "",
    },
  };
}

function renderRoleRoute(
  allow: AppRole[],
  path: string,
  message = "Unauthorized for this role",
  tenantTypes?: string[],
) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          element={
            <RoleRoute allow={allow} tenantTypes={tenantTypes} message={message} />
          }
        >
          <Route path={path.split("?")[0]} element={<div>Allowed content</div>} />
        </Route>
        <Route path="/app/admin" element={<div>Super admin console</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("activeMembershipAllowsRoute", () => {
  it("denies staff-only membership for renter allow-list", () => {
    expect(
      activeMembershipAllowsRoute(mem({ id: "s", role: "landlord_staff" }), [
        "renter",
        "landlord_admin",
      ]),
    ).toBe(false);
  });

  it("allows active renter for renter allow-list", () => {
    expect(
      activeMembershipAllowsRoute(mem({ id: "r", role: "renter" }), [
        "renter",
        "landlord_admin",
      ]),
    ).toBe(true);
  });

  it("does not authorize admin on tenant A while tenant B is active", () => {
    const activeB = mem({
      id: "mem-b",
      role: "landlord_staff",
      tenantId: "tenant-b",
    });
    expect(
      activeMembershipAllowsRoute(activeB, ["landlord_admin"], ["landlord"]),
    ).toBe(false);
  });

  it("allows active landlord admin/staff for approved landlord routes", () => {
    expect(
      activeMembershipAllowsRoute(
        mem({ id: "a", role: "landlord_admin" }),
        ["landlord_admin", "landlord_staff"],
        ["landlord"],
      ),
    ).toBe(true);
    expect(
      activeMembershipAllowsRoute(
        mem({ id: "s", role: "landlord_staff" }),
        ["landlord_admin", "landlord_staff"],
        ["landlord"],
      ),
    ).toBe(true);
    expect(
      activeMembershipAllowsRoute(
        mem({ id: "s", role: "landlord_staff" }),
        ["landlord_admin"],
        ["landlord"],
      ),
    ).toBe(false);
  });

  it("rejects disabled or platform memberships", () => {
    expect(
      activeMembershipAllowsRoute(
        mem({ id: "d", role: "landlord_admin", status: "disabled" }),
        ["landlord_admin"],
        ["landlord"],
      ),
    ).toBe(false);
    expect(
      activeMembershipAllowsRoute(
        mem({
          id: "sa",
          role: "super_admin",
          tenantType: "platform",
        }),
        ["landlord_admin"],
        ["landlord"],
      ),
    ).toBe(false);
  });
});

describe("RoleRoute (active membership)", () => {
  beforeEach(() => {
    useAuth.mockReset();
  });

  it("staff-only user is denied renter routes", () => {
    useAuth.mockReturnValue({
      loading: false,
      isSuperAdmin: false,
      activeMembership: mem({ id: "staff", role: "landlord_staff" }),
      memberships: [mem({ id: "staff", role: "landlord_staff" })],
    });
    renderRoleRoute(
      ["renter", "landlord_admin"],
      "/app/renter",
      "Renter tools require an active renter or landlord admin membership.",
      ["landlord"],
    );
    expect(screen.getByText(/unauthorized/i)).toBeTruthy();
    expect(screen.queryByText("Allowed content")).toBeNull();
  });

  it("legitimate renter is allowed renter routes", () => {
    useAuth.mockReturnValue({
      loading: false,
      isSuperAdmin: false,
      activeMembership: mem({ id: "renter", role: "renter" }),
      memberships: [mem({ id: "renter", role: "renter" })],
    });
    renderRoleRoute(
      ["renter", "landlord_admin"],
      "/app/renter",
      "Renter tools require an active renter or landlord admin membership.",
      ["landlord"],
    );
    expect(screen.getByText("Allowed content")).toBeTruthy();
  });

  it("admin membership on tenant A cannot authorize admin tools while tenant B is active", () => {
    const memA = mem({
      id: "mem-a",
      role: "landlord_admin",
      tenantId: "tenant-a",
    });
    const memB = mem({
      id: "mem-b",
      role: "landlord_staff",
      tenantId: "tenant-b",
    });
    useAuth.mockReturnValue({
      loading: false,
      isSuperAdmin: false,
      activeMembership: memB,
      memberships: [memA, memB],
    });
    renderRoleRoute(
      ["landlord_admin"],
      "/app/landlord/staff",
      "This landlord admin tool requires an active landlord admin membership.",
      ["landlord"],
    );
    expect(screen.getByText(/unauthorized/i)).toBeTruthy();
    expect(screen.queryByText("Allowed content")).toBeNull();
  });

  it("active landlord staff can access shared property routes but not admin-only", () => {
    useAuth.mockReturnValue({
      loading: false,
      isSuperAdmin: false,
      activeMembership: mem({ id: "staff", role: "landlord_staff" }),
      memberships: [mem({ id: "staff", role: "landlord_staff" })],
    });
    renderRoleRoute(
      ["landlord_admin", "landlord_staff"],
      "/app/landlord/properties",
      "Landlord tools require an active landlord admin or staff membership.",
      ["landlord"],
    );
    expect(screen.getByText("Allowed content")).toBeTruthy();
  });

  it("active landlord admin can access admin-only landlord routes", () => {
    useAuth.mockReturnValue({
      loading: false,
      isSuperAdmin: false,
      activeMembership: mem({ id: "admin", role: "landlord_admin" }),
      memberships: [mem({ id: "admin", role: "landlord_admin" })],
    });
    renderRoleRoute(
      ["landlord_admin"],
      "/app/landlord/staff",
      "This landlord admin tool requires an active landlord admin membership.",
      ["landlord"],
    );
    expect(screen.getByText("Allowed content")).toBeTruthy();
  });

  it("Super Admin is redirected away from tenant RoleRoutes to /app/admin", () => {
    useAuth.mockReturnValue({
      loading: false,
      isSuperAdmin: true,
      activeMembership: null,
      memberships: [
        mem({
          id: "sa",
          role: "super_admin",
          tenantType: "platform",
        }),
      ],
    });
    renderRoleRoute(
      ["landlord_admin", "landlord_staff"],
      "/app/landlord",
      "Landlord tools require an active landlord admin or staff membership.",
      ["landlord"],
    );
    expect(screen.getByText("Super admin console")).toBeTruthy();
    expect(screen.queryByText("Allowed content")).toBeNull();
  });
});

describe("SuperAdminRoute", () => {
  beforeEach(() => {
    useAuth.mockReset();
  });

  it("allows Super Admin into platform console", () => {
    useAuth.mockReturnValue({ loading: false, isSuperAdmin: true });
    render(
      <MemoryRouter initialEntries={["/app/admin"]}>
        <Routes>
          <Route element={<SuperAdminRoute />}>
            <Route path="/app/admin" element={<div>Admin ok</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText("Admin ok")).toBeTruthy();
  });

  it("denies non–Super Admin", () => {
    useAuth.mockReturnValue({ loading: false, isSuperAdmin: false });
    render(
      <MemoryRouter initialEntries={["/app/admin"]}>
        <Routes>
          <Route element={<SuperAdminRoute />}>
            <Route path="/app/admin" element={<div>Admin ok</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText(/unauthorized/i)).toBeTruthy();
    expect(screen.queryByText("Admin ok")).toBeNull();
  });
});
