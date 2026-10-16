import { useAuth } from "@/auth/AuthProvider";

const copy: Record<string, { title: string; body: string }> = {
  landlord: {
    title: "Landlord workspace",
    body: "Property, renter, and rent modules arrive in Phase 2–3. Your membership and tenant isolation are already enforced.",
  },
  renter: {
    title: "Renter workspace",
    body: "Browse listings and tenancy tools land in Phase 2. You only see data for tenants you belong to.",
  },
  water: {
    title: "Water company workspace",
    body: "Meters, readings, and bills arrive in Phase 3–4. Water Company A cannot access Water Company B.",
  },
  electricity: {
    title: "Electricity company workspace",
    body: "Company ops arrive in Phase 4. Cross-company isolation is enforced at the database.",
  },
};

export function RoleDashboardPage({ kind }: { kind: keyof typeof copy }) {
  const { activeMembership } = useAuth();
  const meta = copy[kind];

  return (
    <div className="rounded-xl border border-border bg-card p-8">
      <h2 className="font-display text-2xl font-bold">{meta.title}</h2>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{meta.body}</p>
      <div className="mt-6 rounded-lg bg-muted px-4 py-3 text-sm">
        Active context:{" "}
        <strong>
          {activeMembership
            ? `${activeMembership.tenant.name} (${activeMembership.role})`
            : "none"}
        </strong>
      </div>
    </div>
  );
}
