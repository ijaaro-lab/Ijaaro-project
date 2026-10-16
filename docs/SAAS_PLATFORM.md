# IJAARO — SaaS Platform (Landing, Theme, Branding, Templates)

**Status:** Implemented on top of Phase 1–4 foundation  
**Related:** `SYSTEM_ARCHITECTURE.md`, migrations `20261013000008`–`12`

## Platform surfaces

| Surface | Route | Notes |
|---------|-------|--------|
| Platform landing | `/` | Public IJAARO marketing (not a tenant portal) |
| Platform login | `/login` | Super Admin + tenant admins only |
| Workspace onboarding | `/create-workspace` | Self-serve; type selection is step 0 |
| Tenant public portal | `/?tenant=<slug>` or subdomain | `resolve_tenant_workspace` RPC (anon-safe) |
| Workspace branding | `/app/branding` | Landlord / utility admins |
| Super Admin template assist | `/app/admin/tenants/:id` | Can apply `landing_template` |

## Dark mode

- Storage key: `localStorage["ijaaro-theme"]` (`light` \| `dark`)
- FOUC prevention in `frontend/index.html` (respects OS preference when unset)
- `ThemeProvider` wraps the app; `ThemeToggle` appears on platform landing, login, tenant landings, and AppShell

Theme preference is device-local (not synced per user account).

## Branding model

All branding lives in `tenants.branding` (jsonb). No duplicate branding table.

Common keys:

- `display_name`, `tagline`, `hero_headline`, `footer_text`
- `accent_color`, `secondary_color`
- `logo_url`, `hero_image_url`
- `landing_template`
- Public contact (optional): `public_description`, `contact_email`, `contact_phone`, `address`, `website_url`

Updates go through `update_tenant_branding` (tenant admin or Super Admin). Public pages never SELECT `tenants` directly — only `resolve_tenant_workspace`.

## Landing templates (exactly five)

Stored as `branding.landing_template`. Each template is a **full public website** (nav, hero, about, services, portal login, contact, footer) — not a color-only login card.

| ID | Name | Layout idea |
|----|------|-------------|
| `modern_professional` | Modern Professional | Centered hero + Portal Login CTA (Hankaal-style) |
| `corporate_trust` | Corporate Trust | Formal split with trust band |
| `minimal_clean` | Minimal Clean | Light centered brand site |
| `service_showcase` | Service Showcase | Split marketing + services |
| `community_connect` | Community Connect | Welcoming story + community sections |

Legacy IDs (`aurora`, `split`, `night`, `horizon`, `formal`, `nova`, `ledger`, `atelier`) still resolve via a map so existing tenants keep a working portal.

Templates share `SiteNav` / `PortalSection` / type-aware services. Tenant colors (`accent_color`, `secondary_color`), logo, and public contact come from `tenants.branding`. Previews use sample data only.

## Security reminders

- URL / subdomain / logo never grants data access — membership + RLS do
- Public landing exposes only fields returned by `resolve_tenant_workspace`
- Do not grant `anon` SELECT on private tables for landing pages
