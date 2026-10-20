import { useEffect, useState, type FormEvent } from "react";
import { Shield, UserPlus } from "lucide-react";
import { useAuth } from "@/auth/AuthProvider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/supabase";
import { statusTone } from "@/lib/format";
import type { AppRole, MembershipStatus } from "@/types/database";
import { KIND_LABEL, KIND_TENANT_TYPE, type UtilityKind } from "./shared";

type MemberRow = {
  membership_id: string;
  user_id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  role: AppRole;
  membership_status: MembershipStatus;
  created_at: string;
};

const STAFF_ROLES: AppRole[] = ["utility_admin", "utility_staff", "utility_customer"];

export function StaffPage({ kind }: { kind: UtilityKind }) {
  const { activeMembership, user } = useAuth();
  const tenantId = activeMembership?.tenant_id;
  const matchesKind = activeMembership?.tenant.tenant_type === KIND_TENANT_TYPE[kind];
  const isAdmin = activeMembership?.role === "utility_admin";
  const label = KIND_LABEL[kind];

  const [rows, setRows] = useState<MemberRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AppRole>("utility_staff");
  const [resolvedUserId, setResolvedUserId] = useState<string | null>(null);
  const [resolvedLabel, setResolvedLabel] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    if (!tenantId) return;
    setLoading(true);
    const { data, error: err } = await supabase.rpc("list_company_member_profiles", {
      p_tenant_id: tenantId,
    });
    if (err) setError(err.message);
    else {
      setError(null);
      setRows((data as MemberRow[]) ?? []);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (!tenantId || !matchesKind || !isAdmin) {
      setLoading(false);
      return;
    }
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, matchesKind, isAdmin]);

  if (!tenantId || !matchesKind) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-sm text-muted-foreground">
        Switch to a {label.toLowerCase()} company membership to continue.
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-sm text-muted-foreground">
        Staff & permissions can only be managed by utility admins.
      </div>
    );
  }

  const lookup = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setResolvedUserId(null);
    setResolvedLabel(null);
    const { data, error: err } = await supabase.rpc("lookup_profile_by_email", {
      p_email: email.trim(),
    });
    if (err) {
      setError(err.message);
      return;
    }
    const row = (data ?? [])[0] as { id: string; full_name: string; email: string | null } | undefined;
    if (!row) {
      setError("No profile found for that email. They must sign up first.");
      return;
    }
    setResolvedUserId(row.id);
    setResolvedLabel(`${row.full_name || "User"} · ${row.email ?? email}`);
  };

  const saveMembership = async (e: FormEvent) => {
    e.preventDefault();
    if (!resolvedUserId) {
      setError("Look up an email before assigning a role.");
      return;
    }
    if (resolvedUserId === user?.id && role !== "utility_admin") {
      if (!window.confirm("You are about to demote your own admin role. Continue?")) return;
    }
    setSaving(true);
    setError(null);
    setMessage(null);
    const { error: err } = await supabase.rpc("manage_membership", {
      p_tenant_id: tenantId,
      p_user_id: resolvedUserId,
      p_role: role,
      p_status: "active",
    });
    setSaving(false);
    if (err) {
      setError(err.message);
      return;
    }
    setMessage("Membership saved and audited.");
    setEmail("");
    setResolvedUserId(null);
    setResolvedLabel(null);
    await load();
  };

  const setStatus = async (member: MemberRow, status: MembershipStatus) => {
    if (member.user_id === user?.id && status === "disabled") {
      setError("You cannot disable your own membership.");
      return;
    }
    if (
      !window.confirm(
        `${status === "disabled" ? "Disable" : "Activate"} ${member.full_name || member.email || "this member"}?`,
      )
    ) {
      return;
    }
    setError(null);
    const { error: err } = await supabase.rpc("manage_membership", {
      p_tenant_id: tenantId,
      p_user_id: member.user_id,
      p_role: member.role,
      p_status: status,
    });
    if (err) setError(err.message);
    else await load();
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl font-bold text-foreground">Staff & Permissions</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Invite existing users and assign {label.toLowerCase()} company roles. Staff cannot grant
          themselves admin privileges.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
          {error}
        </div>
      )}
      {message && (
        <div className="rounded-lg border border-brand-green/30 bg-brand-green/10 px-4 py-3 text-sm text-brand-green">
          {message}
        </div>
      )}

      <section className="rounded-xl border border-border bg-card p-5">
        <div className="mb-4 flex items-center gap-2">
          <UserPlus className="h-4 w-4 text-brand-water" />
          <h3 className="font-semibold text-foreground">Add or update member</h3>
        </div>
        <form onSubmit={(e) => void lookup(e)} className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <div>
            <Label htmlFor="staff-email">Email</Label>
            <Input
              id="staff-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="staff@company.com"
            />
          </div>
          <div className="flex items-end">
            <Button type="submit" variant="secondary">
              Look up
            </Button>
          </div>
        </form>
        {resolvedLabel && (
          <form onSubmit={(e) => void saveMembership(e)} className="mt-4 grid gap-3 border-t border-border pt-4 sm:grid-cols-[1fr_auto_auto]">
            <div>
              <Label>Resolved user</Label>
              <p className="mt-1 text-sm text-foreground">{resolvedLabel}</p>
            </div>
            <div>
              <Label htmlFor="staff-role">Role</Label>
              <select
                id="staff-role"
                className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"
                value={role}
                onChange={(e) => setRole(e.target.value as AppRole)}
              >
                {STAFF_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r.replaceAll("_", " ")}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <Button type="submit" disabled={saving}>
                {saving ? "Saving…" : "Save role"}
              </Button>
            </div>
          </form>
        )}
      </section>

      <section className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex items-center gap-2 border-b border-border px-5 py-4">
          <Shield className="h-4 w-4 text-brand-water" />
          <h3 className="font-semibold text-foreground">Company members</h3>
        </div>
        {loading ? (
          <div className="px-5 py-8 text-sm text-muted-foreground">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="px-5 py-10 text-sm text-muted-foreground">No members found.</div>
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((m) => (
              <li
                key={m.membership_id}
                className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm"
              >
                <div>
                  <div className="font-medium text-foreground">
                    {m.full_name || m.email || m.user_id.slice(0, 8)}
                  </div>
                  <div className="text-muted-foreground">
                    {m.email || "No email"} · {m.role.replaceAll("_", " ")}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={statusTone(m.membership_status)}>{m.membership_status}</Badge>
                  {m.membership_status === "active" ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => void setStatus(m, "disabled")}
                    >
                      Disable
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => void setStatus(m, "active")}
                    >
                      Activate
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
