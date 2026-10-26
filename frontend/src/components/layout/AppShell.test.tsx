import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { AppShell } from "./AppShell";
import type { MembershipWithTenant } from "@/auth/AuthProvider";
import type { AppRole, TenantType } from "@/types/database";

const useAuth = vi.fn();

vi.mock("@/auth/AuthProvider", () => ({
  useAuth: () => useAuth(),
}));

vi.mock("@/components/theme/ThemeToggle", () => ({
  ThemeToggle: () => <button type="button">Theme</button>,
}));

vi.mock("@/components/ui/user-avatar", () => ({
  UserAvatar: () => <span>Avatar</span>,
}));

function mem(partial: {
  id: string;
  role: AppRole;
  tenantType?: TenantType;
  name?: string;
}): MembershipWithTenant {
  const tenantType = partial.tenantType ?? "landlord";
  const tenantId = `tenant-${partial.id}`;
  return {
    id: partial.id,
    tenant_id: tenantId,
    user_id: "user-1",
    role: partial.role,
    status: "active",
    permissions: {},
    invited_by: null,
    created_at: "",
    updated_at: "",
    tenant: {
      id: tenantId,
      name: partial.name ?? `Tenant ${partial.id}`,
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

function renderShell(path: string, auth: Record<string, unknown>) {
  useAuth.mockReturnValue({
    profile: { full_name: "Test User", email: "t@example.com", avatar_url: null },
    signOut: vi.fn(),
    setActiveMembershipId: vi.fn(),
    refreshMemberships: vi.fn(),
    refreshProfile: vi.fn(),
    memberships: [],
    isSuperAdmin: false,
    ...auth,
  });
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/app/landlord" element={<div>Landlord home</div>} />
          <Route path="/app/landlord/properties" element={<div>Properties page</div>} />
          <Route path="/app/landlord/staff" element={<div>Staff page</div>} />
          <Route path="/app/water" element={<div>Water page</div>} />
          <Route path="/app/branding" element={<div>Branding page</div>} />
          <Route path="/app/account" element={<div>Account page</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

/** jsdom has no md breakpoint — desktop sidebar stays `hidden`; open the mobile drawer. */
function openMobileNav() {
  fireEvent.click(screen.getByRole("button", { name: /open navigation menu/i }));
  return screen.getByRole("complementary", { name: /workspace navigation/i });
}

describe("AppShell navigation", () => {
  beforeEach(() => {
    useAuth.mockReset();
  });

  it("does not mark Dashboard active on /app/landlord/properties", () => {
    const admin = mem({ id: "a", role: "landlord_admin", name: "LL A" });
    renderShell("/app/landlord/properties", {
      primaryRole: "landlord_admin",
      activeMembership: admin,
      memberships: [admin],
    });
    const drawer = openMobileNav();
    const dashboard = within(drawer).getByRole("link", { name: /^Dashboard$/i });
    expect(dashboard.getAttribute("aria-current")).toBeNull();
    const properties = within(drawer).getByRole("link", { name: /^Properties$/i });
    expect(properties.getAttribute("aria-current")).toBe("page");
  });

  it("hides branding for landlord_staff and shows for landlord_admin", () => {
    const staff = mem({ id: "s", role: "landlord_staff" });
    const { unmount } = renderShell("/app/landlord", {
      primaryRole: "landlord_staff",
      activeMembership: staff,
      memberships: [staff],
    });
    const staffDrawer = openMobileNav();
    expect(within(staffDrawer).queryByRole("link", { name: /^Branding$/i })).toBeNull();
    unmount();

    const admin = mem({ id: "a", role: "landlord_admin" });
    renderShell("/app/landlord", {
      primaryRole: "landlord_admin",
      activeMembership: admin,
      memberships: [admin],
    });
    const adminDrawer = openMobileNav();
    expect(within(adminDrawer).getByRole("link", { name: /^Branding$/i })).toBeTruthy();
  });

  it("does not show water nav when landlord membership is active even if water membership exists", () => {
    const landlord = mem({ id: "ll", role: "landlord_admin", name: "LL" });
    const water = mem({
      id: "w",
      role: "utility_admin",
      tenantType: "water_company",
      name: "Water",
    });
    renderShell("/app/landlord", {
      primaryRole: "landlord_admin",
      activeMembership: landlord,
      memberships: [landlord, water],
    });
    const drawer = openMobileNav();
    expect(within(drawer).queryByRole("link", { name: /water dashboard/i })).toBeNull();
    expect(within(drawer).getByRole("link", { name: /^Staff$/i })).toBeTruthy();
  });

  it("shows water nav and branding when water admin is the active membership", () => {
    const landlord = mem({ id: "ll", role: "landlord_admin", name: "LL" });
    const water = mem({
      id: "w",
      role: "utility_admin",
      tenantType: "water_company",
      name: "Water",
    });
    renderShell("/app/water", {
      primaryRole: "utility_admin",
      activeMembership: water,
      memberships: [landlord, water],
    });
    const drawer = openMobileNav();
    expect(within(drawer).getByRole("link", { name: /water dashboard/i })).toBeTruthy();
    expect(within(drawer).queryByRole("link", { name: /^Staff$/i })).toBeNull();
    expect(within(drawer).getByRole("link", { name: /^Branding$/i })).toBeTruthy();
  });

  it("exposes a mobile menu control that opens workspace navigation", () => {
    const admin = mem({ id: "a", role: "landlord_admin" });
    renderShell("/app/landlord", {
      primaryRole: "landlord_admin",
      activeMembership: admin,
      memberships: [admin],
    });
    const drawer = openMobileNav();
    expect(within(drawer).getByRole("link", { name: /^Staff$/i })).toBeTruthy();
  });
});
