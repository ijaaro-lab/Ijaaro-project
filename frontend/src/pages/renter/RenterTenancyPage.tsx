import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Calendar,
  CreditCard,
  DollarSign,
  FileText,
  Flag,
  Home,
  MapPin,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "@/auth/AuthProvider";
import { PropertyCoverImage } from "@/components/listings/PropertyCoverImage";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { money, statusTone } from "@/lib/format";
import {
  fetchCoverPathsForProperties,
  formatPropertyTypeLabel,
} from "@/lib/propertyPhotos";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import type {
  PaymentMethod,
  Property,
  RentCharge,
  RentPayment,
  RentalAssignment,
} from "@/types/database";

type StatAccent = "navy" | "green" | "warning";

const STAT_ACCENTS: Record<StatAccent, string> = {
  navy: "bg-brand-blue/10 text-brand-blue dark:bg-brand-blue/20 dark:text-brand-water",
  green: "bg-brand-green/10 text-brand-green dark:bg-brand-green/20 dark:text-brand-green",
  warning: "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300",
};

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

function formatSubmittedDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatStatusLabel(status: string): string {
  if (!status) return status;
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function assignmentStatusLabel(status: RentalAssignment["status"]): string {
  switch (status) {
    case "active":
      return "Active";
    case "invited":
      return "Pending";
    case "completed":
      return "Ended";
    case "cancelled":
      return "Cancelled";
    default:
      return formatStatusLabel(status);
  }
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

function SummaryCard({
  label,
  value,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string;
  icon: LucideIcon;
  accent: StatAccent;
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
  action,
  children,
}: {
  title: string;
  subtitle?: string;
  icon: LucideIcon;
  iconAccent: StatAccent;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-[0_2px_8px_rgba(11,31,58,0.05)] dark:shadow-none">
      <div className="flex items-start justify-between gap-3 border-b border-border/80 px-4 py-3.5 sm:px-5">
        <div className="flex min-w-0 items-start gap-3">
          <div className={cn("mt-0.5 shrink-0 rounded-xl p-2", STAT_ACCENTS[iconAccent])}>
            <Icon className="h-4 w-4" aria-hidden />
          </div>
          <div className="min-w-0">
            <h3 className="font-display text-sm font-semibold tracking-tight text-foreground sm:text-base">
              {title}
            </h3>
            {subtitle && (
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground sm:text-sm">
                {subtitle}
              </p>
            )}
          </div>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function MetaItem({
  icon: Icon,
  label,
  value,
  accent = "navy",
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  accent?: StatAccent;
}) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        <span className={cn("inline-flex rounded-md p-1", STAT_ACCENTS[accent])}>
          <Icon className="h-3 w-3" aria-hidden />
        </span>
        {label}
      </div>
      <div className="mt-1 truncate text-sm font-semibold text-foreground">{value}</div>
    </div>
  );
}

export function RenterTenancyPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const [assignment, setAssignment] = useState<RentalAssignment | null>(null);
  const [property, setProperty] = useState<Property | null>(null);
  const [charges, setCharges] = useState<RentCharge[]>([]);
  const [payments, setPayments] = useState<RentPayment[]>([]);
  const [coverPath, setCoverPath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id || !user) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error: err } = await supabase
        .from("rental_assignments")
        .select("*")
        .eq("id", id)
        .eq("renter_id", user.id)
        .maybeSingle();
      if (cancelled) return;
      if (err || !data) {
        setError(err?.message || "Tenancy not found");
        setAssignment(null);
        setProperty(null);
        setCharges([]);
        setPayments([]);
        setCoverPath(null);
        setLoading(false);
        return;
      }

      setAssignment(data);
      setError(null);

      const [p, c, pay] = await Promise.all([
        supabase.from("properties").select("*").eq("id", data.property_id).maybeSingle(),
        supabase
          .from("rent_charges")
          .select("*")
          .eq("assignment_id", data.id)
          .order("due_date"),
        supabase
          .from("rent_payments")
          .select("*")
          .eq("assignment_id", data.id)
          .eq("payer_id", user.id)
          .order("submitted_at", { ascending: false }),
      ]);
      if (cancelled) return;

      if (p.error || c.error || pay.error) {
        setError(
          p.error?.message ||
            c.error?.message ||
            pay.error?.message ||
            "Failed to load tenancy details",
        );
      }

      setProperty(p.data ?? null);
      setCharges(c.data ?? []);
      setPayments(pay.data ?? []);
      setLoading(false);

      const covers = await fetchCoverPathsForProperties(data.tenant_id, [data.property_id]);
      if (!cancelled) setCoverPath(covers[data.property_id] ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [id, user]);

  const currency = assignment?.currency ?? "USD";

  const outstandingBalance = useMemo(() => {
    return charges.reduce((sum, c) => {
      if (c.status === "cancelled") return sum;
      return sum + Number(c.balance || 0);
    }, 0);
  }, [charges]);

  const nextDueDate = useMemo(() => {
    const open = charges
      .filter((c) => c.status !== "paid" && c.status !== "cancelled" && Number(c.balance) > 0)
      .slice()
      .sort((a, b) => a.due_date.localeCompare(b.due_date));
    return open[0]?.due_date ?? null;
  }, [charges]);

  if (loading) {
    return (
      <div
        className="rounded-2xl border border-dashed border-border bg-card/60 px-4 py-10 text-center text-sm text-muted-foreground"
        aria-live="polite"
      >
        Loading tenancy…
      </div>
    );
  }

  if (error && !assignment) {
    return (
      <div className="space-y-4">
        <Link
          to="/app/renter"
          className="inline-flex items-center gap-1.5 rounded-md text-sm font-medium text-brand-blue hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          Back to Renter home
        </Link>
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300"
        >
          {error}
        </div>
      </div>
    );
  }

  if (!assignment) {
    return (
      <div className="space-y-4">
        <Link
          to="/app/renter"
          className="inline-flex items-center gap-1.5 rounded-md text-sm font-medium text-brand-blue hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          Back to Renter home
        </Link>
        <div className="rounded-2xl border border-border bg-card px-4 py-8 text-sm text-muted-foreground">
          Tenancy not found.
        </div>
      </div>
    );
  }

  const title = property?.name?.trim() || property?.address_line || "Property";
  const location =
    property?.district?.trim() ||
    property?.city?.trim() ||
    property?.address_line?.trim() ||
    null;
  const propertyType = property?.property_type
    ? formatPropertyTypeLabel(property.property_type)
    : null;
  const paymentsHref = `/app/renter/payments?assignment=${encodeURIComponent(assignment.id)}`;

  return (
    <div className="min-w-0 space-y-5 sm:space-y-6">
      <div>
        <Link
          to="/app/renter"
          className="inline-flex items-center gap-1.5 rounded-md text-sm font-medium text-brand-blue hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          Back to Renter home
        </Link>
        <h2 className="mt-2 font-display text-2xl font-bold tracking-tight text-foreground">
          My tenancy
        </h2>
        <div className="mt-2">
          <Badge tone={statusTone(assignment.status)} className="capitalize">
            {assignmentStatusLabel(assignment.status)}
          </Badge>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300"
        >
          {error}
        </div>
      )}

      <section className="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-[0_2px_8px_rgba(11,31,58,0.05)] dark:shadow-none">
        <div className="flex flex-col gap-5 p-4 sm:p-5 lg:flex-row lg:items-stretch lg:gap-6">
          <PropertyCoverImage
            storagePath={coverPath}
            alt={`${title} cover photo`}
            className="h-44 w-full shrink-0 rounded-xl sm:h-48 lg:h-auto lg:min-h-[11rem] lg:w-52 xl:w-60"
            imgClassName="h-full w-full object-cover"
          />

          <div className="min-w-0 flex-1">
            <h3 className="font-display text-lg font-bold tracking-tight text-foreground sm:text-xl">
              {title}
            </h3>
            {location && (
              <p className="mt-1.5 flex items-start gap-1.5 text-sm text-muted-foreground">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-brand-blue" aria-hidden />
                <span>{location}</span>
              </p>
            )}

            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
              {propertyType && (
                <MetaItem icon={Home} label="Property type" value={propertyType} accent="navy" />
              )}
              <MetaItem
                icon={CreditCard}
                label="Rent amount"
                value={`${money(assignment.rent_amount, currency)} / month`}
                accent="warning"
              />
              <MetaItem
                icon={Calendar}
                label="Start date"
                value={formatDateLabel(assignment.start_date)}
                accent="navy"
              />
              <MetaItem
                icon={Flag}
                label="Status"
                value={assignmentStatusLabel(assignment.status)}
                accent="green"
              />
            </div>

            <p className="mt-3 text-sm text-muted-foreground">
              End date:{" "}
              <span className="font-medium text-foreground">
                {assignment.end_date ? formatDateLabel(assignment.end_date) : "Ongoing"}
              </span>
            </p>
          </div>

          <div className="flex w-full shrink-0 flex-col justify-center gap-2 lg:w-52 xl:w-56">
            <Link to={paymentsHref} className="w-full">
              <Button className="w-full min-h-10 gap-1.5">
                <CreditCard className="h-4 w-4" aria-hidden />
                Submit a rent payment
              </Button>
            </Link>
            <p className="text-center text-xs leading-relaxed text-muted-foreground lg:text-left">
              Make a payment for your current rent charges.
            </p>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-3">
        <SummaryCard
          label="Monthly rent"
          value={money(assignment.rent_amount, currency)}
          icon={CreditCard}
          accent="navy"
        />
        <SummaryCard
          label="Next due date"
          value={nextDueDate ? formatDateLabel(nextDueDate) : "—"}
          icon={Calendar}
          accent="warning"
        />
        <SummaryCard
          label="Outstanding balance"
          value={money(outstandingBalance, currency)}
          icon={DollarSign}
          accent="green"
        />
      </div>

      <Panel
        title="Rent schedule"
        subtitle="Your upcoming and past rent periods."
        icon={Calendar}
        iconAccent="navy"
      >
        {charges.length === 0 ? (
          <div className="px-4 py-12 text-center sm:px-5">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-brand-blue/10 text-brand-blue dark:bg-brand-blue/20 dark:text-brand-water">
              <Calendar className="h-6 w-6" aria-hidden />
            </div>
            <p className="text-sm font-semibold text-foreground">No rent charges yet</p>
            <p className="mt-1.5 text-sm text-muted-foreground">
              When rent periods are issued for this tenancy, they will appear here.
            </p>
          </div>
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[720px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-border/80 bg-muted/30 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-3 font-semibold sm:px-5">Period</th>
                    <th className="px-4 py-3 font-semibold sm:px-5">Due date</th>
                    <th className="px-4 py-3 font-semibold sm:px-5">Amount</th>
                    <th className="px-4 py-3 font-semibold sm:px-5">Paid</th>
                    <th className="px-4 py-3 font-semibold sm:px-5">Balance</th>
                    <th className="px-4 py-3 font-semibold sm:px-5">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/80">
                  {charges.map((c) => (
                    <tr key={c.id} className="transition-colors hover:bg-muted/40">
                      <td className="whitespace-nowrap px-4 py-3.5 text-foreground sm:px-5">
                        {formatDateLabel(c.period_start)} → {formatDateLabel(c.period_end)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3.5 text-muted-foreground sm:px-5">
                        {formatDateLabel(c.due_date)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3.5 font-medium tabular-nums sm:px-5">
                        {money(c.amount_due, currency)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3.5 tabular-nums text-muted-foreground sm:px-5">
                        {money(c.amount_paid, currency)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3.5 font-medium tabular-nums sm:px-5">
                        {money(c.balance, currency)}
                      </td>
                      <td className="px-4 py-3.5 sm:px-5">
                        <Badge tone={statusTone(c.status)} className="capitalize">
                          {formatStatusLabel(c.status)}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ul className="divide-y divide-border/80 md:hidden">
              {charges.map((c) => (
                <li key={c.id} className="px-4 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">
                        {formatDateLabel(c.period_start)} → {formatDateLabel(c.period_end)}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Due {formatDateLabel(c.due_date)}
                      </p>
                    </div>
                    <Badge tone={statusTone(c.status)} className="capitalize">
                      {formatStatusLabel(c.status)}
                    </Badge>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                        Amount
                      </p>
                      <p className="mt-0.5 font-medium tabular-nums">
                        {money(c.amount_due, currency)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                        Paid
                      </p>
                      <p className="mt-0.5 tabular-nums text-muted-foreground">
                        {money(c.amount_paid, currency)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                        Balance
                      </p>
                      <p className="mt-0.5 font-medium tabular-nums">
                        {money(c.balance, currency)}
                      </p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </Panel>

      <Panel
        title="Payment history"
        subtitle="Your submitted payments for this tenancy."
        icon={FileText}
        iconAccent="green"
        action={
          <Link
            to={paymentsHref}
            className="shrink-0 rounded-md text-sm font-medium text-brand-blue hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            View payments →
          </Link>
        }
      >
        {payments.length === 0 ? (
          <div className="px-4 py-12 text-center sm:px-5">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-brand-green/10 text-brand-green dark:bg-brand-green/20">
              <FileText className="h-6 w-6" aria-hidden />
            </div>
            <p className="text-sm font-semibold text-foreground">No payments yet</p>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Payments you submit for this tenancy will show up here.
            </p>
            <Link to={paymentsHref} className="mt-4 inline-flex">
              <Button size="sm" variant="outline" className="gap-1.5">
                <CreditCard className="h-4 w-4" aria-hidden />
                Submit a rent payment
              </Button>
            </Link>
          </div>
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[640px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-border/80 bg-muted/30 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-3 font-semibold sm:px-5">Date</th>
                    <th className="px-4 py-3 font-semibold sm:px-5">Amount</th>
                    <th className="px-4 py-3 font-semibold sm:px-5">Method</th>
                    <th className="px-4 py-3 font-semibold sm:px-5">Reference</th>
                    <th className="px-4 py-3 font-semibold sm:px-5">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/80">
                  {payments.map((p) => (
                    <tr key={p.id} className="transition-colors hover:bg-muted/40">
                      <td className="whitespace-nowrap px-4 py-3.5 text-foreground sm:px-5">
                        {formatSubmittedDate(p.submitted_at)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3.5 font-medium tabular-nums sm:px-5">
                        {money(p.amount, p.currency || currency)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3.5 text-muted-foreground sm:px-5">
                        {paymentMethodLabel(p.method)}
                      </td>
                      <td className="max-w-[12rem] truncate px-4 py-3.5 text-muted-foreground sm:px-5">
                        {p.reference?.trim() || "—"}
                      </td>
                      <td className="px-4 py-3.5 sm:px-5">
                        <Badge tone={statusTone(p.status)} className="capitalize">
                          {formatStatusLabel(p.status)}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ul className="divide-y divide-border/80 md:hidden">
              {payments.map((p) => (
                <li key={p.id} className="px-4 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium tabular-nums text-foreground">
                        {money(p.amount, p.currency || currency)}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {formatSubmittedDate(p.submitted_at)} · {paymentMethodLabel(p.method)}
                      </p>
                      {p.reference?.trim() && (
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          Ref {p.reference.trim()}
                        </p>
                      )}
                    </div>
                    <Badge tone={statusTone(p.status)} className="capitalize">
                      {formatStatusLabel(p.status)}
                    </Badge>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </Panel>
    </div>
  );
}
