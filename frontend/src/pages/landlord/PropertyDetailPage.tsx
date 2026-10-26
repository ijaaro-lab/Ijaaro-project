import { useEffect, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/supabase";
import { money, statusTone } from "@/lib/format";
import type { Profile, Property, PropertyPhoto, RentalAssignment } from "@/types/database";

/** Private bucket signed URLs — short-lived; refresh before expiry. */
const PROPERTY_PHOTO_SIGNED_URL_SECONDS = 15 * 60;
const PROPERTY_PHOTO_REFRESH_BUFFER_MS = 60_000;

type PropertyPhotoThumbProps = {
  photo: PropertyPhoto;
  alt: string;
  /** When omitted, remove control is hidden (e.g. landlord_staff). */
  onRemove?: (photo: PropertyPhoto) => void;
};

function PropertyPhotoThumb({ photo, alt, onRemove }: PropertyPhotoThumbProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewStatus, setPreviewStatus] = useState<"loading" | "ready" | "error">("loading");
  const [previewError, setPreviewError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;

    const clearRefresh = () => {
      if (refreshTimer !== undefined) {
        clearTimeout(refreshTimer);
        refreshTimer = undefined;
      }
    };

    const scheduleRefresh = () => {
      clearRefresh();
      const delay = PROPERTY_PHOTO_SIGNED_URL_SECONDS * 1000 - PROPERTY_PHOTO_REFRESH_BUFFER_MS;
      refreshTimer = setTimeout(() => {
        void fetchSignedUrl(true);
      }, Math.max(delay, 5_000));
    };

    const fetchSignedUrl = async (isRefresh: boolean) => {
      if (!isRefresh) {
        setPreviewStatus("loading");
        setPreviewError(null);
      }

      const { data, error } = await supabase.storage
        .from("property-photos")
        .createSignedUrl(photo.storage_path, PROPERTY_PHOTO_SIGNED_URL_SECONDS);

      if (cancelled) return;

      if (error || !data?.signedUrl) {
        if (!isRefresh) {
          setPreviewUrl(null);
          setPreviewStatus("error");
          setPreviewError(error?.message ?? "Preview unavailable");
        } else {
          // Keep the previous image visible; retry shortly.
          clearRefresh();
          refreshTimer = setTimeout(() => {
            void fetchSignedUrl(true);
          }, 30_000);
        }
        return;
      }

      setPreviewUrl(data.signedUrl);
      setPreviewStatus("ready");
      setPreviewError(null);
      scheduleRefresh();
    };

    void fetchSignedUrl(false);

    return () => {
      cancelled = true;
      clearRefresh();
    };
  }, [photo.id, photo.storage_path]);

  return (
    <div className="w-[160px] overflow-hidden rounded-lg border border-border bg-muted/30">
      <div className="relative aspect-[4/3] w-full bg-muted">
        {previewStatus === "loading" && (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
            Loading preview…
          </div>
        )}
        {previewStatus === "error" && (
          <div className="absolute inset-0 flex items-center justify-center px-2 text-center text-xs text-red-600">
            {previewError ?? "Preview unavailable"}
          </div>
        )}
        {previewUrl && previewStatus !== "error" && (
          <img
            src={previewUrl}
            alt={alt}
            className={`h-full w-full object-cover transition-opacity ${
              previewStatus === "ready" ? "opacity-100" : "opacity-0"
            }`}
            onError={() => {
              setPreviewStatus("error");
              setPreviewError("Preview failed to load");
              setPreviewUrl(null);
            }}
          />
        )}
      </div>
      {onRemove && (
        <div className="p-2">
          <Button
            variant="destructive"
            size="sm"
            className="w-full"
            onClick={() => onRemove(photo)}
          >
            Remove
          </Button>
        </div>
      )}
    </div>
  );
}

export function PropertyDetailPage() {
  const { id } = useParams();
  const { activeMembership, user } = useAuth();
  const isLandlordAdmin = activeMembership?.role === "landlord_admin";
  const [property, setProperty] = useState<Property | null>(null);
  const [photos, setPhotos] = useState<PropertyPhoto[]>([]);
  const [assignment, setAssignment] = useState<RentalAssignment | null>(null);
  const [renters, setRenters] = useState<Profile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [movingOut, setMovingOut] = useState(false);
  const [assignForm, setAssignForm] = useState({
    renter_id: "",
    rent_amount: "",
    start_date: new Date().toISOString().slice(0, 10),
    due_day: "1",
  });

  const load = async () => {
    if (!id) return;
    setLoading(true);
    const [pRes, phRes, aRes] = await Promise.all([
      supabase.from("properties").select("*").eq("id", id).maybeSingle(),
      supabase.from("property_photos").select("*").eq("property_id", id).order("sort_order"),
      supabase
        .from("rental_assignments")
        .select("*")
        .eq("property_id", id)
        .in("status", ["active", "invited"])
        .maybeSingle(),
    ]);
    if (pRes.error) setError(pRes.error.message);
    setProperty(pRes.data);
    setPhotos(phRes.data ?? []);
    setAssignment(aRes.data);
    if (pRes.data?.rent_amount != null) {
      setAssignForm((f) => ({ ...f, rent_amount: String(pRes.data!.rent_amount) }));
    }
    setLoading(false);
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (!activeMembership?.tenant_id || !isLandlordAdmin) {
      setRenters([]);
      return;
    }
    (async () => {
      // profiles RLS is own-row only; landlords must use the gated RPC.
      const { data, error: rpcErr } = await supabase.rpc("list_same_tenant_member_profiles", {
        p_tenant_id: activeMembership.tenant_id,
      });
      if (rpcErr) {
        setError(rpcErr.message);
        setRenters([]);
        return;
      }
      setRenters(
        (data ?? []).map(
          (r: {
            user_id: string;
            full_name: string | null;
            email: string | null;
          }) => ({
            id: r.user_id,
            full_name: r.full_name,
            email: r.email,
            phone: null,
            avatar_url: null,
            preferred_language: null,
            created_at: "",
            updated_at: "",
          }),
        ),
      );
    })();
  }, [activeMembership?.tenant_id, isLandlordAdmin]);

  const onUpload = async (file: File | null) => {
    if (!file || !property || !user) return;
    if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.type)) {
      setError("Only JPEG, PNG, WebP, or GIF images are allowed");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("Image must be 5MB or smaller");
      return;
    }
    setUploading(true);
    setError(null);
    const ext = file.name.split(".").pop() || "jpg";
    const path = `${property.tenant_id}/${property.id}/${crypto.randomUUID()}.${ext}`;
    const { error: upErr } = await supabase.storage.from("property-photos").upload(path, file, {
      contentType: file.type,
      upsert: false,
    });
    if (upErr) {
      setUploading(false);
      setError(upErr.message);
      return;
    }
    const { error: rowErr } = await supabase.from("property_photos").insert({
      property_id: property.id,
      tenant_id: property.tenant_id,
      storage_path: path,
      sort_order: photos.length,
    });
    setUploading(false);
    if (rowErr) {
      setError(rowErr.message);
      return;
    }
    setMsg("Photo uploaded");
    await load();
  };

  const removePhoto = async (photo: PropertyPhoto) => {
    setError(null);
    await supabase.storage.from("property-photos").remove([photo.storage_path]);
    const { error: err } = await supabase.from("property_photos").delete().eq("id", photo.id);
    if (err) setError(err.message);
    else await load();
  };

  const assignRenter = async (e: FormEvent) => {
    e.preventDefault();
    if (!property) return;
    setError(null);
    setMsg(null);
    const amount = Number(assignForm.rent_amount);
    if (!assignForm.renter_id || Number.isNaN(amount) || amount < 0) {
      setError("Select a renter and enter a valid rent amount");
      return;
    }
    const { error: err } = await supabase.rpc("assign_renter", {
      p_property_id: property.id,
      p_renter_id: assignForm.renter_id,
      p_rent_amount: amount,
      p_start_date: assignForm.start_date,
      p_due_day: Number(assignForm.due_day) || null,
      p_currency: property.currency,
      p_create_initial_charge: true,
    });
    if (err) setError(err.message);
    else {
      setMsg("Renter assigned and initial rent charge created");
      await load();
    }
  };

  const moveOut = async () => {
    if (!assignment || movingOut) return;
    setMovingOut(true);
    setError(null);
    setMsg(null);
    const { error: err } = await supabase.rpc("complete_move_out", {
      p_assignment_id: assignment.id,
      p_end_date: new Date().toISOString().slice(0, 10),
    });
    if (err) {
      setError(err.message);
      setMovingOut(false);
      return;
    }
    setMsg("Move-out completed; property set to available");
    await load();
    setMovingOut(false);
  };

  if (loading) return <div className="text-sm text-muted-foreground">Loading…</div>;
  if (!property) {
    return <div className="text-sm text-muted-foreground">Property not found or unauthorized.</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link to="/app/landlord/properties" className="text-sm text-brand-blue hover:underline">
            ← Properties
          </Link>
          <h2 className="mt-2 font-display text-2xl font-bold">{property.name || property.address_line}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{property.address_line}</p>
        </div>
        <div className="flex gap-2">
          {activeMembership?.tenant_id === property.tenant_id && (
            <Link to={`/app/landlord/properties/${property.id}/edit`}>
              <Button variant="outline">Edit</Button>
            </Link>
          )}
          <Badge tone={statusTone(property.status)}>{property.status}</Badge>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}
      {msg && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {msg}
        </div>
      )}

      <div className="grid gap-4 rounded-xl border border-border bg-card p-5 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <div className="text-xs text-muted-foreground">Rent</div>
          <div className="font-semibold">{money(property.rent_amount, property.currency)}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Type</div>
          <div className="font-semibold">{property.property_type}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">District / City</div>
          <div className="font-semibold">
            {[property.district, property.city].filter(Boolean).join(", ") || "—"}
          </div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Listed</div>
          <div className="font-semibold">{property.is_listed ? "Yes" : "No"}</div>
        </div>
      </div>

      {property.description && (
        <p className="rounded-xl border border-border bg-card p-5 text-sm leading-relaxed">{property.description}</p>
      )}

      <section className="rounded-xl border border-border bg-card p-5">
        <h3 className="font-semibold">Photos</h3>
        <p className="mt-1 text-xs text-muted-foreground">Private bucket · max 5MB · JPEG/PNG/WebP/GIF</p>
        <div className="mt-4 flex flex-wrap gap-3">
          {photos.map((ph, index) => (
            <PropertyPhotoThumb
              key={ph.id}
              photo={ph}
              alt={`Photo ${index + 1} of ${property.name || property.address_line}`}
              onRemove={
                isLandlordAdmin ? (photo) => void removePhoto(photo) : undefined
              }
            />
          ))}
          {photos.length === 0 && (
            <p className="text-sm text-muted-foreground">No photos yet.</p>
          )}
        </div>
        {!isLandlordAdmin && (
          <p className="mt-2 text-xs text-muted-foreground">
            Photo removal is limited to landlord admins. You can still upload new photos.
          </p>
        )}
        <div className="mt-4">
          <Input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            disabled={uploading}
            onChange={(e) => void onUpload(e.target.files?.[0] ?? null)}
            aria-label="Upload property photo"
          />
        </div>
      </section>

      {isLandlordAdmin && (
      <section className="rounded-xl border border-border bg-card p-5">
        <h3 className="font-semibold">Tenancy</h3>
        {assignment ? (
          <div className="mt-3 space-y-3 text-sm">
            <div>
              Active assignment · {money(assignment.rent_amount, assignment.currency)} · due day{" "}
              {assignment.due_day ?? "—"} · started {assignment.start_date}
            </div>
            <Link to={`/app/landlord/tenancies/${assignment.id}`} className="text-brand-blue hover:underline">
              Open tenancy details
            </Link>
            <div>
              <Button
                variant="outline"
                disabled={movingOut}
                onClick={() => void moveOut()}
              >
                {movingOut ? "Completing move-out…" : "Complete move-out"}
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={assignRenter} className="mt-4 grid max-w-xl gap-3">
            <div>
              <Label htmlFor="renter">Renter member</Label>
              <select
                id="renter"
                className="flex h-10 w-full rounded-lg border border-border bg-card px-3 text-sm"
                value={assignForm.renter_id}
                onChange={(e) => setAssignForm({ ...assignForm, renter_id: e.target.value })}
                required
              >
                <option value="">Select renter…</option>
                {renters.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.full_name || r.email || r.id}
                  </option>
                ))}
              </select>
              {renters.length === 0 && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Invite a user with role <code>renter</code> on this landlord tenant first.{" "}
                  <Link to="/app/landlord/renters" className="text-brand-blue hover:underline">
                    Invite renter
                  </Link>
                </p>
              )}
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <Label htmlFor="amt">Rent amount</Label>
                <Input
                  id="amt"
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  value={assignForm.rent_amount}
                  onChange={(e) => setAssignForm({ ...assignForm, rent_amount: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="start">Start date</Label>
                <Input
                  id="start"
                  type="date"
                  required
                  value={assignForm.start_date}
                  onChange={(e) => setAssignForm({ ...assignForm, start_date: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="due">Due day (1–28)</Label>
                <Input
                  id="due"
                  type="number"
                  min="1"
                  max="28"
                  value={assignForm.due_day}
                  onChange={(e) => setAssignForm({ ...assignForm, due_day: e.target.value })}
                />
              </div>
            </div>
            <Button type="submit">Assign renter</Button>
          </form>
        )}
      </section>
      )}
    </div>
  );
}
