import { Building2, Droplets, Mail, MapPin, Phone, Globe, Zap } from "lucide-react";
import type { TenantType } from "@/types/database";
import { tenantTypeLabel } from "@/lib/tenant";
import { cn } from "@/lib/utils";

export type ServiceItem = { title: string; body: string };

export function servicesForTenantType(tenantType: TenantType): ServiceItem[] {
  if (tenantType === "water_company") {
    return [
      {
        title: "Customer accounts",
        body: "Manage water service accounts linked to your customers.",
      },
      {
        title: "Meter readings",
        body: "Capture and review meter readings for accurate billing.",
      },
      {
        title: "Water billing",
        body: "Issue bills and track payment status for your company only.",
      },
    ];
  }
  if (tenantType === "electricity_company") {
    return [
      {
        title: "Electricity accounts",
        body: "Operate customer accounts for electricity service.",
      },
      {
        title: "Meter & consumption",
        body: "Record readings and retain billing responsibility history.",
      },
      {
        title: "Payment review",
        body: "Review submitted payments inside your isolated workspace.",
      },
    ];
  }
  if (tenantType === "landlord") {
    return [
      {
        title: "Property listings",
        body: "Publish and manage available rental properties.",
      },
      {
        title: "Tenancies",
        body: "Assign renters and track occupancy through move-out.",
      },
      {
        title: "Rent payments",
        body: "Review manual rent submissions with optional proof.",
      },
    ];
  }
  return [];
}

export function TenantTypeBadge({
  tenantType,
  accent,
  className,
}: {
  tenantType: TenantType;
  accent?: string;
  className?: string;
}) {
  const Icon =
    tenantType === "water_company"
      ? Droplets
      : tenantType === "electricity_company"
        ? Zap
        : Building2;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-sm font-medium",
        className,
      )}
      style={accent ? { color: accent } : undefined}
    >
      <Icon className="h-4 w-4" />
      {tenantTypeLabel(tenantType)}
    </span>
  );
}

export function ServicesSection({
  tenantType,
  accent,
  tone = "light",
  className,
}: {
  tenantType: TenantType;
  accent: string;
  tone?: "light" | "dark";
  className?: string;
}) {
  const items = servicesForTenantType(tenantType);
  if (items.length === 0) return null;
  const dark = tone === "dark";

  return (
    <section className={cn("space-y-4", className)}>
      <h2
        className={cn(
          "font-display text-lg font-semibold",
          dark ? "text-white" : "text-foreground",
        )}
      >
        Services
      </h2>
      <ul className="grid gap-3 sm:grid-cols-3">
        {items.map((item) => (
          <li
            key={item.title}
            className={cn(
              "rounded-xl border p-4",
              dark
                ? "border-white/15 bg-white/5"
                : "border-border bg-card",
            )}
          >
            <p
              className={cn(
                "font-display text-sm font-semibold",
                dark ? "text-white" : "text-foreground",
              )}
              style={{ borderLeft: `3px solid ${accent}`, paddingLeft: 10 }}
            >
              {item.title}
            </p>
            <p
              className={cn(
                "mt-2 text-xs leading-relaxed",
                dark ? "text-white/65" : "text-muted-foreground",
              )}
            >
              {item.body}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function ContactSection({
  email,
  phone,
  address,
  website,
  tone = "light",
  className,
}: {
  email: string;
  phone: string;
  address: string;
  website: string;
  tone?: "light" | "dark";
  className?: string;
}) {
  const items = [
    email ? { icon: Mail, label: email, href: `mailto:${email}` } : null,
    phone ? { icon: Phone, label: phone, href: `tel:${phone}` } : null,
    address ? { icon: MapPin, label: address, href: null } : null,
    website
      ? { icon: Globe, label: website.replace(/^https?:\/\//, ""), href: website }
      : null,
  ].filter(Boolean) as Array<{
    icon: typeof Mail;
    label: string;
    href: string | null;
  }>;

  if (items.length === 0) return null;
  const dark = tone === "dark";

  return (
    <section className={cn("space-y-3", className)}>
      <h2
        className={cn(
          "font-display text-lg font-semibold",
          dark ? "text-white" : "text-foreground",
        )}
      >
        Contact
      </h2>
      <ul className="space-y-2">
        {items.map((item) => (
          <li key={item.label} className="flex items-start gap-2 text-sm">
            <item.icon
              className={cn(
                "mt-0.5 h-4 w-4 shrink-0",
                dark ? "text-white/55" : "text-muted-foreground",
              )}
            />
            {item.href ? (
              <a
                href={item.href}
                className={cn(
                  "hover:underline",
                  dark ? "text-white/85" : "text-foreground",
                )}
                rel={item.href.startsWith("http") ? "noopener noreferrer" : undefined}
                target={item.href.startsWith("http") ? "_blank" : undefined}
              >
                {item.label}
              </a>
            ) : (
              <span className={dark ? "text-white/85" : "text-foreground"}>
                {item.label}
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function PlatformFooterNote({
  tone = "light",
  className,
}: {
  tone?: "light" | "dark";
  className?: string;
}) {
  return (
    <p
      className={cn(
        "text-xs",
        tone === "dark" ? "text-white/40" : "text-muted-foreground",
        className,
      )}
    >
      Powered by IJAARO — secure multi-tenant operations.
    </p>
  );
}
