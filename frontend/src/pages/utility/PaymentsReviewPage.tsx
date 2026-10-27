import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  Download,
  Eye,
  Filter,
  Search,
  Wallet,
  XCircle,
} from "lucide-react";
import { useAuth } from "@/auth/AuthProvider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MetricCard, MetricRow } from "@/components/ui/metric-card";
import { Select } from "@/components/ui/select";
import { brandingString } from "@/lib/uploadImage";
import { money, paymentStatusLabel, statusTone } from "@/lib/format";
import { openUtilityInvoice } from "@/lib/utilityInvoice";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import type {
  PaymentStatus,
  UtilityAccount,
  UtilityBill,
  UtilityPayment,
} from "@/types/database";
import { KIND_LABEL, KIND_TENANT_TYPE, type UtilityKind } from "./shared";

type StatusFilter = PaymentStatus | "all";

const STATUS_FILTER_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "pending", label: "Pending" },
  { value: "paid", label: "Paid" },
  { value: "rejected", label: "Rejected" },
  { value: "processing", label: "Processing" },
  { value: "failed", label: "Failed" },
  { value: "cancelled", label: "Cancelled" },
  { value: "refunded", label: "Refunded" },
];

const PROOF_SIGNED_URL_SECONDS = 10 * 60;

export function PaymentsReviewPage({ kind }: { kind: UtilityKind }) {
  const { activeMembership } = useAuth();
  const tenantId = activeMembership?.tenant_id;
  const matchesKind = activeMembership?.tenant.tenant_type === KIND_TENANT_TYPE[kind];
  const isStaff =
    activeMembership?.role === "utility_admin" || activeMembership?.role === "utility_staff";
  const label = KIND_LABEL[kind];
  const accent = kind === "water" ? "water" : "power";
  const branding = (activeMembership?.tenant.branding ?? {}) as Record<string, unknown>;
  const companyName =
    brandingString(branding, "display_name") || activeMembership?.tenant.name || label;

  const [rows, setRows] = useState<UtilityPayment[]>([]);
  const [accounts, setAccounts] = useState<UtilityAccount[]>([]);
  const [bills, setBills] = useState<UtilityBill[]>([]);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [proofBusyId, setProofBusyId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [expandedRejectId, setExpandedRejectId] = useState<string | null>(null);

  const load = async () => {
    if (!tenantId) return;
    const [payRes, accRes, billRes] = await Promise.all([
      supabase
        .from("utility_payments")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("submitted_at", { ascending: false }),
      supabase.from("utility_accounts").select("*").eq("tenant_id", tenantId),
      supabase.from("utility_bills").select("*").eq("tenant_id", tenantId),
    ]);
    if (payRes.error || accRes.error || billRes.error) {
      setError(
        payRes.error?.message || accRes.error?.message || billRes.error?.message || "Failed to load",
      );
      return;
    }
    setError(null);
    setRows(payRes.data ?? []);
    setAccounts(accRes.data ?? []);
    setBills(billRes.data ?? []);
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  const accountById = useMemo(() => {
    const map = new Map<string, UtilityAccount>();
    for (const a of accounts) map.set(a.id, a);
    return map;
  }, [accounts]);

  const billById = useMemo(() => {
    const map = new Map<string, UtilityBill>();
    for (const b of bills) map.set(b.id, b);
    return map;
  }, [bills]);

  const stats = useMemo(() => {
    let collected = 0;
    let pendingAmount = 0;
    let pendingCount = 0;
    let rejectedCount = 0;
    for (const p of rows) {
      if (p.status === "paid") collected += Number(p.amount);
      if (p.status === "pending") {
        pendingAmount += Number(p.amount);
        pendingCount += 1;
      }
      if (p.status === "rejected") rejectedCount += 1;
    }
    return { collected, pendingAmount, pendingCount, rejectedCount };
  }, [rows]);

  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return rows.filter((p) => {
      if (statusFilter !== "all" && p.status !== statusFilter) return false;
      if (!q) return true;
      const account = accountById.get(p.utility_account_id);
      const haystack = [
        account?.account_number ?? "",
        p.reference ?? "",
        p.method,
        p.status,
        p.id,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [rows, searchQuery, statusFilter, accountById]);

  if (!tenantId || !matchesKind) {
    return (
      <div className="rounded-2xl border border-border bg-card p-8 text-sm text-muted-foreground">
        Switch to a {label.toLowerCase()} company membership to continue.
      </div>
    );
  }

  const review = async (paymentId: string, decision: "approve" | "reject") => {
    setBusyId(paymentId);
    setError(null);
    const { error: err } = await supabase.rpc("review_utility_payment", {
      p_payment_id: paymentId,
      p_decision: decision,
      p_rejection_reason: decision === "reject" ? reasons[paymentId] || null : null,
    });
    setBusyId(null);
    if (err) setError(err.message);
    else {
      setExpandedRejectId(null);
      await load();
    }
  };

  const openProof = async (payment: UtilityPayment) => {
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

  const downloadInvoice = (payment: UtilityPayment) => {
    const bill = billById.get(payment.utility_bill_id);
    if (!bill) {
      setError("Invoice is unavailable for this payment.");
      return;
    }
    const account = accountById.get(payment.utility_account_id);
    openUtilityInvoice({
      bill,
      kind,
      companyName,
      accountNumber: account?.account_number,
    });
  };

  const emptyBecauseFilters =
    rows.length > 0 &&
    filteredRows.length === 0 &&
    (searchQuery.trim() !== "" || statusFilter !== "all");

  return (
    <div className="space-y-5">
      <div>
        <p
          className={cn(
            "text-[11px] font-semibold tracking-[0.08em]",
            kind === "water" ? "text-brand-water" : "text-brand-power",
          )}
        >
          {label} · Finance
        </p>
        <h2 className="mt-1 font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          Payment review
        </h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Record and approve customer payment submissions for this workspace.
        </p>
      </div>

      {!isStaff && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          Your role can view payments, but approve/reject requires utility_admin or utility_staff.
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
            hint="Approved revenue"
            icon={Wallet}
            accent="green"
          />
          <MetricCard
            compact
            label="Awaiting review"
            value={money(stats.pendingAmount)}
            hint={`${stats.pendingCount} pending`}
            icon={Clock3}
            accent="warning"
          />
          <MetricCard
            compact
            label="Pending count"
            value={stats.pendingCount}
            icon={AlertCircle}
            accent={accent}
          />
          <MetricCard
            compact
            label="Rejected"
            value={stats.rejectedCount}
            icon={XCircle}
            accent="warning"
          />
        </MetricRow>
      </div>

      <section
        aria-label={`${label} payment submissions`}
        className="overflow-hidden rounded-2xl border border-brand-green/35 bg-card dark:border-brand-green/40"
      >
        <div className="border-b border-border/70 px-4 py-3.5 sm:px-5">
          <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center">
            <div className="min-w-0 flex-1">
              <h3 className="font-display text-base font-semibold text-foreground">
                Billing & payments status
              </h3>
              <p className="text-xs text-muted-foreground">
                Search, filter, download invoice, and record approval
              </p>
            </div>
            <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center lg:w-auto">
              <label className="relative block min-w-0 flex-1 lg:w-72">
                <span className="sr-only">Search payments</span>
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
                <Input
                  placeholder="Search account or reference…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
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

        {filteredRows.length === 0 ? (
          <div className="px-4 py-12 text-center sm:px-5">
            <p className="text-sm font-medium text-foreground">
              {emptyBecauseFilters ? "No payments match your filters" : `No ${label.toLowerCase()} payments yet.`}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {emptyBecauseFilters
                ? "Try a different account, reference, or status."
                : "Customer submissions will appear here for review."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-border/70 bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 font-semibold sm:px-5">Account</th>
                  <th className="px-4 py-2.5 font-semibold">Method</th>
                  <th className="px-4 py-2.5 font-semibold">Amount</th>
                  <th className="px-4 py-2.5 font-semibold">Submitted</th>
                  <th className="px-4 py-2.5 font-semibold">Status</th>
                  <th className="px-4 py-2.5 font-semibold text-right sm:px-5">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/70">
                {filteredRows.map((p) => {
                  const account = accountById.get(p.utility_account_id);
                  const bill = billById.get(p.utility_bill_id);
                  const showReject = expandedRejectId === p.id;
                  return (
                    <tr key={p.id} className="align-top">
                      <td className="px-4 py-3 sm:px-5">
                        <div className="font-semibold text-foreground">
                          {account?.account_number ?? p.utility_account_id.slice(0, 8)}
                        </div>
                        <div className="mt-0.5 text-xs text-brand-green">
                          {p.reference?.trim() ? `Ref ${p.reference}` : p.id.slice(0, 8)}
                        </div>
                      </td>
                      <td className="px-4 py-3 capitalize text-muted-foreground">
                        {p.method.replaceAll("_", " ")}
                      </td>
                      <td className="px-4 py-3 font-semibold tabular-nums">
                        {money(p.amount, p.currency)}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {new Date(p.submitted_at).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={statusTone(p.status)}>{paymentStatusLabel(p.status)}</Badge>
                        {p.rejection_reason ? (
                          <p className="mt-1 max-w-[12rem] text-xs text-red-600 dark:text-red-300">
                            {p.rejection_reason}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 sm:px-5">
                        <div className="flex flex-wrap items-center justify-end gap-1.5">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8 px-2"
                            disabled={!bill}
                            onClick={() => downloadInvoice(p)}
                            aria-label="Download invoice"
                            title="Invoice"
                          >
                            <Download className="h-3.5 w-3.5" />
                          </Button>
                          {p.proof_path ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-8 px-2"
                              disabled={proofBusyId === p.id}
                              onClick={() => void openProof(p)}
                              aria-label="View payment proof"
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </Button>
                          ) : null}
                          {p.status === "pending" && isStaff ? (
                            <>
                              <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                className="h-8"
                                disabled={busyId === p.id}
                                onClick={() => void review(p.id, "approve")}
                              >
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                Approve
                              </Button>
                              <Button
                                type="button"
                                variant="destructive"
                                size="sm"
                                className="h-8"
                                disabled={busyId === p.id}
                                onClick={() =>
                                  setExpandedRejectId((id) => (id === p.id ? null : p.id))
                                }
                              >
                                <XCircle className="h-3.5 w-3.5" />
                                Reject
                              </Button>
                            </>
                          ) : null}
                        </div>
                        {showReject && p.status === "pending" && isStaff ? (
                          <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
                            <Input
                              placeholder="Rejection reason (optional)"
                              value={reasons[p.id] ?? ""}
                              onChange={(e) =>
                                setReasons({ ...reasons, [p.id]: e.target.value })
                              }
                              className="h-9 sm:max-w-xs"
                            />
                            <Button
                              type="button"
                              variant="destructive"
                              size="sm"
                              disabled={busyId === p.id}
                              onClick={() => void review(p.id, "reject")}
                            >
                              Confirm reject
                            </Button>
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
