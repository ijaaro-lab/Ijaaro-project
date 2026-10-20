import { type ReactNode, useEffect, useId, useState } from "react";
import { Check, Copy, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function generateTempPassword(length = 12): string {
  const chars = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$";
  const buf = new Uint32Array(length);
  crypto.getRandomValues(buf);
  let out = "";
  for (const n of buf) out += chars[n % chars.length];
  return out;
}

export function ModalShell({
  open,
  onClose,
  children,
  className,
  labelledBy,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  labelledBy?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/70"
        aria-label="Close dialog"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className={cn(
          "relative z-10 w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-2xl",
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}

export type CredentialField = {
  label: string;
  value: string;
  copyable?: boolean;
  mono?: boolean;
};

export function CredentialsSuccessModal({
  open,
  onClose,
  title,
  subtitle,
  fields,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle: string;
  fields: CredentialField[];
}) {
  const titleId = useId();
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const copy = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      window.setTimeout(() => setCopiedKey((k) => (k === key ? null : k)), 1500);
    } catch {
      /* ignore */
    }
  };

  const copyAll = async () => {
    const blob = fields.map((f) => `${f.label}: ${f.value}`).join("\n");
    await copy("all", blob);
  };

  return (
    <ModalShell open={open} onClose={onClose} labelledBy={titleId} className="max-w-md text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-green/15">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-green text-white">
          <Check className="h-5 w-5" strokeWidth={2.5} />
        </div>
      </div>
      <h2 id={titleId} className="mt-4 font-display text-xl font-bold text-foreground">
        {title}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>

      <div className="mt-5 space-y-3 rounded-xl border border-border bg-muted/30 px-4 py-3 text-left">
        {fields.map((f) => (
          <div key={f.label} className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {f.label}
              </p>
              <p
                className={cn(
                  "mt-0.5 break-all text-sm font-semibold text-foreground",
                  f.mono && "font-mono",
                )}
              >
                {f.value}
              </p>
            </div>
            {f.copyable !== false && (
              <button
                type="button"
                className="mt-1 shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label={`Copy ${f.label}`}
                onClick={() => void copy(f.label, f.value)}
              >
                {copiedKey === f.label ? (
                  <Check className="h-3.5 w-3.5 text-brand-green" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </button>
            )}
          </div>
        ))}
      </div>

      <Button
        type="button"
        variant="secondary"
        className="mt-5 w-full"
        onClick={() => void copyAll()}
      >
        {copiedKey === "all" ? (
          <>
            <Check className="h-4 w-4" />
            Copied
          </>
        ) : (
          <>
            <Copy className="h-4 w-4" />
            Copy All Details
          </>
        )}
      </Button>
      <button
        type="button"
        className="mt-3 text-sm font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        onClick={onClose}
      >
        Close &amp; Continue
      </button>
    </ModalShell>
  );
}

export function ModalCloseButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
      onClick={onClick}
      aria-label="Close"
    >
      <X className="h-4 w-4" />
    </button>
  );
}
