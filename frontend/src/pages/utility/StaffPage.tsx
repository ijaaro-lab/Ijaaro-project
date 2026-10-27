import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  Link2,
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
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import type { AppRole, MembershipStatus } from "@/types/database";
import { KIND_LABEL, KIND_TENANT_TYPE, type UtilityKind } from "./shared";

type StaffRow = {
  user_id: string;
  role: AppRole;
  status: MembershipStatus;
};

type StatusFilter = "all" | "active" | "disabled";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function initialsFromUserId(userId: string): string {
  const compact = userId.replace(/-/g, "").slice(0, 2).toUpperCase();
  return compact || "?";
}

function roleLabel(role: AppRole): string {
  return role.replaceAll("_", " ");
}

export function StaffPage({ kind }: { kind: UtilityKind }) {
  const { activeMembership } = useAuth();
  const tenantId = activeMembership?.tenant_id;
  const matchesKind = activeMembership?.tenant.tenant_type === KIND_TENANT_TYPE[kind];
  const isAdmin = activeMembership?.role === "utility_admin";
  const label = KIND_LABEL[kind];
  const staffRoleLabel = "utility_staff";
  const accent = kind === "water" ? "water" : "power";

  const [rows, setRows] = useState<StaffRow[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const [linkUserId, setLinkUserId] = useState("");
  const [linking, setLinking] = useState(false);
  const statusInFlight = useRef<string | null>(null);

  const loadStaff = async () => {
    if (!tenantId || !matchesKind || !isAdmin) return;
    setLoadingList(true);
    setError(null);
    const { data, error: err } = await supabase
      .from("tenant_memberships")
      .select("user_id, role, status")
      .eq("tenant_id", tenantId)
      .in("role", ["utility_admin", "utility_staff"])
      .order("role");
    setLoadingList(false);
    if (err) {
      setError(err.message);
      setRows([]);
      return;
    }
    setRows((data ?? []) as StaffRow[]);
  };

  useEffect(() => {
    void loadStaff();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, matchesKind, isAdmin]);

  const stats = useMemo(() => {
    const total = rows.length;
    const active = rows.filter((r) => r.status === "active").length;
    const disabled = rows.filter((r) => r.status === "disabled").length;
    return { total, active, disabled };
  }, [rows]);

  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return rows.filter((row) => {
      if (statusFilter !== "all" && row.status !== statusFilter) return false;
      if (!q) return true;
      return (
        row.user_id.toLowerCase().includes(q) ||
        row.role.toLowerCase().includes(q) ||
        roleLabel(row.role).toLowerCase().includes(q)
      );
    });
  }, [rows, searchQuery, statusFilter]);

  const emptyBecauseFilters =
    rows.length > 0 &&
    filteredRows.length === 0 &&
    (searchQuery.trim().length > 0 || statusFilter !== "all");

  if (!tenantId || !matchesKind) {
    return (
      <div className="rounded-2xl border border-border bg-card p-8 text-sm text-muted-foreground">
        Switch to a {label.toLowerCase()} company membership to continue.
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div
        role="alert"
        className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200"
      >
        Only {label.toLowerCase()} company admins can view staff memberships.
      </div>
    );
  }

  const onLink = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);

    const raw = linkUserId.trim();
    if (!UUID_RE.test(raw)) {
      setError("Enter a valid user ID (UUID).");
      return;
    }
    if (rows.some((r) => r.user_id === raw && r.status === "active")) {
      setError("That user is already an active member of this company.");
      return;
    }

    setLinking(true);
    const { error: rpcErr } = await supabase.rpc("manage_membership", {
      p_tenant_id: tenantId,
      p_user_id: raw,
      p_role: "utility_staff",
      p_status: "active",
    });
    setLinking(false);

    if (rpcErr) {
      setError(rpcErr.message);
      return;
    }

    setMessage("Staff membership linked and set to active.");
    setLinkUserId("");
    await loadStaff();
  };

  const onStatus = async (userId: string, next: "active" | "disabled") => {
    if (statusInFlight.current) return;
    const action = next === "disabled" ? "deactivate" : "reactivate";
    if (!window.confirm(`Are you sure you want to ${action} this staff member?`)) {
      return;
    }

    statusInFlight.current = userId;
    setError(null);
    setMessage(null);
    const { error: rpcErr } = await supabase.rpc("manage_membership", {
      p_tenant_id: tenantId,
      p_user_id: userId,
      p_role: "utility_staff",
      p_status: next,
    });
    statusInFlight.current = null;

    if (rpcErr) {
      setError(rpcErr.message);
      return;
    }

    setMessage(next === "disabled" ? "Staff member deactivated." : "Staff member reactivated.");
    await loadStaff();
  };

  const renderStatusActions = (row: StaffRow, fullWidth = false) => {
    if (row.role === "utility_admin") {
      return (
        <span className="text-xs text-muted-foreground">Admin</span>
      );
    }
    return row.status === "active" ? (
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
  };

  return (
    <div className="space-y-5">
      <div className="min-w-0">
        <p className="text-[11px] font-semibold tracking-[0.08em] text-brand-green">
          {label} · Team
        </p>
        <h2 className="mt-1 font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          Staff
        </h2>
        <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">
          Manage company admins and staff on{" "}
          <span className="font-medium text-foreground">{activeMembership.tenant.name}</span>.
          Profile names stay private until company staff provisioning is enabled; link by user ID
          for now.
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
        <MetricCard compact label="Role" value="Staff" icon={Shield} accent={accent} />
      </MetricRow>

      <section className="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-[0_2px_8px_rgba(11,31,58,0.05)] dark:shadow-none">
        <div className="border-b border-border/80 px-4 py-3.5 sm:px-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
              <h3 className="font-display text-sm font-semibold tracking-tight text-foreground">
                Team members
              </h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Active and disabled {label.toLowerCase()} company staff.
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
                  placeholder="Search user ID or role…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  aria-label="Search staff by user ID or role"
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
        ) : rows.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-navy/8 text-brand-navy dark:bg-brand-blue/15 dark:text-brand-water">
              <Users className="h-5 w-5" aria-hidden />
            </div>
            <p className="mt-4 text-sm font-medium text-foreground">No staff members yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Link an existing account by user ID below.
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
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[640px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-border/80 bg-muted/30 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-3 font-semibold sm:px-5">Member</th>
                    <th className="px-4 py-3 font-semibold sm:px-5">User ID</th>
                    <th className="px-4 py-3 font-semibold sm:px-5">Status</th>
                    <th className="px-4 py-3 font-semibold sm:px-5">Role</th>
                    <th className="px-4 py-3 text-right font-semibold sm:px-5">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/80">
                  {filteredRows.map((row) => (
                    <tr
                      key={`${row.user_id}-${row.role}`}
                      className="transition-colors hover:bg-muted/40"
                    >
                      <td className="px-4 py-3.5 sm:px-5">
                        <div className="flex min-w-0 items-center gap-3">
                          <div
                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-navy/10 text-xs font-semibold text-brand-navy dark:bg-brand-blue/20 dark:text-brand-water"
                            aria-hidden
                          >
                            {initialsFromUserId(row.user_id)}
                          </div>
                          <span className="truncate font-medium text-foreground">
                            {row.role === "utility_admin" ? "Company admin" : "Staff member"}
                          </span>
                        </div>
                      </td>
                      <td className="max-w-[240px] truncate px-4 py-3.5 font-mono text-xs text-muted-foreground sm:px-5">
                        {row.user_id}
                      </td>
                      <td className="px-4 py-3.5 sm:px-5">
                        <Badge tone={row.status === "active" ? "success" : "neutral"}>
                          {row.status === "active" ? "Active" : "Disabled"}
                        </Badge>
                      </td>
                      <td className="px-4 py-3.5 sm:px-5">
                        <Badge
                          tone="info"
                          className="border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-500/30 dark:bg-violet-500/15 dark:text-violet-300"
                        >
                          {row.role}
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

            <ul className="divide-y divide-border/80 md:hidden">
              {filteredRows.map((row) => (
                <li key={`${row.user_id}-${row.role}`} className="px-4 py-4">
                  <div className="flex items-start gap-3">
                    <div
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-navy/10 text-xs font-semibold text-brand-navy dark:bg-brand-blue/20 dark:text-brand-water"
                      aria-hidden
                    >
                      {initialsFromUserId(row.user_id)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate font-medium text-foreground">
                          {row.role === "utility_admin" ? "Company admin" : "Staff member"}
                        </p>
                        <Badge tone={row.status === "active" ? "success" : "neutral"}>
                          {row.status === "active" ? "Active" : "Disabled"}
                        </Badge>
                      </div>
                      <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">
                        {row.user_id}
                      </p>
                      <p className="mt-1.5 text-xs text-muted-foreground">
                        Role:{" "}
                        <span className="font-medium text-violet-700 dark:text-violet-300">
                          {row.role}
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
                Paste the user ID of someone who already has an IJAARO account, then grant{" "}
                <code className="rounded bg-muted px-1 py-0.5 text-[11px] text-foreground">
                  {staffRoleLabel}
                </code>{" "}
                on this company.
              </p>
            </div>
          </div>

          <form className="mt-4 space-y-3" onSubmit={(e) => void onLink(e)}>
            <div>
              <Label htmlFor={`${kind}-staff-user-id`}>User ID</Label>
              <div className="relative mt-1.5">
                <Link2
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
                <Input
                  id={`${kind}-staff-user-id`}
                  className="pl-9 font-mono text-[13px]"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX"
                  value={linkUserId}
                  onChange={(e) => setLinkUserId(e.target.value)}
                  disabled={linking}
                  required
                />
              </div>
            </div>
            <Button type="submit" disabled={linking} className="min-h-10 w-full sm:w-auto">
              {linking ? "Linking…" : "Link as staff"}
            </Button>
          </form>
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
                Email invite and Auth provisioning for utility company staff is not available in this
                baseline yet. Create the account separately, then link by user ID.
              </p>
            </div>
          </div>

          <div className="mt-4 space-y-3 opacity-60">
            <div>
              <Label htmlFor={`${kind}-staff-full-name`}>Full name</Label>
              <Input id={`${kind}-staff-full-name`} className="mt-1.5" disabled />
            </div>
            <div>
              <Label htmlFor={`${kind}-staff-invite-email`}>Email</Label>
              <Input id={`${kind}-staff-invite-email`} type="email" className="mt-1.5" disabled />
            </div>
            <div>
              <Label htmlFor={`${kind}-staff-phone`}>Phone (optional)</Label>
              <Input id={`${kind}-staff-phone`} className="mt-1.5" disabled />
            </div>
            <Button type="button" disabled className="min-h-10 w-full sm:w-auto">
              Coming soon
            </Button>
          </div>
        </section>
      </div>
    </div>
  );
}
