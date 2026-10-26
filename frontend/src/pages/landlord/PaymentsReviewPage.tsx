import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Banknote,
  Calendar,
  CheckCircle2,
  ClipboardList,
  Clock3,
  Eye,
  FileText,
  Filter,
  Search,
  Smartphone,
  Users,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "@/auth/AuthProvider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { money, statusTone } from "@/lib/format";
import { propertyLabel, renterLabel } from "@/lib/tenancyDisplay";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import type { PaymentStatus, RentPayment } from "@/types/database";

const PROOF_SIGNED_URL_SECONDS = 10 * 60;
const PROPERTY_PHOTO_SIGNED_URL_SECONDS = 15 * 60;

type PropertyRow = { id: string; name: string | null; address_line: string };
type RenterRow = { user_id: string; full_name: string | null; email: string | null };
type PhotoRow = { property_id: string; storage_path: string; sort_order: number };
type StatusFilter = PaymentStatus | "all";
type StatAccent = "blue" | "green" | "red" | "purple";

const STATUS_FILTER_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "pending", label: "Pending" },
  { value: "processing", label: "Processing" },
  { value: "paid", label: "Paid" },
  { value: "rejected", label: "Rejected" },
  { value: "failed", label: "Failed" },
  { value: "cancelled", label: "Cancelled" },
  { value: "refunded", label: "Refunded" },
];

const STAT_ACCENTS: Record<StatAccent, string> = {
  blue: "bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300",
  green: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300",
  red: "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300",
  purple: "bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300",
};

const STATUS_DOT: Record<string, string> = {
  success: "bg-emerald-500",
  warning: "bg-amber-500",
  info: "bg-sky-500",
  danger: "bg-red-500",
  neutral: "bg-slate-400",
};

function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  accent,
}: {
  label: string;
  value: number;
  hint: string;
  icon: LucideIcon;
  accent: StatAccent;
}) {
  return (
    <div className="rounded-2xl border border-sky-100/90 bg-card px-4 py-4 shadow-[0_2px_8px_rgba(11,31,58,0.05)] dark:border-border/80 dark:shadow-none">
      <div className="flex items-start gap-3">
        <div className={cn("shrink-0 rounded-xl p-2.5", STAT_ACCENTS[accent])}>
          <Icon className="h-4 w-4" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-medium text-muted-foreground">{label}</div>
          <div className="mt-1 truncate font-display text-2xl font-bold leading-none tracking-tight text-foreground tabular-nums sm:text-[1.75rem]">
            {value}
          </div>
          <p className="mt-1.5 text-xs leading-snug text-muted-foreground">{hint}</p>
        </div>
      </div>
    </div>
  );
}

function PropertyThumb({
  storagePath,
  alt,
}: {
  storagePath: string | null;
  alt: string;
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
      const { data, error } = await supabase.storage
        .from("property-photos")
        .createSignedUrl(storagePath, PROPERTY_PHOTO_SIGNED_URL_SECONDS);
      if (cancelled) return;
      if (error || !data?.signedUrl) {
        setUrl(null);
        setFailed(true);
        return;
      }
      setUrl(data.signedUrl);
    })();
    return () => {
      cancelled = true;
    };
  }, [storagePath]);

  if (!storagePath || failed || !url) {
    const showLabel = !storagePath || failed;
    return (
      <div
        className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-muted text-[10px] font-medium uppercase tracking-wide text-muted-foreground sm:h-[4.5rem] sm:w-[4.5rem]"
        role="img"
        aria-label={showLabel ? "No property photo" : "Loading property photo"}
      >
        {showLabel ? "No photo" : null}
      </div>
    );
  }

  return (
    <img
      src={url}
      alt={alt}
      className="h-16 w-16 shrink-0 rounded-xl object-cover sm:h-[4.5rem] sm:w-[4.5rem]"
    />
  );
}

function propertyLocation(property: PropertyRow | undefined): string {
  const name = propertyLabel(property);
  const address = property?.address_line?.trim();
  if (address && property?.name?.trim()) {
    return `${name} – ${address}`;
  }
  return name;
}

function formatSubmittedAt(iso: string): string {
  const d = new Date(iso);
  const datePart = d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const timePart = d.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  return `${datePart} · ${timePart}`;
}

function MetaCell({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span>{label}</span>
      </div>
      <div className="mt-1 truncate text-sm font-medium text-foreground">{value}</div>
    </div>
  );
}

export function PaymentsReviewPage() {
  const { activeMembership } = useAuth();
  const [rows, setRows] = useState<RentPayment[]>([]);
  const [propertiesById, setPropertiesById] = useState<Record<string, PropertyRow>>({});
  const [rentersById, setRentersById] = useState<Record<string, RenterRow>>({});
  const [photoPathByPropertyId, setPhotoPathByPropertyId] = useState<Record<string, string>>({});
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [reasonErrors, setReasonErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [proofBusyId, setProofBusyId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const load = async () => {
    if (!activeMembership?.tenant_id) return;
    const tenantId = activeMembership.tenant_id;

    const [payRes, propRes, renterRes, photoRes] = await Promise.all([
      supabase
        .from("rent_payments")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("submitted_at", { ascending: false }),
      supabase
        .from("properties")
        .select("id, name, address_line")
        .eq("tenant_id", tenantId),
      supabase.rpc("list_same_tenant_member_profiles", { p_tenant_id: tenantId }),
      supabase
        .from("property_photos")
        .select("property_id, storage_path, sort_order")
        .eq("tenant_id", tenantId)
        .order("sort_order", { ascending: true }),
    ]);

    if (payRes.error || propRes.error || renterRes.error || photoRes.error) {
      setError(
        payRes.error?.message ||
          propRes.error?.message ||
          renterRes.error?.message ||
          photoRes.error?.message ||
          "Failed to load payments",
      );
      return;
    }

    setError(null);
    setRows((payRes.data ?? []) as RentPayment[]);

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

    const photos: Record<string, string> = {};
    for (const ph of (photoRes.data ?? []) as PhotoRow[]) {
      if (!photos[ph.property_id]) {
        photos[ph.property_id] = ph.storage_path;
      }
    }
    setPhotoPathByPropertyId(photos);
  };

  useEffect(() => {
    void load();
  }, [activeMembership?.tenant_id]);

  const review = async (paymentId: string, decision: "approve" | "reject") => {
    if (decision === "reject") {
      const trimmed = (reasons[paymentId] ?? "").trim();
      if (!trimmed) {
        setReasonErrors((prev) => ({
          ...prev,
          [paymentId]: "A rejection reason is required.",
        }));
        return;
      }
      setReasonErrors((prev) => {
        const next = { ...prev };
        delete next[paymentId];
        return next;
      });
      setBusyId(paymentId);
      setError(null);
      const { error: err } = await supabase.rpc("review_rent_payment", {
        p_payment_id: paymentId,
        p_decision: "reject",
        p_rejection_reason: trimmed,
      });
      setBusyId(null);
      if (err) setError(err.message);
      else {
        setReasons((prev) => {
          const next = { ...prev };
          delete next[paymentId];
          return next;
        });
        await load();
      }
      return;
    }

    setBusyId(paymentId);
    setError(null);
    const { error: err } = await supabase.rpc("review_rent_payment", {
      p_payment_id: paymentId,
      p_decision: "approve",
      p_rejection_reason: null,
    });
    setBusyId(null);
    if (err) setError(err.message);
    else await load();
  };

  const openProof = async (payment: RentPayment) => {
    if (!payment.proof_path) return;
    setProofBusyId(payment.id);
    setError(null);
    const { data, error: err } = await supabase.storage
      .from("payment-proofs")
      .createSignedUrl(payment.proof_path, PROOF_SIGNED_URL_SECONDS);
    setProofBusyId(null);
    if (err || !data?.signedUrl) {
      setError(err?.message ?? "Could not open payment proof");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  const canApprove =
    activeMembership?.role === "landlord_admin" ||
    (activeMembership?.role === "landlord_staff" &&
      Boolean(activeMembership.permissions?.approve_rent));

  const stats = useMemo(() => {
    let pending = 0;
    let approved = 0;
    let rejected = 0;
    for (const p of rows) {
      if (p.status === "pending") pending += 1;
      else if (p.status === "paid") approved += 1;
      else if (p.status === "rejected") rejected += 1;
    }
    return {
      pending,
      approved,
      rejected,
      total: rows.length,
    };
  }, [rows]);

  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return rows.filter((p) => {
      if (statusFilter !== "all" && p.status !== statusFilter) return false;
      if (!q) return true;
      const property = propertiesById[p.property_id];
      const renter = rentersById[p.payer_id];
      const haystack = [
        renterLabel(renter),
        propertyLabel(property),
        property?.address_line ?? "",
        p.reference ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [rows, searchQuery, statusFilter, propertiesById, rentersById]);

  const emptyBecauseFilters =
    rows.length > 0 &&
    filteredRows.length === 0 &&
    (searchQuery.trim() !== "" || statusFilter !== "all");

  return (
    <div className="space-y-5 sm:space-y-6">
      <div className="min-w-0">
        <h2 className="font-display text-2xl font-bold tracking-tight text-foreground sm:text-[1.75rem]">
          Rent payment review
        </h2>
        <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-muted-foreground">
          Review renter payment submissions and verify proof before making a decision. Approval does
          not prove funds were received outside the platform.
        </p>
      </div>

      {!canApprove && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          Your role can view payments, but approve/reject requires landlord_admin or staff with
          approve_rent permission.
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300"
        >
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Pending review"
          value={stats.pending}
          hint="Awaiting your review."
          icon={Clock3}
          accent="blue"
        />
        <StatCard
          label="Approved"
          value={stats.approved}
          hint="Payments verified."
          icon={CheckCircle2}
          accent="green"
        />
        <StatCard
          label="Rejected"
          value={stats.rejected}
          hint="Not approved."
          icon={XCircle}
          accent="red"
        />
        <StatCard
          label="Total submissions"
          value={stats.total}
          hint="All rent payment uploads."
          icon={Users}
          accent="purple"
        />
      </div>

      <section
        aria-label="Payment submissions"
        className="overflow-hidden rounded-2xl border border-sky-100/90 bg-card shadow-[0_2px_8px_rgba(11,31,58,0.05)] dark:border-border/80 dark:shadow-none"
      >
        <div className="border-b border-border/80 px-4 py-3.5 sm:px-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300">
                <ClipboardList className="h-4 w-4" aria-hidden />
              </div>
              <div className="min-w-0">
                <h3 className="font-display text-sm font-semibold tracking-tight text-foreground sm:text-base">
                  Payment submissions
                </h3>
                <p className="mt-0.5 text-xs text-muted-foreground sm:text-sm">
                  Renter payment proofs for this landlord workspace.
                </p>
              </div>
            </div>

            <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center lg:w-auto">
              <label className="relative block min-w-0 flex-1 lg:w-80">
                <span className="sr-only">Search payment submissions</span>
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
                <Input
                  placeholder="Search renter, property, or reference..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  aria-label="Search renter, property, or reference"
                  className="h-10 pl-9"
                />
              </label>
              <div className="relative sm:w-44">
                <Filter
                  className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
                <Select
                  aria-label="Filter by status"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                  className="h-10 pl-9"
                >
                  {STATUS_FILTER_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-3 p-4 sm:p-5">
          {filteredRows.map((p) => {
            const property = propertiesById[p.property_id];
            const renter = rentersById[p.payer_id];
            const propName = propertyLabel(property);
            const location = propertyLocation(property);
            const photoPath = photoPathByPropertyId[p.property_id] ?? null;
            const reasonError = reasonErrors[p.id];
            const tone = statusTone(p.status);
            const methodLabel = p.method.replaceAll("_", " ");

            return (
              <article
                key={p.id}
                className="rounded-xl border border-sky-100/90 bg-card p-4 shadow-[0_1px_3px_rgba(11,31,58,0.04)] sm:p-5 dark:border-border/80 dark:shadow-none"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex min-w-0 flex-1 flex-col gap-4 sm:flex-row sm:items-center">
                    <div className="flex min-w-0 items-start gap-3 sm:items-center sm:gap-3.5">
                      <PropertyThumb storagePath={photoPath} alt={propName} />
                      <div className="min-w-0">
                        <div className="font-display text-base font-semibold text-foreground">
                          {renterLabel(renter)}
                        </div>
                        <div className="mt-0.5 text-sm leading-snug text-muted-foreground">
                          {location}
                        </div>
                      </div>
                    </div>

                    <div className="grid min-w-0 flex-1 grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4 lg:pl-2">
                      <MetaCell
                        icon={Banknote}
                        label="Amount"
                        value={money(p.amount, p.currency)}
                      />
                      <MetaCell icon={Smartphone} label="Method" value={methodLabel} />
                      <MetaCell
                        icon={FileText}
                        label="Reference"
                        value={p.reference?.trim() || "—"}
                      />
                      <MetaCell
                        icon={Calendar}
                        label="Submitted"
                        value={formatSubmittedAt(p.submitted_at)}
                      />
                    </div>
                  </div>

                  <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end lg:flex-col lg:items-end xl:flex-row xl:items-center">
                    <Badge tone={tone} className="capitalize gap-1.5">
                      <span
                        className={cn("h-1.5 w-1.5 rounded-full", STATUS_DOT[tone] ?? STATUS_DOT.neutral)}
                        aria-hidden
                      />
                      {p.status}
                    </Badge>
                    {p.proof_path && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={proofBusyId === p.id}
                        onClick={() => void openProof(p)}
                        aria-label="View payment proof"
                        className="min-h-9 border-sky-300 text-brand-blue hover:bg-sky-50 dark:border-sky-500/40 dark:text-sky-300 dark:hover:bg-sky-500/15"
                      >
                        <Eye className="h-4 w-4" aria-hidden />
                        {proofBusyId === p.id ? "Opening…" : "View proof"}
                      </Button>
                    )}
                  </div>
                </div>

                {p.rejection_reason && (
                  <div
                    className="mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300"
                    role="status"
                  >
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                    <span>
                      <span className="font-medium">Reason:</span> {p.rejection_reason}
                    </span>
                  </div>
                )}

                {p.status === "pending" && canApprove && (
                  <div className="mt-4 flex flex-col gap-2 border-t border-border/80 pt-4 sm:flex-row sm:flex-wrap sm:items-end">
                    <div className="min-w-0 flex-1 sm:min-w-[220px]">
                      <Input
                        placeholder="Rejection reason (required)"
                        value={reasons[p.id] ?? ""}
                        aria-label="Rejection reason"
                        aria-invalid={Boolean(reasonError)}
                        aria-describedby={reasonError ? `reject-reason-error-${p.id}` : undefined}
                        onChange={(e) => {
                          setReasons({ ...reasons, [p.id]: e.target.value });
                          if (reasonErrors[p.id]) {
                            setReasonErrors((prev) => {
                              const next = { ...prev };
                              delete next[p.id];
                              return next;
                            });
                          }
                        }}
                      />
                      {reasonError && (
                        <p
                          id={`reject-reason-error-${p.id}`}
                          className="mt-1.5 text-sm text-red-700 dark:text-red-300"
                          role="alert"
                        >
                          {reasonError}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="secondary"
                        disabled={busyId === p.id}
                        onClick={() => void review(p.id, "approve")}
                      >
                        Approve
                      </Button>
                      <Button
                        variant="destructive"
                        disabled={busyId === p.id}
                        onClick={() => void review(p.id, "reject")}
                      >
                        Reject
                      </Button>
                    </div>
                  </div>
                )}
              </article>
            );
          })}

          {rows.length === 0 && (
            <div className="flex flex-col items-center rounded-xl border border-dashed border-border px-6 py-14 text-center">
              <div
                className="flex h-20 w-20 items-center justify-center rounded-full bg-sky-50 dark:bg-sky-500/15"
                aria-hidden
              >
                <ClipboardList
                  className="h-9 w-9 text-brand-blue dark:text-sky-300"
                  strokeWidth={1.5}
                />
              </div>
              <p className="mt-4 text-sm font-medium text-foreground">No rent payments yet.</p>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                Renter payment proofs for this landlord workspace will appear here when submitted.
              </p>
            </div>
          )}

          {emptyBecauseFilters && (
            <div className="rounded-xl border border-dashed border-border px-6 py-12 text-center">
              <p className="text-sm font-medium text-foreground">No payments match your filters</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Try a different renter, property, reference, or status.
              </p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
