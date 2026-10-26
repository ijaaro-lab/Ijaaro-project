import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { ClipboardList, Eye, Home, Pencil, Search, Trash2 } from "lucide-react";
import { useAuth } from "@/auth/AuthProvider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { money, statusTone } from "@/lib/format";
import {
  createPropertyPhotoSignedUrl,
  fetchCoverPathsForProperties,
} from "@/lib/propertyPhotos";
import { supabase } from "@/lib/supabase";
import { propertyLabel, renterLabel, shortId } from "@/lib/tenancyDisplay";
import { cn } from "@/lib/utils";
import type { AssignmentStatus, RentalAssignment } from "@/types/database";

type PropertyRow = { id: string; name: string | null; address_line: string };
type RenterRow = { user_id: string; full_name: string | null; email: string | null };
type StatusFilter = "all" | AssignmentStatus;

const THUMB_CLASS = "h-16 w-[6.75rem] sm:h-[4.25rem] sm:w-[6.75rem]";

function formatDates(startDate: string, endDate: string | null): string {
  if (!endDate) return startDate;
  return `${startDate} → ${endDate}`;
}

function PropertyThumb({
  label,
  storagePath,
}: {
  label: string;
  storagePath?: string | null;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!storagePath) {
      setUrl(null);
      setFailed(false);
      return;
    }
    setFailed(false);
    setUrl(null);
    void (async () => {
      const signed = await createPropertyPhotoSignedUrl(storagePath);
      if (cancelled) return;
      if (!signed) {
        setUrl(null);
        setFailed(true);
        return;
      }
      setUrl(signed);
    })();
    return () => {
      cancelled = true;
    };
  }, [storagePath]);

  if (storagePath && !failed && url) {
    return (
      <img
        src={url}
        alt={label}
        className={cn(THUMB_CLASS, "shrink-0 rounded-xl object-cover")}
        onError={() => {
          setUrl(null);
          setFailed(true);
        }}
      />
    );
  }

  return (
    <div
      className={cn(
        THUMB_CLASS,
        "flex shrink-0 items-center justify-center rounded-xl bg-brand-navy/8 text-brand-navy dark:bg-brand-blue/15 dark:text-brand-water",
        storagePath && !failed && !url && "animate-pulse",
      )}
      role="img"
      aria-label={
        storagePath && !failed && !url ? "Loading property photo" : `${label} thumbnail`
      }
    >
      <Home className="h-5 w-5 opacity-70" aria-hidden />
    </div>
  );
}

const ACTION_BTN =
  "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border/80 bg-transparent text-foreground transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50";

function TenancyActions({
  assignment,
  canMutate,
  busy,
  onEdit,
  onRequestEnd,
}: {
  assignment: RentalAssignment;
  canMutate: boolean;
  busy: boolean;
  onEdit: (assignment: RentalAssignment) => void;
  onRequestEnd: (assignment: RentalAssignment) => void;
}) {
  const label = shortId(assignment.id);
  return (
    <div className="flex items-center justify-end gap-1.5">
      <Link
        to={`/app/landlord/tenancies/${assignment.id}`}
        className={ACTION_BTN}
        aria-label={`View tenancy ${label}`}
        title="View"
      >
        <Eye className="h-4 w-4 opacity-70" aria-hidden />
      </Link>
      <button
        type="button"
        className={ACTION_BTN}
        aria-label={`Edit tenancy ${label}`}
        title={canMutate ? "Edit" : "Edit (requires landlord admin or staff)"}
        disabled={busy || !canMutate}
        onClick={() => onEdit(assignment)}
      >
        <Pencil className="h-4 w-4 opacity-70" aria-hidden />
      </button>
      <button
        type="button"
        className={cn(
          ACTION_BTN,
          "border-red-200 bg-red-50/80 text-red-700 hover:bg-red-50 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300 dark:hover:bg-red-500/15",
        )}
        aria-label={`End tenancy ${label}`}
        title={canMutate ? "Delete" : "Delete (requires landlord admin or staff)"}
        disabled={busy || !canMutate}
        onClick={() => onRequestEnd(assignment)}
      >
        <Trash2 className="h-4 w-4 opacity-70" aria-hidden />
      </button>
    </div>
  );
}

function EditTenancyDialog({
  assignment,
  propertyName,
  renterName,
  onCancel,
  onSaved,
}: {
  assignment: RentalAssignment;
  propertyName: string;
  renterName: string;
  onCancel: () => void;
  onSaved: (updated: RentalAssignment) => void;
}) {
  const titleId = "edit-tenancy-dialog-title";
  const [rentAmount, setRentAmount] = useState(String(assignment.rent_amount));
  const [dueDay, setDueDay] = useState(
    assignment.due_day != null ? String(assignment.due_day) : "",
  );
  const [notes, setNotes] = useState(assignment.notes ?? "");
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const saveInFlight = useRef(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !saving) onCancel();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [saving, onCancel]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (saveInFlight.current) return;
    setFormError(null);
    const amount = Number(rentAmount);
    if (Number.isNaN(amount) || amount < 0) {
      setFormError("Enter a valid rent amount (0 or greater).");
      return;
    }
    let due: number | null = null;
    if (dueDay.trim()) {
      due = Number(dueDay);
      if (!Number.isInteger(due) || due < 1 || due > 28) {
        setFormError("Due day must be blank or an integer from 1 to 28.");
        return;
      }
    }

    saveInFlight.current = true;
    setSaving(true);
    const { data, error } = await supabase
      .from("rental_assignments")
      .update({
        rent_amount: amount,
        due_day: due,
        notes: notes.trim() ? notes.trim() : null,
      })
      .eq("id", assignment.id)
      .eq("tenant_id", assignment.tenant_id)
      .select("*")
      .maybeSingle();
    setSaving(false);
    saveInFlight.current = false;

    if (error) {
      setFormError(error.message);
      return;
    }
    if (!data) {
      setFormError("Could not update this tenancy. It may be protected by access rules.");
      return;
    }
    onSaved(data as RentalAssignment);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving) onCancel();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-[0_16px_40px_rgba(11,31,58,0.18)] dark:shadow-none"
      >
        <h3 id={titleId} className="font-display text-lg font-bold text-foreground">
          Edit tenancy
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {renterName} · {propertyName}
        </p>
        <form className="mt-4 space-y-3" onSubmit={(e) => void submit(e)}>
          <div>
            <Label htmlFor="edit-tenancy-rent">Monthly rent ({assignment.currency})</Label>
            <Input
              id="edit-tenancy-rent"
              type="number"
              min={0}
              step="0.01"
              value={rentAmount}
              onChange={(e) => setRentAmount(e.target.value)}
              disabled={saving}
              required
            />
          </div>
          <div>
            <Label htmlFor="edit-tenancy-due-day">Due day (1–28, optional)</Label>
            <Input
              id="edit-tenancy-due-day"
              type="number"
              min={1}
              max={28}
              value={dueDay}
              onChange={(e) => setDueDay(e.target.value)}
              disabled={saving}
            />
          </div>
          <div>
            <Label htmlFor="edit-tenancy-notes">Notes</Label>
            <Textarea
              id="edit-tenancy-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={saving}
              className="min-h-[88px]"
              rows={3}
            />
          </div>
          {formError && (
            <div
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300"
            >
              {formError}
            </div>
          )}
          <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" disabled={saving} onClick={onCancel}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function EndTenancyDialog({
  assignment,
  renterName,
  propertyName,
  ending,
  limitationOnly,
  onCancel,
  onConfirm,
}: {
  assignment: RentalAssignment;
  renterName: string;
  propertyName: string;
  ending: boolean;
  limitationOnly: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const titleId = "end-tenancy-dialog-title";
  const descId = "end-tenancy-dialog-desc";

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !ending) onCancel();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [ending, onCancel]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !ending) onCancel();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-[0_16px_40px_rgba(11,31,58,0.18)] dark:shadow-none"
      >
        <h3 id={titleId} className="font-display text-lg font-bold text-foreground">
          {limitationOnly ? "Cannot delete tenancy" : "End this tenancy?"}
        </h3>
        <p id={descId} className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {limitationOnly ? (
            <>
              Hard deletion of rental assignments is blocked by database rules. This tenancy (
              <span className="font-medium text-foreground">{renterName}</span> · {propertyName},
              status <span className="font-medium capitalize text-foreground">{assignment.status}</span>
              ) can only be closed while it is <span className="font-medium text-foreground">active</span>{" "}
              via the existing move-out workflow.
            </>
          ) : (
            <>
              Rental assignments cannot be hard-deleted. Ending{" "}
              <span className="font-medium text-foreground">{renterName}</span> at{" "}
              <span className="font-medium text-foreground">{propertyName}</span> will run the
              existing <span className="font-medium text-foreground">complete move-out</span>{" "}
              workflow: the tenancy becomes completed and the property is set available.
            </>
          )}
        </p>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" disabled={ending} autoFocus onClick={onCancel}>
            {limitationOnly ? "Close" : "Cancel"}
          </Button>
          {!limitationOnly && (
            <Button type="button" variant="destructive" disabled={ending} onClick={onConfirm}>
              {ending ? "Ending…" : "End tenancy"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

export function TenanciesPage() {
  const { activeMembership } = useAuth();
  const role = activeMembership?.role ?? null;
  const canMutate = role === "landlord_admin" || role === "landlord_staff";

  const [rows, setRows] = useState<RentalAssignment[]>([]);
  const [propertiesById, setPropertiesById] = useState<Record<string, PropertyRow>>({});
  const [rentersById, setRentersById] = useState<Record<string, RenterRow>>({});
  const [coverByPropertyId, setCoverByPropertyId] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [editing, setEditing] = useState<RentalAssignment | null>(null);
  const [pendingEnd, setPendingEnd] = useState<RentalAssignment | null>(null);
  const [ending, setEnding] = useState(false);
  const endInFlight = useRef(false);

  const load = async () => {
    if (!activeMembership?.tenant_id) return;
    const tenantId = activeMembership.tenant_id;
    setLoading(true);
    const [asgRes, propRes, renterRes] = await Promise.all([
      supabase
        .from("rental_assignments")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false }),
      supabase
        .from("properties")
        .select("id, name, address_line")
        .eq("tenant_id", tenantId),
      supabase.rpc("list_same_tenant_member_profiles", { p_tenant_id: tenantId }),
    ]);

    if (asgRes.error || propRes.error || renterRes.error) {
      setLoading(false);
      setError(
        asgRes.error?.message ||
          propRes.error?.message ||
          renterRes.error?.message ||
          "Failed to load tenancies",
      );
      return;
    }

    setError(null);
    const assignments = (asgRes.data ?? []) as RentalAssignment[];
    setRows(assignments);

    const props: Record<string, PropertyRow> = {};
    for (const p of propRes.data ?? []) {
      props[p.id] = p as PropertyRow;
    }
    setPropertiesById(props);

    const renters: Record<string, RenterRow> = {};
    for (const r of (renterRes.data ?? []) as RenterRow[]) {
      renters[r.user_id] = r;
    }
    setRentersById(renters);

    const propertyIds = [...new Set(assignments.map((a) => a.property_id))];
    const covers = await fetchCoverPathsForProperties(tenantId, propertyIds);
    setCoverByPropertyId(covers);
    setLoading(false);
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMembership?.tenant_id]);

  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (!q) return true;

      const property = propertiesById[r.property_id];
      const renter = rentersById[r.renter_id];
      const haystack = [
        renterLabel(renter),
        renter?.full_name,
        renter?.email,
        propertyLabel(property),
        property?.name,
        property?.address_line,
        r.id,
        shortId(r.id),
        r.property_id,
        shortId(r.property_id),
        r.status,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(q);
    });
  }, [rows, searchQuery, statusFilter, propertiesById, rentersById]);

  const emptyBecauseFilters =
    rows.length > 0 &&
    filteredRows.length === 0 &&
    (searchQuery.trim().length > 0 || statusFilter !== "all");

  const busy = ending;

  const handleEditSaved = (updated: RentalAssignment) => {
    setRows((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
    setEditing(null);
  };

  const confirmEnd = async () => {
    if (!pendingEnd || endInFlight.current) return;
    if (pendingEnd.status !== "active") return;
    endInFlight.current = true;
    setEnding(true);
    setError(null);
    const { error: err } = await supabase.rpc("complete_move_out", {
      p_assignment_id: pendingEnd.id,
      p_end_date: new Date().toISOString().slice(0, 10),
    });
    setEnding(false);
    endInFlight.current = false;
    if (err) {
      setError(err.message);
      setPendingEnd(null);
      return;
    }
    setPendingEnd(null);
    await load();
  };

  const renderActions = (r: RentalAssignment) => (
    <TenancyActions
      assignment={r}
      canMutate={canMutate}
      busy={busy}
      onEdit={setEditing}
      onRequestEnd={setPendingEnd}
    />
  );

  return (
    <div className="space-y-5 sm:space-y-6">
      <section
        aria-labelledby="tenancies-heading"
        className="relative overflow-hidden rounded-2xl border border-sky-100/90 bg-gradient-to-br from-sky-50 via-sky-50/70 to-white px-4 py-6 sm:px-6 sm:py-7 dark:border-sky-500/20 dark:from-sky-950/35 dark:via-sky-950/20 dark:to-card"
      >
        <div
          className="pointer-events-none absolute -right-6 -top-8 h-36 w-36 rounded-full bg-sky-200/40 blur-2xl dark:bg-sky-500/15"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -bottom-10 right-8 hidden h-28 w-28 text-sky-300/50 sm:block dark:text-sky-500/20"
          aria-hidden
        >
          <ClipboardList className="h-full w-full" strokeWidth={1} />
        </div>
        <div className="relative min-w-0 max-w-2xl">
          <h2
            id="tenancies-heading"
            className="font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl"
          >
            Tenancies
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground sm:text-[0.9375rem]">
            Manage active and historical rental assignments across your properties — review
            renters, rent amounts, dates, and status in one place.
          </p>
        </div>
      </section>

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300"
        >
          {error}
        </div>
      )}

      <section
        aria-label="Tenancy records"
        className="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-[0_2px_8px_rgba(11,31,58,0.05)] dark:shadow-none"
      >
        <div className="border-b border-border/80 px-4 py-3.5 sm:px-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300">
                <ClipboardList className="h-4 w-4" aria-hidden />
              </div>
              <div className="min-w-0">
                <h3 className="font-display text-sm font-semibold tracking-tight text-foreground sm:text-base">
                  Tenancy Records
                </h3>
                <p className="mt-0.5 text-xs text-muted-foreground sm:text-sm">
                  View and manage all rental assignments.
                </p>
              </div>
            </div>

            <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center lg:w-auto">
              <label className="relative block min-w-0 flex-1 lg:w-64">
                <span className="sr-only">Search tenancies</span>
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
                <Input
                  placeholder="Search tenant or property…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  aria-label="Search tenancies by tenant or property"
                  className="h-10 pl-9"
                  disabled={loading}
                />
              </label>
              <Select
                aria-label="Filter by status"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                className="h-10 sm:w-48"
                disabled={loading}
              >
                <option value="all">All statuses</option>
                <option value="active">Active</option>
                <option value="invited">Invited</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </Select>
            </div>
          </div>
        </div>

        {loading ? (
          <div
            className="px-4 py-12 text-center text-sm text-muted-foreground sm:px-5"
            aria-live="polite"
          >
            Loading tenancies…
          </div>
        ) : rows.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-navy/8 text-brand-navy dark:bg-brand-blue/15 dark:text-brand-water">
              <ClipboardList className="h-5 w-5" aria-hidden />
            </div>
            <p className="mt-4 text-sm font-medium text-foreground">No tenancies yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Rental assignments will appear here once renters are invited or assigned.
            </p>
          </div>
        ) : emptyBecauseFilters ? (
          <div className="px-6 py-12 text-center">
            <p className="text-sm font-medium text-foreground">No tenancies match your filters</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Try adjusting search or status to see more records.
            </p>
          </div>
        ) : (
          <>
            {/* Desktop / tablet table */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[720px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-border/80 bg-muted/30 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-3 font-semibold sm:px-5">Tenancy</th>
                    <th className="px-4 py-3 font-semibold sm:px-5">Rent</th>
                    <th className="px-4 py-3 font-semibold sm:px-5">Dates</th>
                    <th className="px-4 py-3 font-semibold sm:px-5">Status</th>
                    <th className="px-4 py-3 text-right font-semibold sm:px-5">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/80">
                  {filteredRows.map((r) => {
                    const property = propertiesById[r.property_id];
                    const renter = rentersById[r.renter_id];
                    const propName = propertyLabel(property);
                    return (
                      <tr
                        key={r.id}
                        className="transition-colors hover:bg-muted/40 focus-within:bg-muted/40"
                      >
                        <td className="px-4 py-3.5 sm:px-5">
                          <div className="flex items-center gap-3">
                            <PropertyThumb
                              label={propName}
                              storagePath={coverByPropertyId[r.property_id]}
                            />
                            <div className="min-w-0">
                              <Link
                                to={`/app/landlord/tenancies/${r.id}`}
                                className="font-medium text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              >
                                {renterLabel(renter)}
                              </Link>
                              <div className="text-xs text-muted-foreground">{propName}</div>
                              <div className="mt-0.5 font-mono text-[11px] text-muted-foreground/80">
                                {shortId(r.id)} · property {shortId(r.property_id)}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3.5 font-medium tabular-nums sm:px-5">
                          {money(r.rent_amount, r.currency)}
                          <span className="font-normal text-muted-foreground"> / mo</span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3.5 text-muted-foreground sm:px-5">
                          {formatDates(r.start_date, r.end_date)}
                        </td>
                        <td className="px-4 py-3.5 sm:px-5">
                          <Badge tone={statusTone(r.status)} className="capitalize">
                            {r.status}
                          </Badge>
                        </td>
                        <td className="px-4 py-3.5 sm:px-5">{renderActions(r)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <ul className="divide-y divide-border/80 md:hidden">
              {filteredRows.map((r) => {
                const property = propertiesById[r.property_id];
                const renter = rentersById[r.renter_id];
                const propName = propertyLabel(property);
                return (
                  <li key={r.id} className="px-4 py-4">
                    <div className="flex items-start gap-3">
                      <PropertyThumb
                        label={propName}
                        storagePath={coverByPropertyId[r.property_id]}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0">
                            <Link
                              to={`/app/landlord/tenancies/${r.id}`}
                              className="break-words font-medium text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                              {renterLabel(renter)}
                            </Link>
                            <p className="mt-0.5 break-words text-sm text-muted-foreground">
                              {propName}
                            </p>
                            <p className="mt-0.5 font-mono text-[11px] text-muted-foreground/80">
                              {shortId(r.id)} · property {shortId(r.property_id)}
                            </p>
                          </div>
                          <Badge tone={statusTone(r.status)} className="capitalize">
                            {r.status}
                          </Badge>
                        </div>
                        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                          <span className="font-semibold tabular-nums text-foreground">
                            {money(r.rent_amount, r.currency)}
                            <span className="font-normal text-muted-foreground"> / mo</span>
                          </span>
                          <span className="text-muted-foreground">
                            {formatDates(r.start_date, r.end_date)}
                          </span>
                        </div>
                        <div className="mt-3 flex justify-end">{renderActions(r)}</div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </section>

      {editing && (
        <EditTenancyDialog
          assignment={editing}
          propertyName={propertyLabel(propertiesById[editing.property_id])}
          renterName={renterLabel(rentersById[editing.renter_id])}
          onCancel={() => setEditing(null)}
          onSaved={handleEditSaved}
        />
      )}

      {pendingEnd && (
        <EndTenancyDialog
          assignment={pendingEnd}
          renterName={renterLabel(rentersById[pendingEnd.renter_id])}
          propertyName={propertyLabel(propertiesById[pendingEnd.property_id])}
          ending={ending}
          limitationOnly={pendingEnd.status !== "active"}
          onCancel={() => {
            if (!ending) setPendingEnd(null);
          }}
          onConfirm={() => void confirmEnd()}
        />
      )}
    </div>
  );
}
