import { useEffect, useId, useMemo, useState, type FormEvent } from "react";
import {
  Pencil,
  RefreshCw,
  Search,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";
import { useAuth } from "@/auth/AuthProvider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { supabase } from "@/lib/supabase";
import { statusTone } from "@/lib/format";
import type { AppRole, MembershipStatus } from "@/types/database";
import {
  CredentialsSuccessModal,
  generateTempPassword,
  ModalCloseButton,
  ModalShell,
} from "./DirectoryUi";
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

type CreatedCreds = {
  fullName: string;
  email: string;
  password: string | null;
  created: boolean;
};

async function readFunctionError(fnErr: { message: string; context?: Response }) {
  const ctx = fnErr.context;
  if (ctx) {
    try {
      const body = (await ctx.json()) as { error?: string };
      if (body?.error) return body.error;
    } catch {
      /* keep default */
    }
  }
  return fnErr.message;
}

function roleLabel(role: AppRole): string {
  if (role === "utility_staff") return "Staff";
  if (role === "utility_admin") return "Admin";
  if (role === "utility_customer") return "Customer";
  return role.replaceAll("_", " ");
}

export function StaffPage({ kind }: { kind: UtilityKind }) {
  const { activeMembership, user } = useAuth();
  const tenantId = activeMembership?.tenant_id;
  const matchesKind = activeMembership?.tenant.tenant_type === KIND_TENANT_TYPE[kind];
  const isAdmin = activeMembership?.role === "utility_admin";
  const label = KIND_LABEL[kind];
  const createTitleId = useId();
  const editTitleId = useId();

  const [rows, setRows] = useState<MemberRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [createdCreds, setCreatedCreds] = useState<CreatedCreds | null>(null);
  const [editing, setEditing] = useState<MemberRow | null>(null);

  const [fullName, setFullName] = useState("");
  const [createEmail, setCreateEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [creating, setCreating] = useState(false);
  const [editSaving, setEditSaving] = useState(false);

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

  const syncData = async () => {
    setSyncing(true);
    await load();
    setSyncing(false);
  };

  useEffect(() => {
    if (!tenantId || !matchesKind || !isAdmin) {
      setLoading(false);
      return;
    }
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, matchesKind, isAdmin]);

  const visibleRows = useMemo(() => {
    // Staff directory is for utility_staff only — never list the company admin.
    const base = rows.filter((m) => m.role === "utility_staff");
    const needle = q.trim().toLowerCase();
    if (!needle) return base;
    return base.filter((m) =>
      [m.full_name, m.email, m.phone, m.role]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(needle)),
    );
  }, [rows, q]);

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
        Staff can only be managed by utility admins.
      </div>
    );
  }

  const resetCreateForm = () => {
    setFullName("");
    setCreateEmail("");
    setPhone("");
    setPassword("");
    setShowCreate(false);
  };

  const createStaff = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    const tempPassword = password.trim() || generateTempPassword();
    if (tempPassword.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setCreating(true);
    const { data, error: fnErr } = await supabase.functions.invoke(
      "provision-company-staff",
      {
        body: {
          tenant_id: tenantId,
          email: createEmail.trim().toLowerCase(),
          full_name: fullName.trim(),
          phone: phone.trim() || undefined,
          password: tempPassword,
        },
      },
    );
    setCreating(false);

    if (fnErr) {
      setError(await readFunctionError(fnErr));
      return;
    }

    const payload = data as
      | { ok?: boolean; error?: string; message?: string; created?: boolean }
      | null;
    if (!payload?.ok) {
      setError(payload?.error ?? "Could not create staff account.");
      return;
    }

    const name = fullName.trim();
    const email = createEmail.trim().toLowerCase();
    resetCreateForm();
    setCreatedCreds({
      fullName: name,
      email,
      password: payload.created ? tempPassword : null,
      created: Boolean(payload.created),
    });
    await load();
  };

  const setStatus = async (member: MemberRow, status: MembershipStatus) => {
    if (member.user_id === user?.id && status === "disabled") {
      setError("You cannot disable your own membership.");
      return;
    }
    if (
      !window.confirm(
        `${status === "disabled" ? "Deactivate" : "Activate"} ${member.full_name || member.email || "this member"}?`,
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
    else {
      setEditing(null);
      await load();
    }
  };

  const saveEdit = async (e: FormEvent) => {
    e.preventDefault();
    if (!editing || editing.role === "utility_admin") return;
    setEditSaving(true);
    setError(null);
    const { error: err } = await supabase.rpc("manage_membership", {
      p_tenant_id: tenantId,
      p_user_id: editing.user_id,
      p_role: editing.role,
      p_status: editing.membership_status,
    });
    setEditSaving(false);
    if (err) {
      setError(err.message);
      return;
    }
    setEditing(null);
    await load();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-bold text-foreground">Staff</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Create and manage staff accounts for this {label.toLowerCase()} company.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" onClick={() => setShowCreate(true)}>
            <UserPlus className="h-4 w-4" />
            Create Staff
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={syncing || loading}
            onClick={() => void syncData()}
          >
            <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
            Sync Data
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
          {error}
        </div>
      )}

      <section className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-brand-water" />
            <div>
              <h3 className="font-semibold text-foreground">Staff Directory</h3>
              <p className="text-xs text-muted-foreground">
                Staff are managed here — not under Customers.
              </p>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">Total: {visibleRows.length}</p>
        </div>

        <div className="border-b border-border px-5 py-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search by name, email, or phone…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
        </div>

        {loading ? (
          <div className="px-5 py-10 text-sm text-muted-foreground">Loading…</div>
        ) : visibleRows.length === 0 ? (
          <div className="px-5 py-12 text-center text-sm text-muted-foreground">
            No staff yet. Click Create Staff to add the first account.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-border bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-5 py-3 font-semibold">Staff member</th>
                  <th className="px-5 py-3 font-semibold">Email / Phone</th>
                  <th className="px-5 py-3 font-semibold">Role</th>
                  <th className="px-5 py-3 font-semibold">Status</th>
                  <th className="px-5 py-3 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {visibleRows.map((m) => (
                  <tr key={m.membership_id} className="hover:bg-muted/30">
                    <td className="px-5 py-3">
                      <div className="font-medium text-foreground">
                        {m.full_name || "Unnamed"}
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <div className="text-foreground">{m.email || "—"}</div>
                      <div className="text-xs text-muted-foreground">{m.phone || "—"}</div>
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">{roleLabel(m.role)}</td>
                    <td className="px-5 py-3">
                      <Badge tone={statusTone(m.membership_status)}>
                        {m.membership_status === "active" ? "approved" : m.membership_status}
                      </Badge>
                    </td>
                    <td className="px-5 py-3">
                      {m.role === "utility_admin" ? (
                        <span className="text-xs text-muted-foreground">—</span>
                      ) : (
                        <div className="flex items-center gap-3">
                          {m.membership_status === "active" ? (
                            <button
                              type="button"
                              className="text-sm font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                              onClick={() => void setStatus(m, "disabled")}
                            >
                              Deactivate
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="text-sm font-medium text-brand-green underline-offset-2 hover:underline"
                              onClick={() => void setStatus(m, "active")}
                            >
                              Activate
                            </button>
                          )}
                          <button
                            type="button"
                            className="rounded-md p-1 text-sky-500 hover:bg-sky-500/10"
                            aria-label="Edit staff"
                            onClick={() => setEditing({ ...m })}
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            className="rounded-md p-1 text-red-500 hover:bg-red-500/10"
                            aria-label="Remove staff"
                            onClick={() => void setStatus(m, "disabled")}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <ModalShell
        open={showCreate}
        onClose={resetCreateForm}
        labelledBy={createTitleId}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-green/15 text-brand-green">
              <UserPlus className="h-5 w-5" />
            </div>
            <div>
              <h3 id={createTitleId} className="font-display text-lg font-bold text-foreground">
                Create Staff
              </h3>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Create a staff account for this company. Share the temporary password securely.
              </p>
            </div>
          </div>
          <ModalCloseButton onClick={resetCreateForm} />
        </div>

        <form onSubmit={(e) => void createStaff(e)} className="mt-5 space-y-4">
          <div>
            <Label htmlFor="staff-full-name" className="normal-case tracking-normal">
              Full Name *
            </Label>
            <Input
              id="staff-full-name"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Staff full name"
            />
          </div>
          <div>
            <Label htmlFor="staff-create-email" className="normal-case tracking-normal">
              Email *
            </Label>
            <Input
              id="staff-create-email"
              type="email"
              required
              value={createEmail}
              onChange={(e) => setCreateEmail(e.target.value)}
              placeholder="staff@yourcompany.com"
            />
          </div>
          <div>
            <Label htmlFor="staff-phone" className="normal-case tracking-normal">
              Phone (Optional)
            </Label>
            <Input
              id="staff-phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="0612345678"
            />
          </div>
          <div>
            <Label htmlFor="staff-role" className="normal-case tracking-normal">
              Role
            </Label>
            <Select id="staff-role" disabled value="utility_staff">
              <option value="utility_staff">Staff</option>
            </Select>
            <p className="mt-1.5 text-xs text-muted-foreground">
              New accounts are always created as Staff. Company admin stays with you.
            </p>
          </div>
          <div>
            <Label htmlFor="staff-password" className="normal-case tracking-normal">
              Temporary Password (Optional)
            </Label>
            <Input
              id="staff-password"
              type="text"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Auto-generated if left blank"
            />
          </div>
          <div className="flex flex-wrap justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={resetCreateForm}>
              Cancel
            </Button>
            <Button type="submit" variant="secondary" disabled={creating}>
              {creating ? "Creating…" : "Create Staff"}
            </Button>
          </div>
        </form>
      </ModalShell>

      <ModalShell
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        labelledBy={editTitleId}
      >
        {editing && (
          <>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 id={editTitleId} className="font-display text-lg font-bold text-foreground">
                  Edit Staff
                </h3>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  Update membership status for {editing.full_name || editing.email}.
                </p>
              </div>
              <ModalCloseButton onClick={() => setEditing(null)} />
            </div>
            <form onSubmit={(e) => void saveEdit(e)} className="mt-5 space-y-4">
              <div>
                <Label className="normal-case tracking-normal">Name</Label>
                <Input value={editing.full_name || ""} disabled />
              </div>
              <div>
                <Label className="normal-case tracking-normal">Email</Label>
                <Input value={editing.email || ""} disabled />
              </div>
              <div>
                <Label htmlFor="edit-status" className="normal-case tracking-normal">
                  Status
                </Label>
                <Select
                  id="edit-status"
                  value={editing.membership_status}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      membership_status: e.target.value as MembershipStatus,
                    })
                  }
                >
                  <option value="active">approved (active)</option>
                  <option value="disabled">disabled</option>
                  <option value="invited">invited</option>
                </Select>
              </div>
              <div className="flex flex-wrap justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setEditing(null)}>
                  Cancel
                </Button>
                <Button type="submit" variant="secondary" disabled={editSaving}>
                  {editSaving ? "Saving…" : "Save changes"}
                </Button>
              </div>
            </form>
          </>
        )}
      </ModalShell>

      <CredentialsSuccessModal
        open={Boolean(createdCreds)}
        onClose={() => setCreatedCreds(null)}
        title="Staff Created Successfully"
        subtitle={
          createdCreds?.created
            ? "Share these credentials with the staff member. Keep the temporary password private."
            : "Existing user linked as staff for this company."
        }
        fields={
          createdCreds
            ? [
                { label: "Name", value: createdCreds.fullName, copyable: false },
                { label: "Email", value: createdCreds.email },
                ...(createdCreds.password
                  ? [
                      {
                        label: "Temporary Password",
                        value: createdCreds.password,
                        mono: true,
                      },
                    ]
                  : []),
              ]
            : []
        }
      />
    </div>
  );
}
