import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  Building2,
  Eye,
  Link2,
  Mail,
  MoreVertical,
  Pencil,
  Phone,
  Search,
  Send,
  Trash2,
  User,
  UserPlus,
  Users,
} from "lucide-react";
import { useAuth } from "@/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { validateInviteRenterInput } from "@/lib/inviteRenter";
import {
  parseProvisionRenterResponse,
  validateProvisionRenterInput,
} from "@/lib/provisionRenter";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import type { MembershipStatus } from "@/types/database";

type RenterRow = {
  user_id: string;
  full_name: string | null;
  email: string | null;
  membership_status: MembershipStatus;
};

type StatusFilter = "all" | "active" | "disabled";

const AVATAR_TONES = [
  "bg-sky-100 text-sky-800 dark:bg-sky-500/20 dark:text-sky-300",
  "bg-violet-100 text-violet-800 dark:bg-violet-500/20 dark:text-violet-300",
  "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300",
  "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300",
] as const;

function initialsFromName(name: string | null, email: string | null): string {
  const source = (name || email || "?").trim();
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
  }
  return source.slice(0, 2).toUpperCase() || "?";
}

function avatarTone(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = (hash + userId.charCodeAt(i) * (i + 1)) % AVATAR_TONES.length;
  }
  return AVATAR_TONES[hash] ?? AVATAR_TONES[0];
}

function FieldIcon({ children }: { children: ReactNode }) {
  return (
    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
      {children}
    </span>
  );
}

function StatusBadge({ status }: { status: MembershipStatus }) {
  const active = status === "active";
  return (
    <Badge
      tone={active ? "success" : "warning"}
      className="gap-1.5 rounded-full px-2.5 capitalize"
    >
      <span
        className={cn(
          "h-1.5 w-1.5 shrink-0 rounded-full",
          active ? "bg-emerald-500" : "bg-amber-500",
        )}
        aria-hidden
      />
      {status}
    </Badge>
  );
}

function RenterActions({
  renter,
  canManage,
  onView,
  onEditUnavailable,
  onRequestRemove,
}: {
  renter: RenterRow;
  canManage: boolean;
  onView: (renter: RenterRow) => void;
  onEditUnavailable: () => void;
  onRequestRemove: (renter: RenterRow) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative inline-flex justify-end">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-9 w-9 shrink-0 border-border/80 p-0"
        aria-label={`Actions for ${renter.full_name || renter.email || "renter"}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <MoreVertical className="h-4 w-4" aria-hidden />
      </Button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 bottom-full z-30 mb-1.5 min-w-[10.5rem] overflow-hidden rounded-xl border border-border bg-card py-1 shadow-[0_8px_24px_rgba(11,31,58,0.12)] dark:shadow-none"
        >
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-foreground transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none"
            onClick={() => {
              setOpen(false);
              onView(renter);
            }}
          >
            <Eye className="h-4 w-4 opacity-70" aria-hidden />
            View
          </button>
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-foreground transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none"
            onClick={() => {
              setOpen(false);
              onEditUnavailable();
            }}
          >
            <Pencil className="h-4 w-4 opacity-70" aria-hidden />
            Edit
          </button>
          {canManage && (
            <button
              type="button"
              role="menuitem"
              className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-red-700 transition-colors hover:bg-red-50 focus-visible:bg-red-50 focus-visible:outline-none dark:text-red-300 dark:hover:bg-red-500/10 dark:focus-visible:bg-red-500/10"
              onClick={() => {
                setOpen(false);
                onRequestRemove(renter);
              }}
            >
              <Trash2 className="h-4 w-4 opacity-70" aria-hidden />
              Delete
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function ViewRenterDialog({
  renter,
  onClose,
}: {
  renter: RenterRow;
  onClose: () => void;
}) {
  const titleId = "view-renter-dialog-title";
  const name = renter.full_name || "Unnamed renter";

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-[0_16px_40px_rgba(11,31,58,0.18)] dark:shadow-none"
      >
        <div className="flex items-start gap-3">
          <div
            className={cn(
              "flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
              avatarTone(renter.user_id),
            )}
            aria-hidden
          >
            {initialsFromName(renter.full_name, renter.email)}
          </div>
          <div className="min-w-0">
            <h3 id={titleId} className="font-display text-lg font-bold text-foreground">
              {name}
            </h3>
            <p className="mt-0.5 text-sm text-muted-foreground">{renter.email || "No email on file"}</p>
          </div>
        </div>

        <dl className="mt-4 space-y-3 text-sm">
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Status
            </dt>
            <dd className="mt-1">
              <StatusBadge status={renter.membership_status} />
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              User ID
            </dt>
            <dd className="mt-1 break-all font-mono text-xs text-foreground">{renter.user_id}</dd>
          </div>
        </dl>

        <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
          Username, phone, and joined date are not returned by the current renter list. Assign this
          renter to a property from Properties when ready.
        </p>

        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="outline" autoFocus onClick={onClose}>
            Close
          </Button>
          <Link to="/app/landlord/properties" onClick={onClose}>
            <Button type="button">Go to properties</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

function RemoveRenterDialog({
  renter,
  removing,
  onCancel,
  onConfirm,
}: {
  renter: RenterRow;
  removing: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const titleId = "remove-renter-dialog-title";
  const descId = "remove-renter-dialog-desc";
  const label = renter.full_name || renter.email || "this renter";

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !removing) onCancel();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [removing, onCancel]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !removing) onCancel();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-[0_16px_40px_rgba(11,31,58,0.18)] dark:shadow-none"
      >
        <h3 id={titleId} className="font-display text-lg font-bold text-foreground">
          Remove renter?
        </h3>
        <p id={descId} className="mt-2 text-sm leading-relaxed text-muted-foreground">
          You are about to remove{" "}
          <span className="font-medium text-foreground">{label}</span> from this workspace. This
          disables their renter membership via the existing membership controls. It does not delete
          their Auth account.
        </p>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" disabled={removing} autoFocus onClick={onCancel}>
            Cancel
          </Button>
          <Button type="button" variant="destructive" disabled={removing} onClick={onConfirm}>
            {removing ? "Removing…" : "Delete"}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function InviteRenterPage() {
  const { activeMembership } = useAuth();
  const tenantId = activeMembership?.tenant_id;
  const role = activeMembership?.role ?? null;
  const canInvite = role === "landlord_admin";

  const [userId, setUserId] = useState("");
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  const [renters, setRenters] = useState<RenterRow[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [linking, setLinking] = useState(false);
  const [provisioning, setProvisioning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [viewing, setViewing] = useState<RenterRow | null>(null);
  const [pendingRemove, setPendingRemove] = useState<RenterRow | null>(null);
  const [removing, setRemoving] = useState(false);
  /** Synchronous guard — blocks double-submit before React re-renders. */
  const provisionInFlight = useRef(false);
  const removeInFlight = useRef(false);

  const loadRenters = async () => {
    if (!tenantId) return;
    setLoadingList(true);
    const { data, error: rpcErr } = await supabase.rpc("list_same_tenant_member_profiles", {
      p_tenant_id: tenantId,
    });
    setLoadingList(false);
    if (rpcErr) {
      setError(rpcErr.message);
      setRenters([]);
      return;
    }
    setRenters(
      ((data ?? []) as Array<{
        user_id: string;
        full_name: string | null;
        email: string | null;
        membership_status: MembershipStatus;
      }>).map((r) => ({
        user_id: r.user_id,
        full_name: r.full_name,
        email: r.email,
        membership_status: r.membership_status,
      })),
    );
  };

  useEffect(() => {
    void loadRenters();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  const filteredRenters = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return renters.filter((row) => {
      if (statusFilter !== "all" && row.membership_status !== statusFilter) {
        return false;
      }
      if (!q) return true;
      const name = (row.full_name || "").toLowerCase();
      const mail = (row.email || "").toLowerCase();
      return name.includes(q) || mail.includes(q);
    });
  }, [renters, searchQuery, statusFilter]);

  const emptyBecauseFilters =
    renters.length > 0 &&
    filteredRenters.length === 0 &&
    (searchQuery.trim().length > 0 || statusFilter !== "all");

  if (!tenantId || activeMembership?.tenant.tenant_type !== "landlord") {
    return (
      <div className="rounded-2xl border border-border bg-card p-8 text-sm text-muted-foreground">
        Switch to a landlord workspace membership to invite renters.
      </div>
    );
  }

  const onProvision = async (e: FormEvent) => {
    e.preventDefault();
    if (provisionInFlight.current) return;

    setError(null);
    setMessage(null);

    const validated = validateProvisionRenterInput({
      tenantId,
      role,
      fullNameRaw: fullName,
      usernameRaw: username,
      emailRaw: email,
      phoneRaw: phone,
    });
    if (!validated.ok) {
      setError(validated.error);
      return;
    }

    provisionInFlight.current = true;
    setProvisioning(true);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke("provision-renter", {
        body: {
          tenant_id: validated.tenantId,
          full_name: validated.fullName,
          username: validated.username,
          email: validated.email,
          phone: validated.phone,
        },
      });

      let body: unknown = data;
      const hasStructuredBody =
        !!body &&
        typeof body === "object" &&
        ("error" in body || "ok" in body);
      // Prefer structured function JSON (including non-2xx bodies) over the generic invoke error.
      if (!hasStructuredBody && fnErr) {
        const ctx = (fnErr as { context?: Response }).context;
        if (ctx) {
          try {
            body = await ctx.json();
          } catch {
            body = { error: fnErr.message };
          }
        } else {
          body = { error: fnErr.message };
        }
      }

      const parsed = parseProvisionRenterResponse(body, fnErr?.message);

      if (!parsed.ok) {
        setError(parsed.error);
        return;
      }

      setMessage(
        parsed.message ??
          "Renter provisioned. They must complete activation from their email before signing in.",
      );
      setFullName("");
      setUsername("");
      setEmail("");
      setPhone("");
      await loadRenters();
    } finally {
      provisionInFlight.current = false;
      setProvisioning(false);
    }
  };

  const onLinkExisting = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);

    const validated = validateInviteRenterInput({
      tenantId,
      userIdRaw: userId,
      role,
      existingRenterIds: renters.map((r) => r.user_id),
    });
    if (!validated.ok) {
      setError(validated.error);
      return;
    }

    setLinking(true);
    const { error: rpcErr } = await supabase.rpc("manage_membership", {
      p_tenant_id: validated.tenantId,
      p_user_id: validated.userId,
      p_role: "renter",
      p_status: "active",
    });
    setLinking(false);

    if (rpcErr) {
      setError(rpcErr.message);
      return;
    }

    setMessage("Renter membership saved. You can assign them to a property next.");
    setUserId("");
    await loadRenters();
  };

  const onEditUnavailable = () => {
    setMessage(null);
    setError(
      "Editing renter profile fields is not available from this page. Username and contact details are managed at provision time or by the renter on their Account page.",
    );
  };

  const confirmRemove = async () => {
    if (!pendingRemove || !tenantId || removeInFlight.current) return;
    if (!canInvite) {
      setPendingRemove(null);
      setError("Only a landlord admin can remove renters from this workspace.");
      return;
    }

    removeInFlight.current = true;
    setRemoving(true);
    setError(null);
    setMessage(null);

    const { error: rpcErr } = await supabase.rpc("manage_membership", {
      p_tenant_id: tenantId,
      p_user_id: pendingRemove.user_id,
      p_role: "renter",
      p_status: "disabled",
    });

    removeInFlight.current = false;
    setRemoving(false);

    if (rpcErr) {
      setError(rpcErr.message);
      return;
    }

    setPendingRemove(null);
    setMessage("Renter membership disabled for this workspace.");
    await loadRenters();
  };

  return (
    <div className="relative space-y-5 sm:space-y-6">
      {/* Lightweight housing accent (CSS only; no new assets) */}
      <div
        className="pointer-events-none absolute -right-2 -top-1 hidden h-28 w-40 opacity-[0.14] sm:block"
        aria-hidden
      >
        <svg viewBox="0 0 160 112" fill="none" className="h-full w-full text-brand-blue">
          <path
            d="M18 78 L48 48 L78 78 V98 H18 Z"
            stroke="currentColor"
            strokeWidth="2"
            fill="currentColor"
            fillOpacity="0.12"
          />
          <path
            d="M62 70 L98 38 L134 70 V98 H62 Z"
            stroke="currentColor"
            strokeWidth="2"
            fill="currentColor"
            fillOpacity="0.08"
          />
          <circle cx="128" cy="34" r="18" fill="currentColor" fillOpacity="0.2" />
          <path
            d="M120 38 L128 30 L136 38 V44 H120 Z"
            stroke="white"
            strokeWidth="1.5"
            fill="white"
            fillOpacity="0.9"
          />
        </svg>
      </div>

      <div className="relative min-w-0">
        <h2 className="font-display text-2xl font-bold tracking-tight text-foreground sm:text-[1.75rem]">
          Invite renter
        </h2>
        <p className="mt-1 text-sm font-medium text-muted-foreground">
          {activeMembership.tenant.name}
          <span className="text-muted-foreground/70"> · isolated tenant</span>
        </p>
        <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Add a <code className="rounded bg-muted px-1 py-0.5 text-xs text-foreground">renter</code>{" "}
          on{" "}
          <span className="font-medium text-foreground">{activeMembership.tenant.name}</span>{" "}
          only. Assignment to a property is a separate step. Login stays email + password; username
          is unique within this landlord. Self-serve applications are reviewed under{" "}
          <Link
            to="/app/landlord/applications"
            className="rounded-md font-medium text-brand-blue hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Applications
          </Link>
          .
        </p>
      </div>

      {!canInvite && (
        <div
          role="alert"
          className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200"
        >
          Landlord staff can view renters here, but only a landlord admin can invite.
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300"
        >
          {error}
        </div>
      )}
      {message && (
        <div
          role="status"
          className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300"
        >
          {message}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2 lg:gap-5">
        {/* Card A — Provision new renter */}
        <form
          onSubmit={(e) => void onProvision(e)}
          className="rounded-2xl border border-border/80 bg-card p-4 shadow-[0_2px_8px_rgba(11,31,58,0.05)] sm:p-5 dark:shadow-none"
          aria-busy={provisioning}
        >
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300">
              <UserPlus className="h-4 w-4" aria-hidden />
            </div>
            <div className="min-w-0">
              <h3 className="font-display text-sm font-semibold tracking-tight text-foreground">
                Provision new renter
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Creates an Auth invite (no password chosen here). Existing Auth emails are refused —
                use Link Existing User instead. Activation links are never shown in this UI.
              </p>
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor="renter-full-name">Full name</Label>
              <div className="relative mt-1.5">
                <FieldIcon>
                  <User className="h-4 w-4" aria-hidden />
                </FieldIcon>
                <Input
                  id="renter-full-name"
                  name="fullName"
                  className="pl-9"
                  required
                  disabled={!canInvite || provisioning}
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Enter full name"
                  autoComplete="name"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="renter-username">Username</Label>
              <div className="relative mt-1.5">
                <FieldIcon>
                  <User className="h-4 w-4" aria-hidden />
                </FieldIcon>
                <Input
                  id="renter-username"
                  name="username"
                  className="pl-9"
                  required
                  disabled={!canInvite || provisioning}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="e.g. jane_doe"
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>
            </div>
            <div>
              <Label htmlFor="renter-phone">Phone</Label>
              <div className="relative mt-1.5">
                <FieldIcon>
                  <Phone className="h-4 w-4" aria-hidden />
                </FieldIcon>
                <Input
                  id="renter-phone"
                  name="phone"
                  className="pl-9"
                  required
                  disabled={!canInvite || provisioning}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+252..."
                  autoComplete="tel"
                />
              </div>
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="renter-email">Email</Label>
              <div className="relative mt-1.5">
                <FieldIcon>
                  <Mail className="h-4 w-4" aria-hidden />
                </FieldIcon>
                <Input
                  id="renter-email"
                  name="email"
                  type="email"
                  className="pl-9"
                  required
                  disabled={!canInvite || provisioning}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter email address"
                  autoComplete="email"
                />
              </div>
            </div>
          </div>

          <Button
            type="submit"
            disabled={!canInvite || provisioning}
            className="mt-4 min-h-10 w-full sm:w-auto"
          >
            <Send className="h-4 w-4" aria-hidden />
            {provisioning ? "Provisioning…" : "Provision renter"}
          </Button>
        </form>

        {/* Card B — Link existing user */}
        <form
          onSubmit={(e) => void onLinkExisting(e)}
          className="flex flex-col rounded-2xl border border-border/80 bg-card p-4 shadow-[0_2px_8px_rgba(11,31,58,0.05)] sm:p-5 dark:shadow-none"
          aria-busy={linking}
        >
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-green/10 text-brand-green dark:bg-brand-green/20">
              <Link2 className="h-4 w-4" aria-hidden />
            </div>
            <div className="min-w-0">
              <h3 className="font-display text-sm font-semibold tracking-tight text-foreground">
                Link existing user
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                The renter must already have signed up. Paste the user ID from their Account page.
                Email lookup is reserved for Super Admin; this uses{" "}
                <code className="rounded bg-muted px-1 py-0.5 text-[11px] text-foreground">
                  manage_membership
                </code>{" "}
                on your active tenant.
              </p>
            </div>
          </div>

          <div className="mt-4 flex-1">
            <Label htmlFor="renter-user-id">Renter user ID</Label>
            <div className="relative mt-1.5">
              <FieldIcon>
                <Link2 className="h-4 w-4" aria-hidden />
              </FieldIcon>
              <Input
                id="renter-user-id"
                name="userId"
                className="pl-9 font-mono text-[13px]"
                required
                disabled={!canInvite || linking}
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                placeholder="XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX"
                autoComplete="off"
                spellCheck={false}
              />
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <Button
              type="submit"
              disabled={!canInvite || linking}
              className="min-h-10 w-full sm:w-auto"
            >
              <Link2 className="h-4 w-4" aria-hidden />
              {linking ? "Linking…" : "Link existing user"}
            </Button>
            <Link to="/app/landlord/properties" className="w-full sm:w-auto">
              <Button type="button" variant="outline" className="min-h-10 w-full sm:w-auto">
                <Building2 className="h-4 w-4" aria-hidden />
                Go to properties
              </Button>
            </Link>
          </div>
        </form>
      </div>

      <section className="rounded-2xl border border-border/80 bg-card shadow-[0_2px_8px_rgba(11,31,58,0.05)] dark:shadow-none">
        <div className="border-b border-border/80 px-4 py-3.5 sm:px-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-navy/10 text-brand-navy dark:bg-brand-blue/20 dark:text-brand-water">
                <Users className="h-4 w-4" aria-hidden />
              </div>
              <div className="min-w-0">
                <h3 className="font-display text-sm font-semibold tracking-tight text-foreground">
                  Active renters on this workspace
                </h3>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Renters already linked to {activeMembership.tenant.name}. Assign properties
                  separately.
                </p>
              </div>
            </div>
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
              <label className="relative block min-w-0 flex-1 sm:w-56">
                <span className="sr-only">Search renters</span>
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
                <Input
                  placeholder="Search name or email…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  aria-label="Search renters by name or email"
                  className="h-10 pl-9"
                  disabled={loadingList}
                />
              </label>
              <Select
                aria-label="Filter by status"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                className="h-10 sm:w-40"
                disabled={loadingList}
              >
                <option value="all">All statuses</option>
                <option value="active">Active</option>
                <option value="disabled">Disabled</option>
              </Select>
            </div>
          </div>
        </div>

        {loadingList ? (
          <div
            className="px-4 py-12 text-center text-sm text-muted-foreground sm:px-5"
            aria-live="polite"
          >
            Loading renters…
          </div>
        ) : renters.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-navy/8 text-brand-navy dark:bg-brand-blue/15 dark:text-brand-water">
              <Users className="h-5 w-5" aria-hidden />
            </div>
            <p className="mt-4 text-sm font-medium text-foreground">No active renters yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Provision a new renter or link an existing user above.
            </p>
          </div>
        ) : emptyBecauseFilters ? (
          <div className="px-6 py-12 text-center">
            <p className="text-sm font-medium text-foreground">No renters match your filters</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Try adjusting search or status to see more renters.
            </p>
          </div>
        ) : (
          <>
            {/* Desktop / tablet table — overflow only on scroll wrapper so menus aren’t clipped */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[640px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-border/80 bg-muted/30 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-3 font-semibold sm:px-5">Name</th>
                    <th className="px-4 py-3 font-semibold sm:px-5">Email</th>
                    <th className="px-4 py-3 font-semibold sm:px-5">Status</th>
                    <th className="px-4 py-3 text-right font-semibold sm:px-5">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/80">
                  {filteredRenters.map((r) => (
                    <tr key={r.user_id} className="transition-colors hover:bg-muted/40">
                      <td className="px-4 py-3.5 sm:px-5">
                        <div className="flex min-w-0 items-center gap-3">
                          <div
                            className={cn(
                              "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                              avatarTone(r.user_id),
                            )}
                            aria-hidden
                          >
                            {initialsFromName(r.full_name, r.email)}
                          </div>
                          <span className="truncate font-medium text-foreground">
                            {r.full_name || "—"}
                          </span>
                        </div>
                      </td>
                      <td className="max-w-[260px] truncate px-4 py-3.5 text-muted-foreground sm:px-5">
                        {r.email || "—"}
                      </td>
                      <td className="px-4 py-3.5 sm:px-5">
                        <StatusBadge status={r.membership_status} />
                      </td>
                      <td className="px-4 py-3.5 text-right sm:px-5">
                        <RenterActions
                          renter={r}
                          canManage={canInvite}
                          onView={setViewing}
                          onEditUnavailable={onEditUnavailable}
                          onRequestRemove={setPendingRemove}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile renter cards */}
            <ul className="divide-y divide-border/80 md:hidden">
              {filteredRenters.map((r) => (
                <li key={r.user_id} className="px-4 py-4">
                  <div className="flex items-start gap-3">
                    <div
                      className={cn(
                        "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                        avatarTone(r.user_id),
                      )}
                      aria-hidden
                    >
                      {initialsFromName(r.full_name, r.email)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="truncate font-medium text-foreground">
                              {r.full_name || "—"}
                            </p>
                            <StatusBadge status={r.membership_status} />
                          </div>
                          <p className="mt-0.5 truncate text-sm text-muted-foreground">
                            {r.email || "—"}
                          </p>
                        </div>
                        <RenterActions
                          renter={r}
                          canManage={canInvite}
                          onView={setViewing}
                          onEditUnavailable={onEditUnavailable}
                          onRequestRemove={setPendingRemove}
                        />
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      {viewing && <ViewRenterDialog renter={viewing} onClose={() => setViewing(null)} />}
      {pendingRemove && (
        <RemoveRenterDialog
          renter={pendingRemove}
          removing={removing}
          onCancel={() => {
            if (!removing) setPendingRemove(null);
          }}
          onConfirm={() => void confirmRemove()}
        />
      )}
    </div>
  );
}
