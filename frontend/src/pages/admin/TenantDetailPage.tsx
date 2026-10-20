import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Copy, ExternalLink, Trash2 } from "lucide-react";
import { LandingTemplatePicker } from "@/components/landing/LandingTemplatePicker";
import { supabase } from "@/lib/supabase";
import {
  brandingString,
  resolveLandingTemplateId,
  type LandingTemplateId,
} from "@/lib/landingTemplates";
import type {
  AppRole,
  Tenant,
  TenantMembership,
  TenantStatus,
  TenantType,
} from "@/types/database";
import {
  slugifyTenantName,
  tenantSubdomainLabel,
  tenantTypeLabel,
  tenantWorkspaceUrl,
} from "@/lib/tenant";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

const roleOptions: Record<string, AppRole[]> = {
  platform: ["super_admin"],
  landlord: ["landlord_admin", "landlord_staff", "renter"],
  water_company: ["utility_admin", "utility_staff", "utility_customer"],
  electricity_company: ["utility_admin", "utility_staff", "utility_customer"],
};

export function TenantDetailPage() {
  const { tenantId } = useParams();
  const navigate = useNavigate();
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [memberships, setMemberships] = useState<TenantMembership[]>([]);
  const [adminEmail, setAdminEmail] = useState("");
  const [resolvedUserId, setResolvedUserId] = useState<string | null>(null);
  const [resolvedLabel, setResolvedLabel] = useState<string | null>(null);
  const [role, setRole] = useState<AppRole>("landlord_admin");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [landingTemplate, setLandingTemplate] = useState<LandingTemplateId>(
    "modern_professional",
  );
  const [savingBrand, setSavingBrand] = useState(false);
  const [editName, setEditName] = useState("");
  const [editSlug, setEditSlug] = useState("");
  const [editSubdomain, setEditSubdomain] = useState("");
  const [editStatus, setEditStatus] = useState<TenantStatus>("active");
  const [savingEdit, setSavingEdit] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deletingBusy, setDeletingBusy] = useState(false);

  const load = async () => {
    if (!tenantId) return;
    setError(null);
    const [{ data: t, error: tErr }, { data: m, error: mErr }] = await Promise.all([
      supabase.from("tenants").select("*").eq("id", tenantId).maybeSingle(),
      supabase
        .from("tenant_memberships")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false }),
    ]);
    if (tErr || mErr) {
      setError(tErr?.message ?? mErr?.message ?? "Failed to load");
      return;
    }
    setTenant(t);
    setMemberships(m ?? []);
    if (t) {
      const row = t as Tenant;
      const opts = roleOptions[row.tenant_type] ?? [];
      if (opts[0]) setRole(opts[0]);
      setLandingTemplate(
        resolveLandingTemplateId((row.branding ?? {}) as Record<string, unknown>),
      );
      setEditName(row.name);
      setEditSlug(row.slug);
      setEditSubdomain(row.subdomain || row.slug);
      setEditStatus(row.status);
    }
  };

  useEffect(() => {
    void load();
  }, [tenantId]);

  const lookupEmail = async () => {
    setError(null);
    setResolvedUserId(null);
    setResolvedLabel(null);
    const email = adminEmail.trim();
    if (!email) return;
    const { data, error: err } = await supabase.rpc("lookup_profile_by_email", {
      p_email: email,
    });
    if (err) {
      setError(err.message);
      return;
    }
    const rows = (data ?? []) as Array<{
      id: string;
      full_name: string;
      email: string | null;
    }>;
    if (rows.length === 0) {
      setError("No profile found for that email. Ask the user to sign up first.");
      return;
    }
    setResolvedUserId(rows[0].id);
    setResolvedLabel(`${rows[0].full_name} · ${rows[0].email ?? email}`);
  };

  const onAssign = async (e: FormEvent) => {
    e.preventDefault();
    if (!tenantId) return;
    setError(null);
    setMessage(null);

    let userId = resolvedUserId;
    if (!userId && adminEmail.trim()) {
      const { data, error: err } = await supabase.rpc("lookup_profile_by_email", {
        p_email: adminEmail.trim(),
      });
      if (err) {
        setError(err.message);
        return;
      }
      const rows = (data ?? []) as Array<{ id: string }>;
      userId = rows[0]?.id ?? null;
      if (!userId) {
        setError("No profile found for that email.");
        return;
      }
    }

    if (!userId) {
      setError("Enter an admin email and look it up first.");
      return;
    }

    const { error: err } = await supabase.rpc("manage_membership", {
      p_tenant_id: tenantId,
      p_user_id: userId,
      p_role: role,
      p_status: "active",
    });
    if (err) {
      setError(err.message);
      return;
    }
    setMessage("Membership saved and audited.");
    setAdminEmail("");
    setResolvedUserId(null);
    setResolvedLabel(null);
    await load();
  };

  if (!tenant) {
    return (
      <div className="text-sm text-muted-foreground">
        {error ?? "Loading tenant…"}{" "}
        <Link className="text-brand-blue hover:underline" to="/app/admin/tenants">
          Back
        </Link>
      </div>
    );
  }

  const key = tenant.subdomain || tenant.slug;
  const workspaceUrl = tenantWorkspaceUrl(key);
  const branding = (tenant.branding ?? {}) as Record<string, unknown>;
  const currentTemplate = resolveLandingTemplateId(branding);

  const saveTemplate = async () => {
    if (!tenantId || tenant.tenant_type === "platform") return;
    setSavingBrand(true);
    setError(null);
    setMessage(null);
    const { error: err } = await supabase.rpc("update_tenant_branding", {
      p_tenant_id: tenantId,
      p_branding: { landing_template: landingTemplate },
    });
    setSavingBrand(false);
    if (err) {
      setError(err.message);
      return;
    }
    setMessage("Landing template updated without changing other tenant data.");
    await load();
  };

  const onSaveEdit = async (e: FormEvent) => {
    e.preventDefault();
    if (!tenantId || tenant.tenant_type === "platform") return;
    setSavingEdit(true);
    setError(null);
    setMessage(null);
    const { error: err } = await supabase.rpc("update_tenant", {
      p_tenant_id: tenantId,
      p_name: editName.trim(),
      p_slug: slugifyTenantName(editSlug || editName),
      p_subdomain: slugifyTenantName(editSubdomain || editSlug || editName),
      p_status: editStatus,
    });
    setSavingEdit(false);
    if (err) {
      setError(err.message);
      return;
    }
    setMessage("Tenant details saved.");
    await load();
  };

  const onConfirmDelete = async () => {
    if (!tenantId || tenant.tenant_type === "platform") return;
    if (deleteConfirm.trim() !== tenant.name) {
      setError("Type the tenant name exactly to confirm delete.");
      return;
    }
    setDeletingBusy(true);
    setError(null);
    setMessage(null);
    const { error: err } = await supabase.rpc("delete_tenant", {
      p_tenant_id: tenantId,
    });
    setDeletingBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    navigate("/app/admin/tenants");
  };

  return (
    <div className="space-y-6">
      <div>
        <Link className="text-sm text-brand-blue hover:underline" to="/app/admin/tenants">
          ← Tenants
        </Link>
        <h2 className="mt-2 font-display text-2xl font-bold">{tenant.name}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {tenantTypeLabel(tenant.tenant_type)} tenant · isolated workspace
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Badge tone="info">{tenantTypeLabel(tenant.tenant_type)}</Badge>
          <Badge tone="neutral">{tenant.slug}</Badge>
          <Badge tone={tenant.status === "active" ? "success" : "warning"}>
            {tenant.status}
          </Badge>
        </div>
        <div className="mt-4 space-y-2 rounded-xl border border-border bg-card px-4 py-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-muted-foreground">Subdomain</span>
            <code className="rounded bg-muted px-2 py-1 text-xs text-foreground">
              {tenantSubdomainLabel(key)}
            </code>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-muted-foreground">Workspace URL</span>
            <code className="rounded bg-muted px-2 py-1 text-xs text-foreground">
              {workspaceUrl}
            </code>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => void navigator.clipboard.writeText(workspaceUrl)}
            >
              <Copy className="h-3.5 w-3.5" />
              Copy
            </Button>
            <a
              href={workspaceUrl}
              className="inline-flex h-8 items-center gap-1 rounded-lg px-3 text-xs font-semibold text-brand-blue hover:bg-muted"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Open
            </a>
          </div>
        </div>
      </div>

      {tenant.tenant_type !== "platform" && (
        <form
          onSubmit={(e) => void onSaveEdit(e)}
          className="space-y-4 rounded-xl border border-border bg-card p-5"
        >
          <div>
            <h3 className="font-semibold">Edit tenant</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Update name, slug, subdomain, or status. Tenant type cannot be changed.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor="detail-edit-name">Name</Label>
              <Input
                id="detail-edit-name"
                required
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="detail-edit-slug">Slug</Label>
              <Input
                id="detail-edit-slug"
                required
                value={editSlug}
                onChange={(e) => setEditSlug(e.target.value.toLowerCase())}
              />
            </div>
            <div>
              <Label htmlFor="detail-edit-subdomain">Subdomain</Label>
              <Input
                id="detail-edit-subdomain"
                required
                value={editSubdomain}
                onChange={(e) => setEditSubdomain(e.target.value.toLowerCase())}
              />
            </div>
            <div>
              <Label htmlFor="detail-edit-status">Status</Label>
              <Select
                id="detail-edit-status"
                value={editStatus}
                onChange={(e) => setEditStatus(e.target.value as TenantStatus)}
              >
                <option value="active">Active</option>
                <option value="pending">Pending</option>
                <option value="suspended">Suspended</option>
                <option value="disabled">Disabled</option>
              </Select>
            </div>
          </div>
          <Button type="submit" disabled={savingEdit}>
            {savingEdit ? "Saving…" : "Save changes"}
          </Button>
        </form>
      )}

      {tenant.tenant_type !== "platform" && (
        <section className="space-y-4 rounded-xl border border-border bg-card p-5">
          <div>
            <h3 className="font-semibold">Landing template</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Current: <code>{currentTemplate}</code>
              {brandingString(branding, "display_name")
                ? ` · ${brandingString(branding, "display_name")}`
                : ""}
              . Super Admin can change the published template; tenant admins manage full
              branding from their workspace.
            </p>
          </div>
          <LandingTemplatePicker
            value={landingTemplate}
            onChange={setLandingTemplate}
            tenantType={tenant.tenant_type as Exclude<TenantType, "platform">}
          />
          <Button
            type="button"
            disabled={savingBrand || landingTemplate === currentTemplate}
            onClick={() => void saveTemplate()}
          >
            {savingBrand ? "Saving…" : "Apply template"}
          </Button>
        </section>
      )}

      <form
        onSubmit={(e) => void onAssign(e)}
        className="grid gap-3 rounded-xl border border-border bg-card p-5 md:grid-cols-3"
      >
        <div className="md:col-span-3">
          <h3 className="font-semibold">Assign tenant admin / member</h3>
          <p className="text-xs text-muted-foreground">
            Look up an existing user by email, then grant a role for this tenant only.
          </p>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">User email</label>
          <div className="flex gap-2">
            <Input
              type="email"
              required
              value={adminEmail}
              onChange={(e) => {
                setAdminEmail(e.target.value);
                setResolvedUserId(null);
                setResolvedLabel(null);
              }}
              placeholder="admin@company.com"
            />
            <Button type="button" variant="outline" onClick={() => void lookupEmail()}>
              Lookup
            </Button>
          </div>
          {resolvedLabel && (
            <p className="mt-1 text-xs text-brand-blue">Matched: {resolvedLabel}</p>
          )}
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Role</label>
          <select
            className="flex h-10 w-full rounded-lg border border-border bg-card px-3 text-sm"
            value={role}
            onChange={(e) => setRole(e.target.value as AppRole)}
          >
            {(roleOptions[tenant.tenant_type] ?? []).map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-end">
          <Button className="w-full" type="submit">
            Save membership
          </Button>
        </div>
      </form>

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      {message && (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {message}
        </p>
      )}

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted text-muted-foreground">
            <tr>
              <th className="px-4 py-3">User</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {memberships.map((m) => (
              <tr key={m.id} className="border-t border-border">
                <td className="px-4 py-3 font-mono text-xs">{m.user_id}</td>
                <td className="px-4 py-3">{m.role}</td>
                <td className="px-4 py-3">
                  <Badge tone={m.status === "active" ? "success" : "warning"}>{m.status}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {tenant.tenant_type !== "platform" && tenant.status === "suspended" && (
        <section className="space-y-3 rounded-xl border border-red-200 bg-red-50/70 p-5 dark:border-red-500/30 dark:bg-red-500/10">
          <div>
            <h3 className="font-semibold text-red-800 dark:text-red-200">Danger zone</h3>
            <p className="mt-1 text-sm text-red-700/90 dark:text-red-300/90">
              This workspace is suspended. You can permanently delete it and all owned
              properties, bills, payments, and memberships.
            </p>
          </div>
          {!showDelete ? (
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                setShowDelete(true);
                setDeleteConfirm("");
              }}
            >
              <Trash2 className="h-4 w-4" />
              Delete tenant
            </Button>
          ) : (
            <div className="space-y-3">
              <div>
                <Label htmlFor="detail-delete-confirm">
                  Type{" "}
                  <span className="font-mono normal-case tracking-normal">{tenant.name}</span>{" "}
                  to confirm
                </Label>
                <Input
                  id="detail-delete-confirm"
                  value={deleteConfirm}
                  onChange={(e) => setDeleteConfirm(e.target.value)}
                  placeholder={tenant.name}
                  autoComplete="off"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="destructive"
                  disabled={deletingBusy || deleteConfirm.trim() !== tenant.name}
                  onClick={() => void onConfirmDelete()}
                >
                  {deletingBusy ? "Deleting…" : "Delete forever"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setShowDelete(false);
                    setDeleteConfirm("");
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
