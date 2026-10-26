import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { validatePasswordPair } from "@/lib/passwordForm";
import {
  resolveSetPasswordSuccessLoginPath,
  type MembershipForLoginRedirect,
} from "@/lib/setPasswordLoginRedirect";
import { supabase } from "@/lib/supabase";

/**
 * Activation / set-password page for Supabase Auth invite redirects.
 * Relies on existing client `detectSessionInUrl` — no custom token flow.
 *
 * After a successful password save, redirects to workspace login when the
 * invite session has an unambiguous non-platform membership; otherwise `/login`.
 */
export function SetPasswordPage() {
  const { session, loading, signOut, refreshMemberships } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    const validated = validatePasswordPair(password, confirm);
    if (!validated.ok) {
      setError(validated.error);
      return;
    }

    if (!session) {
      setError("This activation link is invalid or has expired. Ask your landlord to provision again.");
      return;
    }

    setSubmitting(true);
    const { error: updateErr } = await supabase.auth.updateUser({
      password: validated.password,
    });

    if (updateErr) {
      setSubmitting(false);
      setError(updateErr.message);
      return;
    }

    // Resolve workspace while the invite session is still authenticated.
    let membershipRows: MembershipForLoginRedirect[] = [];
    try {
      membershipRows = await refreshMemberships(session.user.id);
    } catch {
      membershipRows = [];
    }

    const loginPath = resolveSetPasswordSuccessLoginPath({
      memberships: membershipRows,
      preferredTenantHint: params.get("tenant"),
    });

    setPassword("");
    setConfirm("");
    await signOut();
    setSubmitting(false);
    navigate(loginPath, {
      replace: true,
      state: { notice: "Password saved. Sign in with your email and new password." },
    });
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">
        Checking activation session…
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-6 rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">Set your password</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Choose a password for your IJAARO account. Sign-in uses your email, not your username.
          </p>
        </div>

        {!session && (
          <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            This activation link is invalid or has expired. Open the link from your invite email, or ask
            your landlord to provision again.
          </p>
        )}

        <form onSubmit={(e) => void onSubmit(e)} className="space-y-4" aria-busy={submitting}>
          <div>
            <Label htmlFor="new-password">New password</Label>
            <Input
              id="new-password"
              name="password"
              type="password"
              autoComplete="new-password"
              required
              disabled={!session || submitting}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="confirm-password">Confirm password</Label>
            <Input
              id="confirm-password"
              name="confirm"
              type="password"
              autoComplete="new-password"
              required
              disabled={!session || submitting}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </div>
          {error && (
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
          )}
          <Button type="submit" disabled={!session || submitting} className="w-full">
            {submitting ? "Saving…" : "Save password"}
          </Button>
        </form>

        <p className="text-center text-xs text-muted-foreground">
          Already activated?{" "}
          <Link to="/login" className="text-foreground underline-offset-2 hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
