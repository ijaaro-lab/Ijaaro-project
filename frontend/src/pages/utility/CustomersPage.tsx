import { useEffect, useId, useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  Eye,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";
import { useAuth } from "@/auth/AuthProvider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/supabase";
import { money, statusTone } from "@/lib/format";
import type {
  ExtraChargesConfig,
  PropertySearchResult,
  PropertyType,
  UtilityAccount,
} from "@/types/database";
import {
  CredentialsSuccessModal,
  generateTempPassword,
  ModalCloseButton,
  ModalShell,
} from "./DirectoryUi";
import { KIND_LABEL, KIND_TENANT_TYPE, type UtilityKind } from "./shared";

type SelectedProperty = {
  id: string;
  address_line: string;
  name: string | null;
  district: string | null;
  city: string | null;
  owner_id: string;
};

type HouseAccount = UtilityAccount & {
  properties?: {
    id: string;
    name: string | null;
    address_line: string;
    city: string | null;
    district: string | null;
    contact_phone: string | null;
    contact_email: string | null;
  } | null;
};

type CreatedCustomer = {
  name: string;
  email: string;
  phone: string;
  accountNumber: string;
  monthlyFee: string;
  address: string;
  password: string;
};

const emptyWaterForm = {
  address_line: "",
  name: "",
  district: "",
  city: "",
  contact_phone: "",
  email: "",
  account_number: "",
  monthly_amount: "",
  password: "",
};

async function readFunctionError(fnErr: { message: string; context?: Response }) {
  const ctx = fnErr.context;
  if (ctx) {
    try {
      const body = (await ctx.json()) as { error?: string };
      if (body?.error) return body.error;
    } catch {
      /* keep default */
    }
  }
  return fnErr.message;
}

function monthlyFee(account: UtilityAccount): number {
  const cfg = (account.extra_charges_config ?? {}) as ExtraChargesConfig;
  return Number(cfg.fixed_amount ?? 0);
}

export function CustomersPage({ kind }: { kind: UtilityKind }) {
  const { activeMembership, user } = useAuth();
  const tenantId = activeMembership?.tenant_id;
  const matchesKind = activeMembership?.tenant.tenant_type === KIND_TENANT_TYPE[kind];
  const isStaff =
    activeMembership?.role === "utility_admin" || activeMembership?.role === "utility_staff";
  const isAdmin = activeMembership?.role === "utility_admin";
  const label = KIND_LABEL[kind];
  const simplifiedWater = kind === "water";
  const createTitleId = useId();
  const editTitleId = useId();

  const [rows, setRows] = useState<HouseAccount[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [waterForm, setWaterForm] = useState(emptyWaterForm);
  const [saving, setSaving] = useState(false);
  const [createdCustomer, setCreatedCustomer] = useState<CreatedCustomer | null>(null);

  const [editingAccount, setEditingAccount] = useState<HouseAccount | null>(null);
  const [editForm, setEditForm] = useState(emptyWaterForm);
  const [editSaving, setEditSaving] = useState(false);

  // Electricity advanced link flow
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

  const load = async () => {
    if (!tenantId) return;
    setLoading(true);
    const { data, error: err } = await supabase
      .from("utility_accounts")
      .select(
        "*, properties(id, name, address_line, city, district, contact_phone, contact_email)",
      )
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false });
    if (err) setError(err.message);
    else {
      setError(null);
      setRows((data as HouseAccount[]) ?? []);
    }
    setLoading(false);
  };

  const syncData = async () => {
    setSyncing(true);
    await load();
    setSyncing(false);
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((r) => {
      const h = r.properties;
      return [
        r.account_number,
        h?.name,
        h?.address_line,
        h?.district,
        h?.city,
        h?.contact_phone,
        h?.contact_email,
      ]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(needle));
    });
  }, [rows, q]);

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
        Customer management requires utility admin or staff access.
      </div>
    );
  }

  const tenantSearch = activeMembership?.tenant.slug
    ? `?tenant=${encodeURIComponent(activeMembership.tenant.slug)}`
    : "";

  const resetWaterForm = () => {
    setWaterForm(emptyWaterForm);
    setShowForm(false);
  };

  const saveWaterCustomer = async (e: FormEvent) => {
    e.preventDefault();
    if (!tenantId) return;
    const amount = Number(waterForm.monthly_amount || "0");
    const email = waterForm.email.trim().toLowerCase();
    const fullName = waterForm.name.trim();

    if (!fullName) {
      setError("Customer name is required");
      return;
    }
    if (!email || !email.includes("@")) {
      setError("Login email is required to create the customer user.");
      return;
    }
    if (!waterForm.address_line.trim() || !waterForm.account_number.trim()) {
      setError("Address and account number are required");
      return;
    }
    if (Number.isNaN(amount) || amount < 0) {
      setError("Monthly fee must be a non-negative number");
      return;
    }

    const tempPassword = waterForm.password.trim() || generateTempPassword();

    setSaving(true);
    setError(null);
    setMsg(null);

    // Always create a NEW user for this company only (membership = utility_customer).
    // They can sign in only on this company's landing page — not platform login.
    const { data, error: fnErr } = await supabase.functions.invoke(
      "provision-company-customer",
      {
        body: {
          tenant_id: tenantId,
          email,
          full_name: fullName,
          phone: waterForm.contact_phone.trim() || undefined,
          password: tempPassword,
        },
      },
    );
    if (fnErr) {
      setSaving(false);
      setError(await readFunctionError(fnErr));
      return;
    }
    const payload = data as { ok?: boolean; error?: string; created?: boolean } | null;
    if (!payload?.ok || !payload.created) {
      setSaving(false);
      setError(payload?.error ?? "Could not create customer user.");
      return;
    }

    const { error: err } = await supabase.rpc("register_utility_house", {
      p_company_tenant_id: tenantId,
      p_address_line: waterForm.address_line.trim(),
      p_account_number: waterForm.account_number.trim(),
      p_monthly_amount: amount,
      p_name: fullName,
      p_district: waterForm.district.trim() || null,
      p_city: waterForm.city.trim() || null,
      p_contact_phone: waterForm.contact_phone.trim() || null,
      p_contact_email: email,
      p_customer_email: email,
      p_meter_number: null,
      p_property_type: "house",
    });
    setSaving(false);
    if (err) {
      setError(err.message);
      return;
    }

    setCreatedCustomer({
      name: fullName,
      email,
      phone: waterForm.contact_phone.trim() || "—",
      accountNumber: waterForm.account_number.trim(),
      monthlyFee: money(amount),
      address: waterForm.address_line.trim(),
      password: tempPassword,
    });
    resetWaterForm();
    await load();
  };

  const openEditCustomer = (account: HouseAccount) => {
    const h = account.properties;
    setError(null);
    setMsg(null);
    setEditingAccount(account);
    setEditForm({
      name: h?.name || h?.address_line || "",
      email: h?.contact_email || "",
      contact_phone: h?.contact_phone || "",
      address_line: h?.address_line || "",
      account_number: account.account_number,
      monthly_amount:
        account.extra_charges_config?.fixed_amount != null
          ? String(account.extra_charges_config.fixed_amount)
          : "",
      district: h?.district || "",
      city: h?.city || "",
      password: "",
    });
  };

  const closeEditCustomer = () => {
    setEditingAccount(null);
    setEditForm(emptyWaterForm);
    setEditSaving(false);
  };

  const saveEditCustomer = async (e: FormEvent) => {
    e.preventDefault();
    if (!editingAccount) return;
    const amount = Number(editForm.monthly_amount || "0");
    if (Number.isNaN(amount) || amount < 0) {
      setError("Enter a valid monthly fee (0 or more)");
      return;
    }
    if (!editForm.address_line.trim() || !editForm.account_number.trim()) {
      setError("Address and account number are required");
      return;
    }
    setEditSaving(true);
    setError(null);
    setMsg(null);
    const { error: err } = await supabase.rpc("update_utility_customer_by_ops", {
      p_utility_account_id: editingAccount.id,
      p_name: editForm.name.trim() || null,
      p_address_line: editForm.address_line.trim(),
      p_district: editForm.district.trim() || null,
      p_city: editForm.city.trim() || null,
      p_contact_phone: editForm.contact_phone.trim() || null,
      p_contact_email: editForm.email.trim().toLowerCase() || null,
      p_account_number: editForm.account_number.trim(),
      p_monthly_amount: amount,
    });
    setEditSaving(false);
    if (err) {
      setError(err.message);
      return;
    }
    setMsg("Customer information updated.");
    closeEditCustomer();
    await load();
  };

  const deactivateAccount = async (account: HouseAccount) => {
    if (!isAdmin) {
      setError("Only company admin can delete / deactivate customers.");
      return;
    }
    if (
      !window.confirm(
        `Delete (deactivate) account ${account.account_number}? The customer will no longer appear as active.`,
      )
    ) {
      return;
    }
    setError(null);
    setMsg(null);
    const { error: err } = await supabase.rpc("deactivate_utility_account_by_admin", {
      p_utility_account_id: account.id,
    });
    if (err) setError(err.message);
    else {
      setMsg(`Account ${account.account_number} deactivated.`);
      await load();
    }
  };

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
    if (!tenantId || !user) return;
    if (!createForm.address_line.trim()) {
      setError("Address is required");
      return;
    }
    const ownerId = createForm.owner_id.trim() || user.id;
    setSaving(true);
    setError(null);
    const { data, error: err } = await supabase.rpc("create_utility_premises", {
      p_company_tenant_id: tenantId,
      p_address_line: createForm.address_line.trim(),
      p_owner_id: ownerId,
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
    setLinkForm({
      customer_id: "",
      account_number: "",
      unit_price: "",
      fixed_amount: "",
      meter_number: "",
      effective_from: "",
    });
    await load();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-bold text-foreground">
            {simplifiedWater ? "Customers" : `${label} customers`}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {simplifiedWater
              ? "Create and manage customer accounts for your water company."
              : "Manage linked accounts. To add a new house with a monthly fee, use Houses."}
          </p>
        </div>
        {simplifiedWater ? (
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" onClick={() => setShowForm(true)}>
              <UserPlus className="h-4 w-4" />
              Create Customer
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={syncing || loading}
              onClick={() => void syncData()}
            >
              <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
              Sync Data
            </Button>
          </div>
        ) : (
          <Link
            to={`/app/${kind}/connections${tenantSearch}`}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand-navy px-4 text-sm font-semibold text-white hover:bg-brand-navy/90 dark:bg-brand-water dark:text-brand-navy"
          >
            <Plus className="h-4 w-4" />
            Add house
          </Link>
        )}
      </div>

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

      {!simplifiedWater && (
        <section className="rounded-xl border border-border bg-card p-5">
          <h3 className="font-semibold">Link account to an existing house</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Advanced: search a house already on the platform, then attach a customer account. Prefer{" "}
            <Link to={`/app/${kind}/connections${tenantSearch}`} className="font-medium underline">
              Houses → Add house
            </Link>{" "}
            for new {label.toLowerCase()} service points.
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
                  {createMode ? "Cancel" : "Register house here"}
                </Button>
              </form>

              {searchResults.length > 0 && (
                <ul className="divide-y divide-border rounded-lg border border-border">
                  {searchResults.map((p) => (
                    <li
                      key={p.id}
                      className="flex items-center justify-between gap-3 px-4 py-3 text-sm"
                    >
                      <div>
                        <div className="font-medium">{p.name || p.address_line}</div>
                        <div className="text-xs text-muted-foreground">
                          {p.address_line} · {[p.district, p.city].filter(Boolean).join(", ") || "—"}{" "}
                          · {p.status}
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
                <form
                  onSubmit={createPremises}
                  className="grid gap-3 rounded-lg border border-border p-4 sm:grid-cols-2"
                >
                  <div className="sm:col-span-2">
                    <Label htmlFor="caddr">Address *</Label>
                    <Input
                      id="caddr"
                      required
                      value={createForm.address_line}
                      onChange={(e) =>
                        setCreateForm({ ...createForm, address_line: e.target.value })
                      }
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <Label htmlFor="cowner">Owner user ID (optional)</Label>
                    <Input
                      id="cowner"
                      value={createForm.owner_id}
                      onChange={(e) => setCreateForm({ ...createForm, owner_id: e.target.value })}
                      placeholder="Leave empty to use your account"
                    />
                  </div>
                  <div>
                    <Label htmlFor="cname">Name</Label>
                    <Input
                      id="cname"
                      value={createForm.name}
                      onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                    />
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
                    <Input
                      id="ccity"
                      value={createForm.city}
                      onChange={(e) => setCreateForm({ ...createForm, city: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="cphone">Contact phone</Label>
                    <Input
                      id="cphone"
                      value={createForm.contact_phone}
                      onChange={(e) =>
                        setCreateForm({ ...createForm, contact_phone: e.target.value })
                      }
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
                  <div className="font-medium">
                    {selectedProperty.name || selectedProperty.address_line}
                  </div>
                  <div className="text-xs text-muted-foreground">{selectedProperty.address_line}</div>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setSelectedProperty(null)}
                >
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
              </div>
              <Button type="submit" disabled={saving}>
                {saving ? "Linking…" : "Link utility account"}
              </Button>
            </form>
          )}
        </section>
      )}

      {simplifiedWater ? (
        <section className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-brand-water" />
              <div>
                <h3 className="font-semibold text-foreground">Customer Directory</h3>
                <p className="text-xs text-muted-foreground">
                  Customers are managed here — open a row for bills and payments.
                </p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">Total: {filtered.length}</p>
          </div>

          <div className="border-b border-border px-5 py-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Search by name, email, phone, or account…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
          </div>

          {loading ? (
            <div className="px-5 py-10 text-sm text-muted-foreground">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="px-5 py-12 text-center text-sm text-muted-foreground">
              No customers yet. Click Create Customer to add the first account.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-border bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-5 py-3 font-semibold">Customer</th>
                    <th className="px-5 py-3 font-semibold">Email / Phone</th>
                    <th className="px-5 py-3 font-semibold">Account / Fee</th>
                    <th className="px-5 py-3 font-semibold">Status</th>
                    <th className="px-5 py-3 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtered.map((a) => {
                    const h = a.properties;
                    const displayName = h?.name || h?.address_line || a.account_number;
                    return (
                      <tr key={a.id} className="hover:bg-muted/30">
                        <td className="px-5 py-3">
                          <div className="font-medium text-foreground">{displayName}</div>
                          {h?.name && h.address_line && (
                            <div className="text-xs text-muted-foreground">{h.address_line}</div>
                          )}
                        </td>
                        <td className="px-5 py-3">
                          <div className="text-foreground">{h?.contact_email || "—"}</div>
                          <div className="text-xs text-muted-foreground">
                            {h?.contact_phone || "—"}
                          </div>
                        </td>
                        <td className="px-5 py-3 text-muted-foreground">
                          {a.account_number} · {money(monthlyFee(a))}
                        </td>
                        <td className="px-5 py-3">
                          <Badge tone={statusTone(a.status)}>
                            {a.status === "active" ? "approved" : a.status}
                          </Badge>
                        </td>
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2">
                            <Link
                              to={`/app/${kind}/customers/${a.id}${tenantSearch}`}
                              className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                              aria-label="View customer"
                              title="View"
                            >
                              <Eye className="h-4 w-4" />
                            </Link>
                            <button
                              type="button"
                              className="rounded-md p-1 text-sky-500 hover:bg-sky-500/10"
                              aria-label="Edit customer"
                              title="Edit"
                              onClick={() => openEditCustomer(a)}
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            {isAdmin && (
                              <button
                                type="button"
                                className="rounded-md p-1 text-red-500 hover:bg-red-500/10"
                                aria-label="Delete customer"
                                title="Delete (admin only)"
                                onClick={() => void deactivateAccount(a)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            )}
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
      ) : (
        <>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search by account number…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>

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
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtered.map((a) => (
                    <tr key={a.id} className="hover:bg-muted/40">
                      <td className="px-4 py-3">
                        <Link
                          to={`/app/${kind}/customers/${a.id}${tenantSearch}`}
                          className="font-medium hover:underline"
                        >
                          {a.account_number}
                        </Link>
                        {a.properties?.name && (
                          <div className="text-xs text-muted-foreground">{a.properties.name}</div>
                        )}
                      </td>
                      <td className="px-4 py-3">{Number(a.unit_price).toFixed(4)} / unit</td>
                      <td className="px-4 py-3">
                        <Badge tone={statusTone(a.status)}>{a.status}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      <ModalShell
        open={Boolean(editingAccount)}
        onClose={closeEditCustomer}
        labelledBy={editTitleId}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-500/15 text-sky-600 dark:text-sky-300">
              <Pencil className="h-5 w-5" />
            </div>
            <div>
              <h3 id={editTitleId} className="font-display text-lg font-bold text-foreground">
                Edit Customer
              </h3>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Update customer information. Changes are saved in the system.
              </p>
            </div>
          </div>
          <ModalCloseButton onClick={closeEditCustomer} />
        </div>

        <form
          onSubmit={(e) => void saveEditCustomer(e)}
          className="mt-5 max-h-[70vh] space-y-4 overflow-y-auto pr-1"
        >
          <div>
            <Label htmlFor="e-name" className="normal-case tracking-normal">
              Full Name *
            </Label>
            <Input
              id="e-name"
              required
              value={editForm.name}
              onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="e-email" className="normal-case tracking-normal">
              Email
            </Label>
            <Input
              id="e-email"
              type="email"
              value={editForm.email}
              onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
            />
            <p className="mt-1.5 text-xs text-muted-foreground">
              Contact email on the account (login email is not changed here).
            </p>
          </div>
          <div>
            <Label htmlFor="e-phone" className="normal-case tracking-normal">
              Phone
            </Label>
            <Input
              id="e-phone"
              value={editForm.contact_phone}
              onChange={(e) => setEditForm({ ...editForm, contact_phone: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="e-address" className="normal-case tracking-normal">
              Service Address *
            </Label>
            <Input
              id="e-address"
              required
              value={editForm.address_line}
              onChange={(e) => setEditForm({ ...editForm, address_line: e.target.value })}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="e-acc" className="normal-case tracking-normal">
                Account Number *
              </Label>
              <Input
                id="e-acc"
                required
                value={editForm.account_number}
                onChange={(e) => setEditForm({ ...editForm, account_number: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="e-fee" className="normal-case tracking-normal">
                Monthly Fee
              </Label>
              <Input
                id="e-fee"
                type="number"
                min="0"
                step="0.01"
                value={editForm.monthly_amount}
                onChange={(e) => setEditForm({ ...editForm, monthly_amount: e.target.value })}
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="e-district" className="normal-case tracking-normal">
                District
              </Label>
              <Input
                id="e-district"
                value={editForm.district}
                onChange={(e) => setEditForm({ ...editForm, district: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="e-city" className="normal-case tracking-normal">
                City
              </Label>
              <Input
                id="e-city"
                value={editForm.city}
                onChange={(e) => setEditForm({ ...editForm, city: e.target.value })}
              />
            </div>
          </div>
          <div className="flex flex-wrap justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={closeEditCustomer}>
              Cancel
            </Button>
            <Button type="submit" variant="secondary" disabled={editSaving}>
              {editSaving ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </form>
      </ModalShell>

      <ModalShell open={showForm} onClose={resetWaterForm} labelledBy={createTitleId}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-green/15 text-brand-green">
              <UserPlus className="h-5 w-5" />
            </div>
            <div>
              <h3 id={createTitleId} className="font-display text-lg font-bold text-foreground">
                Create Customer
              </h3>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Creates a customer user for this company only. They sign in on this company’s
                landing page — not the platform login.
              </p>
            </div>
          </div>
          <ModalCloseButton onClick={resetWaterForm} />
        </div>

        <form
          onSubmit={(e) => void saveWaterCustomer(e)}
          className="mt-5 max-h-[70vh] space-y-4 overflow-y-auto pr-1"
        >
          <div>
            <Label htmlFor="w-name" className="normal-case tracking-normal">
              Full Name *
            </Label>
            <Input
              id="w-name"
              required
              value={waterForm.name}
              onChange={(e) => setWaterForm({ ...waterForm, name: e.target.value })}
              placeholder="Customer full name"
            />
          </div>
          <div>
            <Label htmlFor="w-email" className="normal-case tracking-normal">
              Email *
            </Label>
            <Input
              id="w-email"
              type="email"
              required
              value={waterForm.email}
              onChange={(e) => setWaterForm({ ...waterForm, email: e.target.value })}
              placeholder="customer@email.com"
            />
            <p className="mt-1.5 text-xs text-muted-foreground">
              Login email for this company only. Must be a new email (not already registered).
            </p>
          </div>
          <div>
            <Label htmlFor="w-phone" className="normal-case tracking-normal">
              Phone (Optional)
            </Label>
            <Input
              id="w-phone"
              value={waterForm.contact_phone}
              onChange={(e) => setWaterForm({ ...waterForm, contact_phone: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="w-address" className="normal-case tracking-normal">
              Service Address *
            </Label>
            <Input
              id="w-address"
              required
              value={waterForm.address_line}
              onChange={(e) => setWaterForm({ ...waterForm, address_line: e.target.value })}
              placeholder="Street / neighborhood"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="w-acc" className="normal-case tracking-normal">
                Account Number *
              </Label>
              <Input
                id="w-acc"
                required
                value={waterForm.account_number}
                onChange={(e) =>
                  setWaterForm({ ...waterForm, account_number: e.target.value })
                }
              />
            </div>
            <div>
              <Label htmlFor="w-fee" className="normal-case tracking-normal">
                Monthly Fee
              </Label>
              <Input
                id="w-fee"
                type="number"
                min="0"
                step="0.01"
                value={waterForm.monthly_amount}
                onChange={(e) =>
                  setWaterForm({ ...waterForm, monthly_amount: e.target.value })
                }
                placeholder="0.00"
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="w-district" className="normal-case tracking-normal">
                District
              </Label>
              <Input
                id="w-district"
                value={waterForm.district}
                onChange={(e) => setWaterForm({ ...waterForm, district: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="w-city" className="normal-case tracking-normal">
                City
              </Label>
              <Input
                id="w-city"
                value={waterForm.city}
                onChange={(e) => setWaterForm({ ...waterForm, city: e.target.value })}
              />
            </div>
          </div>
          <div>
            <Label htmlFor="w-password" className="normal-case tracking-normal">
              Temporary Password (Optional)
            </Label>
            <Input
              id="w-password"
              type="text"
              autoComplete="new-password"
              value={waterForm.password}
              onChange={(e) => setWaterForm({ ...waterForm, password: e.target.value })}
              placeholder="Auto-generated if left blank"
            />
          </div>
          <div className="flex flex-wrap justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={resetWaterForm}>
              Cancel
            </Button>
            <Button type="submit" variant="secondary" disabled={saving}>
              {saving ? "Creating…" : "Create Customer"}
            </Button>
          </div>
        </form>
      </ModalShell>

      <CredentialsSuccessModal
        open={Boolean(createdCustomer)}
        onClose={() => setCreatedCustomer(null)}
        title="Customer Created Successfully"
        subtitle="Share these credentials with the customer. They sign in only on this company’s landing page."
        fields={
          createdCustomer
            ? [
                { label: "Name", value: createdCustomer.name, copyable: false },
                { label: "Email", value: createdCustomer.email },
                { label: "Phone", value: createdCustomer.phone },
                {
                  label: "Account Number",
                  value: createdCustomer.accountNumber,
                  mono: true,
                },
                { label: "Monthly Fee", value: createdCustomer.monthlyFee, copyable: false },
                { label: "Address", value: createdCustomer.address, copyable: false },
                {
                  label: "Temporary Password",
                  value: createdCustomer.password,
                  mono: true,
                },
              ]
            : []
        }
      />
    </div>
  );
}
