import { useState } from "react";
import { Building2, Check, Eye, Monitor, Smartphone } from "lucide-react";
import {
  LANDING_TEMPLATES,
  previewSampleBranding,
  type LandingTemplateId,
} from "@/lib/landingTemplates";
import { TenantLandingTemplate } from "@/components/landing/templates";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { TenantType } from "@/types/database";

type Props = {
  value: LandingTemplateId;
  onChange: (id: LandingTemplateId) => void;
  className?: string;
  tenantType?: Exclude<TenantType, "platform">;
  showLivePreview?: boolean;
};

/** Mini wireframe so cards look like sites, not only color chips. */
function TemplateThumb({ id, swatch }: { id: LandingTemplateId; swatch: string[] }) {
  const [a, b, c] = swatch;
  if (id === "modern_professional") {
    return (
      <div className="flex h-20 flex-col overflow-hidden rounded-lg" style={{ background: a }}>
        <div className="flex h-4 items-center gap-1 px-2">
          <span className="h-2 w-2 rounded-full bg-white/40" />
          <span className="h-1 flex-1 rounded bg-white/20" />
          <span className="h-2 w-6 rounded" style={{ background: b }} />
        </div>
        <div className="flex flex-1 flex-col items-center justify-center gap-1 px-4">
          <span className="h-1.5 w-16 rounded bg-white/50" />
          <span className="h-1 w-20 rounded bg-white/25" />
          <span className="mt-1 h-2.5 w-10 rounded" style={{ background: b }} />
        </div>
      </div>
    );
  }
  if (id === "corporate_trust") {
    return (
      <div className="flex h-20 overflow-hidden rounded-lg" style={{ background: a }}>
        <div className="flex flex-1 flex-col justify-center gap-1 p-2">
          <span className="h-1 w-8 rounded" style={{ background: b }} />
          <span className="h-1.5 w-14 rounded bg-white/50" />
          <span className="h-1 w-12 rounded bg-white/25" />
        </div>
        <div className="m-2 w-2/5 rounded" style={{ background: c }} />
      </div>
    );
  }
  if (id === "minimal_clean") {
    return (
      <div className="flex h-20 flex-col items-center justify-center gap-1 overflow-hidden rounded-lg border border-border" style={{ background: c }}>
        <span className="h-3 w-3 rounded-full" style={{ background: b }} />
        <span className="h-1.5 w-12 rounded" style={{ background: a }} />
        <span className="h-1 w-16 rounded bg-black/15" />
      </div>
    );
  }
  if (id === "service_showcase") {
    return (
      <div className="flex h-20 overflow-hidden rounded-lg">
        <div className="flex w-1/2 flex-col justify-center gap-1 p-2" style={{ background: a }}>
          <span className="h-1.5 w-10 rounded bg-white/50" />
          <span className="h-1 w-12 rounded bg-white/25" />
          <span className="h-2 w-8 rounded" style={{ background: b }} />
        </div>
        <div className="w-1/2" style={{ background: c }} />
      </div>
    );
  }
  return (
    <div className="flex h-20 overflow-hidden rounded-lg" style={{ background: c }}>
      <div className="flex flex-1 flex-col justify-center gap-1 p-2">
        <span className="h-1.5 w-12 rounded" style={{ background: a }} />
        <span className="h-1 w-14 rounded bg-black/20" />
        <span className="h-2 w-8 rounded" style={{ background: b }} />
      </div>
      <div
        className="m-2 w-2/5 rounded-lg"
        style={{ background: `linear-gradient(145deg, ${b}, ${a})` }}
      />
    </div>
  );
}

export function LandingTemplatePicker({
  value,
  onChange,
  className,
  tenantType = "landlord",
  showLivePreview = true,
}: Props) {
  const [previewId, setPreviewId] = useState<LandingTemplateId | null>(null);
  const [viewport, setViewport] = useState<"desktop" | "mobile">("desktop");

  const activePreview = previewId ?? value;
  const sample = previewSampleBranding(activePreview);

  return (
    <div className={cn("space-y-4", className)}>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {LANDING_TEMPLATES.map((tpl) => {
          const selected = value === tpl.id;
          return (
            <button
              key={tpl.id}
              type="button"
              onClick={() => {
                onChange(tpl.id);
                setPreviewId(tpl.id);
              }}
              className={cn(
                "group relative overflow-hidden rounded-xl border bg-card p-3 text-left transition",
                selected
                  ? "border-brand-blue ring-2 ring-brand-blue/40"
                  : "border-border hover:border-brand-blue/40",
              )}
            >
              <TemplateThumb id={tpl.id} swatch={tpl.swatch} />
              <div className="mt-3 flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-foreground">{tpl.name}</p>
                  <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
                    {tpl.blurb}
                  </p>
                </div>
                {selected && (
                  <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-blue text-white">
                    <Check className="h-3 w-3" />
                  </span>
                )}
              </div>
              {showLivePreview && (
                <span
                  role="button"
                  tabIndex={0}
                  className="mt-3 inline-flex items-center gap-1 text-[11px] font-medium text-brand-blue hover:underline"
                  onClick={(e) => {
                    e.stopPropagation();
                    setPreviewId(tpl.id);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      e.stopPropagation();
                      setPreviewId(tpl.id);
                    }
                  }}
                >
                  <Eye className="h-3 w-3" />
                  Preview
                </span>
              )}
            </button>
          );
        })}
      </div>

      {showLivePreview && (
        <div className="overflow-hidden rounded-xl border border-border bg-muted/40">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-card px-3 py-2">
            <p className="text-xs font-medium text-muted-foreground">
              Live website preview · sample tenant data ·{" "}
              <span className="text-foreground">
                {LANDING_TEMPLATES.find((t) => t.id === activePreview)?.name}
              </span>
            </p>
            <div className="flex items-center gap-1">
              <button
                type="button"
                className={cn(
                  "inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs",
                  viewport === "desktop"
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:bg-muted/60",
                )}
                onClick={() => setViewport("desktop")}
              >
                <Monitor className="h-3.5 w-3.5" />
                Desktop
              </button>
              <button
                type="button"
                className={cn(
                  "inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs",
                  viewport === "mobile"
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:bg-muted/60",
                )}
                onClick={() => setViewport("mobile")}
              >
                <Smartphone className="h-3.5 w-3.5" />
                Mobile
              </button>
              {activePreview !== value && (
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => onChange(activePreview)}
                >
                  Select this template
                </Button>
              )}
            </div>
          </div>
          <div className="flex justify-center bg-[#0a1524]/5 p-3 dark:bg-black/20">
            <div
              className={cn(
                "overflow-auto rounded-lg border border-border bg-background shadow-sm",
                viewport === "mobile" ? "h-[560px] w-[360px]" : "h-[480px] w-full max-w-5xl",
              )}
            >
              <div
                className={cn(
                  "origin-top-left",
                  viewport === "mobile"
                    ? "w-[360px] scale-100"
                    : "w-[1100px] origin-top scale-[0.72]",
                )}
                style={
                  viewport === "desktop"
                    ? { height: 480 / 0.72, marginBottom: -(480 / 0.72 - 480) }
                    : undefined
                }
              >
                <TenantLandingTemplate
                  preview
                  templateId={activePreview}
                  accent={sample.accent_color}
                  secondary={sample.secondary_color}
                  heroImage=""
                  displayName={sample.display_name}
                  tagline={sample.tagline}
                  headline={sample.hero_headline}
                  footerText={sample.footer_text}
                  publicDescription={sample.public_description}
                  contactEmail={sample.contact_email}
                  contactPhone={sample.contact_phone}
                  address={sample.address}
                  websiteUrl=""
                  tenantType={tenantType}
                  subdomain="preview-workspace"
                  brandMark={(size) => (
                    <div
                      className={cn(
                        "inline-flex items-center justify-center rounded-full bg-white/20",
                        size === "lg" ? "mb-6 h-14 w-14" : "h-9 w-9",
                      )}
                    >
                      <Building2 className={size === "lg" ? "h-7 w-7 text-white" : "h-4 w-4"} />
                    </div>
                  )}
                  loginCard={(tone = "light") => (
                    <div
                      className={cn(
                        "overflow-hidden rounded-2xl border shadow-[0_20px_50px_-24px_rgba(11,31,58,0.4)]",
                        tone === "dark"
                          ? "border-white/15 bg-white/10 text-white"
                          : "border-[#d5e0ec]/90 bg-white/95 text-foreground",
                      )}
                    >
                      <div
                        className="h-[3px] w-full"
                        style={{ backgroundColor: sample.accent_color }}
                        aria-hidden
                      />
                      <div className="px-6 py-5 text-center sm:px-7">
                        <p className="font-display text-[1.375rem] font-bold tracking-tight">
                          Member portal
                        </p>
                        <p className="mt-1 text-[13px] opacity-70">
                          Sample only — not a live workspace.
                        </p>
                        <div
                          className="mt-4 h-10 rounded-lg"
                          style={{ backgroundColor: sample.accent_color }}
                        />
                      </div>
                    </div>
                  )}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
