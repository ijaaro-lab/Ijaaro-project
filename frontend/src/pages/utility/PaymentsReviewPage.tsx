import {
  useEffect,
  useId,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { Link } from "react-router-dom";
import {
  CalendarPlus,
  CreditCard,
  DollarSign,
  Download,
  Pencil,
  Printer,
  Search,
  Trash2,
  Wallet,
} from "lucide-react";
import { useAuth } from "@/auth/AuthProvider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { brandingString } from "@/lib/landingTemplates";
import { money, paymentStatusLabel, statusTone } from "@/lib/format";
import { downloadTablePdf, downloadTextPdf } from "@/lib/simplePdf";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import type {
  ExtraChargesConfig,
  PaymentMethod,
  UtilityAccount,
  UtilityBill,
  UtilityPayment,
} from "@/types/database";
import { ModalCloseButton, ModalShell } from "./DirectoryUi";
import {
  companyFallbackName,
  isBillPeriodOpen,
  isSimplifiedFinance,
  KIND_LABEL,
  KIND_TENANT_TYPE,
  monthlyFeeLabel,
  serviceLabel,
  type UtilityKind,
} from "./shared";

type AccountRow = UtilityAccount & {
  properties?: {
    id: string;
    name: string | null;
    address_line: string;
    contact_phone: string | null;
    contact_email: string | null;
  } | null;
};

function monthBounds(d = new Date()) {
  const y = d.getFullYear();
  const m = d.getMonth();
  const pad = (n: number) => String(n).padStart(2, "0");
  const start = `${y}-${pad(m + 1)}-01`;
  const lastDay = new Date(y, m + 1, 0).getDate();
  const end = `${y}-${pad(m + 1)}-${pad(lastDay)}`;
  return { start, end };
}

function monthlyFee(account: UtilityAccount): number {
  const cfg = (account.extra_charges_config ?? {}) as ExtraChargesConfig;
  return Number(cfg.fixed_amount ?? 0);
}

export function PaymentsReviewPage({ kind }: { kind: UtilityKind }) {
  const { activeMembership } = useAuth();
  const tenantId = activeMembership?.tenant_id;
  const matchesKind = activeMembership?.tenant.tenant_type === KIND_TENANT_TYPE[kind];
  const isOps =
    activeMembership?.role === "utility_admin" || activeMembership?.role === "utility_staff";
  // Admin and staff both review customer/ops submissions; bill balance updates only on approve.
  const canApprove = isOps;
  const label = KIND_LABEL[kind];
  const simplifiedWater = isSimplifiedFinance(kind);
  const tenantSearch = activeMembership?.tenant.slug
    ? `?tenant=${encodeURIComponent(activeMembership.tenant.slug)}`
    : "";
  const payTitleId = useId();
  const chargeTitleId = useId();
  const monthsTitleId = useId();
  const invoiceTitleId = useId();

  const [rows, setRows] = useState<UtilityPayment[]>([]);
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [openBills, setOpenBills] = useState<UtilityBill[]>([]);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<"billing" | "pending" | "history">("billing");
  const [billingFilter, setBillingFilter] = useState<"all" | "owes" | "paid">("all");
  const [historyQ, setHistoryQ] = useState("");
  const [chargingAccountId, setChargingAccountId] = useState<string | null>(null);
  const [showMonthsModal, setShowMonthsModal] = useState(false);
  const [monthsAccount, setMonthsAccount] = useState<AccountRow | null>(null);
  const [monthsCount, setMonthsCount] = useState("5");

  // Legacy electricity register form
  const [showRegister, setShowRegister] = useState(false);
  const [bills, setBills] = useState<UtilityBill[]>([]);
  const [form, setForm] = useState({
    utility_account_id: "",
    utility_bill_id: "",
    amount: "",
    method: "mobile_money" as PaymentMethod,
    reference: "",
  });

  // Water Pay modal — only when customer owes money
  const [showPayModal, setShowPayModal] = useState(false);
  const [payAccount, setPayAccount] = useState<AccountRow | null>(null);
  const [payBills, setPayBills] = useState<UtilityBill[]>([]);
  const [payForm, setPayForm] = useState({
    utility_bill_id: "",
    amount: "",
    method: "cash" as PaymentMethod,
    reference: "",
    notes: "",
    paid_on: new Date().toISOString().slice(0, 10),
  });

  // Other fee / Charge Balance
  const [showChargeModal, setShowChargeModal] = useState(false);
  const [chargeAccount, setChargeAccount] = useState<AccountRow | null>(null);
  const [chargeForm, setChargeForm] = useState({
    amount: "",
    description: "",
    method: "other" as PaymentMethod,
    notes: "",
    charged_on: new Date().toISOString().slice(0, 10),
  });

  // Invoice preview
  const [invoiceAccount, setInvoiceAccount] = useState<AccountRow | null>(null);
  const [invoiceBills, setInvoiceBills] = useState<UtilityBill[]>([]);
  const [invoicePayments, setInvoicePayments] = useState<UtilityPayment[]>([]);

  const load = async () => {
    if (!tenantId) return;
    const [payRes, accRes, billRes] = await Promise.all([
      supabase
        .from("utility_payments")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("submitted_at", { ascending: false }),
      isOps
        ? supabase
            .from("utility_accounts")
            .select(
              "*, properties(id, name, address_line, contact_phone, contact_email)",
            )
            .eq("tenant_id", tenantId)
            .order("account_number")
        : Promise.resolve({ data: [] as AccountRow[], error: null }),
      isOps
        ? supabase
            .from("utility_bills")
            .select("*")
            .eq("tenant_id", tenantId)
            .gt("balance", 0)
            .neq("status", "cancelled")
        : Promise.resolve({ data: [] as UtilityBill[], error: null }),
    ]);
    if (payRes.error) setError(payRes.error.message);
    else {
      setError(null);
      setRows(payRes.data ?? []);
    }
    if (accRes.error) setError(accRes.error.message);
    else setAccounts((accRes.data as AccountRow[]) ?? []);
    if (billRes.error) setError(billRes.error.message);
    else setOpenBills(billRes.data ?? []);
  };

  const loadBillsForAccount = async (accountId: string) => {
    if (!accountId) {
      setBills([]);
      return;
    }
    const { data, error: err } = await supabase
      .from("utility_bills")
      .select("*")
      .eq("utility_account_id", accountId)
      .gt("balance", 0)
      .neq("status", "cancelled")
      .order("due_date");
    if (err) {
      setError(err.message);
      setBills([]);
      return;
    }
    setBills(data ?? []);
    if ((data ?? []).length > 0) {
      setForm((f) => ({
        ...f,
        utility_bill_id: data![0].id,
        amount: String(data![0].balance),
      }));
    } else {
      setForm((f) => ({ ...f, utility_bill_id: "", amount: "" }));
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  /** Open bills whose month has started (future assigned months are excluded). */
  const dueOpenBills = useMemo(
    () => openBills.filter((b) => isBillPeriodOpen(b)),
    [openBills],
  );

  const billingRows = useMemo(() => {
    return accounts.map((a) => {
      const billsFor = dueOpenBills.filter((b) => b.utility_account_id === a.id);
      const balance = billsFor.reduce((s, b) => s + Number(b.balance), 0);
      const paidApproved = rows
        .filter((p) => p.utility_account_id === a.id && p.status === "paid")
        .reduce((s, p) => s + Number(p.amount), 0);
      const hasOverdue = billsFor.some((b) => b.status === "overdue");
      const status =
        balance <= 0 ? "paid" : hasOverdue ? "overdue" : billsFor.length > 0 ? "due" : "clear";
      return { account: a, balance, paidApproved, billsFor, status };
    });
  }, [accounts, dueOpenBills, rows]);

  const filteredBilling = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let list = billingRows;
    if (billingFilter === "owes") {
      list = list.filter((r) => r.balance > 0);
    } else if (billingFilter === "paid") {
      list = list.filter((r) => r.balance <= 0);
    }
    if (!needle) return list;
    return list.filter(({ account: a }) =>
      [a.account_number, a.properties?.name, a.properties?.address_line, a.properties?.contact_phone]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(needle)),
    );
  }, [billingRows, q, billingFilter]);

  const accountLabelById = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of accounts) {
      const name = a.properties?.name?.trim() || a.properties?.address_line?.trim() || "Customer";
      map.set(a.id, `${name} (${a.account_number})`);
    }
    return map;
  }, [accounts]);

  const filteredHistory = useMemo(() => {
    const needle = historyQ.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((p) => {
      const customer = accountLabelById.get(p.utility_account_id) ?? "";
      return (
        customer.toLowerCase().includes(needle) ||
        p.status.toLowerCase().includes(needle) ||
        p.method.replaceAll("_", " ").includes(needle) ||
        (p.reference ?? "").toLowerCase().includes(needle) ||
        String(p.amount).includes(needle)
      );
    });
  }, [rows, historyQ, accountLabelById]);

  const totals = useMemo(() => {
    const collected = rows
      .filter((p) => p.status === "paid")
      .reduce((s, p) => s + Number(p.amount), 0);
    const pending = rows
      .filter((p) => p.status === "pending")
      .reduce((s, p) => s + Number(p.amount), 0);
    const outstanding = dueOpenBills.reduce((s, b) => s + Number(b.balance), 0);
    const overdueCount = billingRows.filter((r) => r.status === "overdue").length;
    const owingCustomers = billingRows.filter((r) => r.balance > 0).length;
    const paidUpCustomers = billingRows.filter((r) => r.balance <= 0).length;
    return { collected, pending, outstanding, overdueCount, owingCustomers, paidUpCustomers };
  }, [rows, dueOpenBills, billingRows]);

  const pendingRows = useMemo(
    () => rows.filter((p) => p.status === "pending"),
    [rows],
  );

  const openMonthsModal = (account: AccountRow) => {
    if (monthlyFee(account) <= 0) {
      setError(
        "This customer has no monthly fee set. Edit the customer and set the monthly amount first.",
      );
      return;
    }
    setError(null);
    setMsg(null);
    setMonthsAccount(account);
    setMonthsCount("5");
    setShowMonthsModal(true);
  };

  /**
   * Assign 1–36 upcoming months at once using the saved monthly fee.
   * Each month becomes its own bill — customer/form sees that month when it is due;
   * no need to re-enter the amount later.
   */
  const submitMonthsAhead = async (e: FormEvent) => {
    e.preventDefault();
    if (!monthsAccount || !isOps) return;
    const n = Number(monthsCount);
    if (!Number.isInteger(n) || n < 1 || n > 36) {
      setError("Enter months between 1 and 36 (e.g. 5 or 20).");
      return;
    }
    setChargingAccountId(monthsAccount.id);
    setError(null);
    setMsg(null);
    const { data, error: err } = await supabase.rpc("issue_flat_bills_months_ahead", {
      p_utility_account_id: monthsAccount.id,
      p_months: n,
      p_from_period_start: null,
    });
    setChargingAccountId(null);
    if (err || !data) {
      setError(err?.message || "Could not assign months");
      return;
    }
    const result = data as {
      monthly_fee?: number;
      issued?: number;
      already_existed?: number;
      periods?: Array<{ period_start: string; period_end: string }>;
    };
    const first = result.periods?.[0]?.period_start?.slice(0, 7);
    const last = result.periods?.[result.periods.length - 1]?.period_start?.slice(0, 7);
    const name =
      monthsAccount.properties?.name?.trim() ||
      monthsAccount.properties?.address_line?.trim() ||
      monthsAccount.account_number;
    setMsg(
      `Assigned ${n} month(s) to ${name} at ${money(Number(result.monthly_fee ?? monthlyFee(monthsAccount)))}/month` +
        (first && last ? ` (${first} → ${last})` : "") +
        `. New: ${result.issued ?? 0}. Only this month shows on balance until you pay; next months appear when their time comes.`,
    );
    setShowMonthsModal(false);
    setMonthsAccount(null);
    setBillingFilter("owes");
    await load();
  };

  const exportPaymentHistoryCsv = () => {
    const header = [
      "Customer",
      "Account",
      "Amount",
      "Currency",
      "Method",
      "Reference",
      "Status",
      "Submitted",
      "Approved",
    ];
    const lines = filteredHistory.map((p) => {
      const acc = accounts.find((a) => a.id === p.utility_account_id);
      const name =
        acc?.properties?.name?.trim() ||
        acc?.properties?.address_line?.trim() ||
        "Customer";
      const cells = [
        name,
        acc?.account_number ?? "",
        String(p.amount),
        p.currency,
        p.method,
        p.reference ?? "",
        p.status,
        p.submitted_at,
        p.reviewed_at ?? "",
      ];
      return cells.map((c) => `"${String(c).replaceAll('"', '""')}"`).join(",");
    });
    const csv = [header.join(","), ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `payment-history-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportPaymentHistoryPdf = () => {
    const branding = (activeMembership?.tenant.branding ?? {}) as Record<string, unknown>;
    const companyName =
      brandingString(branding, "display_name") ||
      activeMembership?.tenant.name ||
      companyFallbackName(kind);
    const companyPhone = brandingString(branding, "contact_phone");
    const companyEmail = brandingString(branding, "contact_email");
    const companyAddress = brandingString(branding, "address");
    const fmt = (iso: string) => {
      const d = new Date(iso);
      return `${d.toLocaleDateString()} ${d.toLocaleTimeString()}`;
    };
    const fmtMoney = (amount: number, currency = "USD") => {
      // PDF Helvetica is ASCII-only; avoid currency symbols that become "?".
      const n = Number(amount).toFixed(2);
      return currency === "USD" ? `USD ${n}` : `${currency} ${n}`;
    };

    downloadTablePdf({
      fileName: `payment-history-${new Date().toISOString().slice(0, 10)}.pdf`,
      title: companyName,
      subtitle: "Payment History Report",
      meta: [
        [
          companyPhone ? `Phone: ${companyPhone}` : null,
          companyEmail ? `Email: ${companyEmail}` : null,
        ]
          .filter(Boolean)
          .join("  |  ") || "Company payment records",
        companyAddress ? `Address: ${companyAddress}` : "",
        `Exported: ${new Date().toLocaleString()}  |  ${filteredHistory.length} record(s)`,
      ].filter(Boolean),
      tables: [
        {
          headers: ["Customer", "Amount", "Method", "Status", "Submitted", "Approved"],
          colWeights: [2.2, 1.1, 1.2, 1, 1.6, 1.6],
          rows: filteredHistory.map((p) => {
            const acc = accounts.find((a) => a.id === p.utility_account_id);
            const name =
              acc?.properties?.name?.trim() ||
              acc?.properties?.address_line?.trim() ||
              "Customer";
            const accountNo = acc?.account_number ? ` (${acc.account_number})` : "";
            return [
              `${name}${accountNo}`,
              fmtMoney(Number(p.amount), p.currency),
              p.method.replaceAll("_", " "),
              paymentStatusLabel(p.status),
              fmt(p.submitted_at),
              p.reviewed_at ? fmt(p.reviewed_at) : "Pending",
            ];
          }),
        },
      ],
    });
  };

  if (!tenantId || !matchesKind) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-sm text-muted-foreground">
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
    else await load();
  };

  const accountOutstanding = (accountId: string) =>
    dueOpenBills
      .filter((b) => b.utility_account_id === accountId)
      .reduce((s, b) => s + Number(b.balance), 0);

  /** Only load bills the customer already owes — never invent a new bill just to take payment. */
  const loadOpenPayBills = async (account: AccountRow): Promise<UtilityBill | null> => {
    const openRes = await supabase
      .from("utility_bills")
      .select("*")
      .eq("utility_account_id", account.id)
      .gt("balance", 0)
      .neq("status", "cancelled")
      .order("due_date");
    if (openRes.error) {
      setError(openRes.error.message);
      setPayBills([]);
      setPayForm((f) => ({ ...f, utility_bill_id: "", amount: "" }));
      return null;
    }
    // Only months that have started — future assigned months are not payable yet.
    const list = (openRes.data ?? []).filter((b) => isBillPeriodOpen(b));
    if (list.length === 0) {
      setPayBills([]);
      setPayForm((f) => ({ ...f, utility_bill_id: "", amount: "" }));
      setError(
        "No payment due this month. Future months appear when their month starts (after this month is paid).",
      );
      return null;
    }
    setPayBills(list);
    const bill = list[0];
    setPayForm((f) => ({
      ...f,
      utility_bill_id: bill.id,
      amount: String(bill.balance),
    }));
    setError(null);
    return bill;
  };

  const openPayModal = async (account?: AccountRow | null) => {
    setError(null);
    setMsg(null);
    setPayForm({
      utility_bill_id: "",
      amount: "",
      method: "cash",
      reference: "",
      notes: "",
      paid_on: new Date().toISOString().slice(0, 10),
    });
    setPayBills([]);
    if (account) {
      if (accountOutstanding(account.id) <= 0) {
        setError("Cannot record payment — this customer does not owe any money.");
        return;
      }
      if (!account.customer_id) {
        setError("This customer has no linked login user.");
        return;
      }
      setPayAccount(account);
      setShowPayModal(true);
      await loadOpenPayBills(account);
    } else {
      setPayAccount(null);
      setShowPayModal(true);
    }
  };

  const selectPayCustomer = async (accountId: string) => {
    const account = accounts.find((a) => a.id === accountId) ?? null;
    setPayAccount(account);
    setError(null);
    if (!account) {
      setPayBills([]);
      setPayForm((f) => ({ ...f, utility_bill_id: "", amount: "" }));
      return;
    }
    if (!account.customer_id) {
      setError(
        "This customer has no linked login user. Create them again with an email so payments can be recorded.",
      );
      setPayBills([]);
      return;
    }
    if (accountOutstanding(account.id) <= 0) {
      setError("This customer has no outstanding balance. Payment cannot be recorded.");
      setPayBills([]);
      setPayForm((f) => ({ ...f, utility_bill_id: "", amount: "" }));
      return;
    }
    await loadOpenPayBills(account);
  };

  const openChargeModal = (account: AccountRow) => {
    setError(null);
    setMsg(null);
    setChargeAccount(account);
    setChargeForm({
      amount: "",
      description: "",
      method: "other",
      notes: "",
      charged_on: new Date().toISOString().slice(0, 10),
    });
    setShowChargeModal(true);
  };

  const submitCharge = async (e: FormEvent) => {
    e.preventDefault();
    if (!isOps || !chargeAccount) return;
    const amount = Number(chargeForm.amount);
    if (Number.isNaN(amount) || amount <= 0) {
      setError("Enter a valid charge amount");
      return;
    }
    setSaving(true);
    setError(null);
    setMsg(null);
    const desc = [chargeForm.description.trim() || "Other charge", chargeForm.notes.trim()]
      .filter(Boolean)
      .join(" — ");
    const { error: err } = await supabase.rpc("create_utility_adhoc_charge" as never, {
      p_utility_account_id: chargeAccount.id,
      p_amount: amount,
      p_description: desc,
      p_due_date: chargeForm.charged_on || null,
    } as never);
    setSaving(false);
    if (err) {
      setError(err.message);
      return;
    }
    setMsg(`Other charge of ${money(amount)} added for ${customerLabel(chargeAccount)}.`);
    setShowChargeModal(false);
    setChargeAccount(null);
    await load();
  };

  const openInvoice = async (account: AccountRow) => {
    setError(null);
    setInvoiceAccount(account);
    const [billRes, payRes] = await Promise.all([
      supabase
        .from("utility_bills")
        .select("*")
        .eq("utility_account_id", account.id)
        .neq("status", "cancelled")
        .order("period_start", { ascending: false }),
      supabase
        .from("utility_payments")
        .select("*")
        .eq("utility_account_id", account.id)
        .order("submitted_at", { ascending: false }),
    ]);
    if (billRes.error) setError(billRes.error.message);
    else setInvoiceBills(billRes.data ?? []);
    if (payRes.error) setError(payRes.error.message);
    else setInvoicePayments(payRes.data ?? []);
  };

  const closePayModal = () => {
    setShowPayModal(false);
    setPayAccount(null);
    setPayBills([]);
  };

  const customerLabel = (a: AccountRow) => {
    const name = a.properties?.name?.trim() || a.properties?.address_line?.trim() || "Customer";
    return `${name} (${a.account_number})`;
  };

  const selectedPayBill = payBills.find((b) => b.id === payForm.utility_bill_id);
  const payMaxDue = selectedPayBill
    ? Number(selectedPayBill.balance)
    : payBills.reduce((s, b) => s + Number(b.balance), 0);

  const submitPay = async (e: FormEvent) => {
    e.preventDefault();
    if (!isOps || !payAccount) return;
    if (!payAccount.customer_id) {
      setError(
        "This account has no linked customer user. Edit the customer and create an IJAARO login first.",
      );
      return;
    }

    let bill = payBills.find((b) => b.id === payForm.utility_bill_id) ?? null;
    if (!bill || Number(bill.balance) <= 0) {
      bill = await loadOpenPayBills(payAccount);
    }
    if (!bill || Number(bill.balance) <= 0) {
      setError("Cannot record payment — this customer does not owe any money.");
      return;
    }

    const amount = Number(payForm.amount);
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
    const refParts = [
      payForm.reference.trim(),
      payForm.notes.trim() ? `note: ${payForm.notes.trim()}` : "",
      payForm.paid_on ? `date: ${payForm.paid_on}` : "",
    ].filter(Boolean);
    // Always save as Pending. Balance updates only after Approve on the Pending tab.
    const { data: payment, error: err } = await supabase.rpc(
      "register_utility_payment_by_ops",
      {
        p_utility_bill_id: bill.id,
        p_amount: amount,
        p_method: payForm.method,
        p_reference: refParts.length > 0 ? refParts.join(" · ") : null,
        p_proof_path: null,
      },
    );
    setSaving(false);
    if (err || !payment) {
      setError(err?.message || "Could not register payment");
      return;
    }

    setMsg(
      `Payment of ${money(amount)} submitted as Pending. Approve it under Pending approvals to record it on the account.`,
    );
    setTab("pending");
    closePayModal();
    await load();
  };

  const issueBillThenRegister = async () => {
    if (!form.utility_account_id) {
      setError("Select a customer account first");
      return;
    }
    const { start, end } = monthBounds();
    setSaving(true);
    setError(null);
    setMsg(null);
    const { data, error: err } = await supabase.rpc("generate_flat_utility_bill", {
      p_utility_account_id: form.utility_account_id,
      p_period_start: start,
      p_period_end: end,
      p_due_date: null,
    });
    if (err || !data) {
      setSaving(false);
      setError(err?.message || "Could not issue bill for this month");
      return;
    }
    setBills((prev) => [data, ...prev.filter((b) => b.id !== data.id)]);
    setForm((f) => ({
      ...f,
      utility_bill_id: data.id,
      amount: String(data.balance),
    }));
    setSaving(false);
    setMsg(`Bill issued for ${start} → ${end}. Enter payment details below.`);
  };

  const registerPayment = async (e: FormEvent) => {
    e.preventDefault();
    if (!isOps) return;
    const bill = bills.find((b) => b.id === form.utility_bill_id);
    if (!bill) {
      setError("Select a bill with an outstanding balance");
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
    const { error: err } = await supabase.rpc("register_utility_payment_by_ops", {
      p_utility_bill_id: bill.id,
      p_amount: amount,
      p_method: form.method,
      p_reference: form.reference.trim() || null,
      p_proof_path: null,
    });
    setSaving(false);
    if (err) {
      setError(err.message);
      return;
    }
    setMsg("Payment registered as Pending. An admin must approve or reject it.");
    setShowRegister(false);
    setForm({
      utility_account_id: "",
      utility_bill_id: "",
      amount: "",
      method: "mobile_money",
      reference: "",
    });
    setBills([]);
    await load();
  };

  const statusBadge = (status: string) => {
    if (status === "paid" || status === "clear") {
      return <Badge tone="success">Paid up</Badge>;
    }
    if (status === "overdue") return <Badge tone="danger">Overdue</Badge>;
    if (status === "due") return <Badge tone="warning">Due</Badge>;
    return <Badge tone="neutral">{status}</Badge>;
  };

  // —— Water finance-style billing ——
  if (simplifiedWater) {
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-2xl font-bold text-foreground">Payments</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              See who owes or paid, review pending requests, and export payment history.
            </p>
          </div>
          {isOps && (
            <Button type="button" variant="secondary" onClick={() => void openPayModal(null)}>
              <DollarSign className="h-4 w-4" />
              Record Payment
            </Button>
          )}
        </div>

        {!isOps && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
            Your role can view payments, but recording and approval require company staff access.
          </div>
        )}

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

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryCard
            label="Total collected"
            value={money(totals.collected)}
            hint="Approved payments"
          />
          <SummaryCard
            label="Pending review"
            value={money(totals.pending)}
            hint={`${pendingRows.length} payment(s) waiting`}
          />
          <SummaryCard
            label="Outstanding balance"
            value={money(totals.outstanding)}
            hint="Open bill balances"
          />
          <SummaryCard
            label="Customers owing"
            value={String(totals.owingCustomers)}
            hint={`${totals.paidUpCustomers} paid up`}
          />
        </div>

        <div className="flex flex-wrap gap-2 border-b border-border pb-0">
          <TabButton active={tab === "billing"} onClick={() => setTab("billing")}>
            Customer billing
          </TabButton>
          <TabButton active={tab === "pending"} onClick={() => setTab("pending")}>
            Pending approvals
            {pendingRows.length > 0 ? ` (${pendingRows.length})` : ""}
          </TabButton>
          <TabButton active={tab === "history"} onClick={() => setTab("history")}>
            Payment history
            {rows.length > 0 ? ` (${rows.length})` : ""}
          </TabButton>
        </div>

        {tab === "billing" && (
          <section className="overflow-hidden rounded-xl border border-border bg-card">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
              <div className="flex items-center gap-2">
                <Wallet
                  className={
                    kind === "water" ? "h-4 w-4 text-brand-water" : "h-4 w-4 text-brand-power"
                  }
                />
                <div>
                  <h3 className="font-semibold text-foreground">Customer Billing Status</h3>
                  <p className="text-xs text-muted-foreground">
                    {filteredBilling.length} customer
                    {filteredBilling.length === 1 ? "" : "s"} found
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex rounded-lg border border-border p-0.5 text-xs">
                  {(
                    [
                      ["all", "All"],
                      ["owes", "Owes"],
                      ["paid", "Paid up"],
                    ] as const
                  ).map(([key, labelText]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setBillingFilter(key)}
                      className={
                        billingFilter === key
                          ? "rounded-md bg-brand-green px-2.5 py-1.5 font-semibold text-white"
                          : "rounded-md px-2.5 py-1.5 font-medium text-muted-foreground hover:text-foreground"
                      }
                    >
                      {labelText}
                    </button>
                  ))}
                </div>
                <div className="relative min-w-[180px] flex-1 sm:max-w-xs">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    className="pl-9"
                    placeholder="Search customer…"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                  />
                </div>
              </div>
            </div>

            {!isOps ? (
              <div className="px-5 py-10 text-sm text-muted-foreground">
                Staff access required to manage billing.
              </div>
            ) : filteredBilling.length === 0 ? (
              <div className="px-5 py-12 text-center text-sm text-muted-foreground">
                No customers yet. Create a customer first, then record payments here.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="border-b border-border bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-5 py-3 font-semibold">Customer</th>
                      <th className="px-5 py-3 font-semibold">Account</th>
                      <th className="px-5 py-3 font-semibold">Monthly fee</th>
                      <th className="px-5 py-3 font-semibold">Paid</th>
                      <th className="px-5 py-3 font-semibold">Balance</th>
                      <th className="px-5 py-3 font-semibold">Status</th>
                      <th className="px-5 py-3 font-semibold">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filteredBilling.map(({ account: a, balance, paidApproved, status }) => {
                      const name = a.properties?.name || a.properties?.address_line || "Customer";
                      const canPay = Boolean(a.customer_id) && balance > 0;
                      return (
                        <tr key={a.id} className="hover:bg-muted/30">
                          <td className="px-5 py-3">
                            <div className="font-medium text-foreground">{name}</div>
                            <div className="text-xs text-muted-foreground">
                              {a.properties?.contact_phone || a.properties?.contact_email || "—"}
                            </div>
                          </td>
                          <td className="px-5 py-3">
                            <Link
                              to={`/app/water/customers/${a.id}${tenantSearch}`}
                              className="font-medium text-brand-blue hover:underline dark:text-brand-water"
                            >
                              {a.account_number}
                            </Link>
                          </td>
                          <td className="px-5 py-3 text-muted-foreground">
                            {money(monthlyFee(a))}
                          </td>
                          <td className="px-5 py-3">{money(paidApproved)}</td>
                          <td
                            className={
                              balance > 0
                                ? "px-5 py-3 font-semibold text-rose-600 dark:text-rose-400"
                                : "px-5 py-3 text-muted-foreground"
                            }
                          >
                            {money(balance)}
                          </td>
                          <td className="px-5 py-3">{statusBadge(status)}</td>
                          <td className="px-5 py-3">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={chargingAccountId === a.id || monthlyFee(a) <= 0}
                                title={
                                  monthlyFee(a) <= 0
                                    ? "Set a monthly fee on this customer first"
                                    : "Assign several months ahead (e.g. 5 or 20) at the saved monthly fee"
                                }
                                onClick={() => openMonthsModal(a)}
                              >
                                <CalendarPlus className="h-3.5 w-3.5" />
                                Months
                              </Button>
                              <button
                                type="button"
                                className="rounded-md border border-border p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                                title="Charge other fee (not monthly fee)"
                                onClick={() => openChargeModal(a)}
                              >
                                <CreditCard className="h-4 w-4" />
                              </button>
                              <Button
                                type="button"
                                size="sm"
                                variant="secondary"
                                disabled={!canPay}
                                title={
                                  !a.customer_id
                                    ? "Customer has no login user linked"
                                    : balance <= 0
                                      ? "No outstanding balance — cannot record payment"
                                      : "Record payment"
                                }
                                onClick={() => void openPayModal(a)}
                              >
                                <DollarSign className="h-3.5 w-3.5" />
                                Pay
                              </Button>
                              <button
                                type="button"
                                className="rounded-md border border-sky-500/40 p-1.5 text-sky-500 hover:bg-sky-500/10"
                                title="View invoice / payment history"
                                onClick={() => void openInvoice(a)}
                              >
                                <Pencil className="h-4 w-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {tab === "pending" && (
          <div className="space-y-3">
            {pendingRows.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border px-6 py-12 text-center text-sm text-muted-foreground">
                No pending payments to review.
              </div>
            ) : (
              pendingRows.map((p) => (
                <PaymentReviewCard
                  key={p.id}
                  payment={p}
                  canApprove={canApprove}
                  busyId={busyId}
                  reason={reasons[p.id] ?? ""}
                  onReason={(v) => setReasons({ ...reasons, [p.id]: v })}
                  onReview={(decision) => void review(p.id, decision)}
                  simplifiedWater
                  label={label}
                  customerLabel={accountLabelById.get(p.utility_account_id)}
                />
              ))
            )}
          </div>
        )}

        {tab === "history" && (
          <section className="overflow-hidden rounded-xl border border-border bg-card">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
              <div>
                <h3 className="font-semibold text-foreground">Payment history</h3>
                <p className="text-xs text-muted-foreground">
                  All customer payments · who paid, who is pending, who was rejected
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative min-w-[180px] flex-1 sm:max-w-xs">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    className="pl-9"
                    placeholder="Search history…"
                    value={historyQ}
                    onChange={(e) => setHistoryQ(e.target.value)}
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={filteredHistory.length === 0}
                  onClick={exportPaymentHistoryCsv}
                >
                  <Download className="h-3.5 w-3.5" />
                  CSV
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={filteredHistory.length === 0}
                  onClick={exportPaymentHistoryPdf}
                >
                  <Download className="h-3.5 w-3.5" />
                  Export PDF
                </Button>
              </div>
            </div>

            {filteredHistory.length === 0 ? (
              <div className="px-5 py-12 text-center text-sm text-muted-foreground">
                No payment history yet.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="border-b border-border bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-5 py-3 font-semibold">Customer</th>
                      <th className="px-5 py-3 font-semibold">Amount</th>
                      <th className="px-5 py-3 font-semibold">Method</th>
                      <th className="hidden px-5 py-3 font-semibold sm:table-cell">Submitted</th>
                      <th className="hidden px-5 py-3 font-semibold md:table-cell">Approved</th>
                      <th className="px-5 py-3 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filteredHistory.map((p) => (
                      <tr key={p.id} className="hover:bg-muted/30">
                        <td className="px-5 py-3">
                          <div className="font-medium text-foreground">
                            {accountLabelById.get(p.utility_account_id) ?? "Customer"}
                          </div>
                          {p.reference && (
                            <div className="text-xs text-muted-foreground">
                              Ref: {p.reference}
                            </div>
                          )}
                        </td>
                        <td className="px-5 py-3 font-semibold tabular-nums">
                          {money(p.amount, p.currency)}
                        </td>
                        <td className="px-5 py-3 capitalize text-muted-foreground">
                          {p.method.replaceAll("_", " ")}
                        </td>
                        <td className="hidden px-5 py-3 text-muted-foreground sm:table-cell">
                          {new Date(p.submitted_at).toLocaleString()}
                        </td>
                        <td className="hidden px-5 py-3 text-muted-foreground md:table-cell">
                          {p.reviewed_at
                            ? new Date(p.reviewed_at).toLocaleString()
                            : "—"}
                        </td>
                        <td className="px-5 py-3">
                          <Badge tone={statusTone(p.status)}>
                            {paymentStatusLabel(p.status)}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        <ModalShell open={showPayModal} onClose={closePayModal} labelledBy={payTitleId}>
          <div className="flex items-start justify-between gap-3">
            <h3 id={payTitleId} className="font-display text-xl font-bold text-foreground">
              Record Payment
            </h3>
            <ModalCloseButton onClick={closePayModal} />
          </div>

          <form onSubmit={(e) => void submitPay(e)} className="mt-5 space-y-4">
            <div>
              <Label htmlFor="pay-customer" className="normal-case tracking-normal">
                Customer *
              </Label>
              <Select
                id="pay-customer"
                required
                value={payAccount?.id ?? ""}
                onChange={(e) => void selectPayCustomer(e.target.value)}
              >
                <option value="">Select customer who owes money…</option>
                {accounts.map((a) => {
                  const owed = accountOutstanding(a.id);
                  return (
                    <option
                      key={a.id}
                      value={a.id}
                      disabled={!a.customer_id || owed <= 0}
                    >
                      {customerLabel(a)}
                      {!a.customer_id
                        ? " — no login"
                        : owed <= 0
                          ? " — paid up"
                          : ` — owes ${money(owed)}`}
                    </option>
                  );
                })}
              </Select>
              {payAccount && (
                <p className="mt-1.5 text-xs text-muted-foreground">
                  Account number:{" "}
                  <span className="font-semibold text-foreground">
                    {payAccount.account_number}
                  </span>
                  {payAccount.properties?.contact_phone
                    ? ` · ${payAccount.properties.contact_phone}`
                    : ""}
                </p>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="pay-amount" className="normal-case tracking-normal">
                  Amount ($) *
                </Label>
                <Input
                  id="pay-amount"
                  type="number"
                  min="0.01"
                  step="0.01"
                  required
                  disabled={!payAccount}
                  value={payForm.amount}
                  onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })}
                />
                {payAccount && (
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    {payMaxDue > 0
                      ? `Outstanding: ${money(payMaxDue)}`
                      : "Balance loads automatically when you select the customer."}
                    {monthlyFee(payAccount) > 0
                      ? ` · monthly fee ${money(monthlyFee(payAccount))}`
                      : ""}
                  </p>
                )}
              </div>
              <div>
                <Label htmlFor="pay-status" className="normal-case tracking-normal">
                  Status
                </Label>
                <Input
                  id="pay-status"
                  disabled
                  value="Pending — approve to record"
                  className="font-medium text-amber-600 dark:text-amber-400"
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="pay-method" className="normal-case tracking-normal">
                  Method
                </Label>
                <Select
                  id="pay-method"
                  value={payForm.method}
                  onChange={(e) =>
                    setPayForm({ ...payForm, method: e.target.value as PaymentMethod })
                  }
                >
                  <option value="cash">Cash</option>
                  <option value="mobile_money">Mobile money</option>
                  <option value="bank_transfer">Bank transfer</option>
                  <option value="card">Card</option>
                  <option value="other">Other</option>
                </Select>
              </div>
              <div>
                <Label htmlFor="pay-date" className="normal-case tracking-normal">
                  Date
                </Label>
                <Input
                  id="pay-date"
                  type="date"
                  value={payForm.paid_on}
                  onChange={(e) => setPayForm({ ...payForm, paid_on: e.target.value })}
                />
              </div>
            </div>

            <div>
              <Label htmlFor="pay-notes" className="normal-case tracking-normal">
                Notes
              </Label>
              <Input
                id="pay-notes"
                value={payForm.notes}
                onChange={(e) => setPayForm({ ...payForm, notes: e.target.value })}
                placeholder="Optional notes…"
              />
            </div>

            <Button
              type="submit"
              variant="secondary"
              className="w-full"
              disabled={saving || !payAccount || !payForm.utility_bill_id || payMaxDue <= 0}
            >
              {saving ? "Saving…" : "Submit for approval"}
            </Button>
          </form>
        </ModalShell>

        <ModalShell
          open={showChargeModal}
          onClose={() => {
            setShowChargeModal(false);
            setChargeAccount(null);
          }}
          labelledBy={chargeTitleId}
        >
          <div className="flex items-start justify-between gap-3">
            <h3 id={chargeTitleId} className="font-display text-xl font-bold text-foreground">
              Charge Balance
            </h3>
            <ModalCloseButton
              onClick={() => {
                setShowChargeModal(false);
                setChargeAccount(null);
              }}
            />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Add another fee (not the monthly {label.toLowerCase()} fee). This
            increases what the customer owes.
          </p>
          <form onSubmit={(e) => void submitCharge(e)} className="mt-5 space-y-4">
            <div>
              <Label className="normal-case tracking-normal">Customer *</Label>
              <Input
                disabled
                value={chargeAccount ? customerLabel(chargeAccount) : ""}
              />
            </div>
            <div>
              <Label htmlFor="charge-desc" className="normal-case tracking-normal">
                Charge type
              </Label>
              <Input
                id="charge-desc"
                value={chargeForm.description}
                onChange={(e) =>
                  setChargeForm({ ...chargeForm, description: e.target.value })
                }
                placeholder="e.g. Connection fee, reconnection, fine…"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="charge-amount" className="normal-case tracking-normal">
                  Amount ($) *
                </Label>
                <Input
                  id="charge-amount"
                  type="number"
                  min="0.01"
                  step="0.01"
                  required
                  value={chargeForm.amount}
                  onChange={(e) => setChargeForm({ ...chargeForm, amount: e.target.value })}
                />
              </div>
              <div>
                <Label className="normal-case tracking-normal">Status</Label>
                <Input
                  disabled
                  value="Pending (Charge / Invoice)"
                  className="font-medium text-amber-600 dark:text-amber-400"
                />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="charge-method" className="normal-case tracking-normal">
                  Method note
                </Label>
                <Select
                  id="charge-method"
                  value={chargeForm.method}
                  onChange={(e) =>
                    setChargeForm({
                      ...chargeForm,
                      method: e.target.value as PaymentMethod,
                    })
                  }
                >
                  <option value="other">Other</option>
                  <option value="cash">Cash</option>
                  <option value="mobile_money">Mobile money</option>
                  <option value="bank_transfer">Bank transfer</option>
                </Select>
              </div>
              <div>
                <Label htmlFor="charge-date" className="normal-case tracking-normal">
                  Date
                </Label>
                <Input
                  id="charge-date"
                  type="date"
                  value={chargeForm.charged_on}
                  onChange={(e) =>
                    setChargeForm({ ...chargeForm, charged_on: e.target.value })
                  }
                />
              </div>
            </div>
            <div>
              <Label htmlFor="charge-notes" className="normal-case tracking-normal">
                Notes
              </Label>
              <Input
                id="charge-notes"
                value={chargeForm.notes}
                onChange={(e) => setChargeForm({ ...chargeForm, notes: e.target.value })}
                placeholder="Optional notes…"
              />
            </div>
            <Button type="submit" variant="secondary" className="w-full" disabled={saving}>
              {saving ? "Saving…" : "Create Charge"}
            </Button>
          </form>
        </ModalShell>

        <ModalShell
          open={showMonthsModal}
          onClose={() => {
            setShowMonthsModal(false);
            setMonthsAccount(null);
          }}
          labelledBy={monthsTitleId}
        >
          <div className="flex items-start justify-between gap-3">
            <h3 id={monthsTitleId} className="font-display text-xl font-bold text-foreground">
              Assign months ahead
            </h3>
            <ModalCloseButton
              onClick={() => {
                setShowMonthsModal(false);
                setMonthsAccount(null);
              }}
            />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Choose a duration (e.g. 5 or 20 months) at the saved monthly fee. Only the current
            month shows on the balance and can be paid. When that month is paid, balance is $0;
            the next month appears when its time comes — no re-entering amounts.
          </p>
          <form onSubmit={(e) => void submitMonthsAhead(e)} className="mt-5 space-y-4">
            <div>
              <Label className="normal-case tracking-normal">Customer</Label>
              <Input
                disabled
                value={monthsAccount ? customerLabel(monthsAccount) : ""}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label className="normal-case tracking-normal">Monthly fee</Label>
                <Input
                  disabled
                  value={
                    monthsAccount ? money(monthlyFee(monthsAccount)) : ""
                  }
                  className="font-semibold"
                />
              </div>
              <div>
                <Label htmlFor="months-count" className="normal-case tracking-normal">
                  How many months? *
                </Label>
                <Input
                  id="months-count"
                  type="number"
                  min={1}
                  max={36}
                  step={1}
                  required
                  value={monthsCount}
                  onChange={(e) => setMonthsCount(e.target.value)}
                  placeholder="e.g. 5 or 20"
                />
                <p className="mt-1 text-xs text-muted-foreground">1 to 36 months</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {(["1", "3", "5", "6", "12", "20", "24"] as const).map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setMonthsCount(n)}
                  className={
                    monthsCount === n
                      ? "rounded-lg bg-brand-green px-3 py-1.5 text-xs font-semibold text-white"
                      : "rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
                  }
                >
                  {n} mo
                </button>
              ))}
            </div>
            {monthsAccount && Number(monthsCount) > 0 && (
              <p className="rounded-lg border border-sky-200/80 bg-sky-50/60 px-3 py-2 text-sm text-sky-900 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-100">
                Total to assign:{" "}
                <span className="font-semibold">
                  {money(monthlyFee(monthsAccount) * Number(monthsCount || 0))}
                </span>{" "}
                ({monthsCount} x {money(monthlyFee(monthsAccount))})
              </p>
            )}
            <Button
              type="submit"
              variant="secondary"
              className="w-full"
              disabled={Boolean(chargingAccountId) || !monthsAccount}
            >
              {chargingAccountId
                ? "Assigning…"
                : `Assign ${monthsCount || "…"} month(s)`}
            </Button>
          </form>
        </ModalShell>

        <ModalShell
          open={Boolean(invoiceAccount)}
          onClose={() => setInvoiceAccount(null)}
          labelledBy={invoiceTitleId}
          className="max-h-[90vh] max-w-2xl overflow-y-auto p-5 sm:p-6"
        >
          {invoiceAccount && (
            <InvoicePanel
              titleId={invoiceTitleId}
              account={invoiceAccount}
              bills={invoiceBills}
              payments={invoicePayments}
              canEdit={isOps}
              companyName={
                brandingString(
                  (activeMembership?.tenant.branding ?? {}) as Record<string, unknown>,
                  "display_name",
                ) ||
                activeMembership?.tenant.name ||
                companyFallbackName(kind)
              }
              serviceName={serviceLabel(kind)}
              feeLabel={monthlyFeeLabel(kind)}
              companyPhone={brandingString(
                (activeMembership?.tenant.branding ?? {}) as Record<string, unknown>,
                "contact_phone",
              )}
              companyEmail={brandingString(
                (activeMembership?.tenant.branding ?? {}) as Record<string, unknown>,
                "contact_email",
              )}
              companyLogo={brandingString(
                (activeMembership?.tenant.branding ?? {}) as Record<string, unknown>,
                "logo_url",
              )}
              onClose={() => setInvoiceAccount(null)}
              onSystemChange={async () => {
                await openInvoice(invoiceAccount);
                await load();
              }}
            />
          )}
        </ModalShell>
      </div>
    );
  }

  // —— Electricity / legacy ——
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-bold">{label} payment review</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Only the utility company (not landlords) reviews these submissions. Approval does not
            prove funds were received outside the platform.
          </p>
        </div>
        {isOps && (
          <Button type="button" variant="secondary" onClick={() => setShowRegister((v) => !v)}>
            {showRegister ? "Close form" : "Register payment"}
          </Button>
        )}
      </div>

      {!isOps && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          Your role can view payments, but review actions require company staff access.
        </div>
      )}
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

      {showRegister && isOps && (
        <form
          onSubmit={(e) => void registerPayment(e)}
          className="max-w-xl space-y-4 rounded-xl border border-border bg-card p-5"
        >
          <h3 className="font-semibold text-foreground">Register a payment</h3>
          <div>
            <Label>Customer account</Label>
            <Select
              value={form.utility_account_id}
              onChange={(e) => {
                const id = e.target.value;
                setForm((f) => ({ ...f, utility_account_id: id, utility_bill_id: "", amount: "" }));
                void loadBillsForAccount(id);
              }}
              required
            >
              <option value="">Select account…</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.account_number}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <div className="mb-1 flex items-center justify-between gap-2">
              <Label>Open bill</Label>
              {form.utility_account_id && bills.length === 0 && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={saving}
                  onClick={() => void issueBillThenRegister()}
                >
                  Issue this month&apos;s bill
                </Button>
              )}
            </div>
            <Select
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
            >
              <option value="">Select bill…</option>
              {bills.map((b) => (
                <option key={b.id} value={b.id}>
                  Due {b.due_date} · balance {money(b.balance)} ({b.status})
                </option>
              ))}
            </Select>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Amount</Label>
              <Input
                type="number"
                min="0.01"
                step="0.01"
                required
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
              />
            </div>
            <div>
              <Label>Method</Label>
              <Select
                value={form.method}
                onChange={(e) => setForm({ ...form, method: e.target.value as PaymentMethod })}
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
            <Label>Reference (optional)</Label>
            <Input
              value={form.reference}
              onChange={(e) => setForm({ ...form, reference: e.target.value })}
            />
          </div>
          <Button type="submit" disabled={saving || !form.utility_bill_id}>
            {saving ? "Saving…" : "Save as Pending"}
          </Button>
        </form>
      )}

      <div className="space-y-3">
        {rows.map((p) => (
          <PaymentReviewCard
            key={p.id}
            payment={p}
            canApprove={canApprove}
            busyId={busyId}
            reason={reasons[p.id] ?? ""}
            onReason={(v) => setReasons({ ...reasons, [p.id]: v })}
            onReview={(decision) => void review(p.id, decision)}
            simplifiedWater={false}
            label={label}
          />
        ))}
        {rows.length === 0 && (
          <div className="rounded-xl border border-dashed border-border px-6 py-12 text-center text-sm text-muted-foreground">
            No {label.toLowerCase()} payments yet.
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-2xl border border-border/80 bg-card px-4 py-4 shadow-[0_1px_3px_rgba(11,31,58,0.05)] dark:border-border dark:shadow-none">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-xl font-bold text-foreground sm:text-2xl">{value}</p>
      <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>
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

function billDescription(b: UtilityBill, feeLabel = "Fee"): string {
  const snap = (b.occupancy_snapshot ?? {}) as Record<string, unknown>;
  if (typeof snap.description === "string" && snap.description.trim()) {
    return snap.description.trim();
  }
  if (snap.billing_mode === "adhoc_charge") return "Other charge";
  return `${feeLabel} · ${b.period_start} → ${b.period_end}`;
}

function billEditLabel(b: UtilityBill): string {
  const snap = (b.occupancy_snapshot ?? {}) as Record<string, unknown>;
  if (typeof snap.description === "string" && snap.description.trim()) {
    return snap.description.trim();
  }
  if (snap.billing_mode === "adhoc_charge") return "Other charge";
  return b.period_start.slice(0, 7);
}

function InvoicePanel({
  titleId,
  account,
  bills,
  payments,
  canEdit,
  companyName,
  companyPhone,
  companyEmail,
  companyLogo,
  serviceName,
  feeLabel,
  onClose,
  onSystemChange,
}: {
  titleId: string;
  account: AccountRow;
  bills: UtilityBill[];
  payments: UtilityPayment[];
  canEdit: boolean;
  companyName: string;
  companyPhone: string;
  companyEmail: string;
  companyLogo: string;
  serviceName: string;
  feeLabel: string;
  onClose: () => void;
  onSystemChange: () => Promise<void>;
}) {
  const customerName =
    account.properties?.name?.trim() ||
    account.properties?.address_line?.trim() ||
    "Customer";

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftAmount, setDraftAmount] = useState("");
  const [savingLine, setSavingLine] = useState(false);
  const [lineError, setLineError] = useState<string | null>(null);
  const [lineMsg, setLineMsg] = useState<string | null>(null);

  const visibleBills = bills;
  const totalDue = visibleBills.reduce((s, b) => s + Number(b.total_amount), 0);
  const paidPayments = payments.filter((p) => p.status === "paid");
  const amountPaid = paidPayments.reduce((s, p) => s + Number(p.amount), 0);
  const balance = visibleBills.reduce((s, b) => s + Number(b.balance), 0);
  const invoiceDate = new Date().toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  const startEdit = (b: UtilityBill) => {
    setLineError(null);
    setLineMsg(null);
    setEditingId(b.id);
    setDraftAmount(String(Number(b.total_amount)));
  };

  const saveEdit = async () => {
    if (!editingId) return;
    const n = Number(draftAmount);
    if (Number.isNaN(n) || n < 0) {
      setLineError("Enter a valid amount (0 or more).");
      return;
    }
    setSavingLine(true);
    setLineError(null);
    setLineMsg(null);
    const { error: err } = await supabase.rpc("adjust_utility_bill_by_ops", {
      p_utility_bill_id: editingId,
      p_total_amount: n,
      p_cancel: false,
    });
    setSavingLine(false);
    if (err) {
      setLineError(err.message);
      return;
    }
    setEditingId(null);
    setLineMsg(`Amount updated to ${money(n)}. Saved in the system.`);
    await onSystemChange();
  };

  const deleteLine = async (id: string) => {
    setSavingLine(true);
    setLineError(null);
    setLineMsg(null);
    const { error: err } = await supabase.rpc("adjust_utility_bill_by_ops", {
      p_utility_bill_id: id,
      p_total_amount: null,
      p_cancel: true,
    });
    setSavingLine(false);
    if (err) {
      setLineError(err.message);
      return;
    }
    setEditingId(null);
    setLineMsg("Charge removed from the system.");
    await onSystemChange();
  };

  const printInvoice = () => {
    window.print();
  };

  const downloadPdf = () => {
    const lines: { text: string; size?: number; bold?: boolean }[] = [
      { text: companyName, size: 16, bold: true },
      { text: [companyPhone, companyEmail].filter(Boolean).join(" · ") || "—", size: 10 },
      { text: "", size: 8 },
      { text: "INVOICE", size: 18, bold: true },
      { text: `Account #${account.account_number}`, size: 11 },
      { text: `Date: ${invoiceDate}`, size: 11 },
      { text: "", size: 8 },
      { text: "Bill to", size: 10, bold: true },
      { text: customerName, size: 12, bold: true },
      { text: `ID: ${account.account_number}`, size: 10 },
    ];
    if (account.properties?.contact_email) {
      lines.push({ text: account.properties.contact_email, size: 10 });
    }
    if (account.properties?.contact_phone) {
      lines.push({ text: account.properties.contact_phone, size: 10 });
    }
    lines.push(
      { text: "", size: 8 },
      { text: `Service: ${serviceName}`, size: 11 },
      { text: `Monthly fee: ${money(monthlyFee(account))}`, size: 10 },
      { text: "", size: 8 },
      { text: "Description                                          Amount", size: 10, bold: true },
    );
    if (visibleBills.length === 0) {
      lines.push({ text: "No bills yet.", size: 10 });
    } else {
      for (const b of visibleBills) {
        const amt = money(b.total_amount);
        const desc = billDescription(b, feeLabel);
        const pad = Math.max(1, 48 - desc.length);
        lines.push({ text: `${desc}${" ".repeat(Math.min(pad, 8))} ${amt}`, size: 10 });
      }
    }
    lines.push(
      { text: "", size: 8 },
      { text: `Total due: ${money(totalDue)}`, size: 11, bold: true },
      { text: `Amount paid: -${money(amountPaid)}`, size: 11 },
      { text: `Balance: ${money(balance)}`, size: 12, bold: true },
      { text: "", size: 8 },
      { text: "Payment history", size: 10, bold: true },
    );
    if (paidPayments.length === 0) {
      lines.push({ text: "No approved payments yet.", size: 10 });
    } else {
      for (const p of paidPayments) {
        lines.push({
          text: `${new Date(p.submitted_at).toLocaleDateString()} · ${p.method.replaceAll("_", " ")}  -${money(p.amount)}`,
          size: 10,
        });
      }
    }
    lines.push(
      { text: "", size: 10 },
      { text: `Thank you for your business. Payable to ${companyName}.`, size: 9 },
    );

    downloadTextPdf({
      fileName: `invoice-${account.account_number}.pdf`,
      lines,
    });
  };

  return (
    <div>
      <div className="mb-4 flex items-start justify-between gap-3 print:hidden">
        <h3 id={titleId} className="font-display text-xl font-bold text-foreground">
          Invoice
        </h3>
        <ModalCloseButton onClick={onClose} />
      </div>

      <div
        id="invoice-print-root"
        className="relative rounded-xl border border-border bg-white p-5 text-slate-900 dark:bg-card dark:text-foreground"
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            {companyLogo ? (
              <img src={companyLogo} alt="" className="h-10 w-10 rounded object-contain" />
            ) : null}
            <div className="text-sm">
              <p className="font-semibold">{companyName}</p>
              <p className="text-slate-500 dark:text-muted-foreground">
                {[companyPhone, companyEmail].filter(Boolean).join(" · ") || "—"}
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="font-display text-2xl font-bold tracking-wide">INVOICE</p>
            <p className="mt-1 text-xs text-slate-500 dark:text-muted-foreground">
              Account #{account.account_number}
            </p>
            <p className="text-xs text-slate-500 dark:text-muted-foreground">
              Date: {invoiceDate}
            </p>
          </div>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-muted-foreground">
              Bill to
            </p>
            <p className="mt-1 font-semibold">{customerName}</p>
            <p className="text-sm text-slate-600 dark:text-muted-foreground">
              ID: {account.account_number}
            </p>
            {account.properties?.contact_email && (
              <p className="text-sm text-slate-600 dark:text-muted-foreground">
                {account.properties.contact_email}
              </p>
            )}
            {account.properties?.contact_phone && (
              <p className="text-sm text-slate-600 dark:text-muted-foreground">
                {account.properties.contact_phone}
              </p>
            )}
          </div>
          <div className="sm:text-right">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-muted-foreground">
              Service
            </p>
            <p className="mt-1 font-semibold">{serviceName}</p>
            <p className="text-sm text-slate-600 dark:text-muted-foreground">
              Monthly fee: {money(monthlyFee(account))}
            </p>
          </div>
        </div>

        <div className="mt-5 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-xs uppercase text-slate-500 dark:border-border dark:text-muted-foreground">
              <tr>
                <th className="py-2 pr-3">Description</th>
                <th className="py-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-border">
              {visibleBills.length === 0 ? (
                <tr>
                  <td colSpan={2} className="py-4 text-slate-500 dark:text-muted-foreground">
                    No bills yet.
                  </td>
                </tr>
              ) : (
                visibleBills.map((b) => (
                  <tr key={b.id}>
                    <td className="py-2 pr-3">{billDescription(b, feeLabel)}</td>
                    <td className="py-2 text-right tabular-nums">{money(b.total_amount)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-4 space-y-1 border-t border-slate-200 pt-4 text-sm dark:border-border">
          <div className="flex justify-between">
            <span>Total due</span>
            <span className="font-semibold tabular-nums text-sky-600">{money(totalDue)}</span>
          </div>
          <div className="flex justify-between">
            <span>Amount paid</span>
            <span className="font-semibold tabular-nums text-emerald-600">
              −{money(amountPaid)}
            </span>
          </div>
          <div className="flex justify-between text-base">
            <span className="font-semibold">Balance</span>
            <span
              className={cn(
                "font-bold tabular-nums",
                balance > 0 ? "text-rose-600" : "text-emerald-600",
              )}
            >
              {money(balance)}
            </span>
          </div>
        </div>

        <div className="mt-5 rounded-lg bg-slate-50 p-3 dark:bg-muted/40">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-muted-foreground">
            Payment history
          </p>
          {paidPayments.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500 dark:text-muted-foreground">
              No approved payments yet.
            </p>
          ) : (
            <ul className="mt-2 space-y-1 text-sm">
              {paidPayments.map((p) => (
                <li key={p.id} className="flex justify-between gap-2">
                  <span className="text-slate-600 dark:text-muted-foreground">
                    {new Date(p.submitted_at).toLocaleDateString()} ·{" "}
                    {p.method.replaceAll("_", " ")}
                    {p.reference ? ` · ${p.reference}` : ""}
                  </span>
                  <span className="tabular-nums text-emerald-600">−{money(p.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <p className="mt-5 text-center text-xs text-slate-500 dark:text-muted-foreground">
          Thank you for your business. Please make payments payable to {companyName}.
        </p>
      </div>

      {canEdit && bills.length > 0 && (
        <div className="mt-5 space-y-3 print:hidden">
          <div>
            <h4 className="font-display text-base font-semibold text-brand-green">
              Edit payment amounts
            </h4>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Click Edit to change an amount (including to $0) or delete the record. Changes are
              saved in the system and update this invoice, billing balances, and the PDF.
            </p>
          </div>
          {lineError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
              {lineError}
            </div>
          )}
          {lineMsg && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200">
              {lineMsg}
            </div>
          )}
          <ul className="space-y-2">
            {bills.map((b) => {
              const amt = Number(b.total_amount);
              const isEditing = editingId === b.id;
              return (
                <li
                  key={b.id}
                  className="rounded-xl border border-border bg-card px-4 py-3 dark:bg-muted/20"
                >
                  {isEditing ? (
                    <div className="space-y-3">
                      <div>
                        <p className="font-semibold text-foreground">{billEditLabel(b)}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(b.period_start + "T12:00:00").toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </p>
                      </div>
                      <div>
                        <Label htmlFor={`edit-amt-${b.id}`}>Amount</Label>
                        <Input
                          id={`edit-amt-${b.id}`}
                          type="number"
                          min={0}
                          step="0.01"
                          value={draftAmount}
                          onChange={(e) => setDraftAmount(e.target.value)}
                          disabled={savingLine}
                          autoFocus
                        />
                        <p className="mt-1 text-xs text-muted-foreground">
                          You can set this to 0. Saved amounts update customer balances.
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          disabled={savingLine}
                          onClick={() => void saveEdit()}
                        >
                          {savingLine ? "Saving…" : "Save"}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={savingLine}
                          onClick={() => setEditingId(null)}
                        >
                          Cancel
                        </Button>
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          disabled={savingLine}
                          onClick={() => void deleteLine(b.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Delete
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-foreground">{billEditLabel(b)}</p>
                        <p className="text-sm text-muted-foreground">
                          {new Date(b.period_start + "T12:00:00").toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}{" "}
                          · {money(amt)}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="shrink-0"
                        disabled={savingLine}
                        onClick={() => startEdit(b)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Edit
                      </Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2 print:hidden">
        <Button type="button" variant="outline" className="flex-1" onClick={printInvoice}>
          <Printer className="h-4 w-4" />
          Print Invoice
        </Button>
        <Button type="button" variant="secondary" className="flex-1" onClick={downloadPdf}>
          <Download className="h-4 w-4" />
          Download PDF
        </Button>
      </div>
      <div className="mt-2 print:hidden">
        <Button type="button" variant="ghost" className="w-full" onClick={onClose}>
          Close
        </Button>
      </div>
    </div>
  );
}

function PaymentReviewCard({
  payment: p,
  canApprove,
  busyId,
  reason,
  onReason,
  onReview,
  simplifiedWater,
  label,
  customerLabel,
}: {
  payment: UtilityPayment;
  canApprove: boolean;
  busyId: string | null;
  reason: string;
  onReason: (v: string) => void;
  onReview: (decision: "approve" | "reject") => void;
  simplifiedWater: boolean;
  label: string;
  customerLabel?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          {customerLabel && (
            <div className="mb-1 text-sm font-medium text-foreground">{customerLabel}</div>
          )}
          <div className="font-display text-lg font-semibold">
            {money(p.amount, p.currency)}
          </div>
          <div className="mt-1 text-sm text-muted-foreground">
            {p.method.replaceAll("_", " ")}
            {p.reference ? ` · ref ${p.reference}` : ""} ·{" "}
            {new Date(p.submitted_at).toLocaleString()}
          </div>
          {p.reviewed_at && (
            <div className="mt-1 text-xs text-muted-foreground">
              Reviewed {new Date(p.reviewed_at).toLocaleString()}
            </div>
          )}
          {p.rejection_reason && (
            <div className="mt-2 text-sm text-red-700 dark:text-red-300">
              Reason: {p.rejection_reason}
            </div>
          )}
        </div>
        <Badge tone={statusTone(p.status)}>
          {simplifiedWater ? paymentStatusLabel(p.status) : p.status}
        </Badge>
      </div>

      {p.status === "pending" && canApprove && (
        <div className="mt-4 flex flex-wrap items-end gap-2 border-t border-border pt-4">
          <div className="min-w-[220px] flex-1">
            <Input
              placeholder="Rejection reason (required to reject)"
              value={reason}
              onChange={(e) => onReason(e.target.value)}
            />
          </div>
          <Button
            variant="secondary"
            disabled={busyId === p.id}
            onClick={() => {
              if (
                !window.confirm(
                  `Approve this ${label.toLowerCase()} payment of ${money(p.amount, p.currency)}?`,
                )
              ) {
                return;
              }
              onReview("approve");
            }}
          >
            Approve
          </Button>
          <Button
            variant="destructive"
            disabled={busyId === p.id || !reason.trim()}
            onClick={() => {
              if (
                !window.confirm(
                  `Reject this ${label.toLowerCase()} payment? The payer will see your reason.`,
                )
              ) {
                return;
              }
              onReview("reject");
            }}
          >
            Reject
          </Button>
        </div>
      )}
    </div>
  );
}
