import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  Building2,
  CheckCircle2,
  Eye,
  EyeOff,
  Home,
  MapPin,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Trash2,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "@/auth/AuthProvider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  createPropertyPhotoSignedUrl,
  fetchCoverPathsForProperties,
} from "@/lib/propertyPhotos";
import { money, statusTone } from "@/lib/format";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import type { Property, PropertyStatus } from "@/types/database";

type StatusFilter = "all" | PropertyStatus;
type ListedFilter = "all" | "published" | "unpublished";
type SortKey = "newest" | "oldest" | "name" | "rent_high" | "rent_low";
type StatAccent = "navy" | "green" | "teal" | "orange" | "pink";

const STAT_ACCENTS: Record<StatAccent, string> = {
  navy: "bg-brand-navy/10 text-brand-navy dark:bg-brand-blue/20 dark:text-brand-water",
  green: "bg-brand-green/10 text-brand-green dark:bg-brand-green/20 dark:text-brand-green",
  teal: "bg-cyan-100 text-cyan-700 dark:bg-cyan-500/20 dark:text-cyan-300",
  orange: "bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-300",
  pink: "bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-500/20 dark:text-fuchsia-300",
};

/** Matches intended RLS: not occupied and no current renter. */
export function isPropertyDeletable(property: Property): boolean {
  return property.status !== "occupied" && property.current_renter_id == null;
}

export function propertyDeleteBlockedMessage(property: Property): string {
  if (property.status === "occupied" || property.current_renter_id != null) {
    return "This property cannot be deleted while it is occupied or assigned to a renter.";
  }
  return "This property cannot be deleted.";
}

/** User-facing copy when Supabase/RLS/FK rejects or returns no deleted row. */
export function formatPropertyDeleteFailure(
  errorMessage: string | null | undefined,
  deletedCount: number,
): string {
  if (errorMessage) {
    const lower = errorMessage.toLowerCase();
    if (
      lower.includes("foreign key") ||
      lower.includes("violates foreign key") ||
      lower.includes("restrict") ||
      lower.includes("still referenced")
    ) {
      return "This property could not be deleted because related records still exist (for example tenancies, rent history, or applications). Remove or complete those first.";
    }
    if (lower.includes("row-level security") || lower.includes("permission") || lower.includes("policy")) {
      return "You do not have permission to delete this property.";
    }
    return errorMessage;
  }
  if (deletedCount < 1) {
    return "Could not delete this property. It may be protected by access rules or still linked to other records.";
  }
  return "Could not delete this property.";
}

function StatCard({
  label,
  value,
  icon: Icon,
  accent,
}: {
  label: string;
  value: number;
  icon: LucideIcon;
  accent: StatAccent;
}) {
  return (
    <div className="rounded-2xl border border-border/80 bg-card px-4 py-3.5 shadow-[0_2px_8px_rgba(11,31,58,0.05)] transition-shadow hover:shadow-[0_4px_14px_rgba(11,31,58,0.08)] dark:shadow-none dark:hover:shadow-none">
      <div className="flex items-center gap-3">
        <div className={cn("shrink-0 rounded-xl p-2.5", STAT_ACCENTS[accent])}>
          <Icon className="h-4 w-4" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-medium text-muted-foreground">{label}</div>
          <div className="mt-0.5 truncate font-display text-2xl font-bold leading-none tracking-tight text-foreground tabular-nums">
            {value}
          </div>
        </div>
      </div>
    </div>
  );
}

function PropertyThumb({
  name,
  storagePath,
  className,
}: {
  name: string;
  storagePath?: string | null;
  className?: string;
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
        alt={name}
        className={cn("shrink-0 rounded-xl object-cover", className)}
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
        "flex shrink-0 items-center justify-center rounded-xl bg-brand-navy/8 text-brand-navy dark:bg-brand-blue/15 dark:text-brand-water",
        storagePath && !failed && !url && "animate-pulse",
        className,
      )}
      role="img"
      aria-label={
        storagePath && !failed && !url ? "Loading property photo" : `${name} thumbnail`
      }
    >
      <Home className="h-5 w-5 opacity-70" aria-hidden />
    </div>
  );
}

function propertyTitle(p: Property) {
  return p.name || p.address_line;
}

function propertyLocation(p: Property) {
  const parts = [p.address_line, p.district, p.city].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : "—";
}

function PropertyActions({
  property,
  showDelete,
  onRequestDelete,
}: {
  property: Property;
  showDelete: boolean;
  onRequestDelete: (property: Property) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-9 w-9 shrink-0 p-0"
        aria-label="Property actions"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <MoreHorizontal className="h-4 w-4" aria-hidden />
      </Button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-20 mt-1.5 min-w-[10.5rem] overflow-hidden rounded-xl border border-border bg-card py-1 shadow-[0_8px_24px_rgba(11,31,58,0.12)] dark:shadow-none"
        >
          <Link
            role="menuitem"
            to={`/app/landlord/properties/${property.id}`}
            className="flex items-center gap-2 px-3 py-2.5 text-sm text-foreground transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none"
            onClick={() => setOpen(false)}
          >
            <Eye className="h-4 w-4 opacity-70" aria-hidden />
            View
          </Link>
          <Link
            role="menuitem"
            to={`/app/landlord/properties/${property.id}/edit`}
            className="flex items-center gap-2 px-3 py-2.5 text-sm text-foreground transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none"
            onClick={() => setOpen(false)}
          >
            <Pencil className="h-4 w-4 opacity-70" aria-hidden />
            Edit
          </Link>
          {showDelete && (
            <button
              type="button"
              role="menuitem"
              className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-red-700 transition-colors hover:bg-red-50 focus-visible:bg-red-50 focus-visible:outline-none dark:text-red-300 dark:hover:bg-red-500/10 dark:focus-visible:bg-red-500/10"
              onClick={() => {
                setOpen(false);
                onRequestDelete(property);
              }}
            >
              <Trash2 className="h-4 w-4 opacity-70" aria-hidden />
              Delete
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function DeletePropertyDialog({
  property,
  deleting,
  onCancel,
  onConfirm,
}: {
  property: Property;
  deleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const title = propertyTitle(property);
  const titleId = "delete-property-dialog-title";
  const descId = "delete-property-dialog-desc";

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !deleting) onCancel();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [deleting, onCancel]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !deleting) onCancel();
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
          Delete property?
        </h3>
        <p id={descId} className="mt-2 text-sm leading-relaxed text-muted-foreground">
          You are about to permanently delete{" "}
          <span className="font-medium text-foreground">{title}</span>. This cannot be undone.
        </p>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            disabled={deleting}
            autoFocus
            onClick={onCancel}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={deleting}
            onClick={onConfirm}
          >
            {deleting ? "Deleting…" : "Delete"}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function PropertiesPage() {
  const { activeMembership } = useAuth();
  const tenantId = activeMembership?.tenant_id;
  const isLandlordAdmin = activeMembership?.role === "landlord_admin";
  const [rows, setRows] = useState<Property[]>([]);
  const [coverByPropertyId, setCoverByPropertyId] = useState<Record<string, string>>({});
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [listedFilter, setListedFilter] = useState<ListedFilter>("all");
  const [districtFilter, setDistrictFilter] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("newest");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingDelete, setPendingDelete] = useState<Property | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!tenantId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error: err } = await supabase
        .from("properties")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false });
      if (cancelled) return;
      if (err) {
        setError(err.message);
        setRows([]);
        setCoverByPropertyId({});
      } else {
        setError(null);
        const props = data ?? [];
        setRows(props);
        const covers = await fetchCoverPathsForProperties(
          tenantId,
          props.map((p) => p.id),
        );
        if (!cancelled) setCoverByPropertyId(covers);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  const districts = useMemo(() => {
    const values = new Set<string>();
    for (const row of rows) {
      const district = row.district?.trim();
      if (district) values.add(district);
    }
    return [...values].sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const stats = useMemo(
    () => ({
      total: rows.length,
      available: rows.filter((p) => p.status === "available").length,
      occupied: rows.filter((p) => p.status === "occupied").length,
      published: rows.filter((p) => p.is_listed).length,
      unpublished: rows.filter((p) => !p.is_listed).length,
    }),
    [rows],
  );

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    const next = rows.filter((p) => {
      if (statusFilter !== "all" && p.status !== statusFilter) return false;
      if (listedFilter === "published" && !p.is_listed) return false;
      if (listedFilter === "unpublished" && p.is_listed) return false;
      if (districtFilter !== "all" && (p.district ?? "") !== districtFilter) return false;
      if (!query) return true;
      const hay = `${p.name ?? ""} ${p.address_line} ${p.district ?? ""} ${p.city ?? ""}`.toLowerCase();
      return hay.includes(query);
    });

    next.sort((a, b) => {
      switch (sortKey) {
        case "oldest":
          return a.created_at.localeCompare(b.created_at);
        case "name":
          return propertyTitle(a).localeCompare(propertyTitle(b), undefined, {
            sensitivity: "base",
          });
        case "rent_high":
          return (Number(b.rent_amount) || 0) - (Number(a.rent_amount) || 0);
        case "rent_low":
          return (Number(a.rent_amount) || 0) - (Number(b.rent_amount) || 0);
        case "newest":
        default:
          return b.created_at.localeCompare(a.created_at);
      }
    });

    return next;
  }, [rows, q, statusFilter, listedFilter, districtFilter, sortKey]);

  const requestDelete = (property: Property) => {
    if (!isLandlordAdmin) return;
    if (!isPropertyDeletable(property)) {
      setError(propertyDeleteBlockedMessage(property));
      setPendingDelete(null);
      return;
    }
    setError(null);
    setPendingDelete(property);
  };

  const cancelDelete = () => {
    if (deleting) return;
    setPendingDelete(null);
  };

  const confirmDelete = async () => {
    if (!pendingDelete || !tenantId || deleting) return;
    if (!isLandlordAdmin) {
      setPendingDelete(null);
      setError("Only landlord admins can delete properties.");
      return;
    }
    if (!isPropertyDeletable(pendingDelete)) {
      setError(propertyDeleteBlockedMessage(pendingDelete));
      setPendingDelete(null);
      return;
    }

    const targetId = pendingDelete.id;
    setDeleting(true);
    setError(null);

    const { data, error: err } = await supabase
      .from("properties")
      .delete()
      .eq("id", targetId)
      .eq("tenant_id", tenantId)
      .select("id");

    setDeleting(false);

    if (err) {
      setError(formatPropertyDeleteFailure(err.message, 0));
      return;
    }

    const deletedCount = data?.length ?? 0;
    if (deletedCount < 1) {
      setError(formatPropertyDeleteFailure(null, 0));
      return;
    }

    setPendingDelete(null);
    setRows((prev) => prev.filter((row) => row.id !== targetId));
    setCoverByPropertyId((prev) => {
      if (!(targetId in prev)) return prev;
      const next = { ...prev };
      delete next[targetId];
      return next;
    });
  };

  if (!tenantId || activeMembership?.tenant.tenant_type !== "landlord") {
    return (
      <div className="rounded-2xl border border-border bg-card p-8 text-sm text-muted-foreground">
        Landlord membership required.
      </div>
    );
  }

  const emptyBecauseFilters =
    rows.length > 0 && filtered.length === 0 && (q.trim() || statusFilter !== "all" || listedFilter !== "all" || districtFilter !== "all");

  return (
    <div className="space-y-5 sm:space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h2 className="font-display text-2xl font-bold tracking-tight text-foreground sm:text-[1.75rem]">
            Properties
          </h2>
          <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-muted-foreground">
            Manage property listings for your landlord workspace — review status, publish
            availability, and keep inventory up to date.
          </p>
        </div>
        <Link to="/app/landlord/properties/new" className="shrink-0">
          <Button className="min-h-10 w-full gap-1.5 sm:w-auto">
            <Plus className="h-4 w-4" aria-hidden />
            New property
          </Button>
        </Link>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300"
        >
          {error}
        </div>
      )}

      {loading ? (
        <div
          className="rounded-2xl border border-dashed border-border bg-card/60 px-4 py-12 text-center text-sm text-muted-foreground"
          aria-live="polite"
        >
          Loading properties…
        </div>
      ) : (
        <>
      <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <StatCard label="Total Properties" value={stats.total} icon={Building2} accent="navy" />
        <StatCard label="Available" value={stats.available} icon={CheckCircle2} accent="green" />
        <StatCard label="Occupied" value={stats.occupied} icon={Users} accent="teal" />
        <StatCard label="Published" value={stats.published} icon={Eye} accent="orange" />
        <StatCard label="Unpublished" value={stats.unpublished} icon={EyeOff} accent="pink" />
      </div>

      <section
        aria-label="Search and filters"
        className="rounded-2xl border border-border/80 bg-card p-3.5 shadow-[0_2px_8px_rgba(11,31,58,0.05)] sm:p-4 dark:shadow-none"
      >
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <label className="relative block min-w-0 sm:col-span-2 xl:col-span-2">
            <span className="sr-only">Search properties</span>
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              placeholder="Search by name, address, or district…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-label="Search properties"
              className="h-10 pl-9"
            />
          </label>

          <Select
            aria-label="Filter by status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          >
            <option value="all">All statuses</option>
            <option value="available">Available</option>
            <option value="occupied">Occupied</option>
            <option value="vacant">Vacant</option>
          </Select>

          <Select
            aria-label="Filter by publish state"
            value={listedFilter}
            onChange={(e) => setListedFilter(e.target.value as ListedFilter)}
          >
            <option value="all">All publish states</option>
            <option value="published">Published</option>
            <option value="unpublished">Unpublished</option>
          </Select>

          <Select
            aria-label="Sort properties"
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="name">Name A–Z</option>
            <option value="rent_high">Rent: high to low</option>
            <option value="rent_low">Rent: low to high</option>
          </Select>

          {districts.length > 0 && (
            <Select
              aria-label="Filter by district"
              value={districtFilter}
              onChange={(e) => setDistrictFilter(e.target.value)}
              className="sm:col-span-2 xl:col-span-1"
            >
              <option value="all">All districts</option>
              {districts.map((district) => (
                <option key={district} value={district}>
                  {district}
                </option>
              ))}
            </Select>
          )}
        </div>
      </section>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card px-6 py-12 text-center shadow-[0_2px_8px_rgba(11,31,58,0.04)] dark:shadow-none">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-navy/8 text-brand-navy dark:bg-brand-blue/15 dark:text-brand-water">
            <Home className="h-5 w-5" aria-hidden />
          </div>
          <p className="mt-4 text-sm font-medium text-foreground">
            {emptyBecauseFilters ? "No properties match your filters" : "No properties yet"}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {emptyBecauseFilters
              ? "Try adjusting search or filters to see more listings."
              : "Create your first listing to get started."}
          </p>
          {!emptyBecauseFilters && (
            <Link to="/app/landlord/properties/new" className="mt-4 inline-block">
              <Button size="sm" className="min-h-9 gap-1.5">
                <Plus className="h-4 w-4" aria-hidden />
                New property
              </Button>
            </Link>
          )}
        </div>
      ) : (
        <>
          {/* Mobile / tablet cards */}
          <ul className="grid gap-3 md:hidden">
            {filtered.map((p) => {
              const title = propertyTitle(p);
              return (
                <li
                  key={p.id}
                  className="rounded-2xl border border-border/80 bg-card p-3.5 shadow-[0_2px_8px_rgba(11,31,58,0.05)] transition-shadow hover:shadow-[0_4px_14px_rgba(11,31,58,0.08)] dark:shadow-none dark:hover:shadow-none"
                >
                  <div className="flex items-start gap-3">
                    <PropertyThumb
                      name={title}
                      storagePath={coverByPropertyId[p.id]}
                      className="h-16 w-16"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <Link
                            to={`/app/landlord/properties/${p.id}`}
                            className="break-words font-medium text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            {title}
                          </Link>
                          <div className="mt-1 flex items-start gap-1 text-sm text-muted-foreground">
                            <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
                            <span className="break-words">{propertyLocation(p)}</span>
                          </div>
                        </div>
                        <PropertyActions
                          property={p}
                          showDelete={isLandlordAdmin}
                          onRequestDelete={requestDelete}
                        />
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold tabular-nums text-foreground">
                          {money(p.rent_amount, p.currency)}
                          <span className="font-normal text-muted-foreground"> / mo</span>
                        </span>
                        <Badge tone={statusTone(p.status)} className="capitalize">
                          {p.status}
                        </Badge>
                        <Badge tone={p.is_listed ? "success" : "neutral"}>
                          {p.is_listed ? "Published" : "Unpublished"}
                        </Badge>
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>

          {/* Desktop table */}
          <div className="hidden overflow-hidden rounded-2xl border border-border/80 bg-card shadow-[0_2px_8px_rgba(11,31,58,0.05)] md:block dark:shadow-none">
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-border/80 bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3.5 font-semibold sm:px-5">Property</th>
                    <th className="px-4 py-3.5 font-semibold sm:px-5">Location</th>
                    <th className="px-4 py-3.5 font-semibold sm:px-5">Monthly rent</th>
                    <th className="px-4 py-3.5 font-semibold sm:px-5">Status</th>
                    <th className="px-4 py-3.5 font-semibold sm:px-5">Listed</th>
                    <th className="px-4 py-3.5 text-right font-semibold sm:px-5">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/80">
                  {filtered.map((p) => {
                    const title = propertyTitle(p);
                    return (
                      <tr
                        key={p.id}
                        className="transition-colors hover:bg-muted/40 focus-within:bg-muted/40"
                      >
                        <td className="px-4 py-3.5 sm:px-5">
                          <div className="flex items-center gap-3">
                            <PropertyThumb
                              name={title}
                              storagePath={coverByPropertyId[p.id]}
                              className="h-12 w-12"
                            />
                            <Link
                              to={`/app/landlord/properties/${p.id}`}
                              className="min-w-0 font-medium text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                              <span className="line-clamp-2 break-words">{title}</span>
                            </Link>
                          </div>
                        </td>
                        <td className="max-w-[16rem] px-4 py-3.5 text-muted-foreground sm:px-5">
                          <div className="flex items-start gap-1.5">
                            <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
                            <span className="line-clamp-2 break-words">{propertyLocation(p)}</span>
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3.5 font-medium tabular-nums sm:px-5">
                          {money(p.rent_amount, p.currency)}
                        </td>
                        <td className="px-4 py-3.5 sm:px-5">
                          <Badge tone={statusTone(p.status)} className="capitalize">
                            {p.status}
                          </Badge>
                        </td>
                        <td className="px-4 py-3.5 sm:px-5">
                          <Badge tone={p.is_listed ? "success" : "neutral"}>
                            {p.is_listed ? "Published" : "Unpublished"}
                          </Badge>
                        </td>
                        <td className="px-4 py-3.5 text-right sm:px-5">
                          <div className="inline-flex justify-end">
                            <PropertyActions
                              property={p}
                              showDelete={isLandlordAdmin}
                              onRequestDelete={requestDelete}
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="border-t border-border/80 px-4 py-3 text-xs text-muted-foreground sm:px-5">
              Showing {filtered.length} of {rows.length}{" "}
              {rows.length === 1 ? "property" : "properties"}
            </div>
          </div>
        </>
      )}
        </>
      )}

      {pendingDelete && (
        <DeletePropertyDialog
          property={pendingDelete}
          deleting={deleting}
          onCancel={cancelDelete}
          onConfirm={() => void confirmDelete()}
        />
      )}
    </div>
  );
}
