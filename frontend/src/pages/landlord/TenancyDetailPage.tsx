import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Banknote,
  CalendarDays,
  CalendarRange,
  CircleDollarSign,
  Home,
  PlusCircle,
  Receipt,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "@/auth/AuthProvider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UserAvatar } from "@/components/ui/user-avatar";
import { money, statusTone } from "@/lib/format";
import {
  createPropertyPhotoSignedUrl,
  fetchCoverPathsForProperties,
} from "@/lib/propertyPhotos";
import { supabase } from "@/lib/supabase";
import { propertyLabel, renterLabel, shortId } from "@/lib/tenancyDisplay";
import { cn } from "@/lib/utils";
import type { RentCharge, RentPayment, RentalAssignment } from "@/types/database";

type PropertyRow = { id: string; name: string | null; address_line: string };
type RenterRow = { user_id: string; full_name: string | null; email: string | null };
type StatAccent = "navy" | "green" | "teal" | "orange";

const STAT_ACCENTS: Record<StatAccent, string> = {
  navy: "bg-brand-navy/10 text-brand-navy dark:bg-brand-blue/20 dark:text-brand-water",
  green: "bg-brand-green/10 text-brand-green dark:bg-brand-green/20 dark:text-brand-green",
  teal: "bg-teal-100 text-teal-700 dark:bg-teal-500/20 dark:text-teal-300",
  orange: "bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-300",
};

const CARD =
  "rounded-2xl border border-border/80 bg-card shadow-[0_2px_8px_rgba(11,31,58,0.05)] dark:shadow-none";

const PROPERTY_COVER_FRAME =
  "h-16 w-16 shrink-0 sm:h-20 sm:w-20";

function SummaryCard({
  label,
  value,
  icon: Icon,
  accent,
  valueTitle,
}: {
  label: string;
  value: string;
  icon: LucideIcon;
  accent: StatAccent;
  valueTitle?: string;
}) {
  return (
    <div className={cn(CARD, "px-4 py-3.5 transition-shadow hover:shadow-[0_4px_14px_rgba(11,31,58,0.08)] dark:hover:shadow-none")}>
      <div className="flex items-center gap-3">
        <div className={cn("shrink-0 rounded-xl p-2.5", STAT_ACCENTS[accent])}>
          <Icon className="h-4 w-4" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-medium text-muted-foreground">{label}</div>
          <div
            className="mt-0.5 truncate font-display text-base font-bold leading-tight tracking-tight text-foreground sm:text-lg"
            title={valueTitle ?? value}
          >
            {value}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Cover image for the property panel — uses existing property-photos signed URL helper. */
function PropertyCoverImage({
  name,
  storagePath,
}: {
  name: string;
  storagePath: string | null;
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
        alt={name}
        className={cn(PROPERTY_COVER_FRAME, "rounded-xl object-cover")}
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
        PROPERTY_COVER_FRAME,
        "flex items-center justify-center rounded-xl bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300",
        storagePath && !failed && !url && "animate-pulse",
      )}
      role="img"
      aria-label={
        storagePath && !failed && !url ? "Loading property photo" : `${name} thumbnail`
      }
    >
      <Home className="h-6 w-6 opacity-70" aria-hidden />
    </div>
  );
}

function endDateLabel(endDate: string | null): string {
  return endDate ?? "Ongoing";
}

export function TenancyDetailPage() {
  const { id } = useParams();
  const { activeMembership } = useAuth();
  const [assignment, setAssignment] = useState<RentalAssignment | null>(null);
  const [property, setProperty] = useState<PropertyRow | null>(null);
  const [renter, setRenter] = useState<RenterRow | null>(null);
  const [coverPath, setCoverPath] = useState<string | null>(null);
  const [charges, setCharges] = useState<RentCharge[]>([]);
  const [payments, setPayments] = useState<RentPayment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [chargeForm, setChargeForm] = useState({
    period_start: "",
    period_end: "",
    due_date: "",
    amount_due: "",
  });

  const load = async () => {
    if (!id || !activeMembership?.tenant_id) return;
    const tenantId = activeMembership.tenant_id;

    const [a, c, p] = await Promise.all([
      supabase
        .from("rental_assignments")
        .select("*")
        .eq("id", id)
        .eq("tenant_id", tenantId)
        .maybeSingle(),
      supabase.from("rent_charges").select("*").eq("assignment_id", id).order("due_date"),
      supabase
        .from("rent_payments")
        .select("*")
        .eq("assignment_id", id)
        .order("submitted_at", { ascending: false }),
    ]);
    if (a.error) setError(a.error.message);
    else setError(null);
    setAssignment(a.data);
    setCharges(c.data ?? []);
    setPayments(p.data ?? []);

    if (!a.data) {
      setProperty(null);
      setRenter(null);
      setCoverPath(null);
      return;
    }

    if (a.data) {
      setChargeForm((f) => ({
        ...f,
        amount_due: String(a.data!.rent_amount),
      }));
    }

    const [propRes, renterRes, covers] = await Promise.all([
      supabase
        .from("properties")
        .select("id, name, address_line")
        .eq("id", a.data.property_id)
        .eq("tenant_id", tenantId)
        .maybeSingle(),
      supabase.rpc("list_same_tenant_member_profiles", { p_tenant_id: tenantId }),
      // Existing frontend helper (same source as Properties / Dashboard cards).
      fetchCoverPathsForProperties(tenantId, [a.data.property_id]),
    ]);

    if (propRes.error || renterRes.error) {
      setError(propRes.error?.message || renterRes.error?.message || "Failed to load related records");
    }
    setProperty((propRes.data as PropertyRow | null) ?? null);
    const match = ((renterRes.data ?? []) as RenterRow[]).find((r) => r.user_id === a.data!.renter_id);
    setRenter(match ?? null);
    setCoverPath(covers[a.data.property_id] ?? null);
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, activeMembership?.tenant_id]);

  const createCharge = async (e: FormEvent) => {
    e.preventDefault();
    if (!assignment) return;
    const amount = chargeForm.amount_due ? Number(chargeForm.amount_due) : null;
    const { error: err } = await supabase.rpc("create_rent_charge", {
      p_assignment_id: assignment.id,
      p_period_start: chargeForm.period_start,
      p_period_end: chargeForm.period_end,
      p_due_date: chargeForm.due_date,
      p_amount_due: amount,
    });
    if (err) setError(err.message);
    else {
      setError(null);
      await load();
    }
  };

  const totalPaid = useMemo(() => {
    return payments
      .filter((p) => p.status === "paid")
      .reduce((sum, p) => sum + Number(p.amount || 0), 0);
  }, [payments]);

  if (!assignment) {
    return <div className="text-sm text-muted-foreground">Tenancy not found or unauthorized.</div>;
  }

  const renterName = renterLabel(renter);
  const propName = propertyLabel(property);
  const propAddress = property?.address_line?.trim() || null;
  const currency = assignment.currency;
  const endLabel = endDateLabel(assignment.end_date);

  return (
    <div className="min-w-0 space-y-5 sm:space-y-6">
      <div>
        <Link
          to="/app/landlord/tenancies"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-blue hover:underline"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          Tenancies
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

      {/* Tenancy overview */}
      <section aria-labelledby="tenancy-overview-heading" className={cn(CARD, "overflow-hidden")}>
        <div className="border-b border-border/80 bg-gradient-to-br from-sky-50/80 via-white to-white px-4 py-5 sm:px-6 sm:py-6 dark:from-sky-950/30 dark:via-card dark:to-card">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex min-w-0 items-start gap-4">
              <UserAvatar
                name={renter?.full_name}
                email={renter?.email}
                size="lg"
                className="ring-2 ring-sky-100 dark:ring-sky-500/30"
              />
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Renter
                </p>
                <h2
                  id="tenancy-overview-heading"
                  className="mt-0.5 break-words font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl"
                >
                  {renterName}
                </h2>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Badge tone={statusTone(assignment.status)} className="capitalize">
                    {assignment.status}
                  </Badge>
                  <span className="text-sm text-muted-foreground">
                    {assignment.start_date}
                    {assignment.end_date ? ` → ${assignment.end_date}` : " → present"}
                  </span>
                </div>
                <p className="mt-2 font-mono text-[11px] text-muted-foreground/80">
                  Tenancy {shortId(assignment.id)} · property {shortId(assignment.property_id)}
                </p>
              </div>
            </div>

            <div className="min-w-0 rounded-xl border border-sky-100/90 bg-white/80 p-4 sm:min-w-[280px] dark:border-sky-500/20 dark:bg-card/80">
              <div className="flex items-start gap-3">
                <PropertyCoverImage name={propName} storagePath={coverPath} />
                <div className="min-w-0">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Property
                  </p>
                  <Link
                    to={`/app/landlord/properties/${assignment.property_id}`}
                    className="mt-0.5 block break-words font-display text-base font-semibold text-brand-blue hover:underline"
                  >
                    {propName}
                  </Link>
                  {propAddress && propAddress !== propName && (
                    <p className="mt-1 break-words text-sm text-muted-foreground">{propAddress}</p>
                  )}
                  <p className="mt-2 text-sm text-muted-foreground">
                    Rent {money(assignment.rent_amount, currency)}
                    {assignment.due_day != null ? ` · due day ${assignment.due_day}` : " · due day —"}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Summary cards */}
      <section
        aria-label="Tenancy summary"
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4"
      >
        <SummaryCard
          label="Monthly Rent"
          value={money(assignment.rent_amount, currency)}
          icon={Banknote}
          accent="navy"
        />
        <SummaryCard
          label="Start Date"
          value={assignment.start_date || "—"}
          icon={CalendarDays}
          accent="teal"
        />
        <SummaryCard
          label="End Date"
          value={endLabel}
          icon={CalendarRange}
          accent="orange"
          valueTitle={assignment.end_date ?? "No end date — ongoing"}
        />
        <SummaryCard
          label="Total Paid"
          value={money(totalPaid, currency)}
          icon={CircleDollarSign}
          accent="green"
        />
      </section>

      {/* Rent charges + add form */}
      <div
        className={cn(
          "grid grid-cols-1 gap-5",
          assignment.status === "active" && "lg:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.85fr)]",
        )}
      >
        <section aria-labelledby="rent-charges-heading" className={cn(CARD, "min-w-0 overflow-hidden")}>
          <div className="flex items-start gap-3 border-b border-border/80 px-4 py-3.5 sm:px-5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300">
              <Receipt className="h-4 w-4" aria-hidden />
            </div>
            <div className="min-w-0">
              <h3
                id="rent-charges-heading"
                className="font-display text-sm font-semibold tracking-tight text-foreground sm:text-base"
              >
                Rent Charges
              </h3>
              <p className="mt-0.5 text-xs text-muted-foreground sm:text-sm">
                Period balances and charge status for this tenancy.
              </p>
            </div>
          </div>

          {/* Desktop / tablet table */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[640px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-border/80 bg-muted/30 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3 font-semibold sm:px-5">Period</th>
                  <th className="px-4 py-3 font-semibold sm:px-5">Due</th>
                  <th className="px-4 py-3 font-semibold sm:px-5">Due amt</th>
                  <th className="px-4 py-3 font-semibold sm:px-5">Paid</th>
                  <th className="px-4 py-3 font-semibold sm:px-5">Balance</th>
                  <th className="px-4 py-3 font-semibold sm:px-5">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/80">
                {charges.map((c) => (
                  <tr
                    key={c.id}
                    className="transition-colors hover:bg-muted/40 focus-within:bg-muted/40"
                  >
                    <td className="whitespace-nowrap px-4 py-3.5 text-foreground sm:px-5">
                      {c.period_start} → {c.period_end}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3.5 text-muted-foreground sm:px-5">
                      {c.due_date}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3.5 font-medium tabular-nums sm:px-5">
                      {money(c.amount_due)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3.5 tabular-nums text-muted-foreground sm:px-5">
                      {money(c.amount_paid)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3.5 font-medium tabular-nums sm:px-5">
                      {money(c.balance)}
                    </td>
                    <td className="px-4 py-3.5 sm:px-5">
                      <Badge tone={statusTone(c.status)} className="capitalize">
                        {c.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {charges.length === 0 && (
              <p className="px-4 py-10 text-center text-sm text-muted-foreground sm:px-5">
                No charges yet.
              </p>
            )}
          </div>

          {/* Mobile stacked rows */}
          <ul className="divide-y divide-border/80 md:hidden">
            {charges.length === 0 ? (
              <li className="px-4 py-10 text-center text-sm text-muted-foreground">No charges yet.</li>
            ) : (
              charges.map((c) => (
                <li key={c.id} className="px-4 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">
                        {c.period_start} → {c.period_end}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">Due {c.due_date}</p>
                    </div>
                    <Badge tone={statusTone(c.status)} className="capitalize">
                      {c.status}
                    </Badge>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Due amt</p>
                      <p className="mt-0.5 font-medium tabular-nums">{money(c.amount_due)}</p>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Paid</p>
                      <p className="mt-0.5 tabular-nums text-muted-foreground">{money(c.amount_paid)}</p>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Balance</p>
                      <p className="mt-0.5 font-medium tabular-nums">{money(c.balance)}</p>
                    </div>
                  </div>
                </li>
              ))
            )}
          </ul>
        </section>

        {assignment.status === "active" && (
          <section
            aria-labelledby="add-rent-charge-heading"
            className={cn(CARD, "min-w-0 self-start p-4 sm:p-5")}
          >
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-green/10 text-brand-green">
                <PlusCircle className="h-4 w-4" aria-hidden />
              </div>
              <div className="min-w-0">
                <h3
                  id="add-rent-charge-heading"
                  className="font-display text-sm font-semibold tracking-tight text-foreground sm:text-base"
                >
                  Add Rent Charge
                </h3>
                <p className="mt-0.5 text-xs text-muted-foreground sm:text-sm">
                  Create a new charge period for this tenancy.
                </p>
              </div>
            </div>

            <form onSubmit={createCharge} className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              <div className="min-w-0">
                <Label htmlFor="period_start">Period start</Label>
                <Input
                  id="period_start"
                  type="date"
                  required
                  value={chargeForm.period_start}
                  onChange={(e) => setChargeForm({ ...chargeForm, period_start: e.target.value })}
                  className="mt-1.5"
                />
              </div>
              <div className="min-w-0">
                <Label htmlFor="period_end">Period end</Label>
                <Input
                  id="period_end"
                  type="date"
                  required
                  value={chargeForm.period_end}
                  onChange={(e) => setChargeForm({ ...chargeForm, period_end: e.target.value })}
                  className="mt-1.5"
                />
              </div>
              <div className="min-w-0">
                <Label htmlFor="due_date">Due date</Label>
                <Input
                  id="due_date"
                  type="date"
                  required
                  value={chargeForm.due_date}
                  onChange={(e) => setChargeForm({ ...chargeForm, due_date: e.target.value })}
                  className="mt-1.5"
                />
              </div>
              <div className="min-w-0">
                <Label htmlFor="amount_due">Amount due</Label>
                <Input
                  id="amount_due"
                  type="number"
                  min="0"
                  step="0.01"
                  value={chargeForm.amount_due}
                  onChange={(e) => setChargeForm({ ...chargeForm, amount_due: e.target.value })}
                  className="mt-1.5"
                />
              </div>
              <div className="sm:col-span-2 lg:col-span-1 xl:col-span-2">
                <Button type="submit" className="w-full sm:w-auto">
                  Add rent charge
                </Button>
              </div>
            </form>
          </section>
        )}
      </div>

      {/* Payment history */}
      <section aria-labelledby="payment-history-heading" className={cn(CARD, "min-w-0 overflow-hidden")}>
        <div className="flex items-start gap-3 border-b border-border/80 px-4 py-3.5 sm:px-5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300">
            <Wallet className="h-4 w-4" aria-hidden />
          </div>
          <div className="min-w-0">
            <h3
              id="payment-history-heading"
              className="font-display text-sm font-semibold tracking-tight text-foreground sm:text-base"
            >
              Payment History
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground sm:text-sm">
              Submitted payments and review outcomes for this tenancy.
            </p>
          </div>
        </div>

        {/* Desktop / tablet table */}
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[560px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-border/80 bg-muted/30 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-semibold sm:px-5">Amount</th>
                <th className="px-4 py-3 font-semibold sm:px-5">Method</th>
                <th className="px-4 py-3 font-semibold sm:px-5">Submitted</th>
                <th className="px-4 py-3 font-semibold sm:px-5">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/80">
              {payments.map((p) => (
                <tr
                  key={p.id}
                  className="transition-colors hover:bg-muted/40 focus-within:bg-muted/40"
                >
                  <td className="whitespace-nowrap px-4 py-3.5 font-medium tabular-nums sm:px-5">
                    {money(p.amount, p.currency)}
                  </td>
                  <td className="px-4 py-3.5 capitalize text-muted-foreground sm:px-5">
                    {p.method.replaceAll("_", " ")}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3.5 text-muted-foreground sm:px-5">
                    {new Date(p.submitted_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-3.5 sm:px-5">
                    <Badge tone={statusTone(p.status)} className="capitalize">
                      {p.status}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {payments.length === 0 && (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground sm:px-5">
              No payments yet.
            </p>
          )}
        </div>

        {/* Mobile list */}
        <ul className="divide-y divide-border/80 md:hidden">
          {payments.length === 0 ? (
            <li className="px-4 py-10 text-center text-sm text-muted-foreground">No payments yet.</li>
          ) : (
            payments.map((p) => (
              <li key={p.id} className="flex items-start justify-between gap-3 px-4 py-4 text-sm">
                <div className="min-w-0">
                  <div className="font-medium tabular-nums text-foreground">
                    {money(p.amount, p.currency)}
                  </div>
                  <div className="mt-0.5 capitalize text-muted-foreground">
                    {p.method.replaceAll("_", " ")}
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {new Date(p.submitted_at).toLocaleString()}
                  </div>
                </div>
                <Badge tone={statusTone(p.status)} className="shrink-0 capitalize">
                  {p.status}
                </Badge>
              </li>
            ))
          )}
        </ul>
      </section>
    </div>
  );
}
