import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/lib/supabase";
import type { Property, PropertyType } from "@/types/database";

const empty = {
  name: "",
  address_line: "",
  district: "",
  city: "",
  property_type: "apartment" as PropertyType,
  description: "",
  rent_amount: "",
  currency: "USD",
  contact_phone: "",
  contact_email: "",
  is_listed: true,
  status: "available" as Property["status"],
};

export function PropertyFormPage() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const { user, activeMembership } = useAuth();
  const [form, setForm] = useState(empty);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(isEdit);

  useEffect(() => {
    if (!id || !activeMembership) return;
    let cancelled = false;
    (async () => {
      const { data, error: err } = await supabase.from("properties").select("*").eq("id", id).maybeSingle();
      if (cancelled) return;
      if (err || !data) {
        setError(err?.message || "Property not found");
        setLoading(false);
        return;
      }
      setForm({
        name: data.name ?? "",
        address_line: data.address_line,
        district: data.district ?? "",
        city: data.city ?? "",
        property_type: data.property_type,
        description: data.description ?? "",
        rent_amount: data.rent_amount != null ? String(data.rent_amount) : "",
        currency: data.currency,
        contact_phone: data.contact_phone ?? "",
        contact_email: data.contact_email ?? "",
        is_listed: data.is_listed,
        status: data.status === "occupied" ? "occupied" : data.status,
      });
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [id, activeMembership]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user || !activeMembership) return;
    if (!form.address_line.trim()) {
      setError("Address is required");
      return;
    }
    const rent = form.rent_amount.trim() === "" ? null : Number(form.rent_amount);
    if (rent != null && (Number.isNaN(rent) || rent < 0)) {
      setError("Rent amount must be a non-negative number");
      return;
    }

    setSaving(true);
    setError(null);

    if (isEdit && id) {
      const payload: Record<string, unknown> = {
        name: form.name.trim() || null,
        address_line: form.address_line.trim(),
        district: form.district.trim() || null,
        city: form.city.trim() || null,
        property_type: form.property_type,
        description: form.description.trim() || null,
        rent_amount: rent,
        currency: form.currency.trim() || "USD",
        contact_phone: form.contact_phone.trim() || null,
        contact_email: form.contact_email.trim() || null,
        is_listed: form.is_listed,
      };
      // Occupancy status is RPC-controlled; allow available/vacant toggles only when not occupied
      if (form.status !== "occupied") {
        payload.status = form.status;
      }
      const { error: err } = await supabase.from("properties").update(payload).eq("id", id);
      setSaving(false);
      if (err) {
        setError(err.message);
        return;
      }
      navigate(`/app/landlord/properties/${id}`);
      return;
    }

    const { data, error: err } = await supabase
      .from("properties")
      .insert({
        tenant_id: activeMembership.tenant_id,
        owner_id: user.id,
        name: form.name.trim() || null,
        address_line: form.address_line.trim(),
        district: form.district.trim() || null,
        city: form.city.trim() || null,
        property_type: form.property_type,
        description: form.description.trim() || null,
        rent_amount: rent,
        currency: form.currency.trim() || "USD",
        contact_phone: form.contact_phone.trim() || null,
        contact_email: form.contact_email.trim() || null,
        is_listed: form.is_listed,
        status: form.status === "occupied" ? "available" : form.status,
        created_source: "landlord",
      })
      .select("id")
      .single();
    setSaving(false);
    if (err || !data) {
      setError(err?.message || "Create failed");
      return;
    }
    navigate(`/app/landlord/properties/${data.id}`);
  };

  if (!activeMembership || activeMembership.tenant.tenant_type !== "landlord") {
    return <div className="text-sm text-muted-foreground">Landlord membership required.</div>;
  }

  if (loading) return <div className="text-sm text-muted-foreground">Loading…</div>;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link to="/app/landlord/properties" className="text-sm text-brand-blue hover:underline">
          ← Properties
        </Link>
        <h2 className="mt-2 font-display text-2xl font-bold">{isEdit ? "Edit property" : "Create property"}</h2>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <form onSubmit={onSubmit} className="space-y-4 rounded-xl border border-border bg-card p-6">
        <div>
          <Label htmlFor="name">Title</Label>
          <Input id="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div>
          <Label htmlFor="address">Address *</Label>
          <Input
            id="address"
            required
            value={form.address_line}
            onChange={(e) => setForm({ ...form, address_line: e.target.value })}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="district">District</Label>
            <Input id="district" value={form.district} onChange={(e) => setForm({ ...form, district: e.target.value })} />
          </div>
          <div>
            <Label htmlFor="city">City</Label>
            <Input id="city" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="type">Type</Label>
            <Select
              id="type"
              value={form.property_type}
              onChange={(e) => setForm({ ...form, property_type: e.target.value as PropertyType })}
            >
              <option value="apartment">Apartment</option>
              <option value="house">House</option>
              <option value="shop">Shop</option>
              <option value="office">Office</option>
              <option value="other">Other</option>
            </Select>
          </div>
          <div>
            <Label htmlFor="status">Availability</Label>
            <Select
              id="status"
              value={form.status}
              disabled={form.status === "occupied"}
              onChange={(e) => setForm({ ...form, status: e.target.value as Property["status"] })}
            >
              <option value="available">Available</option>
              <option value="vacant">Vacant</option>
              {form.status === "occupied" && <option value="occupied">Occupied</option>}
            </Select>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="rent">Rent amount</Label>
            <Input
              id="rent"
              type="number"
              min="0"
              step="0.01"
              value={form.rent_amount}
              onChange={(e) => setForm({ ...form, rent_amount: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="currency">Currency</Label>
            <Input id="currency" value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} />
          </div>
        </div>
        <div>
          <Label htmlFor="description">Description</Label>
          <Textarea
            id="description"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="phone">Contact phone</Label>
            <Input
              id="phone"
              value={form.contact_phone}
              onChange={(e) => setForm({ ...form, contact_phone: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="email">Contact email</Label>
            <Input
              id="email"
              type="email"
              value={form.contact_email}
              onChange={(e) => setForm({ ...form, contact_email: e.target.value })}
            />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.is_listed}
            onChange={(e) => setForm({ ...form, is_listed: e.target.checked })}
          />
          Publish in renter browse listings
        </label>
        <div className="flex gap-2 pt-2">
          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : isEdit ? "Save changes" : "Create property"}
          </Button>
          <Link to={isEdit ? `/app/landlord/properties/${id}` : "/app/landlord/properties"}>
            <Button type="button" variant="outline">
              Cancel
            </Button>
          </Link>
        </div>
      </form>
    </div>
  );
}
