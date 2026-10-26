import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  Building2,
  Camera,
  Check,
  ClipboardList,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  ImagePlus,
  Loader2,
  Lock,
  Mail,
  Phone,
  User,
} from "lucide-react";
import { useAuth } from "@/auth/AuthProvider";
import { UserAvatar } from "@/components/ui/user-avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { validatePasswordPair } from "@/lib/passwordForm";
import { supabase } from "@/lib/supabase";
import { brandingString, uploadPublicImage } from "@/lib/uploadImage";
import { cn } from "@/lib/utils";

function SectionCard({
  icon: Icon,
  title,
  description,
  children,
  className,
}: {
  icon: typeof User;
  title: string;
  description: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-2xl border border-[#cfe0f0] bg-card p-5 shadow-[0_8px_24px_-16px_rgba(11,31,58,0.35)] sm:p-6",
        className,
      )}
    >
      <header className="mb-5 flex items-start gap-3">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#e8f2fb] text-brand-blue"
          aria-hidden
        >
          <Icon className="h-5 w-5" strokeWidth={1.75} />
        </div>
        <div className="min-w-0 pt-0.5">
          <h3 className="font-display text-base font-bold text-foreground sm:text-lg">{title}</h3>
          <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
        </div>
      </header>
      {children}
    </section>
  );
}

function FieldShell({
  icon: Icon,
  children,
  trailing,
}: {
  icon: typeof User;
  children: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute inset-y-0 left-0 flex w-10 items-center justify-center text-muted-foreground">
        <Icon className="h-4 w-4" aria-hidden />
      </span>
      {children}
      {trailing}
    </div>
  );
}

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
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const [copiedId, setCopiedId] = useState(false);
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

  const onCopyUserId = async () => {
    if (!user?.id) return;
    try {
      await navigator.clipboard.writeText(user.id);
      setCopiedId(true);
      window.setTimeout(() => setCopiedId(false), 2000);
    } catch {
      setError("Could not copy user ID.");
    }
  };

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

  const onChangePassword = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);

    const validated = validatePasswordPair(newPassword, confirmPassword);
    if (!validated.ok) {
      setError(validated.error);
      return;
    }

    setSavingPassword(true);
    const { error: err } = await supabase.auth.updateUser({
      password: validated.password,
    });
    setSavingPassword(false);

    if (err) {
      setError(err.message);
      return;
    }

    setNewPassword("");
    setConfirmPassword("");
    setMessage("Password updated.");
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
    <div className="mx-auto w-full max-w-5xl space-y-5 sm:space-y-6">
      <div>
        <h2 className="font-display text-2xl font-bold tracking-tight text-foreground sm:text-[1.75rem]">
          Account
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage your profile, workspace branding, and password.
        </p>
      </div>

      {(error || message) && (
        <p
          role={error ? "alert" : "status"}
          className={
            error
              ? "rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700"
              : "rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-sm text-emerald-800"
          }
        >
          {error || message}
        </p>
      )}

      <SectionCard
        icon={ClipboardList}
        title="Profile information"
        description="Update your profile photo and personal details."
      >
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between lg:gap-8">
          <div className="flex min-w-0 flex-1 flex-col items-center gap-4 sm:flex-row sm:items-start">
            <div className="relative shrink-0">
              <UserAvatar
                name={profile?.full_name}
                email={profile?.email}
                avatarUrl={profile?.avatar_url}
                size="xl"
                className="h-24 w-24 text-3xl ring-brand-blue/20"
              />
              <button
                type="button"
                disabled={uploading}
                onClick={() => fileRef.current?.click()}
                className="absolute -bottom-1 -right-1 flex h-9 w-9 items-center justify-center rounded-full bg-brand-navy text-white shadow-md ring-2 ring-card transition-colors hover:bg-[#132b4d] disabled:opacity-60"
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

            <div className="min-w-0 flex-1 text-center sm:pt-1 sm:text-left">
              <p className="font-display text-lg font-bold text-foreground sm:text-xl">
                {profile?.full_name || "Your name"}
              </p>
              <p className="mt-0.5 text-sm capitalize text-muted-foreground">{roleLabel}</p>
              {profile?.email && (
                <p className="mt-2 flex items-center justify-center gap-1.5 truncate text-sm text-muted-foreground sm:justify-start">
                  <Mail className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  <span className="truncate">{profile.email}</span>
                </p>
              )}
              {profile?.username && (
                <p className="mt-1.5 text-xs text-muted-foreground">
                  Username:{" "}
                  <span className="font-medium text-foreground">{profile.username}</span>
                  <span className="ml-1">(display only; cannot be changed)</span>
                </p>
              )}
            </div>
          </div>

          {user?.id && (
            <div className="w-full shrink-0 lg:max-w-md">
              <div className="rounded-xl border border-[#cfe0f0] bg-[#eef5fb] px-3.5 py-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      User ID
                    </p>
                    <p className="mt-1 break-all font-mono text-xs leading-relaxed text-foreground sm:text-[13px]">
                      {user.id}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void onCopyUserId()}
                    className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-white/80 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label={copiedId ? "User ID copied" : "Copy user ID"}
                  >
                    {copiedId ? (
                      <Check className="h-4 w-4 text-brand-green" aria-hidden />
                    ) : (
                      <Copy className="h-4 w-4" aria-hidden />
                    )}
                  </button>
                </div>
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground sm:text-xs">
                Share this ID with a landlord so they can invite you to their workspace.
              </p>
            </div>
          )}
        </div>

        <p className="mt-4 text-xs text-muted-foreground">
          JPG, PNG, or WebP · max 2 MB · stored in Supabase Storage
        </p>
      </SectionCard>

      {canEditTenantBranding && (
        <SectionCard
          icon={Building2}
          title="Workspace branding"
          description={`Landing template, colors, public contact, and logo for ${activeMembership?.tenant.name}.`}
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex h-20 w-28 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[#cfe0f0] bg-muted/40 sm:h-[4.5rem] sm:w-32">
              {tenantLogo ? (
                <img
                  src={tenantLogo}
                  alt="Workspace logo"
                  className="h-full w-full object-contain p-1.5"
                />
              ) : (
                <ImagePlus className="h-6 w-6 text-muted-foreground" />
              )}
            </div>

            <div className="flex w-full flex-col gap-2.5 sm:w-auto sm:flex-row sm:flex-wrap sm:justify-end">
              <Link
                to={`/app/branding?tenant=${encodeURIComponent(activeMembership?.tenant.slug ?? "")}`}
                className="w-full sm:w-auto"
              >
                <Button type="button" className="w-full sm:w-auto">
                  <ExternalLink className="h-4 w-4" />
                  Open branding editor
                </Button>
              </Link>
              <Button
                type="button"
                variant="outline"
                disabled={logoUploading}
                className="w-full sm:w-auto"
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
        </SectionCard>
      )}

      <SectionCard
        icon={User}
        title="Personal information"
        description="Update your personal details. This information is used within your landlord workspace."
      >
        <form onSubmit={(e) => void onSave(e)} className="space-y-5">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            <div>
              <Label htmlFor="fullName">Full name</Label>
              <FieldShell icon={User}>
                <Input
                  id="fullName"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                  className="h-11 border-[#d0dce8] pl-10"
                />
              </FieldShell>
            </div>
            <div>
              <Label htmlFor="email">Email</Label>
              <FieldShell icon={Mail}>
                <Input
                  id="email"
                  value={profile?.email ?? ""}
                  disabled
                  className="h-11 border-[#d0dce8] bg-muted/50 pl-10"
                />
              </FieldShell>
            </div>
            <div className="md:col-span-2 xl:col-span-1">
              <Label htmlFor="phone">Phone</Label>
              <FieldShell icon={Phone}>
                <Input
                  id="phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+252…"
                  className="h-11 border-[#d0dce8] pl-10"
                />
              </FieldShell>
            </div>
          </div>
          <Button type="submit" disabled={saving} className="w-full sm:w-auto">
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </form>
      </SectionCard>

      <SectionCard
        icon={Lock}
        title="Change password"
        description="Uses your signed-in session. Passwords are never stored in the app database."
      >
        <form
          onSubmit={(e) => void onChangePassword(e)}
          className="space-y-5"
          aria-busy={savingPassword}
        >
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <Label htmlFor="newPassword">New password</Label>
              <FieldShell
                icon={Lock}
                trailing={
                  <button
                    type="button"
                    className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
                    onClick={() => setShowNewPassword((v) => !v)}
                    aria-label={showNewPassword ? "Hide new password" : "Show new password"}
                  >
                    {showNewPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                }
              >
                <Input
                  id="newPassword"
                  name="newPassword"
                  type={showNewPassword ? "text" : "password"}
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  className="h-11 border-[#d0dce8] pl-10 pr-10"
                />
              </FieldShell>
            </div>
            <div>
              <Label htmlFor="confirmPassword">Confirm password</Label>
              <FieldShell
                icon={Lock}
                trailing={
                  <button
                    type="button"
                    className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
                    onClick={() => setShowConfirmPassword((v) => !v)}
                    aria-label={
                      showConfirmPassword
                        ? "Hide password confirmation"
                        : "Show password confirmation"
                    }
                  >
                    {showConfirmPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                }
              >
                <Input
                  id="confirmPassword"
                  name="confirmPassword"
                  type={showConfirmPassword ? "text" : "password"}
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  className="h-11 border-[#d0dce8] pl-10 pr-10"
                />
              </FieldShell>
            </div>
          </div>
          <Button type="submit" disabled={savingPassword} className="w-full sm:w-auto">
            {savingPassword ? "Updating…" : "Update password"}
          </Button>
        </form>
      </SectionCard>
    </div>
  );
}
