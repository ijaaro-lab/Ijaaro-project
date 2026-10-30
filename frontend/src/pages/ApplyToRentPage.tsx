import { useEffect, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { friendlyAuthError } from "@/components/landing/LandingLoginCard";
import { money } from "@/lib/format";
import { buildApplySignupEmailRedirectTo } from "@/lib/signupEmailRedirect";
import { supabase } from "@/lib/supabase";
import { readTenantSlugFromHost, withTenantSearch } from "@/lib/tenant";
import { validateUsernameInput } from "@/lib/username";
import type { LandlordPublicListing } from "@/types/database";

export function ApplyToRentPage() {
  const [params] = useSearchParams();
  const tenantKey =
    params.get("tenant")?.trim().toLowerCase() || readTenantSlugFromHost() || "";
  const propertyId = params.get("property")?.trim() || "";

  const { session, loading: authLoading, signIn, signUp, user } = useAuth();

  const [listing, setListing] = useState<LandlordPublicListing | null>(null);
  const [listingError, setListingError] = useState<string | null>(null);
  const [listingLoading, setListingLoading] = useState(true);

  const [mode, setMode] = useState<"signin" | "signup">("signup");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [message, setMessage] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!tenantKey || !propertyId) {
      setListingLoading(false);
      setListingError("Missing workspace or property.");
      return;
    }
    let cancelled = false;
    (async () => {
      setListingLoading(true);
      const { data, error } = await supabase.rpc("get_landlord_public_listing", {
        p_tenant_key: tenantKey,
        p_property_id: propertyId,
      });
      if (cancelled) return;
      if (error) {
        setListingError(error.message);
        setListing(null);
      } else {
        const row = (data as LandlordPublicListing[] | null)?.[0] ?? null;
        setListing(row);
        setListingError(row ? null : "This property is not available for applications.");
      }
      setListingLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [tenantKey, propertyId]);

  const ensureSession = async (): Promise<boolean> => {
    setAuthError(null);
    if (session) return true;

    if (mode === "signin") {
      const { error } = await signIn(email.trim(), password);
      if (error) {
        setAuthError(friendlyAuthError(error));
        return false;
      }
      return true;
    }

    const name = fullName.trim();
    if (!name) {
      setAuthError("Enter your full name.");
      return false;
    }
    const emailRedirectTo = buildApplySignupEmailRedirectTo(
      window.location.origin,
      tenantKey,
      propertyId,
    );
    const { error, needsConfirmation } = await signUp(
      email.trim(),
      password,
      name,
      emailRedirectTo ? { emailRedirectTo } : undefined,
    );
    if (error) {
      setAuthError(friendlyAuthError(error));
      return false;
    }
    if (needsConfirmation) {
      setAuthError(
        "Check your email to confirm the account, then return here to sign in and submit your application.",
      );
      setMode("signin");
      return false;
    }
    return true;
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSuccess(null);

    if (!tenantKey || !propertyId) {
      setFormError("Missing workspace or property.");
      return;
    }

    const usernameResult = validateUsernameInput(username);
    if (!usernameResult.ok) {
      setFormError(usernameResult.error);
      return;
    }

    setSubmitting(true);
    try {
      const ok = await ensureSession();
      if (!ok) return;

      const { data: available, error: availErr } = await supabase.rpc(
        "check_landlord_username_available",
        {
          p_tenant_key: tenantKey,
          p_username: usernameResult.username,
        },
      );
      if (availErr) {
        setFormError(availErr.message);
        return;
      }
      if (available === false) {
        setFormError("That username is already taken for this landlord.");
        return;
      }

      const { error: submitErr } = await supabase.rpc("submit_rental_application", {
        p_tenant_key: tenantKey,
        p_property_id: propertyId,
        p_requested_username: usernameResult.username,
        p_message: message.trim() || null,
      });

      if (submitErr) {
        const msg = submitErr.message || "Application failed.";
        if (/duplicate|23505|username/i.test(msg)) {
          setFormError(
            "Could not submit — username conflict or you already have a pending application for this property.",
          );
        } else {
          setFormError(msg);
        }
        return;
      }

      setSuccess(
        "Application submitted and pending landlord review. You do not have private renter access until accepted.",
      );
      setMessage("");
    } finally {
      setSubmitting(false);
    }
  };

  if (!tenantKey) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-sm text-muted-foreground">
        Open this page from a landlord workspace subdomain (or local{" "}
        <code className="text-foreground">?tenant=</code>).
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-10 sm:px-6">
      <Link
        to={withTenantSearch("/", tenantKey)}
        className="text-sm text-brand-blue hover:underline"
      >
        ← Back to workspace
      </Link>
      <h1 className="mt-4 font-display text-2xl font-bold text-foreground">Apply to rent</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Create or sign in to an account, choose a username for this landlord, and submit a request.
        Access stays pending until the landlord accepts.
      </p>

      {listingLoading && (
        <p className="mt-6 text-sm text-muted-foreground">Loading property…</p>
      )}
      {listingError && (
        <div className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {listingError}
        </div>
      )}
      {listing && (
        <div className="mt-6 rounded-xl border border-border bg-card p-4 text-sm">
          <div className="font-medium text-foreground">{listing.name || "Property"}</div>
          <div className="text-muted-foreground">{listing.address_line}</div>
          <div className="mt-2">
            {listing.rent_amount != null
              ? money(listing.rent_amount, listing.currency)
              : "Rent on request"}
          </div>
        </div>
      )}

      {success ? (
        <div className="mt-6 space-y-3">
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            {success}
          </div>
          <Link
            to={withTenantSearch("/my-applications", tenantKey)}
            className="text-sm text-brand-blue hover:underline"
          >
            View my applications →
          </Link>
        </div>
      ) : (
        listing &&
        !listingError && (
          <form className="mt-6 space-y-4" onSubmit={(e) => void onSubmit(e)}>
            {!user && !authLoading && (
              <div className="rounded-xl border border-border bg-card p-4 space-y-3">
                <div className="flex gap-2 text-sm">
                  <button
                    type="button"
                    className={mode === "signup" ? "font-semibold underline" : "text-muted-foreground"}
                    onClick={() => setMode("signup")}
                  >
                    Register
                  </button>
                  <span className="text-muted-foreground">·</span>
                  <button
                    type="button"
                    className={mode === "signin" ? "font-semibold underline" : "text-muted-foreground"}
                    onClick={() => setMode("signin")}
                  >
                    Sign in
                  </button>
                </div>
                {mode === "signup" && (
                  <div>
                    <Label htmlFor="apply-name">Full name</Label>
                    <Input
                      id="apply-name"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      autoComplete="name"
                      required
                    />
                  </div>
                )}
                <div>
                  <Label htmlFor="apply-email">Email</Label>
                  <Input
                    id="apply-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="apply-password">Password</Label>
                  <Input
                    id="apply-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete={mode === "signup" ? "new-password" : "current-password"}
                    required
                    minLength={8}
                  />
                </div>
                {authError && (
                  <p className="text-sm text-red-600">{authError}</p>
                )}
              </div>
            )}

            {user && (
              <p className="text-sm text-muted-foreground">
                Signed in. Your application will be linked to this account.
              </p>
            )}

            <div>
              <Label htmlFor="apply-username">Username for this landlord</Label>
              <Input
                id="apply-username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                required
                placeholder="abdirahman"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Unique within this landlord only. Login remains email + password.
              </p>
            </div>

            <div>
              <Label htmlFor="apply-message">Message (optional)</Label>
              <textarea
                id="apply-message"
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                rows={3}
                maxLength={2000}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
            </div>

            {formError && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {formError}
              </div>
            )}

            <Button type="submit" disabled={submitting || authLoading}>
              {submitting ? "Submitting…" : "Submit application"}
            </Button>
          </form>
        )
      )}
    </div>
  );
}
