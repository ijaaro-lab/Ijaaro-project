import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Bell, CreditCard, Droplets } from "lucide-react";
import { useAuth } from "@/auth/AuthProvider";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/lib/supabase";
import { money } from "@/lib/format";
import { KIND_LABEL, KIND_TENANT_TYPE, type UtilityKind } from "./shared";

type AlertItem = {
  id: string;
  tone: "warning" | "danger" | "info";
  title: string;
  detail: string;
  href: string;
};

/**
 * Operational alerts derived from live billing/payment data.
 * A dedicated notifications inbox is planned for Phase 5 — this page is not a stub.
 */
export function NotificationsPage({ kind }: { kind: UtilityKind }) {
  const { activeMembership } = useAuth();
  const tenantId = activeMembership?.tenant_id;
  const matchesKind = activeMembership?.tenant.tenant_type === KIND_TENANT_TYPE[kind];
  const isStaff =
    activeMembership?.role === "utility_admin" || activeMembership?.role === "utility_staff";
  const label = KIND_LABEL[kind];

  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!tenantId || !matchesKind || !isStaff) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [payRes, overdueRes, readingGap] = await Promise.all([
        supabase
          .from("utility_payments")
          .select("id, amount, currency, submitted_at")
          .eq("tenant_id", tenantId)
          .eq("status", "pending")
          .order("submitted_at", { ascending: false })
          .limit(20),
        supabase
          .from("utility_bills")
          .select("id, balance, due_date, utility_accounts(account_number)")
          .eq("tenant_id", tenantId)
          .eq("status", "overdue")
          .order("due_date", { ascending: true })
          .limit(20),
        supabase
          .from("meters")
          .select("id, meter_number, status")
          .eq("tenant_id", tenantId)
          .eq("status", "active")
          .limit(50),
      ]);
      if (cancelled) return;
      if (payRes.error || overdueRes.error || readingGap.error) {
        setError(
          payRes.error?.message ||
            overdueRes.error?.message ||
            readingGap.error?.message ||
            "Failed to load alerts",
        );
        setLoading(false);
        return;
      }

      const items: AlertItem[] = [];
      for (const p of payRes.data ?? []) {
        items.push({
          id: `pay-${p.id}`,
          tone: "warning",
          title: "Payment awaiting verification",
          detail: `${money(p.amount, p.currency)} submitted ${new Date(p.submitted_at).toLocaleString()}`,
          href: `/app/${kind}/payments`,
        });
      }
      for (const b of overdueRes.data ?? []) {
        const row = b as {
          id: string;
          balance: number;
          due_date: string;
          utility_accounts?:
            | { account_number: string }
            | { account_number: string }[]
            | null;
        };
        const account = Array.isArray(row.utility_accounts)
          ? row.utility_accounts[0]
          : row.utility_accounts;
        const accountNumber = account?.account_number || "Account";
        items.push({
          id: `bill-${row.id}`,
          tone: "danger",
          title: `Overdue bill · ${accountNumber}`,
          detail: `Balance ${money(row.balance)} · due ${row.due_date}`,
          href: `/app/${kind}/bills`,
        });
      }
      if ((readingGap.data ?? []).length > 0 && (payRes.data ?? []).length === 0) {
        items.push({
          id: "ops-hint",
          tone: "info",
          title: "Active meters in service",
          detail: `${readingGap.data?.length ?? 0} active meter(s). Record readings regularly to keep billing current.`,
          href: `/app/${kind}/readings`,
        });
      }
      setAlerts(items);
      setError(null);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [tenantId, matchesKind, isStaff, kind]);

  if (!tenantId || !matchesKind) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-sm text-muted-foreground">
        Switch to a {label.toLowerCase()} company membership to continue.
      </div>
    );
  }
  if (!isStaff) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-sm text-muted-foreground">
        Operational alerts require utility admin or staff access.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-display text-2xl font-bold text-foreground">Notifications</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Live operational alerts for this {label.toLowerCase()} company. In-app push/email inbox
          is planned separately.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-sm text-muted-foreground">Loading alerts…</div>
      ) : alerts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card px-6 py-14 text-center">
          <Bell className="mx-auto h-8 w-8 text-brand-green" />
          <p className="mt-3 text-sm font-medium text-foreground">You&apos;re all caught up</p>
          <p className="mt-1 text-sm text-muted-foreground">
            No pending payments or overdue bills for this company right now.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {alerts.map((a) => {
            const Icon =
              a.tone === "danger" ? AlertTriangle : a.tone === "warning" ? CreditCard : Droplets;
            return (
              <li key={a.id}>
                <Link
                  to={a.href}
                  className="flex items-start gap-3 rounded-xl border border-border bg-card px-4 py-3 transition hover:border-brand-water/40 hover:bg-muted/30"
                >
                  <div
                    className={
                      a.tone === "danger"
                        ? "rounded-md bg-red-100 p-2 text-red-700 dark:bg-red-500/20 dark:text-red-300"
                        : a.tone === "warning"
                          ? "rounded-md bg-amber-100 p-2 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300"
                          : "rounded-md bg-brand-water/15 p-2 text-brand-water"
                    }
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-foreground">{a.title}</p>
                      <Badge
                        tone={
                          a.tone === "danger" ? "danger" : a.tone === "warning" ? "warning" : "info"
                        }
                      >
                        {a.tone}
                      </Badge>
                    </div>
                    <p className="mt-0.5 text-sm text-muted-foreground">{a.detail}</p>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
