import {
  useEffect,
  useId,
  useRef,
  useState,
  type DragEvent,
  type FormEvent,
  type SelectHTMLAttributes,
} from "react";
import { ChevronDown, ImagePlus, Lightbulb, X } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  createPropertyPhotoSignedUrl,
  PROPERTY_PHOTO_SIGNED_URL_SECONDS,
} from "@/lib/propertyPhotos";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import type { Property, PropertyPhoto, PropertyType } from "@/types/database";

const empty = {
  name: "",
  address_line: "",
  district: "",
  city: "",
  neighborhood: "",
  bedrooms: "",
  kitchens: "",
  bathrooms: "",
  property_type: "apartment" as PropertyType,
  description: "",
  rent_amount: "",
  currency: "USD",
  contact_phone: "",
  contact_email: "",
  is_listed: true,
  status: "available" as Property["status"],
};

/** Mogadishu districts for the Create/Edit Property form. Spelling matches project usage (e.g. Daarusalam). */
const MOGADISHU_DISTRICTS = [
  "Abdiaziz",
  "Bondhere",
  "Daynile",
  "Dharkenley",
  "Hamar Jajab",
  "Hamar Weyne",
  "Hodan",
  "Howlwadaag",
  "Heliwaa",
  "Karaan",
  "Kaxda",
  "Shangani",
  "Shibis",
  "Waberi",
  "Wadajir",
  "Wardhiigley",
  "Yaaqshiid",
  "Garasbaaley",
  "Gubadley",
  "Daarusalam",
] as const;

const ROOM_COUNT_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

/** Keep an existing saved value selectable when it is not in the fixed option list. */
function withCurrentOption(options: readonly string[], current: string): string[] {
  if (current && !options.includes(current)) {
    return [current, ...options];
  }
  return [...options];
}

function withCurrentRoomOption(current: string): string[] {
  const base = ROOM_COUNT_OPTIONS.map(String);
  if (current && !base.includes(current)) {
    return [current, ...base];
  }
  return base;
}

/** Create Property selects: consistent height, muted placeholder, custom chevron, blue focus ring. */
function FormSelect({
  className,
  value,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  const isPlaceholder = value === "" || value == null;
  return (
    <div className="relative">
      <Select
        value={value}
        className={cn(
          "appearance-none pe-10 transition-colors",
          "border-border hover:border-brand-blue/40",
          "focus-visible:border-brand-blue focus-visible:ring-2 focus-visible:ring-ring",
          isPlaceholder ? "text-muted-foreground" : "text-foreground",
          className,
        )}
        {...props}
      >
        {children}
      </Select>
      <ChevronDown
        className="pointer-events-none absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
    </div>
  );
}

/** Empty → null; otherwise a non-negative whole number. */
function parseOptionalNonNegInt(
  raw: string,
  label: string,
): { value: number | null; error: string | null } {
  const trimmed = raw.trim();
  if (trimmed === "") return { value: null, error: null };
  const n = Number(trimmed);
  if (!Number.isInteger(n) || n < 0) {
    return {
      value: null,
      error: `${label} must be a whole number that is zero or greater`,
    };
  }
  return { value: n, error: null };
}

const ACCEPTED_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

type PendingPhoto = {
  id: string;
  file: File;
  previewUrl: string;
};

function validatePhotoFile(file: File): string | null {
  if (!(ACCEPTED_PHOTO_TYPES as readonly string[]).includes(file.type)) {
    return "Only JPEG, PNG, WebP, or GIF images are allowed";
  }
  if (file.size > MAX_PHOTO_BYTES) {
    return "Image must be 5MB or smaller";
  }
  return null;
}

async function uploadPropertyPhoto(params: {
  file: File;
  tenantId: string;
  propertyId: string;
  sortOrder: number;
}): Promise<string | null> {
  const ext = params.file.name.split(".").pop() || "jpg";
  const path = `${params.tenantId}/${params.propertyId}/${crypto.randomUUID()}.${ext}`;
  const { error: upErr } = await supabase.storage.from("property-photos").upload(path, params.file, {
    contentType: params.file.type,
    upsert: false,
  });
  if (upErr) return upErr.message;

  const { error: rowErr } = await supabase.from("property_photos").insert({
    property_id: params.propertyId,
    tenant_id: params.tenantId,
    storage_path: path,
    sort_order: params.sortOrder,
  });
  return rowErr?.message ?? null;
}

function ExistingPhotoThumb({
  photo,
  alt,
  onRemove,
}: {
  photo: PropertyPhoto;
  alt: string;
  onRemove?: () => void;
}) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const signed = await createPropertyPhotoSignedUrl(
        photo.storage_path,
        PROPERTY_PHOTO_SIGNED_URL_SECONDS,
      );
      if (!cancelled) setUrl(signed);
    })();
    return () => {
      cancelled = true;
    };
  }, [photo.storage_path]);

  return (
    <div className="group relative h-20 w-20 overflow-hidden rounded-lg border border-border bg-muted">
      {url ? (
        <img src={url} alt={alt} className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-[10px] text-muted-foreground">
          …
        </div>
      )}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="absolute right-1 top-1 rounded-full bg-black/60 p-0.5 text-white opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`Remove ${alt}`}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

export function PropertyFormPage() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const { user, activeMembership } = useAuth();
  const fileInputId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState(empty);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(isEdit);
  /** Edit mode: only true after own-tenant property loaded. Create mode: always true. */
  const [editAllowed, setEditAllowed] = useState(!isEdit);
  const [pendingPhotos, setPendingPhotos] = useState<PendingPhoto[]>([]);
  const pendingPhotosRef = useRef<PendingPhoto[]>([]);
  const [existingPhotos, setExistingPhotos] = useState<PropertyPhoto[]>([]);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const isLandlordAdmin = activeMembership?.role === "landlord_admin";

  useEffect(() => {
    if (!id || !activeMembership) return;
    let cancelled = false;
    setLoading(true);
    setEditAllowed(false);
    setError(null);
    setForm(empty);
    setExistingPhotos([]);
    (async () => {
      const { data, error: err } = await supabase.from("properties").select("*").eq("id", id).maybeSingle();
      if (cancelled) return;
      if (err || !data) {
        setError(err?.message || "Property not found");
        setEditAllowed(false);
        setLoading(false);
        return;
      }
      if (data.tenant_id !== activeMembership.tenant_id) {
        setError("You are not authorized to edit this property.");
        setEditAllowed(false);
        setLoading(false);
        return;
      }
      setForm({
        name: data.name ?? "",
        address_line: data.address_line,
        district: data.district ?? "",
        city: data.city ?? "",
        neighborhood: data.neighborhood ?? "",
        bedrooms: data.bedrooms != null ? String(data.bedrooms) : "",
        kitchens: data.kitchens != null ? String(data.kitchens) : "",
        bathrooms: data.bathrooms != null ? String(data.bathrooms) : "",
        property_type: data.property_type,
        description: data.description ?? "",
        rent_amount: data.rent_amount != null ? String(data.rent_amount) : "",
        currency: data.currency,
        contact_phone: data.contact_phone ?? "",
        contact_email: data.contact_email ?? "",
        is_listed: data.is_listed,
        status: data.status === "occupied" ? "occupied" : data.status,
      });
      const { data: photos } = await supabase
        .from("property_photos")
        .select("*")
        .eq("property_id", id)
        .order("sort_order");
      if (!cancelled) {
        setExistingPhotos((photos as PropertyPhoto[]) ?? []);
        setEditAllowed(true);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, activeMembership]);

  useEffect(() => {
    pendingPhotosRef.current = pendingPhotos;
  }, [pendingPhotos]);

  useEffect(() => {
    return () => {
      pendingPhotosRef.current.forEach((p) => URL.revokeObjectURL(p.previewUrl));
    };
  }, []);

  const addPhotoFiles = (files: FileList | File[]) => {
    const list = Array.from(files);
    if (list.length === 0) return;
    const next: PendingPhoto[] = [];
    for (const file of list) {
      const validationError = validatePhotoFile(file);
      if (validationError) {
        setError(validationError);
        continue;
      }
      next.push({
        id: crypto.randomUUID(),
        file,
        previewUrl: URL.createObjectURL(file),
      });
    }
    if (next.length > 0) {
      setError(null);
      setPendingPhotos((prev) => {
        const merged = [...prev, ...next];
        pendingPhotosRef.current = merged;
        return merged;
      });
    }
  };

  const removePendingPhoto = (photoId: string) => {
    setPendingPhotos((prev) => {
      const target = prev.find((p) => p.id === photoId);
      if (target) URL.revokeObjectURL(target.previewUrl);
      const next = prev.filter((p) => p.id !== photoId);
      pendingPhotosRef.current = next;
      return next;
    });
  };

  const removeExistingPhoto = async (photo: PropertyPhoto) => {
    if (!isLandlordAdmin) return;
    setError(null);
    await supabase.storage.from("property-photos").remove([photo.storage_path]);
    const { error: err } = await supabase.from("property_photos").delete().eq("id", photo.id);
    if (err) {
      setError(err.message);
      return;
    }
    setExistingPhotos((prev) => prev.filter((p) => p.id !== photo.id));
  };

  const uploadPendingForProperty = async (propertyId: string, tenantId: string, startOrder: number) => {
    let sortOrder = startOrder;
    for (const pending of pendingPhotos) {
      const errMsg = await uploadPropertyPhoto({
        file: pending.file,
        tenantId,
        propertyId,
        sortOrder,
      });
      if (errMsg) return errMsg;
      sortOrder += 1;
    }
    return null;
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user || !activeMembership || saving) return;
    if (!form.address_line.trim()) {
      setError("Address is required");
      return;
    }
    const rent = form.rent_amount.trim() === "" ? null : Number(form.rent_amount);
    if (rent != null && (Number.isNaN(rent) || rent < 0)) {
      setError("Rent amount must be a non-negative number");
      return;
    }
    const bedroomsParsed = parseOptionalNonNegInt(form.bedrooms, "Bedrooms");
    if (bedroomsParsed.error) {
      setError(bedroomsParsed.error);
      return;
    }
    const kitchensParsed = parseOptionalNonNegInt(form.kitchens, "Kitchen");
    if (kitchensParsed.error) {
      setError(kitchensParsed.error);
      return;
    }
    const bathroomsParsed = parseOptionalNonNegInt(form.bathrooms, "Bathrooms");
    if (bathroomsParsed.error) {
      setError(bathroomsParsed.error);
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
        neighborhood: form.neighborhood.trim() || null,
        bedrooms: bedroomsParsed.value,
        kitchens: kitchensParsed.value,
        bathrooms: bathroomsParsed.value,
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
      const { data: updated, error: err } = await supabase
        .from("properties")
        .update(payload)
        .eq("id", id)
        .eq("tenant_id", activeMembership.tenant_id)
        .select("id")
        .maybeSingle();
      if (err) {
        setSaving(false);
        setError(err.message);
        return;
      }
      if (!updated) {
        setSaving(false);
        setError("You are not authorized to update this property.");
        return;
      }

      if (pendingPhotos.length > 0) {
        setUploadingPhotos(true);
        const photoErr = await uploadPendingForProperty(
          id,
          activeMembership.tenant_id,
          existingPhotos.length,
        );
        setUploadingPhotos(false);
        if (photoErr) {
          setSaving(false);
          setError(photoErr);
          return;
        }
      }

      setSaving(false);
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
        neighborhood: form.neighborhood.trim() || null,
        bedrooms: bedroomsParsed.value,
        kitchens: kitchensParsed.value,
        bathrooms: bathroomsParsed.value,
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

    if (err || !data) {
      setSaving(false);
      setError(err?.message || "Create failed");
      return;
    }

    if (pendingPhotos.length > 0) {
      setUploadingPhotos(true);
      const photoErr = await uploadPendingForProperty(data.id, activeMembership.tenant_id, 0);
      setUploadingPhotos(false);
      if (photoErr) {
        setSaving(false);
        setError(
          `Property created, but a photo failed to upload: ${photoErr}. You can add photos from the property page.`,
        );
        navigate(`/app/landlord/properties/${data.id}`);
        return;
      }
    }

    setSaving(false);
    navigate(`/app/landlord/properties/${data.id}`);
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    if (saving || uploadingPhotos) return;
    addPhotoFiles(e.dataTransfer.files);
  };

  if (!activeMembership || activeMembership.tenant.tenant_type !== "landlord") {
    return <div className="text-sm text-muted-foreground">Landlord membership required.</div>;
  }

  if (isEdit && loading) {
    return <div className="text-sm text-muted-foreground">Loading…</div>;
  }

  if (isEdit && !editAllowed) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <Link to="/app/landlord/properties" className="text-sm text-brand-blue hover:underline">
          ← Properties
        </Link>
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error ?? "You are not authorized to edit this property."}
        </div>
      </div>
    );
  }

  const busy = saving || uploadingPhotos;
  const submitLabel = busy
    ? uploadingPhotos
      ? "Uploading photos…"
      : "Saving…"
    : isEdit
      ? "Save changes"
      : "Create property";

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <Link
          to="/app/landlord/properties"
          className="inline-flex items-center text-sm font-medium text-brand-blue hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
        >
          ← Properties
        </Link>
        <h1 className="mt-2 font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          {isEdit ? "Edit property" : "Create property"}
        </h1>
        <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">
          {isEdit
            ? "Update the details below and save your changes."
            : "Add a new property to your portfolio. Fill in the details below."}
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <form onSubmit={onSubmit} className="space-y-6">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(280px,380px)]">
          {/* Left — Property Information */}
          <section className="rounded-xl border border-border bg-card p-5 shadow-[0_1px_2px_rgba(11,31,58,0.04)] sm:p-6">
            <div className="mb-5 border-b border-border pb-4">
              <h2 className="font-display text-lg font-semibold text-foreground">Property Information</h2>
              <p className="mt-1 text-sm text-muted-foreground">Basic details for this listing</p>
            </div>

            <div className="space-y-4">
              <div>
                <Label htmlFor="name">Title</Label>
                <Input
                  id="name"
                  placeholder="e.g. Villa Near the Beach"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>

              <div>
                <Label htmlFor="address">
                  Address <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="address"
                  required
                  placeholder="Street address, building name, etc."
                  value={form.address_line}
                  onChange={(e) => setForm({ ...form, address_line: e.target.value })}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <Label htmlFor="district">District</Label>
                  <FormSelect
                    id="district"
                    value={form.district}
                    onChange={(e) => setForm({ ...form, district: e.target.value })}
                  >
                    <option value="">Choose a district</option>
                    {withCurrentOption(MOGADISHU_DISTRICTS, form.district).map((district) => (
                      <option key={district} value={district}>
                        {district}
                      </option>
                    ))}
                  </FormSelect>
                </div>
                <div>
                  <Label htmlFor="neighborhood">Neighborhood (Xaafad)</Label>
                  <Input
                    id="neighborhood"
                    placeholder="Enter neighborhood name"
                    value={form.neighborhood}
                    onChange={(e) => setForm({ ...form, neighborhood: e.target.value })}
                    className="border-border transition-colors hover:border-brand-blue/40 focus-visible:border-brand-blue"
                  />
                </div>
                <div>
                  <Label htmlFor="city">City</Label>
                  <Input
                    id="city"
                    placeholder="e.g. Mogadishu"
                    value={form.city}
                    onChange={(e) => setForm({ ...form, city: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <Label htmlFor="bedrooms">Number of Bedrooms</Label>
                  <FormSelect
                    id="bedrooms"
                    value={form.bedrooms}
                    onChange={(e) => setForm({ ...form, bedrooms: e.target.value })}
                  >
                    <option value="">Choose bedrooms</option>
                    {withCurrentRoomOption(form.bedrooms).map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </FormSelect>
                </div>
                <div>
                  <Label htmlFor="kitchens">Number of Kitchens</Label>
                  <FormSelect
                    id="kitchens"
                    value={form.kitchens}
                    onChange={(e) => setForm({ ...form, kitchens: e.target.value })}
                  >
                    <option value="">Choose kitchens</option>
                    {withCurrentRoomOption(form.kitchens).map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </FormSelect>
                </div>
                <div>
                  <Label htmlFor="bathrooms">Number of Bathrooms</Label>
                  <FormSelect
                    id="bathrooms"
                    value={form.bathrooms}
                    onChange={(e) => setForm({ ...form, bathrooms: e.target.value })}
                  >
                    <option value="">Choose bathrooms</option>
                    {withCurrentRoomOption(form.bathrooms).map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </FormSelect>
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
                    <option value="villa">Villa</option>
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
                    placeholder="0.00"
                    value={form.rent_amount}
                    onChange={(e) => setForm({ ...form, rent_amount: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="currency">Currency</Label>
                  <Input
                    id="currency"
                    value={form.currency}
                    onChange={(e) => setForm({ ...form, currency: e.target.value })}
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  placeholder="Describe key features, amenities, and nearby landmarks…"
                  className="min-h-28"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="phone">Contact phone</Label>
                  <Input
                    id="phone"
                    placeholder="e.g. +252 61 1234567"
                    value={form.contact_phone}
                    onChange={(e) => setForm({ ...form, contact_phone: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="email">Contact email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="e.g. property@domain.com"
                    value={form.contact_email}
                    onChange={(e) => setForm({ ...form, contact_email: e.target.value })}
                  />
                </div>
              </div>

              <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-muted/40 px-3 py-3 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 rounded border-border text-brand-blue focus-visible:ring-2 focus-visible:ring-ring"
                  checked={form.is_listed}
                  onChange={(e) => setForm({ ...form, is_listed: e.target.checked })}
                />
                <span>
                  <span className="font-medium text-foreground">Publish listing</span>
                  <span className="mt-0.5 block text-muted-foreground">
                    Show on public landlord website and renter browse
                  </span>
                </span>
              </label>
            </div>
          </section>

          {/* Right — Photos + Tips */}
          <div className="space-y-6">
            <section className="rounded-xl border border-border bg-card p-5 shadow-[0_1px_2px_rgba(11,31,58,0.04)] sm:p-6">
              <h2 className="font-display text-lg font-semibold text-foreground">Property Photos</h2>
              <p className="mt-1 text-sm text-muted-foreground">Upload clear photos of the property</p>

              <div
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    fileInputRef.current?.click();
                  }
                }}
                onDragEnter={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                }}
                onDrop={onDrop}
                onClick={() => !busy && fileInputRef.current?.click()}
                className={cn(
                  "mt-4 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  dragOver
                    ? "border-brand-blue bg-brand-blue/5"
                    : "border-border bg-muted/30 hover:border-brand-blue/50 hover:bg-muted/50",
                  busy && "pointer-events-none opacity-60",
                )}
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-blue/10 text-brand-blue">
                  <ImagePlus className="h-5 w-5" aria-hidden />
                </div>
                <p className="mt-3 text-sm font-medium text-foreground">
                  Drag & drop photos here, or click to browse
                </p>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  JPEG, PNG, WebP, or GIF · max 5MB each
                </p>
                <input
                  ref={fileInputRef}
                  id={fileInputId}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  multiple
                  disabled={busy}
                  className="sr-only"
                  aria-label="Upload property photos"
                  onChange={(e) => {
                    if (e.target.files) addPhotoFiles(e.target.files);
                    e.target.value = "";
                  }}
                />
              </div>

              {(existingPhotos.length > 0 || pendingPhotos.length > 0) && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {existingPhotos.map((ph, index) => (
                    <ExistingPhotoThumb
                      key={ph.id}
                      photo={ph}
                      alt={`Photo ${index + 1}`}
                      onRemove={
                        !busy && isLandlordAdmin
                          ? () => void removeExistingPhoto(ph)
                          : undefined
                      }
                    />
                  ))}
                  {pendingPhotos.map((ph, index) => (
                    <div
                      key={ph.id}
                      className="group relative h-20 w-20 overflow-hidden rounded-lg border border-border bg-muted"
                    >
                      <img
                        src={ph.previewUrl}
                        alt={`New photo ${index + 1}`}
                        className="h-full w-full object-cover"
                      />
                      {!busy && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            removePendingPhoto(ph.id);
                          }}
                          className="absolute right-1 top-1 rounded-full bg-black/60 p-0.5 text-white opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          aria-label={`Remove new photo ${index + 1}`}
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {!isEdit && pendingPhotos.length === 0 && (
                <p className="mt-3 text-xs text-muted-foreground">
                  Photos are uploaded after the property is created, using the same storage as property details.
                </p>
              )}
              {isEdit && !isLandlordAdmin && (
                <p className="mt-3 text-xs text-muted-foreground">
                  Photo removal is limited to landlord admins. You can still upload new photos.
                </p>
              )}
            </section>

            <aside className="rounded-xl border border-brand-green/25 bg-brand-green/5 p-5 shadow-[0_1px_2px_rgba(11,31,58,0.04)]">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-green/15 text-brand-green">
                  <Lightbulb className="h-4 w-4" aria-hidden />
                </div>
                <div>
                  <h3 className="font-display text-sm font-semibold text-foreground">
                    Tips for better listings
                  </h3>
                  <ul className="mt-2 space-y-1.5 text-sm text-muted-foreground">
                    <li className="flex gap-2">
                      <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-brand-green" aria-hidden />
                      Use clear, high-quality photos.
                    </li>
                    <li className="flex gap-2">
                      <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-brand-green" aria-hidden />
                      Provide an accurate and detailed address.
                    </li>
                    <li className="flex gap-2">
                      <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-brand-green" aria-hidden />
                      Choose the correct property type.
                    </li>
                    <li className="flex gap-2">
                      <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-brand-green" aria-hidden />
                      Set the right availability status.
                    </li>
                    <li className="flex gap-2">
                      <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-brand-green" aria-hidden />
                      Include key features in the description.
                    </li>
                  </ul>
                </div>
              </div>
            </aside>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
          <Button type="submit" disabled={busy} className="min-w-[9.5rem]">
            {submitLabel}
          </Button>
          <Link to={isEdit ? `/app/landlord/properties/${id}` : "/app/landlord/properties"}>
            <Button type="button" variant="outline" disabled={busy}>
              Cancel
            </Button>
          </Link>
        </div>
      </form>
    </div>
  );
}
