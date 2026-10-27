import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  Link2,
  Mail,
  Search,
  Shield,
  UserCheck,
  UserPlus,
  UserX,
  Users,
} from "lucide-react";
import { useAuth } from "@/auth/AuthProvider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MetricCard, MetricRow } from "@/components/ui/metric-card";
import { Select } from "@/components/ui/select";
import {
  validateLinkStaffByEmailInput,
  validateStaffStatusAction,
} from "@/lib/inviteStaff";
import {
  parseProvisionStaffResponse,
  validateProvisionStaffInput,
} from "@/lib/provisionStaff";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import type { MembershipStatus } from "@/types/database";

type StaffRow = {
  user_id: string;
  full_name: string | null;
  email: string | null;
  membership_status: MembershipStatus;
};

type StatusFilter = "all" | "active" | "disabled";

const STAFF_ROLE_LABEL = "landlord_staff";

function initialsFromName(name: string | null, email: string | null): string {
  const source = (name || email || "?").trim();
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
  }
  return source.slice(0, 2).toUpperCase() || "?";
}

export function StaffMembersPage() {
  const { activeMembership } = useAuth();
  const tenantId = activeMembership?.tenant_id;
  const role = activeMembership?.role ?? null;
  const canManage = role === "landlord_admin";

  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const [linkEmail, setLinkEmail] = useState("");
  const [lookupLabel, setLookupLabel] = useState<string | null>(null);
  const [lookupUserId, setLookupUserId] = useState<string | null>(null);
  const [lookingUp, setLookingUp] = useState(false);
  const [linking, setLinking] = useState(false);

  const [fullName, setFullName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [provisioning, setProvisioning] = useState(false);
  const provisionInFlight = useRef(false);
  const statusInFlight = useRef<string | null>(null);

  const loadStaff = async () => {
    if (!tenantId || !canManage) return;
    setLoadingList(true);
    const { data, error: rpcErr } = await supabase.rpc("list_landlord_staff_profiles", {
      p_tenant_id: tenantId,
    });
    setLoadingList(false);
    if (rpcErr) {
      setError(rpcErr.message);
      setStaff([]);
      return;
    }
    setStaff(
      ((data ?? []) as Array<{
        user_id: string;
        full_name: string | null;
        email: string | null;
        membership_status: MembershipStatus;
      }>).map((r) => ({
        user_id: r.user_id,
        full_name: r.full_name,
        email: r.email,
        membership_status: r.membership_status,
      })),
    );
  };

  useEffect(() => {
    void loadStaff();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, canManage]);

  const stats = useMemo(() => {
    const total = staff.length;
    const active = staff.filter((s) => s.membership_status === "active").length;
    const disabled = staff.filter((s) => s.membership_status === "disabled").length;
    return { total, active, disabled };
  }, [staff]);

  const filteredStaff = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return staff.filter((row) => {
      if (statusFilter !== "all" && row.membership_status !== statusFilter) {
        return false;
      }
      if (!q) return true;
      const name = (row.full_name || "").toLowerCase();
      const email = (row.email || "").toLowerCase();
      return name.includes(q) || email.includes(q);
    });
  }, [staff, searchQuery, statusFilter]);

  const emptyBecauseFilters =
    staff.length > 0 &&
    filteredStaff.length === 0 &&
    (searchQuery.trim().length > 0 || statusFilter !== "all");

  if (!tenantId || activeMembership?.tenant.tenant_type !== "landlord") {
    return (
      <div className="rounded-2xl border border-border bg-card p-8 text-sm text-muted-foreground">
        Switch to a landlord workspace to manage staff.
      </div>
    );
  }

  if (!canManage) {
    return (
      <div
        role="alert"
        className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200"
      >
        Only landlord admins can manage staff memberships.
      </div>
    );
  }

  const onLookup = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setLookupLabel(null);
    setLookupUserId(null);

    const validated = validateLinkStaffByEmailInput({
      tenantId,
      role,
      emailRaw: linkEmail,
    });
    if (!validated.ok) {
      setError(validated.error);
      return;
    }

    setLookingUp(true);
    const { data, error: rpcErr } = await supabase.rpc(
      "lookup_profile_by_email_for_landlord_admin",
      {
        p_email: validated.email,
        p_tenant_id: validated.tenantId,
      },
    );
    setLookingUp(false);

    if (rpcErr) {
      setError(rpcErr.message);
      return;
    }

    const rows = (data ?? []) as Array<{
      id: string;
      full_name: string;
      email: string | null;
    }>;
    if (rows.length === 0) {
      setError("No account found for that email. Invite them as a new staff member instead.");
      return;
    }
    const hit = rows[0];
    setLookupUserId(hit.id);
    setLookupLabel(`${hit.full_name || "User"} · ${hit.email || validated.email}`);
  };

  const onLink = async () => {
    if (!lookupUserId) return;
    setError(null);
    setMessage(null);

    const validated = validateLinkStaffByEmailInput({
      tenantId,
      role,
      emailRaw: linkEmail,
    });
    if (!validated.ok) {
      setError(validated.error);
      return;
    }

    setLinking(true);
    const { error: rpcErr } = await supabase.rpc("manage_membership", {
      p_tenant_id: validated.tenantId,
      p_user_id: lookupUserId,
      p_role: "landlord_staff",
      p_status: "active",
    });
    setLinking(false);

    if (rpcErr) {
      setError(rpcErr.message);
      return;
    }

    setMessage("Staff membership linked and set to active.");
    setLinkEmail("");
    setLookupUserId(null);
    setLookupLabel(null);
    await loadStaff();
  };

  const onProvision = async (e: FormEvent) => {
    e.preventDefault();
    if (provisionInFlight.current) return;

    setError(null);
    setMessage(null);

    const validated = validateProvisionStaffInput({
      tenantId,
      role,
      fullNameRaw: fullName,
      emailRaw: inviteEmail,
      phoneRaw: phone,
    });
    if (!validated.ok) {
      setError(validated.error);
      return;
    }

    provisionInFlight.current = true;
    setProvisioning(true);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke("provision-staff", {
        body: {
          tenant_id: validated.tenantId,
          full_name: validated.fullName,
          email: validated.email,
          phone: validated.phone || undefined,
        },
      });

      let body: unknown = data;
      const hasStructuredBody =
        !!body && typeof body === "object" && ("error" in body || "ok" in body);
      if (!hasStructuredBody && fnErr) {
        const ctx = (fnErr as { context?: Response }).context;
        if (ctx) {
          try {
            body = await ctx.json();
          } catch {
            body = { error: fnErr.message };
          }
        } else {
          body = { error: fnErr.message };
        }
      }

      const parsed = parseProvisionStaffResponse(body, fnErr?.message);
      if (!parsed.ok) {
        setError(parsed.error);
        return;
      }

      setMessage(
        parsed.message ??
          "Staff provisioned. They must complete activation from their email before signing in.",
      );
      setFullName("");
      setInviteEmail("");
      setPhone("");
      await loadStaff();
    } finally {
      provisionInFlight.current = false;
      setProvisioning(false);
    }
  };

  const onStatus = async (userId: string, next: "active" | "disabled") => {
    if (statusInFlight.current) return;
    const label = next === "disabled" ? "deactivate" : "reactivate";
    if (!window.confirm(`Are you sure you want to ${label} this staff member?`)) {
      return;
    }

    const validated = validateStaffStatusAction({
      tenantId,
      role,
      userId,
      status: next,
    });
    if (!validated.ok) {
      setError(validated.error);
      return;
    }

    statusInFlight.current = userId;
    setError(null);
    setMessage(null);
    const { error: rpcErr } = await supabase.rpc("manage_membership", {
      p_tenant_id: validated.tenantId,
      p_user_id: validated.userId,
      p_role: "landlord_staff",
      p_status: validated.status,
    });
    statusInFlight.current = null;

    if (rpcErr) {
      setError(rpcErr.message);
      return;
    }

    setMessage(next === "disabled" ? "Staff member deactivated." : "Staff member reactivated.");
    await loadStaff();
  };

  const renderStatusActions = (row: StaffRow, fullWidth = false) =>
    row.membership_status === "active" ? (
      <Button
        type="button"
        variant="destructive"
        size="sm"
        className={cn("min-h-9", fullWidth && "w-full sm:w-auto")}
        onClick={() => void onStatus(row.user_id, "disabled")}
      >
        Deactivate
      </Button>
    ) : (
      <Button
        type="button"
        size="sm"
        className={cn("min-h-9", fullWidth && "w-full sm:w-auto")}
        onClick={() => void onStatus(row.user_id, "active")}
      >
        Reactivate
      </Button>
    );

  return (
    <div className="space-y-5">
      <div className="min-w-0">
        <p className="text-[11px] font-semibold tracking-[0.08em] text-brand-green">
          Landlord · Team
        </p>
        <h2 className="mt-1 font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          Staff
        </h2>
        <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">
          Add property managers on{" "}
          <span className="font-medium text-foreground">{activeMembership.tenant.name}</span>. Staff
          can create and publish listings; they cannot delete properties or manage tenancies,
          payments, or memberships.
        </p>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300"
        >
          {error}
        </div>
      )}
      {message && (
        <div
          role="status"
          className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300"
        >
          {message}
        </div>
      )}

      <MetricRow>
        <MetricCard compact label="Total staff" value={stats.total} icon={Users} accent="navy" />
        <MetricCard compact label="Active" value={stats.active} icon={UserCheck} accent="green" />
        <MetricCard compact label="Disabled" value={stats.disabled} icon={UserX} accent="warning" />
        <MetricCard compact label="Role" value="Staff" icon={Shield} accent="water" />
      </MetricRow>

      <section className="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-[0_2px_8px_rgba(11,31,58,0.05)] dark:shadow-none">
        <div className="border-b border-border/80 px-4 py-3.5 sm:px-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
              <h3 className="font-display text-sm font-semibold tracking-tight text-foreground">
                Team members
              </h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Active and disabled landlord staff.
              </p>
            </div>
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
              <label className="relative block min-w-0 flex-1 sm:w-56">
                <span className="sr-only">Search staff</span>
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
                <Input
                  placeholder="Search name or email…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  aria-label="Search staff by name or email"
                  className="h-10 pl-9"
                  disabled={loadingList}
                />
              </label>
              <Select
                aria-label="Filter by status"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                className="h-10 sm:w-40"
                disabled={loadingList}
              >
                <option value="all">All statuses</option>
                <option value="active">Active</option>
                <option value="disabled">Disabled</option>
              </Select>
            </div>
          </div>
        </div>

        {loadingList ? (
          <div
            className="px-4 py-12 text-center text-sm text-muted-foreground sm:px-5"
            aria-live="polite"
          >
            Loading staff…
          </div>
        ) : staff.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-navy/8 text-brand-navy dark:bg-brand-blue/15 dark:text-brand-water">
              <Users className="h-5 w-5" aria-hidden />
            </div>
            <p className="mt-4 text-sm font-medium text-foreground">No staff members yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Link an existing account or send an invitation below.
            </p>
          </div>
        ) : emptyBecauseFilters ? (
          <div className="px-6 py-12 text-center">
            <p className="text-sm font-medium text-foreground">No staff match your filters</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Try adjusting search or status to see more team members.
            </p>
          </div>
        ) : (
          <>
            {/* Desktop / tablet table */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[640px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-border/80 bg-muted/30 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-3 font-semibold sm:px-5">Name</th>
                    <th className="px-4 py-3 font-semibold sm:px-5">Email</th>
                    <th className="px-4 py-3 font-semibold sm:px-5">Status</th>
                    <th className="px-4 py-3 font-semibold sm:px-5">Role</th>
                    <th className="px-4 py-3 text-right font-semibold sm:px-5">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/80">
                  {filteredStaff.map((row) => (
                    <tr key={row.user_id} className="transition-colors hover:bg-muted/40">
                      <td className="px-4 py-3.5 sm:px-5">
                        <div className="flex min-w-0 items-center gap-3">
                          <div
                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-navy/10 text-xs font-semibold text-brand-navy dark:bg-brand-blue/20 dark:text-brand-water"
                            aria-hidden
                          >
                            {initialsFromName(row.full_name, row.email)}
                          </div>
                          <span className="truncate font-medium text-foreground">
                            {row.full_name || "Unnamed"}
                          </span>
                        </div>
                      </td>
                      <td className="max-w-[220px] truncate px-4 py-3.5 text-muted-foreground sm:px-5">
                        {row.email || row.user_id}
                      </td>
                      <td className="px-4 py-3.5 sm:px-5">
                        <Badge tone={row.membership_status === "active" ? "success" : "neutral"}>
                          {row.membership_status === "active" ? "Active" : "Disabled"}
                        </Badge>
                      </td>
                      <td className="px-4 py-3.5 sm:px-5">
                        <Badge tone="info" className="border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-500/30 dark:bg-violet-500/15 dark:text-violet-300">
                          {STAFF_ROLE_LABEL}
                        </Badge>
                      </td>
                      <td className="px-4 py-3.5 text-right sm:px-5">
                        {renderStatusActions(row)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile staff cards */}
            <ul className="divide-y divide-border/80 md:hidden">
              {filteredStaff.map((row) => (
                <li key={row.user_id} className="px-4 py-4">
                  <div className="flex items-start gap-3">
                    <div
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-navy/10 text-xs font-semibold text-brand-navy dark:bg-brand-blue/20 dark:text-brand-water"
                      aria-hidden
                    >
                      {initialsFromName(row.full_name, row.email)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate font-medium text-foreground">
                          {row.full_name || "Unnamed"}
                        </p>
                        <Badge tone={row.membership_status === "active" ? "success" : "neutral"}>
                          {row.membership_status === "active" ? "Active" : "Disabled"}
                        </Badge>
                      </div>
                      <p className="mt-0.5 truncate text-sm text-muted-foreground">
                        {row.email || row.user_id}
                      </p>
                      <p className="mt-1.5 text-xs text-muted-foreground">
                        Role:{" "}
                        <span className="font-medium text-violet-700 dark:text-violet-300">
                          {STAFF_ROLE_LABEL}
                        </span>
                      </p>
                      <div className="mt-3">{renderStatusActions(row, true)}</div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-2 lg:gap-5">
        <section className="rounded-2xl border border-border/80 bg-card p-4 shadow-[0_2px_8px_rgba(11,31,58,0.05)] sm:p-5 dark:shadow-none">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300">
              <Link2 className="h-4 w-4" aria-hidden />
            </div>
            <div className="min-w-0">
              <h3 className="font-display text-sm font-semibold tracking-tight text-foreground">
                Link existing account
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Look up someone who already has an IJAARO account by email, then grant them{" "}
                <code className="rounded bg-muted px-1 py-0.5 text-[11px] text-foreground">
                  {STAFF_ROLE_LABEL}
                </code>{" "}
                on this workspace.
              </p>
            </div>
          </div>

          <form className="mt-4 space-y-3" onSubmit={(e) => void onLookup(e)}>
            <div>
              <Label htmlFor="staff-link-email">Email</Label>
              <div className="relative mt-1.5">
                <Mail
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
                <Input
                  id="staff-link-email"
                  type="email"
                  autoComplete="off"
                  placeholder="colleague@example.com"
                  value={linkEmail}
                  onChange={(e) => {
                    setLinkEmail(e.target.value);
                    setLookupUserId(null);
                    setLookupLabel(null);
                  }}
                  disabled={lookingUp || linking}
                  className="pl-9"
                />
              </div>
            </div>
            <Button
              type="submit"
              variant="outline"
              disabled={lookingUp || linking}
              className="min-h-10 w-full sm:w-auto"
            >
              {lookingUp ? "Looking up…" : "Look up email"}
            </Button>
          </form>

          {lookupLabel && lookupUserId && (
            <div className="mt-4 rounded-xl border border-border/80 bg-muted/40 px-3.5 py-3.5 text-sm">
              <p className="font-medium text-foreground">{lookupLabel}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Ready to grant <code className="text-[11px]">{STAFF_ROLE_LABEL}</code> on this
                workspace.
              </p>
              <Button
                type="button"
                className="mt-3 min-h-9 w-full sm:w-auto"
                size="sm"
                disabled={linking}
                onClick={() => void onLink()}
              >
                {linking ? "Linking…" : "Link as staff"}
              </Button>
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-border/80 bg-card p-4 shadow-[0_2px_8px_rgba(11,31,58,0.05)] sm:p-5 dark:shadow-none">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-green/10 text-brand-green dark:bg-brand-green/20">
              <UserPlus className="h-4 w-4" aria-hidden />
            </div>
            <div className="min-w-0">
              <h3 className="font-display text-sm font-semibold tracking-tight text-foreground">
                Invite new staff by email
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Creates a new Auth account and sends an activation email when delivery is enabled for
                this environment. Does not create an account if the email already exists — use link
                instead.
              </p>
            </div>
          </div>

          <form className="mt-4 space-y-3" onSubmit={(e) => void onProvision(e)}>
            <div>
              <Label htmlFor="staff-full-name">Full name</Label>
              <Input
                id="staff-full-name"
                className="mt-1.5"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                disabled={provisioning}
                required
              />
            </div>
            <div>
              <Label htmlFor="staff-invite-email">Email</Label>
              <div className="relative mt-1.5">
                <Mail
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
                <Input
                  id="staff-invite-email"
                  type="email"
                  className="pl-9"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  disabled={provisioning}
                  required
                />
              </div>
            </div>
            <div>
              <Label htmlFor="staff-phone">Phone (optional)</Label>
              <Input
                id="staff-phone"
                className="mt-1.5"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                disabled={provisioning}
              />
            </div>
            <Button type="submit" disabled={provisioning} className="min-h-10 w-full sm:w-auto">
              {provisioning ? "Sending invite…" : "Send staff invitation"}
            </Button>
          </form>
        </section>
      </div>
    </div>
  );
}
