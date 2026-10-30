import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, ClipboardList, MapPin } from "lucide-react";
import { useAuth } from "@/auth/AuthProvider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { friendlyAuthError } from "@/components/landing/LandingLoginCard";
import { resolveMyApplicationsRenterDestination } from "@/lib/myApplicationsNav";
import { statusTone } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import { readTenantSlugFromHost, withTenantSearch } from "@/lib/tenant";
import type { MyRentalApplicationRow } from "@/types/database";

export function MyApplicationsPage() {
  const [params] = useSearchParams();
  const tenantKey =
    params.get("tenant")?.trim().toLowerCase() || readTenantSlugFromHost() || "";
  const navigate = useNavigate();
  const {
    session,
    loading: authLoading,
    signIn,
    user,
    memberships,
    refreshMemberships,
    setActiveMembershipId,
  } = useAuth();

  const [rows, setRows] = useState<MyRentalApplicationRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);

  const renterDestination = useMemo(
    () => resolveMyApplicationsRenterDestination(memberships, tenantKey),
    [memberships, tenantKey],
  );

  const browseListingsHref = tenantKey
    ? withTenantSearch("/#available-homes", tenantKey)
    : "/";

  const load = async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase.rpc("list_my_rental_applications", {
      p_tenant_key: tenantKey || null,
    });
    setLoading(false);
    if (err) {
      setError(err.message);
      setRows([]);
      return;
    }
    setRows((data as MyRentalApplicationRow[] | null) ?? []);
  };

  useEffect(() => {
    if (user) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, tenantKey]);

  const onSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setSigningIn(true);
    const { error: err } = await signIn(email.trim(), password);
    if (err) {
      setSigningIn(false);
      setAuthError(friendlyAuthError(err));
      return;
    }

    const rowsNow = await refreshMemberships();
    const dest = resolveMyApplicationsRenterDestination(rowsNow, tenantKey);
    setSigningIn(false);
    if (dest) {
      setActiveMembershipId(dest.membershipId);
      navigate(dest.path, { replace: true });
    }
    // Pending/rejected (no active renter membership): stay here and show applications.
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
        {tenantKey ? (
          <Link
            to={withTenantSearch("/", tenantKey)}
            className="inline-flex items-center gap-1.5 rounded-md text-sm font-medium text-brand-blue hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Back to workspace
          </Link>
        ) : (
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 rounded-md text-sm font-medium text-brand-blue hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Home
          </Link>
        )}

        <header className="mt-6 space-y-2">
          <h1 className="font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            My Rental Applications
          </h1>
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
            Review the rental applications you have submitted and check for status updates from the
            property manager. Pending and rejected requests do not unlock the renter dashboard.
            After acceptance, sign in here to open your renter workspace. Assignment to a property
            is a separate landlord step.
          </p>
        </header>

        {authLoading && (
          <p className="mt-8 text-sm text-muted-foreground" aria-live="polite">
            Checking session…
          </p>
        )}

        {!authLoading && !session && (
          <form
            className="mt-8 space-y-4 rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6"
            onSubmit={(e) => void onSignIn(e)}
          >
            <div>
              <h2 className="font-display text-lg font-semibold text-foreground">Sign in</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Sign in to view your application status.
              </p>
            </div>
            <div>
              <Label htmlFor="apps-email">Email</Label>
              <Input
                id="apps-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="apps-password">Password</Label>
              <Input
                id="apps-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="mt-1.5"
              />
            </div>
            {authError && (
              <p className="text-sm text-red-600" role="alert">
                {authError}
              </p>
            )}
            <Button type="submit" disabled={signingIn} className="h-11 w-full sm:w-auto">
              {signingIn ? "Signing in…" : "Sign in"}
            </Button>
          </form>
        )}

        {session && (
          <div className="mt-8 space-y-4">
            {loading && (
              <p className="text-sm text-muted-foreground" aria-live="polite">
                Loading…
              </p>
            )}
            {error && (
              <div
                className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
                role="alert"
              >
                {error}
              </div>
            )}

            {!loading && rows.length === 0 && (
              <div
                className="rounded-2xl border border-dashed border-border bg-card/60 px-5 py-10 text-center sm:px-8"
                data-testid="applications-empty-state"
              >
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <ClipboardList className="h-6 w-6" aria-hidden />
                </div>
                <h2 className="mt-4 font-display text-xl font-semibold text-foreground">
                  You haven’t submitted any rental applications yet
                </h2>
                <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
                  Browse available properties for this landlord, then apply when you find a home that
                  fits. You can return here anytime to track your application status.
                </p>
                <Link
                  to={browseListingsHref}
                  className="mt-6 inline-flex focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <Button type="button" className="h-11 px-5 font-semibold">
                    Browse Available Properties
                  </Button>
                </Link>
              </div>
            )}

            {!loading && rows.length > 0 && (
              <ul className="space-y-3" aria-label="Your rental applications">
                {rows.map((r) => {
                  const loc = [r.property_district, r.property_city]
                    .filter(Boolean)
                    .join(", ");
                  return (
                    <li key={r.id}>
                      <article className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0 space-y-1.5">
                            <div className="flex flex-wrap items-center gap-2">
                              <h2 className="font-display text-lg font-semibold text-foreground">
                                {r.property_name || "Property"}
                              </h2>
                              <Badge tone={statusTone(r.status)} className="capitalize">
                                {r.status}
                              </Badge>
                            </div>
                            <p className="text-sm text-muted-foreground">
                              Requested username{" "}
                              <span className="font-medium text-foreground">
                                @{r.requested_username}
                              </span>
                            </p>
                            {loc ? (
                              <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
                                <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                                <span>{loc}</span>
                              </p>
                            ) : null}
                            <p className="text-xs text-muted-foreground">
                              Submitted {new Date(r.created_at).toLocaleString()}
                            </p>
                          </div>
                          <div className="flex shrink-0 flex-wrap gap-2 sm:flex-col sm:items-end">
                            {r.status === "rejected" && tenantKey && (
                              <Link
                                to={withTenantSearch(
                                  `/apply?property=${encodeURIComponent(r.property_id)}`,
                                  tenantKey,
                                )}
                                className="inline-flex focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                              >
                                <Button type="button" size="sm" variant="outline">
                                  Reapply
                                </Button>
                              </Link>
                            )}
                            {r.status === "accepted" && renterDestination && (
                              <Link
                                to={renterDestination.path}
                                className="inline-flex focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                              >
                                <Button type="button" size="sm">
                                  Open portal
                                </Button>
                              </Link>
                            )}
                          </div>
                        </div>
                      </article>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
