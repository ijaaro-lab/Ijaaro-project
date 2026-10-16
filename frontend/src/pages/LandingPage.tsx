import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Building2,
  ClipboardList,
  CreditCard,
  Droplets,
  FileText,
  Gauge,
  Menu,
  ShieldCheck,
  Wrench,
  X,
  Zap,
} from "lucide-react";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Get Started → public multi-step workspace onboarding. */
const CREATE_WORKSPACE_PATH = "/create-workspace";

const MARQUEE_LINE =
  "One connected workspace for rental property, water, and electricity operations.";

const navLinks = [
  { href: "#features", label: "Features" },
  { href: "#how-it-works", label: "How it works" },
  { href: "#solutions", label: "Solutions" },
  { href: "#security", label: "Security" },
  { href: "#onboarding", label: "Onboarding" },
];

const overview = [
  {
    title: "Rental Property Management",
    icon: Building2,
    accent: "text-brand-green",
    bullets: [
      "Property listings and availability",
      "Rental assignments and tenancy details",
      "Rent tracking and payment review",
    ],
  },
  {
    title: "Water Management",
    icon: Droplets,
    accent: "text-brand-water",
    bullets: [
      "Customer accounts",
      "Meter readings",
      "Water billing and payment tracking",
    ],
  },
  {
    title: "Electricity Management",
    icon: Zap,
    accent: "text-brand-power",
    bullets: [
      "Customer accounts",
      "Electricity meter readings",
      "Billing and payment management",
    ],
  },
];

const steps = [
  { num: "01", title: "Register", body: "Register an organization or property workspace." },
  { num: "02", title: "Add records", body: "Add properties, customers, staff, and relevant accounts." },
  { num: "03", title: "Operate", body: "Manage rental activity, meter readings, bills, and payments." },
  { num: "04", title: "Review", body: "Review account activity, outstanding balances, and reports." },
];

const solutions = [
  {
    title: "Property Owners / Landlords",
    body: "Publish properties, manage tenancies and move-outs, track rent charges, and approve or reject manual rent payments within your own landlord workspace.",
  },
  {
    title: "Renters / Tenants",
    body: "Browse available listings, view your tenancy obligations, submit rent payments with optional proof, and open maintenance requests for your unit.",
  },
  {
    title: "Water Companies",
    body: "Operate customer accounts, link meters to properties, capture readings, issue water bills, and review payments for your water company tenant only.",
  },
  {
    title: "Electricity Companies",
    body: "Manage electricity customers, meters, readings, bills, and payment review inside your electricity company workspace—separate from water and landlord data.",
  },
];

const features = [
  {
    icon: Building2,
    title: "Property and tenancy tracking",
    body: "List properties, assign renters, and track occupancy status through move-out.",
  },
  {
    icon: CreditCard,
    title: "Rent payment review",
    body: "Renters submit manual payments; landlords approve or reject within their workspace.",
  },
  {
    icon: Droplets,
    title: "Water and electricity accounts",
    body: "Utility companies manage customer accounts and service records in isolated tenants.",
  },
  {
    icon: Gauge,
    title: "Meter reading and billing",
    body: "Capture readings, generate bills, and retain historical billing responsibility.",
  },
  {
    icon: FileText,
    title: "Payment status tracking",
    body: "Follow Pending, Approved, Rejected, and verified API payment states.",
  },
  {
    icon: Wrench,
    title: "Maintenance requests",
    body: "Renters submit requests; landlords update status through completion.",
  },
  {
    icon: ClipboardList,
    title: "Reports and account history",
    body: "Review tenant-scoped activity, balances, and operational history.",
  },
  {
    icon: ShieldCheck,
    title: "Role-based access and isolation",
    body: "Permissions and tenant_id boundaries limit what each role can see and do.",
  },
];

const securityPoints = [
  {
    title: "Role boundaries",
    body: "Landlords approve rent only. Utility staff approve payments for their own service and company tenant.",
  },
  {
    title: "Tenant isolation",
    body: "Water Company A cannot access Water Company B. Cross-tenant reads and writes are denied by policy. Landlord workspaces are equally isolated from each other.",
  },
  {
    title: "Least privilege for renters",
    body: "Renters and utility customers see their own tenancy, bills, and payment history—not other customers’ records.",
  },
];

function BrandLogo({ className }: { className?: string }) {
  return (
    <>
      <img
        src="/brand/ijaaro-logo.png"
        alt="IJAARO"
        className={cn("w-auto object-contain dark:hidden", className)}
      />
      <img
        src="/brand/ijaaro-logo-on-dark.png"
        alt="IJAARO"
        className={cn("hidden w-auto object-contain dark:block", className)}
      />
    </>
  );
}

function HeroPreview() {
  return (
    <div className="relative flex h-full w-full items-center justify-center self-center lg:justify-start">
      <img
        src="/platform-hero.png?v=10"
        alt="Team collaborating on property and utility operations in IJAARO"
        className="h-auto w-full origin-left object-contain object-left lg:w-[165%] lg:max-w-none"
        width={1676}
        height={780}
      />
    </div>
  );
}

export function LandingPage() {
  const getStartedTo = CREATE_WORKSPACE_PATH;
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div
        className="overflow-hidden bg-brand-navy"
        aria-label={MARQUEE_LINE}
      >
        <div className="flex w-max animate-marquee-right whitespace-nowrap py-2.5 text-[13px] font-medium tracking-wide text-[#D7E4F2]">
          {Array.from({ length: 8 }).map((_, i) => (
            <span key={i} className="mx-8 inline-flex items-center gap-3">
              <span
                className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand-power"
                aria-hidden
              />
              {MARQUEE_LINE}
            </span>
          ))}
        </div>
      </div>

      <header className="sticky top-0 z-20 border-b border-border bg-card/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <a href="#top" className="flex items-center gap-2">
            <BrandLogo className="h-10 sm:h-12" />
          </a>
          <nav className="hidden items-center gap-6 text-sm font-medium text-muted-foreground lg:flex">
            {navLinks.map((link) => (
              <a key={link.href} href={link.href} className="hover:text-foreground">
                {link.label}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-2 sm:gap-3">
            <ThemeToggle />
            <Link to="/login" className="hidden sm:inline-flex">
              <Button variant="outline">Login</Button>
            </Link>
            <Link to={getStartedTo}>
              <Button variant="primary">Get Started</Button>
            </Link>
            <button
              type="button"
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border lg:hidden"
              aria-label={mobileOpen ? "Close menu" : "Open menu"}
              onClick={() => setMobileOpen((v) => !v)}
            >
              {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </button>
          </div>
        </div>
        {mobileOpen && (
          <nav className="border-t border-border px-4 py-3 lg:hidden">
            <ul className="space-y-2 text-sm">
              {navLinks.map((link) => (
                <li key={link.href}>
                  <a
                    href={link.href}
                    className="block rounded-lg px-2 py-2 text-muted-foreground hover:bg-muted hover:text-foreground"
                    onClick={() => setMobileOpen(false)}
                  >
                    {link.label}
                  </a>
                </li>
              ))}
              <li>
                <Link
                  to="/login"
                  className="block rounded-lg px-2 py-2 font-semibold text-foreground hover:bg-muted"
                  onClick={() => setMobileOpen(false)}
                >
                  Login
                </Link>
              </li>
            </ul>
          </nav>
        )}
      </header>

      <main id="top">
        <section className="relative overflow-x-clip border-b border-border">
          <div
            className="pointer-events-none absolute inset-0 opacity-70"
            style={{
              background:
                "radial-gradient(ellipse 70% 55% at 85% 10%, rgba(43,140,255,0.16), transparent 55%), radial-gradient(ellipse 50% 40% at 10% 80%, rgba(31,168,90,0.12), transparent 50%)",
            }}
            aria-hidden
          />
          <div className="relative mx-auto grid max-w-6xl items-center gap-8 px-4 pb-14 pt-10 sm:px-6 lg:grid-cols-2 lg:gap-8 lg:pb-16 lg:pt-14">
            <div className="relative z-10 flex flex-col justify-center self-center">
              <p className="font-display text-sm font-semibold tracking-wide text-brand-blue">
                IJAARO
              </p>
              <h1 className="mt-2 font-display text-4xl font-extrabold leading-[1.12] tracking-tight text-foreground sm:text-5xl">
                Property, water, and electricity — one secure SaaS platform
              </h1>
              <p className="mt-5 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
                Give each landlord, water company, and electricity company its own branded
                workspace with isolated data, role-based access, and ready-to-publish landing pages.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link to={getStartedTo}>
                  <Button size="lg" variant="primary">
                    Create a workspace
                  </Button>
                </Link>
                <Link to="/login">
                  <Button size="lg" variant="outline">
                    Login
                  </Button>
                </Link>
              </div>
              <p className="mt-5 text-sm text-muted-foreground">
                Self-serve onboarding chooses tenant type, branding, and landing template — then
                opens <code className="text-foreground">/?tenant=&lt;slug&gt;</code>.
              </p>
            </div>
            <HeroPreview />
          </div>
        </section>

        <section id="features" className="border-y border-border bg-card">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="font-display text-3xl font-bold tracking-tight sm:text-[34px]">
                Everything Connected in One Platform
              </h2>
              <p className="mt-3 text-base text-muted-foreground">
                Bring property management and utility operations into a more organized workflow.
              </p>
            </div>
            <div className="mt-10 grid gap-5 md:grid-cols-3">
              {overview.map((item) => (
                <div
                  key={item.title}
                  className="rounded-xl border border-border bg-background p-6"
                >
                  <item.icon className={cn("h-6 w-6", item.accent)} />
                  <h3 className="mt-4 font-display text-lg font-semibold">{item.title}</h3>
                  <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                    {item.bullets.map((b) => (
                      <li key={b} className="flex gap-2">
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-blue" />
                        {b}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="how-it-works" className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <h2 className="text-center font-display text-3xl font-bold tracking-tight sm:text-[34px]">
            A Clearer Way to Manage Daily Operations
          </h2>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((step) => (
              <div key={step.num} className="rounded-xl border border-border bg-card p-5">
                <p className="font-display text-sm font-bold text-brand-blue">{step.num}</p>
                <h3 className="mt-2 font-display text-lg font-semibold">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="solutions" className="border-y border-border bg-card">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="font-display text-3xl font-bold tracking-tight sm:text-[34px]">
                Designed for Every Part of the Workflow
              </h2>
              <p className="mt-3 text-base text-muted-foreground">
                Each role sees only the workspaces, records, and actions permitted for their
                membership.
              </p>
            </div>
            <div className="mt-10 grid gap-5 md:grid-cols-2">
              {solutions.map((item) => (
                <div key={item.title} className="rounded-xl bg-background p-6">
                  <h3 className="font-display text-lg font-semibold">{item.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="font-display text-3xl font-bold tracking-tight sm:text-[34px]">
              Capabilities That Match Real Operations
            </h2>
            <p className="mt-3 text-base text-muted-foreground">
              Core workflows drawn from the IJAARO requirements—not vague marketing claims.
            </p>
          </div>
          <div className="mt-10 grid gap-4 sm:grid-cols-2">
            {features.map((item) => (
              <div
                key={item.title}
                className="flex gap-4 rounded-xl border border-border bg-card p-5"
              >
                <item.icon className="mt-0.5 h-5 w-5 shrink-0 text-brand-water" />
                <div>
                  <h3 className="font-display font-semibold">{item.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{item.body}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section id="security" className="border-y border-border bg-card">
          <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
            <div>
              <h2 className="font-display text-3xl font-bold tracking-tight sm:text-[34px]">
                Your workspace. Your data. Your permissions.
              </h2>
              <p className="mt-4 text-base leading-relaxed text-muted-foreground">
                IJAARO is a multi-tenant SaaS platform. Tenant-scoped data is isolated with
                membership checks, role-based authorization, and database Row-Level Security.
                Users only reach dashboards and actions permitted by their role.
              </p>
              <p className="mt-3 text-sm text-muted-foreground">
                Each landlord, water company, and electricity company gets its own slug-based
                workspace entry (for example{" "}
                <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                  ?tenant=your-company
                </code>
                ). Data never crosses tenant boundaries.
              </p>
            </div>
            <div className="space-y-3">
              {securityPoints.map((item) => (
                <div key={item.title} className="rounded-xl bg-background p-5">
                  <h3 className="font-display font-semibold">{item.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                    {item.body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="onboarding" className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="font-display text-3xl font-bold tracking-tight sm:text-[34px]">
              Company onboarding in minutes
            </h2>
            <p className="mt-3 text-base text-muted-foreground">
              Organizations create an isolated tenant, pick a landing template, and publish
              their own branded portal — without mixing data with other companies.
            </p>
          </div>
          <ol className="mt-10 grid gap-4 md:grid-cols-3">
            {[
              {
                title: "Choose tenant type",
                body: "Landlord, water company, or electricity company — the first step of every workspace.",
              },
              {
                title: "Brand your portal",
                body: "Upload a logo, set colors, and select one of five reusable landing templates.",
              },
              {
                title: "Invite your team",
                body: "Members sign in on your workspace URL. Membership — not the URL — grants access.",
              },
            ].map((item, i) => (
              <li key={item.title} className="rounded-xl border border-border bg-card p-5">
                <p className="font-display text-sm font-bold text-brand-blue">
                  Step {i + 1}
                </p>
                <h3 className="mt-2 font-display text-lg font-semibold">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section id="cta" className="bg-brand-navy">
          <div className="mx-auto max-w-3xl px-4 py-16 text-center sm:px-6">
            <h2 className="font-display text-3xl font-bold tracking-tight text-white sm:text-[32px]">
              Bring property and utility operations together
            </h2>
            <p className="mt-4 text-base text-[#D7E4F2]">
              Create your workspace: choose type → admin account → subdomain → landing
              branding. You get a unique entry at{" "}
              <code className="text-white">/?tenant=&lt;slug&gt;</code>.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link to={getStartedTo}>
                <Button
                  size="lg"
                  className="bg-brand-power text-brand-navy hover:bg-[#e0b300]"
                >
                  Create workspace
                </Button>
              </Link>
              <Link to="/login">
                <Button
                  size="lg"
                  variant="outline"
                  className="border-brand-green bg-transparent text-brand-green hover:bg-brand-green/15"
                >
                  Login
                </Button>
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="bg-brand-navy text-[#7A90A8]">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:grid-cols-2 sm:px-6 lg:grid-cols-4">
          <div>
            <img
              src="/brand/ijaaro-logo-on-dark.png"
              alt="IJAARO"
              className="h-10 w-auto object-contain"
            />
            <p className="mt-3 text-sm leading-relaxed text-[#D7E4F2]/80">
              Integrated Rental Property and Utility Management System.
            </p>
          </div>
          <div>
            <p className="mb-3 text-sm font-semibold text-white">Platform</p>
            <ul className="space-y-2 text-sm">
              <li>
                <a href="#features" className="hover:text-white">
                  Features
                </a>
              </li>
              <li>
                <a href="#how-it-works" className="hover:text-white">
                  How it works
                </a>
              </li>
              <li>
                <a href="#security" className="hover:text-white">
                  Security
                </a>
              </li>
            </ul>
          </div>
          <div>
            <p className="mb-3 text-sm font-semibold text-white">Solutions</p>
            <ul className="space-y-2 text-sm">
              <li>Landlords</li>
              <li>Water companies</li>
              <li>Electricity companies</li>
              <li>Renters</li>
            </ul>
          </div>
          <div>
            <p className="mb-3 text-sm font-semibold text-white">Account</p>
            <ul className="space-y-2 text-sm">
              <li>
                <Link to="/login" className="hover:text-white">
                  Login
                </Link>
              </li>
              <li>
                <Link to={CREATE_WORKSPACE_PATH} className="hover:text-white">
                  Create workspace
                </Link>
              </li>
            </ul>
          </div>
        </div>
        <div className="border-t border-white/10 px-4 py-6 text-center text-xs sm:px-6">
          © {new Date().getFullYear()} IJAARO. Integrated Rental Property and Utility Management
          System.
        </div>
      </footer>
    </div>
  );
}
