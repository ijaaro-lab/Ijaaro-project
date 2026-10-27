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
import { MetricCard, MetricRow } from "@/components/ui/metric-card";
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

const STATUS_DOT: Record<string, string> = {
  success: "bg-emerald-500",
  warning: "bg-amber-500",
  info: "bg-sky-500",
  danger: "bg-red-500",
  neutral: "bg-slate-400",
};

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
        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-muted text-[9px] font-medium uppercase tracking-wide text-muted-foreground"
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
      className="h-12 w-12 shrink-0 rounded-xl object-cover"
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
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
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
    <div className="min-w-0 flex-1">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
        <Icon className="h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden />
        <span className="truncate">{label}</span>
      </div>
      <div className="mt-1 truncate text-sm font-semibold text-foreground" title={value}>
        {value}
      </div>
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
    let pendingAmount = 0;
    let approved = 0;
    let collected = 0;
    let rejected = 0;
    for (const p of rows) {
      if (p.status === "pending") {
        pending += 1;
        pendingAmount += Number(p.amount);
      } else if (p.status === "paid") {
        approved += 1;
        collected += Number(p.amount);
      } else if (p.status === "rejected") {
        rejected += 1;
      }
    }
    return {
      pending,
      pendingAmount,
      approved,
      collected,
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
    <div className="space-y-5">
      <div className="min-w-0">
        <p className="text-[11px] font-semibold tracking-[0.08em] text-brand-green">
          Landlord · Tenancies & Rent
        </p>
        <h2 className="mt-1 font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          Rent review
        </h2>
        <p className="mt-1.5 max-w-3xl text-sm text-muted-foreground">
          Review payment proofs before approving. Approval does not prove funds were received
          outside the platform.
        </p>
      </div>

      {!canApprove && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          Your role can view payments, but approve/reject requires landlord_admin or staff with
          approve_rent permission.
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300"
        >
          {error}
        </div>
      )}

      <div className="rounded-2xl border border-brand-green/35 bg-card p-3 dark:border-brand-green/40 sm:p-4">
        <MetricRow>
          <MetricCard
            compact
            label="Collected"
            value={money(stats.collected)}
            hint={`${stats.approved} approved`}
            icon={CheckCircle2}
            accent="green"
          />
          <MetricCard
            compact
            label="Awaiting review"
            value={money(stats.pendingAmount)}
            hint={`${stats.pending} pending`}
            icon={Clock3}
            accent="warning"
          />
          <MetricCard
            compact
            label="Rejected"
            value={stats.rejected}
            icon={XCircle}
            accent="warning"
          />
          <MetricCard compact label="Total" value={stats.total} icon={Users} accent="navy" />
        </MetricRow>
      </div>

      <section
        aria-label="Payment submissions"
        className="overflow-hidden rounded-2xl border border-brand-green/35 bg-card shadow-[0_1px_2px_rgba(11,31,58,0.04)] dark:border-brand-green/40 dark:shadow-none"
      >
        <div className="border-b border-border px-4 py-3.5 sm:px-5">
          <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center">
            <div className="min-w-0 flex-1">
              <h3 className="font-display text-base font-semibold text-foreground">
                Billing & payments status
              </h3>
              <p className="text-xs text-muted-foreground">
                Search, filter, view proof, and record approval
              </p>
            </div>

            <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center lg:w-auto">
              <label className="relative block min-w-0 flex-1 lg:w-72">
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
                  className="h-9 pl-9"
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
                  className="h-9 pl-9"
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
                className="overflow-x-auto rounded-2xl border border-border/80 bg-card dark:border-border"
              >
                <div className="flex min-w-[52rem] flex-nowrap items-center gap-4 px-4 py-3.5 sm:min-w-0 sm:gap-5 sm:px-5">
                  <div className="flex w-[13.5rem] shrink-0 items-center gap-3 sm:w-[15rem]">
                    <PropertyThumb storagePath={photoPath} alt={propName} />
                    <div className="min-w-0">
                      <div className="truncate font-display text-sm font-semibold text-foreground">
                        {renterLabel(renter)}
                      </div>
                      <div
                        className="mt-0.5 truncate text-xs text-muted-foreground"
                        title={location}
                      >
                        {location}
                      </div>
                    </div>
                  </div>

                  <div className="flex min-w-0 flex-1 flex-nowrap items-center gap-4 border-x border-border/70 px-4">
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

                  <div className="flex shrink-0 flex-nowrap items-center gap-2">
                    <Badge tone={tone} className="capitalize gap-1.5">
                      <span
                        className={cn(
                          "h-1.5 w-1.5 rounded-full",
                          STATUS_DOT[tone] ?? STATUS_DOT.neutral,
                        )}
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
                        className="h-8 whitespace-nowrap px-2.5"
                      >
                        <Eye className="h-3.5 w-3.5" aria-hidden />
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
