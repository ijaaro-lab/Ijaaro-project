import { useEffect, useState } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/lib/supabase";
import { money, statusTone } from "@/lib/format";
import type { UtilityPayment } from "@/types/database";
import { KIND_LABEL, KIND_TENANT_TYPE, type UtilityKind } from "./shared";

export function PaymentsReviewPage({ kind }: { kind: UtilityKind }) {
  const { activeMembership } = useAuth();
  const tenantId = activeMembership?.tenant_id;
  const matchesKind = activeMembership?.tenant.tenant_type === KIND_TENANT_TYPE[kind];
  const isStaff = activeMembership?.role === "utility_admin" || activeMembership?.role === "utility_staff";
  const label = KIND_LABEL[kind];

  const [rows, setRows] = useState<UtilityPayment[]>([]);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    if (!tenantId) return;
    const { data, error: err } = await supabase
      .from("utility_payments")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("submitted_at", { ascending: false });
    if (err) setError(err.message);
    else {
      setError(null);
      setRows(data ?? []);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

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

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl font-bold">{label} payment review</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Only the utility company (not landlords) reviews these submissions. Approval does not prove funds
          were received outside the platform.
        </p>
      </div>

      {!isStaff && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Your role can view payments, but approve/reject requires utility_admin or utility_staff.
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <div className="space-y-3">
        {rows.map((p) => (
          <div key={p.id} className="rounded-xl border border-border bg-card p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="font-display text-lg font-semibold">{money(p.amount, p.currency)}</div>
                <div className="mt-1 text-sm text-muted-foreground">
                  {p.method.replaceAll("_", " ")}
                  {p.reference ? ` · ref ${p.reference}` : ""} · {new Date(p.submitted_at).toLocaleString()}
                </div>
                {p.proof_path && (
                  <div className="mt-1 font-mono text-xs text-muted-foreground">{p.proof_path}</div>
                )}
                {p.rejection_reason && (
                  <div className="mt-2 text-sm text-red-700">Reason: {p.rejection_reason}</div>
                )}
              </div>
              <Badge tone={statusTone(p.status)}>{p.status}</Badge>
            </div>

            {p.status === "pending" && isStaff && (
              <div className="mt-4 flex flex-wrap items-end gap-2 border-t border-border pt-4">
                <div className="min-w-[220px] flex-1">
                  <Input
                    placeholder="Rejection reason (optional)"
                    value={reasons[p.id] ?? ""}
                    onChange={(e) => setReasons({ ...reasons, [p.id]: e.target.value })}
                  />
                </div>
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
            )}
          </div>
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
