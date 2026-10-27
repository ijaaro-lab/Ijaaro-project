import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/supabase";
import { statusTone } from "@/lib/format";
import type { PropertySearchResult, PropertyType, UtilityAccount } from "@/types/database";
import { KIND_LABEL, KIND_TENANT_TYPE, type UtilityKind } from "./shared";

type SelectedProperty = {
  id: string;
  address_line: string;
  name: string | null;
  district: string | null;
  city: string | null;
  owner_id: string;
};

export function CustomersPage({ kind }: { kind: UtilityKind }) {
  const { activeMembership } = useAuth();
  const tenantId = activeMembership?.tenant_id;
  const matchesKind = activeMembership?.tenant.tenant_type === KIND_TENANT_TYPE[kind];
  const isStaff = activeMembership?.role === "utility_admin" || activeMembership?.role === "utility_staff";
  const label = KIND_LABEL[kind];

  const [rows, setRows] = useState<UtilityAccount[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  // Property search / create
  const [propQuery, setPropQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<PropertySearchResult[]>([]);
  const [selectedProperty, setSelectedProperty] = useState<SelectedProperty | null>(null);
  const [createMode, setCreateMode] = useState(false);
  const [createForm, setCreateForm] = useState({
    address_line: "",
    owner_id: "",
    name: "",
    district: "",
    city: "",
    property_type: "other" as PropertyType,
    contact_phone: "",
    contact_email: "",
  });

  const [linkForm, setLinkForm] = useState({
    customer_id: "",
    account_number: "",
    unit_price: "",
    fixed_amount: "",
    meter_number: "",
    effective_from: "",
  });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    if (!tenantId) return;
    setLoading(true);
    const { data, error: err } = await supabase
      .from("utility_accounts")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false });
    if (err) setError(err.message);
    else {
      setError(null);
      setRows(data ?? []);
    }
    setLoading(false);
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  if (!tenantId || !matchesKind) {
    return (
      <div className="rounded-2xl border border-border bg-card p-8 text-sm text-muted-foreground">
        Switch to a {label.toLowerCase()} company membership to continue.
      </div>
    );
  }
  if (!isStaff) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-sm text-muted-foreground">
        Customer management requires utility admin or staff access.
      </div>
    );
  }

  const runSearch = async (e: FormEvent) => {
    e.preventDefault();
    if (propQuery.trim().length < 2) {
      setError("Enter at least 2 characters to search");
      return;
    }
    setSearching(true);
    setError(null);
    const { data, error: err } = await supabase.rpc("search_properties_for_link", {
      p_query: propQuery.trim(),
      p_limit: 20,
    });
    setSearching(false);
    if (err) setError(err.message);
    else setSearchResults(data ?? []);
  };

  const pickProperty = (p: PropertySearchResult) => {
    setSelectedProperty({
      id: p.id,
      address_line: p.address_line,
      name: p.name,
      district: p.district,
      city: p.city,
      owner_id: p.owner_id,
    });
    setCreateMode(false);
    setError(null);
  };

  const createPremises = async (e: FormEvent) => {
    e.preventDefault();
    if (!tenantId) return;
    if (!createForm.address_line.trim() || !createForm.owner_id.trim()) {
      setError("Address and owner user ID are required");
      return;
    }
    setSaving(true);
    setError(null);
    const { data, error: err } = await supabase.rpc("create_utility_premises", {
      p_company_tenant_id: tenantId,
      p_address_line: createForm.address_line.trim(),
      p_owner_id: createForm.owner_id.trim(),
      p_name: createForm.name.trim() || null,
      p_district: createForm.district.trim() || null,
      p_city: createForm.city.trim() || null,
      p_property_type: createForm.property_type,
      p_contact_phone: createForm.contact_phone.trim() || null,
      p_contact_email: createForm.contact_email.trim() || null,
    });
    setSaving(false);
    if (err || !data) {
      setError(err?.message || "Failed to create premises");
      return;
    }
    setSelectedProperty({
      id: data.id,
      address_line: data.address_line,
      name: data.name,
      district: data.district,
      city: data.city,
      owner_id: data.owner_id,
    });
    setCreateMode(false);
    setMsg("Premises created. Now link a utility account below.");
  };

  const linkAccount = async (e: FormEvent) => {
    e.preventDefault();
    if (!tenantId || !selectedProperty) return;
    const unitPrice = Number(linkForm.unit_price || "0");
    if (!linkForm.customer_id.trim() || !linkForm.account_number.trim()) {
      setError("Customer user ID and account number are required");
      return;
    }
    if (Number.isNaN(unitPrice) || unitPrice < 0) {
      setError("Unit price must be a non-negative number");
      return;
    }
    const fixed = linkForm.fixed_amount.trim() === "" ? null : Number(linkForm.fixed_amount);
    if (fixed != null && (Number.isNaN(fixed) || fixed < 0)) {
      setError("Fixed extra charge must be a non-negative number");
      return;
    }

    setSaving(true);
    setError(null);
    const { error: err } = await supabase.rpc("link_utility_account", {
      p_company_tenant_id: tenantId,
      p_property_id: selectedProperty.id,
      p_customer_id: linkForm.customer_id.trim(),
      p_account_number: linkForm.account_number.trim(),
      p_unit_price: unitPrice,
      p_extra_charges_config: fixed != null ? { fixed_amount: fixed } : {},
      p_meter_number: linkForm.meter_number.trim() || null,
      p_effective_from: linkForm.effective_from || null,
      p_ensure_customer_membership: true,
    });
    setSaving(false);
    if (err) {
      setError(err.message);
      return;
    }
    setMsg("Utility account linked.");
    setSelectedProperty(null);
    setSearchResults([]);
    setPropQuery("");
    setLinkForm({ customer_id: "", account_number: "", unit_price: "", fixed_amount: "", meter_number: "", effective_from: "" });
    await load();
  };

  const filtered = rows.filter((a) => a.account_number.toLowerCase().includes(q.trim().toLowerCase()));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl font-bold">{label} customers</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Link premises to utility accounts and manage {label.toLowerCase()} customers.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}
      {msg && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {msg}
        </div>
      )}

      <section className="rounded-xl border border-border bg-card p-5">
        <h3 className="font-semibold">Link a new utility account</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Step 1: find an existing IJAARO property, or register new premises. Step 2: link the utility account.
        </p>

        {!selectedProperty && (
          <div className="mt-4 space-y-4">
            <form onSubmit={runSearch} className="flex flex-wrap items-end gap-2">
              <div className="min-w-[240px] flex-1">
                <Label htmlFor="propq">Search properties (address, name, district, city)</Label>
                <Input
                  id="propq"
                  value={propQuery}
                  onChange={(e) => setPropQuery(e.target.value)}
                  placeholder="e.g. Hodan, Jigjiga Yar…"
                />
              </div>
              <Button type="submit" disabled={searching}>
                {searching ? "Searching…" : "Search"}
              </Button>
              <Button type="button" variant="outline" onClick={() => setCreateMode((v) => !v)}>
                {createMode ? "Cancel new premises" : "No match? Register premises"}
              </Button>
            </form>

            {searchResults.length > 0 && (
              <ul className="divide-y divide-border rounded-lg border border-border">
                {searchResults.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                    <div>
                      <div className="font-medium">{p.name || p.address_line}</div>
                      <div className="text-xs text-muted-foreground">
                        {p.address_line} · {[p.district, p.city].filter(Boolean).join(", ") || "—"} · {p.status}
                      </div>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => pickProperty(p)}>
                      Select
                    </Button>
                  </li>
                ))}
              </ul>
            )}

            {createMode && (
              <form onSubmit={createPremises} className="grid gap-3 rounded-lg border border-border p-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Label htmlFor="caddr">Address *</Label>
                  <Input
                    id="caddr"
                    required
                    value={createForm.address_line}
                    onChange={(e) => setCreateForm({ ...createForm, address_line: e.target.value })}
                  />
                </div>
                <div className="sm:col-span-2">
                  <Label htmlFor="cowner">Owner user ID (UUID) *</Label>
                  <Input
                    id="cowner"
                    required
                    value={createForm.owner_id}
                    onChange={(e) => setCreateForm({ ...createForm, owner_id: e.target.value })}
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Profile email search is restricted by RLS to self-only; ask the owner for their account UUID.
                  </p>
                </div>
                <div>
                  <Label htmlFor="cname">Name</Label>
                  <Input id="cname" value={createForm.name} onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })} />
                </div>
                <div>
                  <Label htmlFor="cdist">District</Label>
                  <Input
                    id="cdist"
                    value={createForm.district}
                    onChange={(e) => setCreateForm({ ...createForm, district: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="ccity">City</Label>
                  <Input id="ccity" value={createForm.city} onChange={(e) => setCreateForm({ ...createForm, city: e.target.value })} />
                </div>
                <div>
                  <Label htmlFor="cphone">Contact phone</Label>
                  <Input
                    id="cphone"
                    value={createForm.contact_phone}
                    onChange={(e) => setCreateForm({ ...createForm, contact_phone: e.target.value })}
                  />
                </div>
                <div className="sm:col-span-2">
                  <Button type="submit" disabled={saving}>
                    {saving ? "Creating…" : "Register premises"}
                  </Button>
                </div>
              </form>
            )}
          </div>
        )}

        {selectedProperty && (
          <form onSubmit={linkAccount} className="mt-4 space-y-4">
            <div className="flex items-center justify-between rounded-lg bg-muted px-4 py-3 text-sm">
              <div>
                <div className="font-medium">{selectedProperty.name || selectedProperty.address_line}</div>
                <div className="text-xs text-muted-foreground">{selectedProperty.address_line}</div>
              </div>
              <Button type="button" size="sm" variant="outline" onClick={() => setSelectedProperty(null)}>
                Change property
              </Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="cust">Customer user ID (UUID) *</Label>
                <Input
                  id="cust"
                  required
                  value={linkForm.customer_id}
                  onChange={(e) => setLinkForm({ ...linkForm, customer_id: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="accno">Account number *</Label>
                <Input
                  id="accno"
                  required
                  value={linkForm.account_number}
                  onChange={(e) => setLinkForm({ ...linkForm, account_number: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="price">Unit price *</Label>
                <Input
                  id="price"
                  type="number"
                  min="0"
                  step="0.0001"
                  required
                  value={linkForm.unit_price}
                  onChange={(e) => setLinkForm({ ...linkForm, unit_price: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="fixed">Extra charge (fixed amount, optional)</Label>
                <Input
                  id="fixed"
                  type="number"
                  min="0"
                  step="0.01"
                  value={linkForm.fixed_amount}
                  onChange={(e) => setLinkForm({ ...linkForm, fixed_amount: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="meter">Initial meter number (optional)</Label>
                <Input
                  id="meter"
                  value={linkForm.meter_number}
                  onChange={(e) => setLinkForm({ ...linkForm, meter_number: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="eff">Effective from</Label>
                <Input
                  id="eff"
                  type="date"
                  value={linkForm.effective_from}
                  onChange={(e) => setLinkForm({ ...linkForm, effective_from: e.target.value })}
                />
              </div>
            </div>
            <Button type="submit" disabled={saving}>
              {saving ? "Linking…" : "Link utility account"}
            </Button>
          </form>
        )}
      </section>

      <Input placeholder="Search by account number…" value={q} onChange={(e) => setQ(e.target.value)} />

      {loading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card px-6 py-12 text-center text-sm text-muted-foreground">
          No customer accounts yet.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-border bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-semibold">Account</th>
                <th className="px-4 py-3 font-semibold">Unit price</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Effective from</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((a) => (
                <tr key={a.id} className="hover:bg-muted/40">
                  <td className="px-4 py-3">
                    <Link to={`/app/${kind}/customers/${a.id}`} className="font-medium hover:underline">
                      {a.account_number}
                    </Link>
                    <div className="text-xs text-muted-foreground">Property {a.property_id.slice(0, 8)}…</div>
                  </td>
                  <td className="px-4 py-3">{Number(a.unit_price).toFixed(4)} / unit</td>
                  <td className="px-4 py-3">
                    <Badge tone={statusTone(a.status)}>{a.status}</Badge>
                  </td>
                  <td className="px-4 py-3">{a.effective_from || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
