import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  ChevronLeft,
  ChevronRight,
  Copy,
  ExternalLink,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { Tenant, TenantStatus, TenantType } from "@/types/database";
import {
  slugifyTenantName,
  tenantSubdomainLabel,
  tenantTypeLabel,
  tenantWorkspaceUrl,
} from "@/lib/tenant";
import { CreateTenantWizard } from "@/components/admin/CreateTenantWizard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

const PAGE_SIZE = 10;

const statusTone: Record<
  TenantStatus,
  "success" | "warning" | "danger" | "neutral" | "info"
> = {
  active: "success",
  pending: "warning",
  suspended: "danger",
  disabled: "neutral",
};

export function TenantsPage() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [memberCounts, setMemberCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<"all" | TenantType>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | TenantStatus>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<Tenant | null>(null);
  const [editName, setEditName] = useState("");
  const [editSlug, setEditSlug] = useState("");
  const [editSubdomain, setEditSubdomain] = useState("");
  const [editStatus, setEditStatus] = useState<TenantStatus>("active");
  const [savingEdit, setSavingEdit] = useState(false);
  const [deleting, setDeleting] = useState<Tenant | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deletingBusy, setDeletingBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    const [{ data, error: err }, { data: memberships }] = await Promise.all([
      supabase.from("tenants").select("*").order("created_at", { ascending: false }),
      supabase.from("tenant_memberships").select("tenant_id").eq("status", "active"),
    ]);
    if (err) setError(err.message);
    setTenants(data ?? []);
    const counts: Record<string, number> = {};
    for (const row of memberships ?? []) {
      counts[row.tenant_id] = (counts[row.tenant_id] ?? 0) + 1;
    }
    setMemberCounts(counts);
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, []);

  const setStatus = async (tenantId: string, status: TenantStatus) => {
    setError(null);
    const { error: err } = await supabase.rpc("set_tenant_status", {
      p_tenant_id: tenantId,
      p_status: status,
    });
    if (err) {
      setError(err.message);
      return;
    }
    await load();
  };

  const openEdit = (t: Tenant) => {
    setShowCreate(false);
    setDeleting(null);
    setEditing(t);
    setEditName(t.name);
    setEditSlug(t.slug);
    setEditSubdomain(t.subdomain || t.slug);
    setEditStatus(t.status);
    setError(null);
  };

  const closeEdit = () => {
    setEditing(null);
    setSavingEdit(false);
  };

  const onSaveEdit = async (e: FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    setSavingEdit(true);
    setError(null);
    const { error: err } = await supabase.rpc("update_tenant", {
      p_tenant_id: editing.id,
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
    closeEdit();
    await load();
  };

  const openDelete = (t: Tenant) => {
    setShowCreate(false);
    setEditing(null);
    setDeleting(t);
    setDeleteConfirm("");
    setError(null);
  };

  const closeDelete = () => {
    setDeleting(null);
    setDeleteConfirm("");
    setDeletingBusy(false);
  };

  const onConfirmDelete = async () => {
    if (!deleting) return;
    if (deleteConfirm.trim() !== deleting.name) {
      setError("Type the tenant name exactly to confirm delete.");
      return;
    }
    setDeletingBusy(true);
    setError(null);
    const { error: err } = await supabase.rpc("delete_tenant", {
      p_tenant_id: deleting.id,
    });
    setDeletingBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    closeDelete();
    await load();
  };

  const copyWorkspace = async (tenantSlug: string) => {
    await navigator.clipboard.writeText(tenantWorkspaceUrl(tenantSlug));
    setCopiedSlug(tenantSlug);
    window.setTimeout(() => setCopiedSlug(null), 1800);
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tenants.filter((t) => {
      if (t.tenant_type === "platform") return false;
      if (typeFilter !== "all" && t.tenant_type !== typeFilter) return false;
      if (statusFilter !== "all" && t.status !== statusFilter) return false;
      if (q) {
        const hay = `${t.name} ${t.slug} ${t.subdomain ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [tenants, typeFilter, statusFilter, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const pageRows = filtered.slice(pageStart, pageStart + PAGE_SIZE);
  const rangeFrom = filtered.length === 0 ? 0 : pageStart + 1;
  const rangeTo = Math.min(pageStart + PAGE_SIZE, filtered.length);

  useEffect(() => {
    setPage(1);
  }, [typeFilter, statusFilter, search]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-bold text-foreground">Tenants</h2>
          <p className="text-sm text-muted-foreground">
            Create, edit, suspend, or delete workspaces.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant={showCreate ? "outline" : "primary"}
          onClick={() => {
            setEditing(null);
            setDeleting(null);
            setShowCreate((v) => !v);
          }}
        >
          {showCreate ? (
            <>
              <X className="h-4 w-4" />
              Close
            </>
          ) : (
            <>
              <Plus className="h-4 w-4" />
              Create tenant
            </>
          )}
        </Button>
      </div>

      {showCreate && (
        <CreateTenantWizard
          compact
          onCreated={() => {
            setShowCreate(false);
            void load();
          }}
        />
      )}

      {editing && (
        <form
          onSubmit={(e) => void onSaveEdit(e)}
          className="space-y-4 rounded-2xl border border-border bg-card p-5"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="font-semibold text-foreground">Edit tenant</h3>
              <p className="text-xs text-muted-foreground">
                {tenantTypeLabel(editing.tenant_type)} · type cannot be changed
              </p>
            </div>
            <Button type="button" size="sm" variant="ghost" onClick={closeEdit}>
              <X className="h-4 w-4" />
              Cancel
            </Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor="edit-name">Name</Label>
              <Input
                id="edit-name"
                required
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="edit-slug">Slug</Label>
              <Input
                id="edit-slug"
                required
                value={editSlug}
                onChange={(e) => setEditSlug(e.target.value.toLowerCase())}
              />
            </div>
            <div>
              <Label htmlFor="edit-subdomain">Subdomain</Label>
              <Input
                id="edit-subdomain"
                required
                value={editSubdomain}
                onChange={(e) => setEditSubdomain(e.target.value.toLowerCase())}
              />
            </div>
            <div>
              <Label htmlFor="edit-status">Status</Label>
              <Select
                id="edit-status"
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
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={savingEdit}>
              {savingEdit ? "Saving…" : "Save changes"}
            </Button>
            <Button type="button" variant="outline" onClick={closeEdit}>
              Cancel
            </Button>
          </div>
        </form>
      )}

      {deleting && (
        <div className="space-y-4 rounded-2xl border border-red-200 bg-red-50/80 p-5 dark:border-red-500/30 dark:bg-red-500/10">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="font-semibold text-red-800 dark:text-red-200">
                Delete tenant permanently
              </h3>
              <p className="mt-1 text-sm text-red-700/90 dark:text-red-300/90">
                This removes <strong>{deleting.name}</strong> and all its properties, bills,
                payments, meters, and memberships. This cannot be undone.
              </p>
            </div>
            <Button type="button" size="sm" variant="ghost" onClick={closeDelete}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div>
            <Label htmlFor="delete-confirm">
              Type <span className="font-mono normal-case tracking-normal">{deleting.name}</span>{" "}
              to confirm
            </Label>
            <Input
              id="delete-confirm"
              value={deleteConfirm}
              onChange={(e) => setDeleteConfirm(e.target.value)}
              placeholder={deleting.name}
              autoComplete="off"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="destructive"
              disabled={deletingBusy || deleteConfirm.trim() !== deleting.name}
              onClick={() => void onConfirmDelete()}
            >
              {deletingBusy ? "Deleting…" : "Delete forever"}
            </Button>
            <Button type="button" variant="outline" onClick={closeDelete}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[12rem] flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, slug…"
            className="h-9 pl-9"
            aria-label="Search tenants"
          />
        </div>
        <Select
          className="h-9 w-auto min-w-[9rem]"
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as "all" | TenantType)}
        >
          <option value="all">All types</option>
          <option value="landlord">Landlord</option>
          <option value="water_company">Water</option>
          <option value="electricity_company">Electricity</option>
        </Select>
        <Select
          className="h-9 w-auto min-w-[9rem]"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as "all" | TenantStatus)}
        >
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="pending">Pending</option>
          <option value="suspended">Suspended</option>
          <option value="disabled">Disabled</option>
        </Select>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted/60 text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Tenant</th>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Members</th>
              <th className="px-4 py-3 font-medium">Subdomain</th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="px-4 py-8 text-muted-foreground" colSpan={6}>
                  Loading…
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td className="px-4 py-8 text-muted-foreground" colSpan={6}>
                  {search.trim() || typeFilter !== "all" || statusFilter !== "all"
                    ? "No tenants match your search or filters."
                    : "No tenants yet. Use Create tenant to add one."}
                </td>
              </tr>
            ) : (
              pageRows.map((t) => {
                const key = t.subdomain || t.slug;
                return (
                  <tr key={t.id} className="border-t border-border">
                    <td className="px-4 py-3">
                      <Link
                        className="font-medium text-foreground hover:text-brand-blue"
                        to={`/app/admin/tenants/${t.id}`}
                      >
                        {t.name}
                      </Link>
                      <div className="text-xs text-muted-foreground">{t.slug}</div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {tenantTypeLabel(t.tenant_type)}
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={statusTone[t.status]}>{t.status}</Badge>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {memberCounts[t.id] ?? 0}
                    </td>
                    <td className="px-4 py-3">
                      <code className="text-[11px] text-muted-foreground">
                        {tenantSubdomainLabel(key)}
                      </code>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1.5">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => openEdit(t)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => void copyWorkspace(key)}
                        >
                          <Copy className="h-3.5 w-3.5" />
                          {copiedSlug === key ? "Copied" : "URL"}
                        </Button>
                        <a
                          href={tenantWorkspaceUrl(key)}
                          className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-brand-blue hover:bg-muted"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                          Open
                        </a>
                        {t.status !== "active" ? (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => void setStatus(t.id, "active")}
                          >
                            Activate
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => void setStatus(t.id, "suspended")}
                          >
                            Suspend
                          </Button>
                        )}
                        {t.status === "suspended" && (
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => openDelete(t)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Delete
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
        {!loading && filtered.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3">
            <p className="text-xs text-muted-foreground">
              Showing {rangeFrom}–{rangeTo} of {filtered.length} tenant
              {filtered.length === 1 ? "" : "s"}
            </p>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={currentPage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                Previous
              </Button>
              <span className="min-w-[5.5rem] text-center text-xs font-medium text-muted-foreground">
                Page {currentPage} of {totalPages}
              </span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={currentPage >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Next
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
