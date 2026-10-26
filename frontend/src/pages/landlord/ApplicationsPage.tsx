import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUpDown,
  CheckCircle2,
  ClipboardList,
  Clock3,
  Search,
  Users,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "@/auth/AuthProvider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { statusTone } from "@/lib/format";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import type { LandlordRentalApplicationRow, RentalApplicationStatus } from "@/types/database";

type StatusFilter = RentalApplicationStatus | "all";
type SortKey = "newest" | "oldest";
type StatAccent = "blue" | "green" | "orange" | "purple";

const STATUS_TABS: { id: StatusFilter; label: string }[] = [
  { id: "pending", label: "Pending" },
  { id: "accepted", label: "Accepted" },
  { id: "rejected", label: "Rejected" },
  { id: "all", label: "All" },
];

const STAT_ACCENTS: Record<StatAccent, string> = {
  blue: "bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300",
  green: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300",
  orange: "bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-300",
  purple: "bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300",
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

function emptyCopy(filter: StatusFilter): { title: string; body: string } {
  switch (filter) {
    case "pending":
      return {
        title: "No pending applications",
        body: "New renter requests will appear here when someone applies to rent a property.",
      };
    case "accepted":
      return {
        title: "No accepted applications",
        body: "Accepted applications will appear here once you approve a renter request.",
      };
    case "rejected":
      return {
        title: "No rejected applications",
        body: "Rejected applications will appear here when a request is not approved.",
      };
    default:
      return {
        title: "No applications yet",
        body: "Renter requests for this landlord workspace will appear here when someone applies.",
      };
  }
}

export function ApplicationsPage() {
  const { activeMembership } = useAuth();
  const tenantId = activeMembership?.tenant_id;
  const role = activeMembership?.role ?? null;
  const canReview = role === "landlord_admin";

  const [filter, setFilter] = useState<StatusFilter>("pending");
  const [rows, setRows] = useState<LandlordRentalApplicationRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("newest");
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const reviewInFlight = useRef<string | null>(null);

  const load = async () => {
    if (!tenantId) return;
    setLoading(true);
    setError(null);
    // Load all tenant-scoped applications once so summary counts stay accurate
    // without a second decorative API call; status tabs filter client-side.
    const { data, error: err } = await supabase.rpc("list_landlord_rental_applications", {
      p_status: null,
    });
    setLoading(false);
    if (err) {
      setError(err.message);
      setRows([]);
      return;
    }
    const all = (data as LandlordRentalApplicationRow[] | null) ?? [];
    setRows(all.filter((r) => r.tenant_id === tenantId));
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  const stats = useMemo(() => {
    const pending = rows.filter((r) => r.status === "pending").length;
    const accepted = rows.filter((r) => r.status === "accepted").length;
    const rejected = rows.filter((r) => r.status === "rejected").length;
    return {
      pending,
      accepted,
      rejected,
      all: rows.length,
    };
  }, [rows]);

  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const statusFiltered =
      filter === "all" ? rows : rows.filter((r) => r.status === filter);

    const searched = !q
      ? statusFiltered
      : statusFiltered.filter((r) => {
          const loc = [r.property_district, r.property_city].filter(Boolean).join(" ");
          const haystack = [
            r.applicant_full_name,
            r.applicant_email,
            r.applicant_phone,
            r.requested_username,
            r.property_name,
            loc,
            r.message,
            r.status,
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          return haystack.includes(q);
        });

    const sorted = [...searched].sort((a, b) => {
      const aTime = new Date(a.created_at).getTime();
      const bTime = new Date(b.created_at).getTime();
      return sortKey === "newest" ? bTime - aTime : aTime - bTime;
    });

    return sorted;
  }, [rows, filter, searchQuery, sortKey]);

  const statusPoolEmpty =
    filter === "all"
      ? rows.length === 0
      : rows.filter((r) => r.status === filter).length === 0;

  const emptyBecauseSearch =
    !statusPoolEmpty && filteredRows.length === 0 && searchQuery.trim().length > 0;

  const onReview = async (id: string, decision: "accept" | "reject") => {
    if (!canReview || reviewInFlight.current) return;
    reviewInFlight.current = id;
    setReviewingId(id);
    setError(null);
    setMessage(null);
    const { error: err } = await supabase.rpc("review_rental_application", {
      p_application_id: id,
      p_decision: decision,
    });
    reviewInFlight.current = null;
    setReviewingId(null);
    if (err) {
      setError(err.message);
      return;
    }
    setMessage(
      decision === "accept"
        ? "Application accepted. Renter membership is active — assign a property separately when ready."
        : "Application rejected. The applicant may reapply later.",
    );
    await load();
  };

  if (!tenantId || activeMembership?.tenant.tenant_type !== "landlord") {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-sm text-muted-foreground">
        Switch to a landlord workspace membership to review applications.
      </div>
    );
  }

  const empty = emptyCopy(filter);

  return (
    <div className="space-y-5 sm:space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 max-w-2xl">
          <h2 className="font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Rental applications
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground sm:text-[0.9375rem]">
            Review renter requests for this landlord workspace. Accept activates renter membership
            only; assign properties separately.
          </p>
        </div>

        <div
          role="tablist"
          aria-label="Filter applications by status"
          className="flex w-full shrink-0 gap-1 overflow-x-auto rounded-xl border border-border/80 bg-card p-1 shadow-[0_1px_3px_rgba(11,31,58,0.04)] sm:w-auto dark:shadow-none"
        >
          {STATUS_TABS.map((tab) => {
            const selected = filter === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={selected}
                className={cn(
                  "min-h-9 shrink-0 rounded-lg px-3.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  selected
                    ? "bg-brand-blue text-white shadow-sm"
                    : "text-foreground hover:bg-muted/80",
                )}
                onClick={() => setFilter(tab.id)}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {!canReview && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          Only landlord admins can accept or reject. Staff can view the queue.
        </p>
      )}

      {message && (
        <div
          role="status"
          className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300"
        >
          {message}
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

      <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Pending"
          value={stats.pending}
          hint="Awaiting review"
          icon={Clock3}
          accent="blue"
        />
        <StatCard
          label="Accepted"
          value={stats.accepted}
          hint="Renter memberships activated"
          icon={CheckCircle2}
          accent="green"
        />
        <StatCard
          label="Rejected"
          value={stats.rejected}
          hint="Not approved"
          icon={XCircle}
          accent="orange"
        />
        <StatCard
          label="All applications"
          value={stats.all}
          hint="Total applications"
          icon={Users}
          accent="purple"
        />
      </div>

      <section
        aria-label="Application queue"
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
                  Application queue
                </h3>
                <p className="mt-0.5 text-xs text-muted-foreground sm:text-sm">
                  Renter requests for this landlord workspace.
                </p>
              </div>
            </div>

            <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center lg:w-auto">
              <label className="relative block min-w-0 flex-1 lg:w-72">
                <span className="sr-only">Search applications</span>
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
                <Input
                  placeholder="Search renter, email, or property..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  aria-label="Search renter, email, or property"
                  className="h-10 pl-9"
                  disabled={loading}
                />
              </label>
              <div className="relative sm:w-44">
                <ArrowUpDown
                  className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
                <Select
                  aria-label="Sort applications"
                  value={sortKey}
                  onChange={(e) => setSortKey(e.target.value as SortKey)}
                  className="h-10 pl-9"
                  disabled={loading}
                >
                  <option value="newest">Newest first</option>
                  <option value="oldest">Oldest first</option>
                </Select>
              </div>
            </div>
          </div>
        </div>

        {loading ? (
          <div
            className="px-4 py-14 text-center text-sm text-muted-foreground sm:px-5"
            aria-live="polite"
          >
            Loading applications…
          </div>
        ) : statusPoolEmpty ? (
          <div className="flex flex-col items-center px-6 py-14 text-center sm:py-16">
            <div
              className="flex h-24 w-24 items-center justify-center rounded-full bg-sky-50 dark:bg-sky-500/15"
              aria-hidden
            >
              <ClipboardList className="h-11 w-11 text-brand-blue dark:text-sky-300" strokeWidth={1.5} />
            </div>
            <h4 className="mt-5 font-display text-lg font-bold tracking-tight text-foreground">
              {empty.title}
            </h4>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
              {empty.body}
            </p>
            {filter === "pending" && (
              <Button
                type="button"
                variant="outline"
                className="mt-6 border-brand-blue text-brand-blue hover:bg-brand-blue/10 dark:border-sky-400 dark:text-sky-300 dark:hover:bg-sky-500/15"
                onClick={() => setFilter("accepted")}
              >
                View accepted applications
              </Button>
            )}
          </div>
        ) : emptyBecauseSearch ? (
          <div className="px-6 py-12 text-center">
            <p className="text-sm font-medium text-foreground">No applications match your search</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Try a different renter name, email, or property.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border/80" aria-label="Rental applications">
            {filteredRows.map((r) => {
              const loc = [r.property_district, r.property_city].filter(Boolean).join(", ");
              const busy = reviewingId === r.id;
              return (
                <li
                  key={r.id}
                  className="flex flex-col gap-4 px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-5"
                >
                  <div className="min-w-0 flex-1 space-y-1.5 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-foreground">
                        {r.applicant_full_name || "Applicant"}
                      </span>
                      <Badge tone={statusTone(r.status)} className="capitalize">
                        {r.status}
                      </Badge>
                    </div>
                    <div className="text-foreground">
                      <span className="font-medium">{r.property_name || "Property"}</span>
                      {loc ? (
                        <span className="text-muted-foreground"> · {loc}</span>
                      ) : (
                        <span className="text-muted-foreground"> · Location TBD</span>
                      )}
                    </div>
                    <div className="text-muted-foreground">
                      @{r.requested_username}
                      {r.applicant_email ? ` · ${r.applicant_email}` : ""}
                      {r.applicant_phone ? ` · ${r.applicant_phone}` : ""}
                    </div>
                    {r.message && (
                      <p className="whitespace-pre-wrap text-muted-foreground">{r.message}</p>
                    )}
                    <div className="text-xs text-muted-foreground">
                      Submitted {new Date(r.created_at).toLocaleString()}
                      {r.reviewed_at
                        ? ` · Reviewed ${new Date(r.reviewed_at).toLocaleString()}`
                        : ""}
                    </div>
                  </div>
                  {r.status === "pending" && canReview && (
                    <div className="flex shrink-0 gap-2">
                      <Button
                        type="button"
                        size="sm"
                        disabled={busy || reviewingId != null}
                        onClick={() => void onReview(r.id, "accept")}
                      >
                        Accept
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="border-border text-foreground hover:bg-muted"
                        disabled={busy || reviewingId != null}
                        onClick={() => void onReview(r.id, "reject")}
                      >
                        Reject
                      </Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
