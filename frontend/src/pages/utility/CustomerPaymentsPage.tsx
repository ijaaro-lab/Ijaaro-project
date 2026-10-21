import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Building2, Mail, MapPin, Phone } from "lucide-react";
import { useAuth } from "@/auth/AuthProvider";
import { AppLoading } from "@/components/ui/app-loading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { brandingString } from "@/lib/landingTemplates";
import { supabase } from "@/lib/supabase";
import { money, paymentStatusLabel, statusTone } from "@/lib/format";
import type { PaymentMethod, UtilityBill, UtilityPayment } from "@/types/database";
import {
  isBillPeriodOpen,
  isSimplifiedFinance,
  KIND_LABEL,
  KIND_TENANT_TYPE,
  monthlyFeeLabel,
  type UtilityKind,
} from "./shared";

type PayTab = "request" | "history";

const HISTORY_PAGE_SIZE = 8;

function billOptionLabel(b: UtilityBill, kind: UtilityKind, simplified: boolean): string {
  if (!simplified) {
    return `Due ${b.due_date} · balance ${money(b.balance)} (${b.status})`;
  }
  const snap = (b.occupancy_snapshot ?? {}) as Record<string, unknown>;
  if (typeof snap.description === "string" && snap.description.trim()) {
    return `${snap.description.trim()} · ${money(b.balance)}`;
  }
  if (snap.billing_mode === "adhoc_charge") {
    return `Other charge · ${money(b.balance)}`;
  }
  return `${monthlyFeeLabel(kind)} · due ${b.due_date} · ${money(b.balance)}`;
}

export function CustomerPaymentsPage({ kind }: { kind: UtilityKind }) {
  const { activeMembership, user } = useAuth();
  const tenantId = activeMembership?.tenant_id;
  const tenant = activeMembership?.tenant;
  const matchesKind = tenant?.tenant_type === KIND_TENANT_TYPE[kind];
  const isCustomer = activeMembership?.role === "utility_customer";
  const label = KIND_LABEL[kind];
  const simplifiedWater = isSimplifiedFinance(kind);

  const branding = (tenant?.branding ?? {}) as Record<string, unknown>;
  const companyName =
    brandingString(branding, "display_name") || tenant?.name || label;
  const companyPhone = brandingString(branding, "contact_phone");
  const companyEmail = brandingString(branding, "contact_email");
  const companyAddress = brandingString(branding, "address");

  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<PayTab>("request");
  const [historyPage, setHistoryPage] = useState(0);
  const [bills, setBills] = useState<UtilityBill[]>([]);
  const [payments, setPayments] = useState<UtilityPayment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [form, setForm] = useState({
    utility_bill_id: "",
    amount: "",
    method: "mobile_money" as PaymentMethod,
    reference: "",
  });

  const outstanding = useMemo(
    () => bills.reduce((s, b) => s + Number(b.balance), 0),
    [bills],
  );

  const historyPageCount = Math.max(1, Math.ceil(payments.length / HISTORY_PAGE_SIZE));
  const pagedPayments = useMemo(() => {
    const start = historyPage * HISTORY_PAGE_SIZE;
    return payments.slice(start, start + HISTORY_PAGE_SIZE);
  }, [payments, historyPage]);

  const load = async () => {
    if (!tenantId || !user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data: accounts, error: accErr } = await supabase
      .from("utility_accounts")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("customer_id", user.id);
    if (accErr) {
      setError(accErr.message);
      setLoading(false);
      return;
    }
    const accountIds = (accounts ?? []).map((a) => a.id);
    const [byAccount, byResp, payRes] = await Promise.all([
      accountIds.length > 0
        ? supabase
            .from("utility_bills")
            .select("*")
            .in("utility_account_id", accountIds)
            .gt("balance", 0)
        : Promise.resolve({ data: [] as UtilityBill[], error: null }),
      supabase
        .from("utility_bills")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("responsible_party_id", user.id)
        .gt("balance", 0),
      supabase
        .from("utility_payments")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("payer_id", user.id)
        .order("submitted_at", { ascending: false }),
    ]);
    if (byAccount.error || byResp.error || payRes.error) {
      setError(
        byAccount.error?.message ||
          byResp.error?.message ||
          payRes.error?.message ||
          "Failed to load",
      );
      setLoading(false);
      return;
    }
    const merged = new Map<string, UtilityBill>();
    for (const b of [...(byAccount.data ?? []), ...(byResp.data ?? [])]) {
      merged.set(b.id, b);
    }
    // Only months that have started are payable (future assigned months wait).
    const dueBills = Array.from(merged.values())
      .filter((b) => isBillPeriodOpen(b))
      .sort((a, b) => a.due_date.localeCompare(b.due_date));
    setBills(dueBills);
    setPayments(payRes.data ?? []);
    setHistoryPage(0);
    setError(null);
    if (!form.utility_bill_id && dueBills.length > 0) {
      setForm((f) => ({
        ...f,
        utility_bill_id: dueBills[0].id,
        amount: String(dueBills[0].balance),
      }));
    }
    setLoading(false);
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, user]);

  useEffect(() => {
    const maxPage = Math.max(0, Math.ceil(payments.length / HISTORY_PAGE_SIZE) - 1);
    if (historyPage > maxPage) setHistoryPage(maxPage);
  }, [payments.length, historyPage]);

  if (!tenantId || !matchesKind) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-sm text-muted-foreground">
        Switch to a {label.toLowerCase()} company membership to continue.
      </div>
    );
  }
  if (!isCustomer) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-sm text-muted-foreground">
        This page is for utility customer accounts.
      </div>
    );
  }
  if (loading) {
    return <AppLoading message="Loading…" fullScreen={false} />;
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const bill = bills.find((b) => b.id === form.utility_bill_id);
    if (!bill) {
      setError("Select a bill");
      return;
    }
    const amount = Number(form.amount);
    if (Number.isNaN(amount) || amount <= 0) {
      setError("Enter a valid payment amount");
      return;
    }
    if (amount > Number(bill.balance)) {
      setError("Amount exceeds outstanding balance");
      return;
    }

    setSaving(true);
    setError(null);
    setMsg(null);

    let proof_path: string | null = null;
    if (proofFile) {
      const allowed = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
      if (!allowed.includes(proofFile.type)) {
        setSaving(false);
        setError("Proof must be JPEG, PNG, WebP, or PDF");
        return;
      }
      if (proofFile.size > 5 * 1024 * 1024) {
        setSaving(false);
        setError("Proof must be 5MB or smaller");
        return;
      }
      const ext = proofFile.name.split(".").pop() || "bin";
      proof_path = `utility/${bill.tenant_id}/${bill.id}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("payment-proofs")
        .upload(proof_path, proofFile, {
          contentType: proofFile.type,
          upsert: false,
        });
      if (upErr) {
        setSaving(false);
        setError(upErr.message);
        return;
      }
    }

    const { error: err } = await supabase.from("utility_payments").insert({
      utility_bill_id: bill.id,
      amount,
      method: form.method,
      reference: form.reference.trim() || null,
      proof_path,
      status: "pending",
    });

    setSaving(false);
    if (err) {
      setError(err.message);
      return;
    }
    setMsg(
      simplifiedWater
        ? "Payment request submitted. Waiting for company approval — it is not recorded on your balance until Approved."
        : "Payment submitted as pending. The utility company must approve or reject it.",
    );
    setProofFile(null);
    setForm((f) => ({ ...f, amount: "", reference: "" }));
    setTab("history");
    await load();
  };

  const showPayTo =
    outstanding > 0 && Boolean(companyName || companyPhone || companyEmail || companyAddress);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl font-bold">
          {simplifiedWater ? "Finance & Payments" : `My ${label.toLowerCase()} payments`}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {simplifiedWater
            ? `Submit a payment you already made. It stays Pending until the ${label.toLowerCase()} company approves it — only then is it recorded on your balance.`
            : "Submissions start as pending. Company staff must approve before the payment is recorded on your bill."}
        </p>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-border">
        <TabButton active={tab === "request"} onClick={() => setTab("request")}>
          Submit payment
        </TabButton>
        <TabButton
          active={tab === "history"}
          onClick={() => {
            setTab("history");
            setHistoryPage(0);
          }}
        >
          Payment history
          {payments.length > 0 ? ` (${payments.length})` : ""}
        </TabButton>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
          {error}
        </div>
      )}
      {msg && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200">
          {msg}
        </div>
      )}

      {tab === "request" && (
        <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
          {showPayTo && (
            <section className="rounded-2xl border border-sky-200/80 bg-sky-50/60 p-5 dark:border-sky-500/30 dark:bg-sky-500/10">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sky-500/15 text-sky-700 dark:text-sky-300">
                  <Building2 className="h-[18px] w-[18px]" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-display text-base font-semibold text-foreground">
                    Pay to {companyName}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    You owe {money(outstanding)}. Send payment using the company details
                    below, then submit your request.
                  </p>
                  <ul className="mt-3 space-y-2 text-sm text-foreground">
                    {companyPhone && (
                      <li className="flex items-center gap-2">
                        <Phone className="h-3.5 w-3.5 shrink-0 text-sky-600 dark:text-sky-400" />
                        <a
                          href={`tel:${companyPhone.replace(/\s+/g, "")}`}
                          className="font-medium hover:underline"
                        >
                          {companyPhone}
                        </a>
                      </li>
                    )}
                    {companyEmail && (
                      <li className="flex items-center gap-2">
                        <Mail className="h-3.5 w-3.5 shrink-0 text-sky-600 dark:text-sky-400" />
                        <a href={`mailto:${companyEmail}`} className="hover:underline">
                          {companyEmail}
                        </a>
                      </li>
                    )}
                    {companyAddress && (
                      <li className="flex items-start gap-2">
                        <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-600 dark:text-sky-400" />
                        <span>{companyAddress}</span>
                      </li>
                    )}
                  </ul>
                </div>
              </div>
            </section>
          )}

          <form
            onSubmit={(e) => void onSubmit(e)}
            className="w-full space-y-4 rounded-2xl border border-border/80 bg-card p-5 shadow-[0_1px_3px_rgba(11,31,58,0.05)] dark:shadow-none sm:p-6"
          >
            <div>
              <p className="font-display text-base font-semibold text-foreground">
                Payment request
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Fill in what you paid. Staff will Approve or Reject.
              </p>
            </div>

            <div>
              <Label htmlFor="pay-bill" className="normal-case tracking-normal">
                {simplifiedWater ? "Charge" : "Bill"}
              </Label>
              <Select
                id="pay-bill"
                value={form.utility_bill_id}
                onChange={(e) => {
                  const bill = bills.find((b) => b.id === e.target.value);
                  setForm({
                    ...form,
                    utility_bill_id: e.target.value,
                    amount: bill ? String(bill.balance) : form.amount,
                  });
                }}
                required
                disabled={bills.length === 0}
              >
                <option value="">
                  {bills.length === 0 ? "No open balance…" : "Select…"}
                </option>
                {bills.map((b) => (
                  <option key={b.id} value={b.id}>
                    {billOptionLabel(b, kind, simplifiedWater)}
                  </option>
                ))}
              </Select>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="pay-amount" className="normal-case tracking-normal">
                  Amount
                </Label>
                <Input
                  id="pay-amount"
                  type="number"
                  min="0.01"
                  step="0.01"
                  required
                  disabled={bills.length === 0}
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="pay-method" className="normal-case tracking-normal">
                  Method
                </Label>
                <Select
                  id="pay-method"
                  value={form.method}
                  disabled={bills.length === 0}
                  onChange={(e) =>
                    setForm({ ...form, method: e.target.value as PaymentMethod })
                  }
                >
                  <option value="mobile_money">Mobile money</option>
                  <option value="bank_transfer">Bank transfer</option>
                  <option value="cash">Cash</option>
                  <option value="card">Card</option>
                  <option value="other">Other</option>
                </Select>
              </div>
            </div>

            <div>
              <Label htmlFor="pay-ref" className="normal-case tracking-normal">
                Reference
              </Label>
              <Input
                id="pay-ref"
                disabled={bills.length === 0}
                value={form.reference}
                onChange={(e) => setForm({ ...form, reference: e.target.value })}
                placeholder="Transaction ID (optional)"
              />
            </div>

            <div>
              <Label htmlFor="pay-proof" className="normal-case tracking-normal">
                Payment proof{" "}
                <span className="font-normal text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="pay-proof"
                type="file"
                disabled={bills.length === 0}
                accept="image/jpeg,image/png,image/webp,application/pdf"
                onChange={(e) => setProofFile(e.target.files?.[0] ?? null)}
              />
              {proofFile && (
                <p className="mt-1 text-xs text-muted-foreground">{proofFile.name}</p>
              )}
            </div>

            <Button
              type="submit"
              variant="secondary"
              className="w-full"
              disabled={saving || bills.length === 0}
            >
              {saving
                ? "Submitting…"
                : simplifiedWater
                  ? "Submit for approval"
                  : "Submit payment"}
            </Button>

            {bills.length === 0 && (
              <p className="text-center text-sm text-muted-foreground">
                No outstanding balance. When you owe money, you can submit a payment
                request here.
              </p>
            )}
          </form>
        </div>
      )}

      {tab === "history" && (
        <section className="w-full rounded-2xl border border-border/80 bg-card shadow-[0_1px_3px_rgba(11,31,58,0.05)] dark:shadow-none">
          <div className="flex flex-wrap items-end justify-between gap-2 border-b border-border/80 px-5 py-4 sm:px-6">
            <div>
              <h3 className="font-display text-base font-semibold text-foreground">
                Payment history
              </h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Company, pay-to number, submit time, and approve time
                {payments.length > 0 ? ` · ${payments.length} total` : ""}
              </p>
            </div>
            {payments.length > HISTORY_PAGE_SIZE && (
              <p className="text-xs text-muted-foreground">
                Page {historyPage + 1} of {historyPageCount}
              </p>
            )}
          </div>

          {payments.length === 0 ? (
            <div className="px-5 py-14 text-center text-sm text-muted-foreground sm:px-6">
              No payment requests yet.
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="border-b border-border bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-5 py-3 font-semibold sm:px-6">Amount</th>
                      <th className="px-5 py-3 font-semibold sm:px-6">Company</th>
                      <th className="px-5 py-3 font-semibold sm:px-6">Paid to</th>
                      <th className="hidden px-5 py-3 font-semibold sm:table-cell sm:px-6">
                        Method
                      </th>
                      <th className="px-5 py-3 font-semibold sm:px-6">Submitted</th>
                      <th className="px-5 py-3 font-semibold sm:px-6">Approved</th>
                      <th className="px-5 py-3 font-semibold sm:px-6">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/80">
                    {pagedPayments.map((p) => (
                      <tr key={p.id} className="align-top hover:bg-muted/20">
                        <td className="px-5 py-3.5 sm:px-6">
                          <div className="font-semibold tabular-nums text-foreground">
                            {money(p.amount, p.currency)}
                          </div>
                          {p.reference && (
                            <div className="mt-1 text-xs text-muted-foreground">
                              Ref: {p.reference}
                            </div>
                          )}
                          {p.rejection_reason && (
                            <div className="mt-1 max-w-[14rem] text-xs text-red-600 dark:text-red-300">
                              {p.rejection_reason}
                            </div>
                          )}
                          {p.proof_path && (
                            <div className="mt-1 text-[11px] text-muted-foreground">
                              Proof attached
                            </div>
                          )}
                        </td>
                        <td className="px-5 py-3.5 sm:px-6">
                          <div className="font-medium text-foreground">{companyName}</div>
                        </td>
                        <td className="px-5 py-3.5 sm:px-6">
                          {companyPhone ? (
                            <div>
                              <div className="font-medium tabular-nums text-foreground">
                                {companyPhone}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                Company number
                              </div>
                            </div>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="hidden px-5 py-3.5 capitalize text-muted-foreground sm:table-cell sm:px-6">
                          {p.method.replaceAll("_", " ")}
                        </td>
                        <td className="px-5 py-3.5 text-muted-foreground sm:px-6">
                          <div className="text-foreground">
                            {new Date(p.submitted_at).toLocaleDateString()}
                          </div>
                          <div className="text-xs">
                            {new Date(p.submitted_at).toLocaleTimeString()}
                          </div>
                        </td>
                        <td className="px-5 py-3.5 text-muted-foreground sm:px-6">
                          {p.reviewed_at && p.status === "paid" ? (
                            <>
                              <div className="text-foreground">
                                {new Date(p.reviewed_at).toLocaleDateString()}
                              </div>
                              <div className="text-xs">
                                {new Date(p.reviewed_at).toLocaleTimeString()}
                              </div>
                            </>
                          ) : p.reviewed_at && p.status === "rejected" ? (
                            <>
                              <div className="text-foreground">
                                {new Date(p.reviewed_at).toLocaleDateString()}
                              </div>
                              <div className="text-xs text-red-600 dark:text-red-300">
                                Rejected {new Date(p.reviewed_at).toLocaleTimeString()}
                              </div>
                            </>
                          ) : (
                            <span className="text-amber-600 dark:text-amber-400">
                              Waiting…
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-3.5 sm:px-6">
                          <Badge tone={statusTone(p.status)}>
                            {simplifiedWater ? paymentStatusLabel(p.status) : p.status}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {payments.length > HISTORY_PAGE_SIZE && (
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/80 px-5 py-4 sm:px-6">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={historyPage <= 0}
                    onClick={() => setHistoryPage((p) => Math.max(0, p - 1))}
                  >
                    Previous
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    Showing {historyPage * HISTORY_PAGE_SIZE + 1}–
                    {Math.min((historyPage + 1) * HISTORY_PAGE_SIZE, payments.length)} of{" "}
                    {payments.length}
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={historyPage >= historyPageCount - 1}
                    onClick={() =>
                      setHistoryPage((p) => Math.min(historyPageCount - 1, p + 1))
                    }
                  >
                    Next page
                  </Button>
                </div>
              )}
            </>
          )}
        </section>
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? "-mb-px border-b-2 border-brand-green px-3 py-2 text-sm font-semibold text-foreground"
          : "px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground"
      }
    >
      {children}
    </button>
  );
}
