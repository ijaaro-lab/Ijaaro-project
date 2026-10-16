import { useEffect, useState } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/lib/supabase";
import { money, statusTone } from "@/lib/format";
import type { RentPayment } from "@/types/database";

export function PaymentsReviewPage() {
  const { activeMembership } = useAuth();
  const [rows, setRows] = useState<RentPayment[]>([]);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    if (!activeMembership?.tenant_id) return;
    const { data, error: err } = await supabase
      .from("rent_payments")
      .select("*")
      .eq("tenant_id", activeMembership.tenant_id)
      .order("submitted_at", { ascending: false });
    if (err) setError(err.message);
    else {
      setError(null);
      setRows(data ?? []);
    }
  };

  useEffect(() => {
    void load();
  }, [activeMembership?.tenant_id]);

  const review = async (paymentId: string, decision: "approve" | "reject") => {
    setBusyId(paymentId);
    setError(null);
    const { error: err } = await supabase.rpc("review_rent_payment", {
      p_payment_id: paymentId,
      p_decision: decision,
      p_rejection_reason: decision === "reject" ? reasons[paymentId] || null : null,
    });
    setBusyId(null);
    if (err) setError(err.message);
    else await load();
  };

  const canApprove =
    activeMembership?.role === "landlord_admin" ||
    (activeMembership?.role === "landlord_staff" &&
      Boolean(activeMembership.permissions?.approve_rent));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl font-bold">Rent payment review</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Manual submissions stay pending until an authorized landlord reviewer acts. Approval does not
          prove funds were received outside the platform.
        </p>
      </div>

      {!canApprove && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Your role can view payments, but approve/reject requires landlord_admin or staff with
          approve_rent permission.
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
                  {p.reference ? ` · ref ${p.reference}` : ""} ·{" "}
                  {new Date(p.submitted_at).toLocaleString()}
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

            {p.status === "pending" && canApprove && (
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
            No rent payments yet.
          </div>
        )}
      </div>
    </div>
  );
}
