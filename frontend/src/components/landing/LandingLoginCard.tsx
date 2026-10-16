import { useState, type FormEvent, type ReactNode } from "react";
import {
  AlertCircle,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  LogIn,
  Mail,
  ShieldCheck,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { isSupabaseConfigured } from "@/lib/supabase";
import { cn } from "@/lib/utils";

type Props = {
  accent: string;
  email: string;
  password: string;
  error: string | null;
  submitting: boolean;
  onEmail: (v: string) => void;
  onPassword: (v: string) => void;
  onSubmit: (e: FormEvent) => void;
  displayName: string;
  /** When set, show logo only (no tenant name). */
  logoUrl?: string | null;
  className?: string;
  tone?: "light" | "dark";
  footer?: ReactNode;
  onClose?: () => void;
  closeDisabled?: boolean;
};

/** Map raw auth/API messages to short, visible user copy. */
export function friendlyAuthError(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const msg = raw.trim();
  if (!msg) return null;
  const lower = msg.toLowerCase();

  if (
    lower.includes("invalid login") ||
    lower.includes("invalid credentials") ||
    lower.includes("email or password") ||
    lower.includes("invalid email or password")
  ) {
    return "Invalid email or password. Please check your credentials and try again.";
  }
  if (
    lower.includes("not registered") ||
    lower.includes("another organization") ||
    lower.includes("super admin cannot") ||
    lower.includes("no active membership") ||
    lower.includes("only this organization") ||
    lower.includes("only “") ||
    lower.includes('only "')
  ) {
    return "This account is not registered.";
  }
  if (lower.includes("email not confirmed") || lower.includes("not confirmed")) {
    return "Confirm your email before signing in.";
  }
  if (lower.includes("rate limit") || lower.includes("too many")) {
    return "Too many attempts. Wait a moment, then try again.";
  }
  if (lower.includes("network") || lower.includes("fetch")) {
    return "Network error. Check your connection and try again.";
  }
  return msg;
}

export function LandingLoginCard({
  accent,
  email,
  password,
  error,
  submitting,
  onEmail,
  onPassword,
  onSubmit,
  displayName,
  logoUrl,
  className,
  tone = "light",
  footer,
  onClose,
  closeDisabled,
}: Props) {
  const dark = tone === "dark";
  const [showPassword, setShowPassword] = useState(false);
  const visibleError = friendlyAuthError(error);
  const hasLogo = Boolean(logoUrl?.trim());
  const inputClass = cn(
    "h-11 rounded-xl pl-10 text-[13px] text-slate-900 shadow-none placeholder:text-slate-400 focus-visible:ring-2 focus-visible:ring-[var(--portal-accent)] focus-visible:ring-offset-0",
    dark
      ? "border-transparent bg-white"
      : "border border-[#d8e2ec] bg-[#f7f9fc]",
  );

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-[1.35rem] border backdrop-blur-md",
        dark
          ? "border-white/10 bg-[#0c1628]/92 text-white shadow-[0_0_0_1px_rgba(59,130,246,0.18),0_24px_60px_-20px_rgba(0,0,0,0.65)]"
          : "border-[#dce6f0] bg-white text-[#0b1f3a] shadow-[0_24px_50px_-24px_rgba(11,31,58,0.35)]",
        className,
      )}
    >
      {onClose ? (
        <button
          type="button"
          className={cn(
            "absolute right-3.5 top-3.5 z-10 flex h-8 w-8 items-center justify-center rounded-md transition-colors",
            dark
              ? "text-white/45 hover:bg-white/10 hover:text-white"
              : "text-muted-foreground hover:bg-black/5 hover:text-foreground",
          )}
          aria-label="Close sign-in"
          disabled={closeDisabled}
          onClick={onClose}
        >
          <X className="h-4 w-4" strokeWidth={2} />
        </button>
      ) : null}

      <div className="px-6 pb-6 pt-7 sm:px-8 sm:pb-7 sm:pt-8">
        <div className="mb-6 text-center">
          {hasLogo ? (
            <div
              className={cn(
                "mx-auto mb-4 flex h-[4.5rem] w-[4.5rem] items-center justify-center rounded-2xl p-2 shadow-sm",
                dark ? "bg-white" : "bg-white ring-1 ring-[#e8eef4]",
              )}
            >
              <img
                src={logoUrl!}
                alt={displayName}
                className="h-full w-full object-contain"
              />
            </div>
          ) : (
            <p
              className={cn(
                "mb-3 font-display text-[1.25rem] font-bold tracking-tight",
                dark ? "text-white" : "text-[#0b1f3a]",
              )}
            >
              {displayName}
            </p>
          )}

          <h2
            className={cn(
              "text-[1.2rem] font-bold tracking-tight sm:text-[1.3rem]",
              dark ? "text-white" : "text-[#0b1f3a]",
            )}
          >
            Sign in to your portal
          </h2>
          <p
            className={cn(
              "mt-2 inline-flex items-center justify-center gap-1.5 text-[13px]",
              dark ? "text-white/55" : "text-muted-foreground",
            )}
          >
            <ShieldCheck
              className="h-3.5 w-3.5 shrink-0"
              style={{ color: accent }}
              aria-hidden
            />
            Only this institution&apos;s accounts.
          </p>
        </div>

        {!isSupabaseConfigured && (
          <div
            role="alert"
            className={cn(
              "mb-3 rounded-xl border px-3 py-2 text-xs",
              dark
                ? "border-amber-300/30 bg-amber-400/10 text-amber-50"
                : "border-amber-200 bg-amber-50 text-amber-900",
            )}
          >
            Configure Supabase environment variables before signing in.
          </div>
        )}

        <form className="space-y-4" onSubmit={onSubmit} noValidate={false}>
          <div>
            <label
              className={cn(
                "mb-1.5 block text-[13px] font-medium",
                dark ? "text-white/70" : "text-[#334155]",
              )}
              htmlFor="tenant-email"
            >
              Email
            </label>
            <div className="relative">
              <Mail
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                aria-hidden
              />
              <Input
                id="tenant-email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => onEmail(e.target.value)}
                disabled={submitting}
                placeholder="you@email.com"
                className={inputClass}
                style={{ ["--portal-accent" as string]: accent }}
              />
            </div>
          </div>

          <div>
            <label
              className={cn(
                "mb-1.5 block text-[13px] font-medium",
                dark ? "text-white/70" : "text-[#334155]",
              )}
              htmlFor="tenant-password"
            >
              Password
            </label>
            <div className="relative">
              <Lock
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                aria-hidden
              />
              <Input
                id="tenant-password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => onPassword(e.target.value)}
                disabled={submitting}
                placeholder="Enter your password"
                className={cn(inputClass, "pr-10")}
                style={{ ["--portal-accent" as string]: accent }}
              />
              <button
                type="button"
                className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-slate-400 transition-colors hover:text-slate-700"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                tabIndex={0}
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>

          <Button
            className="mt-1 h-11 w-full gap-2 rounded-xl text-sm font-bold text-white shadow-[0_10px_24px_-12px_rgba(0,0,0,0.45)] transition hover:brightness-[1.05] active:scale-[0.99]"
            type="submit"
            disabled={submitting}
            style={{ backgroundColor: accent }}
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Signing in…
              </>
            ) : (
              <>
                Sign in
                <LogIn className="h-4 w-4" />
              </>
            )}
          </Button>

          {visibleError ? (
            <div
              role="alert"
              aria-live="assertive"
              className={cn(
                "flex gap-2 rounded-xl border px-3 py-2 text-[13px] leading-snug",
                dark
                  ? "border-red-300/40 bg-red-500/25 text-red-50"
                  : "border-red-200 bg-red-50 text-red-700",
              )}
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <p className="min-w-0 flex-1 font-medium">{visibleError}</p>
            </div>
          ) : null}
        </form>

        {footer ?? (
          <p
            className={cn(
              "mt-5 text-center text-[12px] leading-relaxed",
              dark ? "text-white/45" : "text-muted-foreground",
            )}
          >
            Use the email issued by {displayName}.
          </p>
        )}
      </div>
    </div>
  );
}
