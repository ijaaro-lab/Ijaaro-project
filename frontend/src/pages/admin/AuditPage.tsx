import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { AuditLog } from "@/types/database";

export function AuditPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      const { data, error: err } = await supabase
        .from("audit_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      if (err) setError(err.message);
      setLogs(data ?? []);
      setLoading(false);
    })();
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-medium text-brand-blue">Security trail</p>
        <h2 className="mt-1 font-display text-2xl font-bold">Audit history</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Append-only log of privileged actions. Ordinary users cannot insert, update, or
          delete these rows.
        </p>
      </div>

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted text-muted-foreground">
            <tr>
              <th className="px-4 py-3">When</th>
              <th className="px-4 py-3">Action</th>
              <th className="px-4 py-3">Entity</th>
              <th className="px-4 py-3">Actor</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="px-4 py-8 text-muted-foreground" colSpan={4}>
                  Loading…
                </td>
              </tr>
            ) : logs.length === 0 ? (
              <tr>
                <td className="px-4 py-8 text-muted-foreground" colSpan={4}>
                  No audit events yet.
                </td>
              </tr>
            ) : (
              logs.map((log) => (
                <tr key={log.id} className="border-t border-border align-top">
                  <td className="px-4 py-3 whitespace-nowrap text-xs text-muted-foreground">
                    {new Date(log.created_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 font-medium">{log.action}</td>
                  <td className="px-4 py-3">
                    <div>{log.entity_type}</div>
                    <div className="font-mono text-xs text-muted-foreground">
                      {log.entity_id}
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{log.actor_id}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
