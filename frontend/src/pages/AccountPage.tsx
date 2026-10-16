import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Camera, ImagePlus, Loader2, Palette } from "lucide-react";
import { useAuth } from "@/auth/AuthProvider";
import { UserAvatar } from "@/components/ui/user-avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/supabase";
import { brandingString, uploadPublicImage } from "@/lib/uploadImage";

export function AccountPage() {
  const {
    user,
    profile,
    refreshProfile,
    refreshMemberships,
    isSuperAdmin,
    activeMembership,
  } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const logoRef = useRef<HTMLInputElement>(null);

  const [fullName, setFullName] = useState(profile?.full_name ?? "");
  const [phone, setPhone] = useState(profile?.phone ?? "");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setFullName(profile?.full_name ?? "");
    setPhone(profile?.phone ?? "");
  }, [profile?.full_name, profile?.phone]);

  const roleLabel = isSuperAdmin
    ? "Super Admin"
    : activeMembership?.role?.replace(/_/g, " ") ?? "Member";

  const canEditTenantBranding =
    !isSuperAdmin &&
    !!activeMembership &&
    (activeMembership.role === "landlord_admin" ||
      activeMembership.role === "utility_admin");

  const tenantLogo = brandingString(
    activeMembership?.tenant.branding as Record<string, unknown> | undefined,
    "logo_url",
  );

  const onSave = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    setError(null);
    setMessage(null);

    const { error: err } = await supabase
      .from("profiles")
      .update({
        full_name: fullName.trim(),
        phone: phone.trim() || null,
      })
      .eq("id", user.id);

    setSaving(false);
    if (err) {
      setError(err.message);
      return;
    }
    await refreshProfile();
    setMessage("Profile saved.");
  };

  const onPickAvatar = async (file: File | null) => {
    if (!file || !user) return;

    setUploading(true);
    setError(null);
    setMessage(null);

    const result = await uploadPublicImage({
      bucket: "avatars",
      folder: user.id,
      fileName: "avatar",
      file,
    });

    if ("error" in result) {
      setUploading(false);
      setError(result.error);
      return;
    }

    const { error: profileErr } = await supabase
      .from("profiles")
      .update({ avatar_url: result.url })
      .eq("id", user.id);

    setUploading(false);
    if (profileErr) {
      setError(profileErr.message);
      return;
    }
    await refreshProfile();
    setMessage("Profile photo updated.");
  };

  const onPickTenantLogo = async (file: File | null) => {
    if (!file || !user || !activeMembership) return;

    setLogoUploading(true);
    setError(null);
    setMessage(null);

    const result = await uploadPublicImage({
      bucket: "tenant-branding",
      folder: activeMembership.tenant_id,
      fileName: "logo",
      file,
    });

    if ("error" in result) {
      setLogoUploading(false);
      setError(result.error);
      return;
    }

    const { error: brandErr } = await supabase.rpc("update_tenant_branding", {
      p_tenant_id: activeMembership.tenant_id,
      p_branding: { logo_url: result.url },
    });

    setLogoUploading(false);
    if (brandErr) {
      setError(brandErr.message);
      return;
    }
    await refreshMemberships();
    setMessage("Workspace logo updated — sidebar and landing page will use it.");
  };

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <h2 className="font-display text-2xl font-bold text-foreground">Account</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Update your profile photo and personal details.
        </p>
      </div>

      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
          <div className="relative">
            <UserAvatar
              name={profile?.full_name}
              email={profile?.email}
              avatarUrl={profile?.avatar_url}
              size="xl"
              className="ring-brand-blue/20"
            />
            <button
              type="button"
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
              className="absolute -bottom-1 -right-1 flex h-9 w-9 items-center justify-center rounded-full bg-brand-navy text-white shadow-md ring-2 ring-card hover:bg-[#132b4d] disabled:opacity-60"
              aria-label="Upload profile photo"
            >
              {uploading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Camera className="h-4 w-4" />
              )}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="hidden"
              onChange={(e) => void onPickAvatar(e.target.files?.[0] ?? null)}
            />
          </div>
          <div className="min-w-0 flex-1 text-center sm:pt-2 sm:text-left">
            <p className="font-display text-lg font-semibold text-foreground">
              {profile?.full_name || "Your name"}
            </p>
            <p className="text-sm capitalize text-muted-foreground">{roleLabel}</p>
            <p className="mt-1 truncate text-xs text-muted-foreground">{profile?.email}</p>
            <p className="mt-3 text-xs text-muted-foreground">
              JPG, PNG, or WebP · max 2 MB · stored in Supabase Storage
            </p>
          </div>
        </div>
      </div>

      {canEditTenantBranding && (
        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <h3 className="font-display text-base font-semibold text-foreground">
            Workspace branding
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Landing template, colors, public contact, and logo for{" "}
            {activeMembership?.tenant.name}.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-xl border border-dashed border-border bg-muted/40">
              {tenantLogo ? (
                <img
                  src={tenantLogo}
                  alt="Workspace logo"
                  className="h-full w-full object-contain p-1"
                />
              ) : (
                <ImagePlus className="h-6 w-6 text-muted-foreground" />
              )}
            </div>
            <Link
              to={`/app/branding?tenant=${encodeURIComponent(activeMembership?.tenant.slug ?? "")}`}
            >
              <Button type="button" variant="secondary">
                <Palette className="h-4 w-4" />
                Open branding editor
              </Button>
            </Link>
            <Button
              type="button"
              variant="outline"
              disabled={logoUploading}
              onClick={() => logoRef.current?.click()}
            >
              {logoUploading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Uploading…
                </>
              ) : (
                <>
                  <ImagePlus className="h-4 w-4" />
                  Quick logo upload
                </>
              )}
            </Button>
            <input
              ref={logoRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif,image/svg+xml"
              className="hidden"
              onChange={(e) => void onPickTenantLogo(e.target.files?.[0] ?? null)}
            />
          </div>
        </div>
      )}

      {(error || message) && (
        <p
          className={
            error
              ? "rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
              : "rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800"
          }
        >
          {error || message}
        </p>
      )}

      <form
        onSubmit={(e) => void onSave(e)}
        className="space-y-4 rounded-2xl border border-border bg-card p-6 shadow-sm"
      >
        <div>
          <Label htmlFor="fullName">Full name</Label>
          <Input
            id="fullName"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
          />
        </div>
        <div>
          <Label htmlFor="email">Email</Label>
          <Input id="email" value={profile?.email ?? ""} disabled />
        </div>
        <div>
          <Label htmlFor="phone">Phone</Label>
          <Input
            id="phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+252…"
          />
        </div>
        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save changes"}
        </Button>
      </form>
    </div>
  );
}
