import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { useSearchParams } from "react-router-dom";
import {
  CheckCircle2,
  CircleAlert,
  Clock3,
  CreditCard,
  FileText,
  Hash,
  Info,
  Send,
  Smartphone,
  UploadCloud,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "@/auth/AuthProvider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { supabase } from "@/lib/supabase";
import { money, statusTone } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { PaymentMethod, PaymentStatus, RentCharge, RentPayment } from "@/types/database";

type StatAccent = "navy" | "green" | "warning";

const STAT_ACCENTS: Record<StatAccent, string> = {
  navy: "bg-brand-blue/10 text-brand-blue dark:bg-brand-blue/20 dark:text-brand-water",
  green: "bg-brand-green/10 text-brand-green dark:bg-brand-green/20 dark:text-brand-green",
  warning: "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300",
};

const PROOF_ACCEPT = "image/jpeg,image/png,image/webp,application/pdf";
const PROOF_ALLOWED = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
const PROOF_MAX_BYTES = 5 * 1024 * 1024;

function formatDateLabel(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatSubmittedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatStatusLabel(status: string): string {
  if (!status) return status;
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function paymentMethodLabel(method: PaymentMethod): string {
  switch (method) {
    case "mobile_money":
      return "Mobile money";
    case "bank_transfer":
      return "Bank transfer";
    case "cash":
      return "Cash";
    case "card":
      return "Card";
    case "api_provider":
      return "Provider";
    case "other":
      return "Other";
    default:
      return formatStatusLabel(method);
  }
}

function chargeOptionLabel(charge: RentCharge): string {
  return `${formatDateLabel(charge.period_start)} → ${formatDateLabel(charge.period_end)} · Due ${formatDateLabel(charge.due_date)} · ${money(charge.balance)}`;
}

function StatusBadge({ status }: { status: PaymentStatus | string }) {
  const tone = statusTone(status);
  const Icon =
    tone === "success" ? CheckCircle2 : tone === "danger" ? XCircle : tone === "warning" ? Clock3 : CircleAlert;
  return (
    <Badge tone={tone} className="gap-1 capitalize">
      <Icon className="h-3 w-3" aria-hidden />
      {formatStatusLabel(status)}
    </Badge>
  );
}

function SummaryCard({
  label,
  value,
  icon: Icon,
  accent,
  hint,
}: {
  label: string;
  value: string;
  icon: LucideIcon;
  accent: StatAccent;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl border border-border/80 bg-card px-4 py-3.5 shadow-[0_2px_8px_rgba(11,31,58,0.05)] dark:shadow-none">
      <div className="flex items-center gap-3">
        <div className={cn("shrink-0 rounded-xl p-2.5", STAT_ACCENTS[accent])}>
          <Icon className="h-4 w-4" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-medium text-muted-foreground">{label}</div>
          <div className="mt-0.5 truncate font-display text-xl font-bold leading-none tracking-tight text-foreground tabular-nums sm:text-2xl">
            {value}
          </div>
          {hint && <p className="mt-1 truncate text-xs text-muted-foreground">{hint}</p>}
        </div>
      </div>
    </div>
  );
}

function Panel({
  title,
  subtitle,
  icon: Icon,
  iconAccent,
  children,
  className,
  bodyClassName,
}: {
  title: string;
  subtitle?: string;
  icon: LucideIcon;
  iconAccent: StatAccent;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section
      className={cn(
        "overflow-hidden rounded-2xl border border-border/80 bg-card shadow-[0_2px_8px_rgba(11,31,58,0.05)] dark:shadow-none",
        className,
      )}
    >
      <div className="flex items-start gap-3 border-b border-border/80 px-4 py-3.5 sm:px-5">
        <div className={cn("mt-0.5 shrink-0 rounded-xl p-2", STAT_ACCENTS[iconAccent])}>
          <Icon className="h-4 w-4" aria-hidden />
        </div>
        <div className="min-w-0">
          <h3 className="font-display text-sm font-semibold tracking-tight text-foreground sm:text-base">
            {title}
          </h3>
          {subtitle && (
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground sm:text-sm">{subtitle}</p>
          )}
        </div>
      </div>
      <div className={cn("px-4 py-4 sm:px-5 sm:py-5", bodyClassName)}>{children}</div>
    </section>
  );
}

export function RenterPaymentsPage() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const assignmentFilter = searchParams.get("assignment");
  const [charges, setCharges] = useState<RentCharge[]>([]);
  const [payments, setPayments] = useState<RentPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [form, setForm] = useState({
    rent_charge_id: "",
    amount: "",
    method: "mobile_money" as PaymentMethod,
    reference: "",
  });
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofDragOver, setProofDragOver] = useState(false);
  const [saving, setSaving] = useState(false);
  const proofInputRef = useRef<HTMLInputElement>(null);
  const proofInputId = useId();
  const chargeSelectId = useId();
  const amountInputId = useId();
  const methodSelectId = useId();
  const referenceInputId = useId();

  const load = async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const [c, p] = await Promise.all([
      supabase
        .from("rent_charges")
        .select("*")
        .eq("renter_id", user.id)
        .gt("balance", 0)
        .order("due_date"),
      supabase
        .from("rent_payments")
        .select("*")
        .eq("payer_id", user.id)
        .order("submitted_at", { ascending: false }),
    ]);
    if (c.error || p.error) setError(c.error?.message || p.error?.message || "Load failed");
    else {
      const allCharges = c.data ?? [];
      const scopedCharges = assignmentFilter
        ? allCharges.filter((row) => row.assignment_id === assignmentFilter)
        : allCharges;
      // Prefer tenancy-scoped open charges when linked from View Tenancy; fall back to all.
      const nextCharges = scopedCharges.length > 0 ? scopedCharges : allCharges;
      setCharges(nextCharges);
      setPayments(p.data ?? []);
      if (!form.rent_charge_id && nextCharges.length > 0) {
        setForm((f) => ({
          ...f,
          rent_charge_id: nextCharges[0].id,
          amount: String(nextCharges[0].balance),
        }));
      }
    }
    setLoading(false);
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, assignmentFilter]);

  const selectedCharge = useMemo(
    () => charges.find((c) => c.id === form.rent_charge_id) ?? null,
    [charges, form.rent_charge_id],
  );

  const latestPayment = payments[0] ?? null;

  const paymentStatusSummary = useMemo(() => {
    if (loading) return { value: "…", hint: "Loading payment data" };
    if (latestPayment?.status === "pending" || latestPayment?.status === "processing") {
      return {
        value: formatStatusLabel(latestPayment.status),
        hint: "Awaiting landlord review",
      };
    }
    if (latestPayment?.status === "rejected" || latestPayment?.status === "failed") {
      return {
        value: formatStatusLabel(latestPayment.status),
        hint: "Review the reason in history",
      };
    }
    if (latestPayment?.status === "paid") {
      return {
        value: "Paid",
        hint: charges.length > 0 ? "You still have open charges" : "Latest payment approved",
      };
    }
    if (charges.length === 0) {
      return { value: "No open charges", hint: "Nothing eligible to pay right now" };
    }
    return { value: "Ready to submit", hint: "Choose a charge and send payment" };
  }, [loading, latestPayment, charges.length]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const charge = charges.find((c) => c.id === form.rent_charge_id);
    if (!charge) {
      setError("Select a rent charge");
      return;
    }
    const amount = Number(form.amount);
    if (Number.isNaN(amount) || amount <= 0) {
      setError("Enter a valid payment amount");
      return;
    }
    if (amount > Number(charge.balance)) {
      setError("Amount exceeds outstanding balance");
      return;
    }

    setSaving(true);
    setError(null);
    setMsg(null);

    let proof_path: string | null = null;
    if (proofFile) {
      if (!PROOF_ALLOWED.includes(proofFile.type)) {
        setSaving(false);
        setError("Proof must be JPEG, PNG, WebP, or PDF");
        return;
      }
      if (proofFile.size > PROOF_MAX_BYTES) {
        setSaving(false);
        setError("Proof must be 5MB or smaller");
        return;
      }
      const ext = proofFile.name.split(".").pop() || "bin";
      proof_path = `${charge.tenant_id}/${charge.assignment_id}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("payment-proofs").upload(proof_path, proofFile, {
        contentType: proofFile.type,
        upsert: false,
      });
      if (upErr) {
        setSaving(false);
        setError(upErr.message);
        return;
      }
    }

    const { error: err } = await supabase.from("rent_payments").insert({
      rent_charge_id: charge.id,
      amount,
      method: form.method,
      reference: form.reference.trim() || null,
      proof_path,
      // server trigger forces pending + payer + tenant linkage
      tenant_id: charge.tenant_id,
      property_id: charge.property_id,
      assignment_id: charge.assignment_id,
      payer_id: user.id,
      status: "pending",
    });

    setSaving(false);
    if (err) {
      setError(err.message);
      return;
    }
    setMsg("Payment submitted as pending. A landlord reviewer must approve or reject it.");
    setProofFile(null);
    await load();
  };

  const applyProofFile = (file: File | null) => {
    setProofFile(file);
  };

  if (loading) {
    return (
      <div className="space-y-6" aria-busy="true" aria-live="polite">
        <div>
          <div className="h-8 w-48 animate-pulse rounded bg-muted" />
          <div className="mt-2 h-4 w-80 max-w-full animate-pulse rounded bg-muted" />
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-2xl border border-border/80 bg-card" />
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <div className="h-96 animate-pulse rounded-2xl border border-border/80 bg-card" />
          <div className="h-72 animate-pulse rounded-2xl border border-border/80 bg-card" />
        </div>
        <div className="h-48 animate-pulse rounded-2xl border border-border/80 bg-card" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          Rent payments
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Submit a payment and track your payment history.
        </p>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300"
        >
          {error}
        </div>
      )}
      {msg && (
        <div
          role="status"
          className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300"
        >
          {msg}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryCard
          label="Selected rent charge"
          value={selectedCharge ? money(selectedCharge.balance) : "—"}
          hint={
            selectedCharge
              ? `Due ${formatDateLabel(selectedCharge.due_date)}`
              : charges.length === 0
                ? "No eligible charges"
                : "Select a charge below"
          }
          icon={CreditCard}
          accent="navy"
        />
        <SummaryCard
          label="Payment status"
          value={paymentStatusSummary.value}
          hint={paymentStatusSummary.hint}
          icon={Clock3}
          accent="warning"
        />
        <SummaryCard
          label="Payment history"
          value={String(payments.length)}
          hint={payments.length === 1 ? "1 submission on record" : `${payments.length} submissions on record`}
          icon={FileText}
          accent="green"
        />
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <Panel
          title="Submit a rent payment"
          subtitle="Select the rent charge, enter payment details, and upload proof (optional)."
          icon={CreditCard}
          iconAccent="navy"
        >
          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <Label htmlFor={chargeSelectId}>
                Rent charge <span className="text-destructive">*</span>
              </Label>
              <Select
                id={chargeSelectId}
                value={form.rent_charge_id}
                onChange={(e) => {
                  const charge = charges.find((c) => c.id === e.target.value);
                  setForm({
                    ...form,
                    rent_charge_id: e.target.value,
                    amount: charge ? String(charge.balance) : form.amount,
                  });
                }}
                required
                disabled={charges.length === 0}
              >
                <option value="">
                  {charges.length === 0 ? "No eligible rent charges" : "Select charge…"}
                </option>
                {charges.map((c) => (
                  <option key={c.id} value={c.id}>
                    {chargeOptionLabel(c)}
                  </option>
                ))}
              </Select>
              {charges.length === 0 && (
                <p className="mt-1.5 text-xs text-muted-foreground">
                  {payments.some((p) => p.status === "paid")
                    ? "There is no open rent balance to pay. Prior charges appear fully paid. A new rent charge must be issued for the next period (by your landlord or automatic monthly charge generation) before you can submit another payment."
                    : "There are no eligible rent charges with an outstanding balance to select right now. If you expect a new period to be due, ask your landlord to issue the next rent charge."}
                </p>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor={amountInputId}>
                  Amount <span className="text-destructive">*</span>
                </Label>
                <div className="relative">
                  <span
                    className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm font-medium text-muted-foreground"
                    aria-hidden
                  >
                    $
                  </span>
                  <Input
                    id={amountInputId}
                    type="number"
                    min="0.01"
                    step="0.01"
                    required
                    value={form.amount}
                    onChange={(e) => setForm({ ...form, amount: e.target.value })}
                    className="pl-7"
                    disabled={charges.length === 0}
                  />
                </div>
              </div>
              <div>
                <Label htmlFor={methodSelectId}>
                  Payment method <span className="text-destructive">*</span>
                </Label>
                <div className="relative">
                  <Smartphone
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                    aria-hidden
                  />
                  <Select
                    id={methodSelectId}
                    value={form.method}
                    onChange={(e) => setForm({ ...form, method: e.target.value as PaymentMethod })}
                    className="pl-9"
                    disabled={charges.length === 0}
                  >
                    <option value="mobile_money">Mobile money</option>
                    <option value="bank_transfer">Bank transfer</option>
                    <option value="cash">Cash</option>
                    <option value="card">Card</option>
                    <option value="other">Other</option>
                  </Select>
                </div>
              </div>
            </div>

            <div>
              <Label htmlFor={referenceInputId}>Reference</Label>
              <div className="relative">
                <Hash
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
                <Input
                  id={referenceInputId}
                  value={form.reference}
                  onChange={(e) => setForm({ ...form, reference: e.target.value })}
                  placeholder="e.g. Transaction ID, phone number, or reference"
                  className="pl-9"
                  disabled={charges.length === 0}
                />
              </div>
            </div>

            <div>
              <Label htmlFor={proofInputId}>Payment proof (optional)</Label>
              <div
                role="button"
                tabIndex={charges.length === 0 ? -1 : 0}
                aria-controls={proofInputId}
                aria-disabled={charges.length === 0}
                onKeyDown={(e) => {
                  if (charges.length === 0) return;
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    proofInputRef.current?.click();
                  }
                }}
                onClick={() => {
                  if (charges.length === 0) return;
                  proofInputRef.current?.click();
                }}
                onDragEnter={(e) => {
                  e.preventDefault();
                  if (charges.length === 0) return;
                  setProofDragOver(true);
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (charges.length === 0) return;
                  setProofDragOver(true);
                }}
                onDragLeave={(e) => {
                  e.preventDefault();
                  setProofDragOver(false);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  setProofDragOver(false);
                  if (charges.length === 0) return;
                  const file = e.dataTransfer.files?.[0] ?? null;
                  applyProofFile(file);
                }}
                className={cn(
                  "mt-1.5 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  proofDragOver
                    ? "border-brand-blue bg-brand-blue/5"
                    : "border-brand-blue/35 bg-brand-blue/[0.03] hover:border-brand-blue/55 hover:bg-brand-blue/[0.06]",
                  charges.length === 0 && "pointer-events-none cursor-not-allowed opacity-60",
                )}
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-blue/10 text-brand-blue">
                  <UploadCloud className="h-5 w-5" aria-hidden />
                </div>
                <p className="mt-3 text-sm font-medium text-foreground">
                  {proofFile ? proofFile.name : "Drag & drop a file here, or click to browse"}
                </p>
                <p className="mt-1.5 text-xs text-muted-foreground">JPEG, PNG, PDF, or WebP · max 5MB</p>
                <input
                  ref={proofInputRef}
                  id={proofInputId}
                  type="file"
                  accept={PROOF_ACCEPT}
                  className="sr-only"
                  disabled={charges.length === 0}
                  aria-label="Upload payment proof"
                  onChange={(e) => {
                    applyProofFile(e.target.files?.[0] ?? null);
                    e.target.value = "";
                  }}
                />
              </div>
              {proofFile && (
                <button
                  type="button"
                  className="mt-2 text-xs font-medium text-brand-blue hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => applyProofFile(null)}
                >
                  Remove selected file
                </button>
              )}
            </div>

            <Button type="submit" disabled={saving || charges.length === 0} className="w-full sm:w-auto">
              <Send className="h-4 w-4" aria-hidden />
              {saving ? "Submitting…" : "Submit payment"}
            </Button>
          </form>
        </Panel>

        <Panel
          title="Before you submit"
          subtitle="A few tips to help your payment clear review."
          icon={Info}
          iconAccent="green"
        >
          <ol className="space-y-4">
            {[
              {
                title: "Select the rent charge",
                body: "Choose the open charge for the period you are paying.",
              },
              {
                title: "Enter the correct amount",
                body: "Use an amount that does not exceed the outstanding balance.",
              },
              {
                title: "Add a reference or proof",
                body: "Include a transaction reference or optional payment proof when available.",
              },
            ].map((step, index) => (
              <li key={step.title} className="flex gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-blue/10 text-xs font-bold text-brand-blue">
                  {index + 1}
                </span>
                <div className="min-w-0 pt-0.5">
                  <p className="text-sm font-semibold text-foreground">{step.title}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground sm:text-sm">
                    {step.body}
                  </p>
                </div>
              </li>
            ))}
          </ol>
          <p className="mt-5 rounded-xl border border-border/80 bg-muted/40 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
            Submissions start as pending. A landlord reviewer must approve or reject your payment — you
            cannot approve your own payment.
          </p>
        </Panel>
      </div>

      <Panel
        title="Payment history"
        subtitle="A list of your submitted payments."
        icon={FileText}
        iconAccent="green"
        bodyClassName="px-0 py-0 sm:px-0 sm:py-0"
      >
        {payments.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-muted-foreground sm:px-5">
            No submissions yet. When you submit a payment, it will appear here.
          </div>
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[40rem] text-left text-sm">
                <thead>
                  <tr className="border-b border-border/80 bg-muted/30 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-3 sm:px-5">Date</th>
                    <th className="px-4 py-3 sm:px-5">Amount</th>
                    <th className="px-4 py-3 sm:px-5">Method</th>
                    <th className="px-4 py-3 sm:px-5">Reference</th>
                    <th className="px-4 py-3 sm:px-5">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/80">
                  {payments.map((p) => (
                    <tr key={p.id} className="align-top">
                      <td className="whitespace-nowrap px-4 py-3.5 text-muted-foreground sm:px-5">
                        {formatSubmittedAt(p.submitted_at)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3.5 font-semibold tabular-nums text-foreground sm:px-5">
                        {money(p.amount, p.currency)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3.5 text-foreground sm:px-5">
                        {paymentMethodLabel(p.method)}
                      </td>
                      <td className="px-4 py-3.5 text-muted-foreground sm:px-5">
                        {p.reference?.trim() ? p.reference : "—"}
                      </td>
                      <td className="px-4 py-3.5 sm:px-5">
                        <div className="flex flex-col items-start gap-1.5">
                          <StatusBadge status={p.status} />
                          {p.rejection_reason && (
                            <div className="max-w-xs rounded-md border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
                              Rejected: {p.rejection_reason}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ul className="divide-y divide-border/80 md:hidden">
              {payments.map((p) => (
                <li key={p.id} className="space-y-2 px-4 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold tabular-nums text-foreground">
                        {money(p.amount, p.currency)}
                      </div>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {formatSubmittedAt(p.submitted_at)}
                      </div>
                    </div>
                    <StatusBadge status={p.status} />
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <div className="font-medium text-muted-foreground">Method</div>
                      <div className="mt-0.5 text-foreground">{paymentMethodLabel(p.method)}</div>
                    </div>
                    <div>
                      <div className="font-medium text-muted-foreground">Reference</div>
                      <div className="mt-0.5 break-all text-foreground">
                        {p.reference?.trim() ? p.reference : "—"}
                      </div>
                    </div>
                  </div>
                  {p.rejection_reason && (
                    <div className="rounded-md border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
                      Rejected: {p.rejection_reason}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </Panel>
    </div>
  );
}
