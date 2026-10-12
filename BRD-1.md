# IJAARO — Business Requirements Document (BRD)

**Integrated Rental Property and Utility Management System**

---

## 1. Document Information

| Field | Value |
| --- | --- |
| Document title | IJAARO Business Requirements Document |
| Document ID | BRD-1 |
| Version | 1.1 |
| Status | Draft for stakeholder review (stack + permission matrix finalized) |
| Project name | IJAARO — Integrated Rental Property and Utility Management System |
| Document type | Business Requirements Document (Graduation Project) |
| Primary sources | `IJAARO_Project_Roadmap_v1.docx` (v1.0); `IJAARO_Technical_Architecture_v1.docx` (v1.0); `DATABASE_DESIGN.md`; `ijaaro-database.erd.json` |
| Prepared for | University graduation project stakeholders |
| Date | 11 October 2026 |
| Change summary (v1.1) | Confirmed web stack (React.js, Tailwind CSS, shadcn/ui, Supabase); finalized role names and full permission matrix (closes OQ-01 web/auth portion and OQ-10); linked visual ERD for ERD Editor |

### 1.1 Document purpose

This BRD defines the business needs, scope, roles, processes, functional and non-functional requirements, business rules, acceptance criteria, and open decisions for IJAARO. It is derived from the project roadmap and technical architecture documents and does not invent unsupported product decisions.

### 1.2 Document conventions

| ID prefix | Meaning |
| --- | --- |
| BR-xxx | Business requirement |
| FR-xxx | Functional requirement |
| NFR-xxx | Non-functional requirement |
| AC-xxx | Acceptance criterion |

Priority values: **Must Have**, **Should Have**, **Could Have**.

Technology choices marked **Confirmed** are finalized for v1 implementation. Items still marked **Proposed** or **To confirm** remain open (see Section 26).

---

## 2. Executive Summary

IJAARO is a multi-tenant SaaS platform that integrates **rental property management** with **water and electricity utility management** on one shared platform: one backend, one database, one web application, and one mobile application.

Tenant-scoped data is isolated using `tenant_id`, role-based authorization, and PostgreSQL Row-Level Security (RLS). Landlords manage properties, renters, rent payments, and maintenance. Water and electricity companies manage customers, meters, readings, bills, and payments within their own tenants. Renters and utility customers access only their own relevant tenancy, bills, and payment history.

A core relationship chain is:

**Property → Owner → Current Renter → Utility Account → Meter → Readings → Bills → Payments**

Existing rental properties should be linked to utility services without creating duplicate property records. Historical bills retain the responsible party recorded when the bill was created. Manual payments start as `Pending` and are approved or rejected only by the authorized role for that payment type. API payments must be verified server-side with duplicate-callback protection.

Delivery follows six roadmap phases: platform foundation and multi-tenant security; rental property and tenancy operations; rent payments, utility linking and metering; utility billing, payments and company operations; maintenance, reporting and auditability; and deployment, subscriptions and release readiness.

---

## 3. Project Background

Rental property management and utility (water/electricity) operations are often handled in separate tools or informal processes. That separation creates duplicated property records, unclear bill responsibility when renters change, weak payment verification, and limited auditability.

IJAARO addresses this by providing one integrated multi-tenant platform where:

- Landlords publish and manage properties and tenancies.
- Renters view tenancy obligations, submit payments and maintenance requests.
- Water and electricity companies operate on isolated tenant data with their own dashboards.
- Utility accounts and meters can be linked to existing rental properties.
- Billing responsibility is preserved historically when occupancy changes.
- Sensitive actions are auditable and protected by RLS and role boundaries.

**Confirmed v1 web stack:** React.js + TypeScript, Tailwind CSS, shadcn/ui, and Supabase (PostgreSQL, Auth, Edge Functions, private Storage) with Row-Level Security. Mobile (Flutter) remains a Should Have client on the same backend (FR-036). Visual schema: `ijaaro-database.erd.json` (open with ERD Editor / vuerd-vscode).

---

## 4. Problem Statement

Without an integrated, tenant-isolated platform:

1. Property and utility records are duplicated or inconsistently linked.
2. Rent and utility payment approvals are informal and hard to audit.
3. New renters may be incorrectly charged for previous renters’ unpaid utility balances.
4. Water and electricity companies lack role-scoped operational tools on a shared secure platform.
5. Cross-organization data leakage risk increases if isolation is enforced only in the UI.
6. Payment success may be trusted from the client without server-side verification.

IJAARO must solve these problems through shared architecture, strict multi-tenant security, clear role boundaries, verified payments, and correct billing responsibility rules.

---

## 5. Business Objectives

| ID | Title | Description | Priority | Relevant role(s) | Acceptance criteria | Source / phase |
| --- | --- | --- | --- | --- | --- | --- |
| BR-001 | Unified multi-tenant platform | Deliver one platform, one backend, one database, one web app, and one mobile app for rental and utility operations. | Must Have | All | Users of different roles operate on the same platform with role-appropriate dashboards; no separate siloed systems for landlords vs utility companies. | Roadmap overview; Architecture §1, §17 |
| BR-002 | Enforce tenant data isolation | Ensure tenant-scoped data is isolated via `tenant_id`, roles, and PostgreSQL RLS. | Must Have | Super Admin, All tenants | Cross-tenant unauthorized reads/writes fail in tests; Water Company A cannot access Water Company B. | Roadmap Phase 1; Architecture §3 |
| BR-003 | Enable rental property operations | Allow landlords to publish properties, manage assignments/move-outs, and track rent. | Must Have | Landlord, Renter | Landlord can publish/update property; renter can browse available properties; move-out returns property to Available. | Roadmap Phase 2 |
| BR-004 | Secure rent and utility payments | Support manual and (where available) API payments with authorization, verification, and audit. | Must Have | Landlord, Utility staff, Renter, Utility Customer | Manual payments stay Pending until authorized review; API success verified server-side; no duplicate application of one provider transaction. | Roadmap Phases 3–4; Architecture §8 |
| BR-005 | Link properties and utilities without duplicates | Link utility accounts/meters to existing rental properties; register premises only when needed. | Must Have | Water/Electricity Company Staff | Existing properties can be linked without creating duplicate property records. | Roadmap Phase 3; Architecture §5 |
| BR-006 | Preserve historical bill responsibility | Keep the original responsible party on historical utility bills after renter changes. | Must Have | Utility company, Renter, Landlord | New renter does not automatically inherit prior unpaid balances; historic bills retain original responsible person. | Roadmap Phase 3; Architecture §5.3 |
| BR-007 | Support utility company operations | Provide separate water and electricity dashboards for customers, meters, readings, bills, payments, staff, and reports. | Must Have | Water/Electricity Company Staff, Utility Customer | Water and electricity records remain tenant-isolated; only matching company reviews its payments. | Roadmap Phase 4 |
| BR-008 | Provide maintenance and reporting | Support maintenance requests and tenant-scoped reports with audit trails. | Must Have | Renter, Landlord, Utility staff, Super Admin | Renter can submit/track requests; reports respect role and tenant permissions; sensitive actions are audited. | Roadmap Phase 5 |
| BR-009 | Achieve secure release readiness | Prepare production hosting, secrets handling, backups, monitoring, and release testing. | Must Have | Super Admin / Ops | HTTPS in production; no API secrets in client code; backup/deploy procedures documented; critical isolation/payment tests pass. | Roadmap Phase 6; Architecture §14–15 |
| BR-010 | Optional SaaS billing (conditional) | Support landlord/company subscriptions and platform fees only if confirmed in scope. | Could Have | Super Admin | If enabled, agreed subscription flow works end-to-end; otherwise deferred. | Roadmap Phase 6; Architecture §16 |

---

## 6. Project Scope

### 6.1 In Scope

- One shared multi-tenant SaaS platform for rental and water/electricity utility management.
- Authentication, user profiles, tenant registration/onboarding, and tenant memberships.
- Super Admin management of tenants, users, tenant types, account status, and global settings.
- Landlord property CRUD (including photos, availability/status, contact details) and rental assignments/move-outs.
- Renter browsing of available properties, tenancy view, rent/utility bills, payment history, and maintenance requests.
- Rent ledger, manual rent payment submission with optional proof, and landlord approve/reject.
- Payment API support where a provider is selected (provider confirmation required).
- Separate Water Company and Electricity Company dashboards and operations.
- Utility customer accounts, meters, meter readings, bills, payments, and company staff management.
- Linking utility accounts/meters to existing properties; premises registration when no IJAARO property exists.
- Responsible-party assignment for bills and preservation of historical responsibility.
- Maintenance request lifecycle (Pending → In Progress → Completed).
- Notifications for key rental, utility, payment, and maintenance events (channel details TBD).
- Tenant-scoped reporting and audit logs for sensitive actions.
- Private file storage for property photos, maintenance photos, and payment proof.
- Web and mobile clients backed by the same services.
- Deployment, backups, monitoring, security testing, and documentation for release readiness.
- Optional subscriptions/platform fees **if confirmed** in scope.

### 6.2 Out of Scope

Unless explicitly confirmed later by stakeholders, the following are out of scope for the baseline documented in the sources:

- Separate backends or databases per landlord or utility company.
- Schema-per-tenant or database-per-tenant isolation models.
- Final selection of a specific payment provider without stakeholder confirmation.
- Guaranteed in-app chat (contact/chat option noted; whether contact links suffice vs in-app chat is unresolved).
- Guaranteed SMS/WhatsApp delivery (may be added only if included in project scope).
- Automatic transfer of previous renters’ unpaid balances to a new renter.
- Automatic confirmation of payment solely from uploaded proof or client UI.
- Landlord approval of water/electricity payments, or utility company approval of rent payments.
- Unauthorized cross-tenant data access for any ordinary user role.
- Full legal/regulatory compliance certification beyond project security and privacy controls stated in sources (unless later required by the university/stakeholders).

---

## 7. Stakeholders and User Roles

### 7.1 Stakeholders

| Stakeholder | Interest |
| --- | --- |
| Project sponsors / academic supervisors | Validate graduation-project scope, quality, and delivery |
| Platform operator (Super Admin) | Tenant onboarding, platform settings, optional SaaS billing |
| Landlords (Kireeye) | Property listing, tenancy, rent collection, maintenance |
| Renters (Kirayste) | Find housing, pay rent/utilities, request maintenance |
| Water companies | Customer/meter/billing/payment operations |
| Electricity companies | Customer/meter/billing/payment operations |
| Utility customers | View accounts, bills, balances, and payment history |
| Development team | Implement architecture, RLS, workflows, and tests |

### 7.2 User roles (finalized names)

Roles are stored on `tenant_memberships.role` (`app_role`). Water vs electricity is separated by `tenants.tenant_type` (`water_company` / `electricity_company`), not by duplicate role enums.

| Role code | Display name | Tenant type(s) | Primary responsibilities | Must not do |
| --- | --- | --- | --- | --- |
| `super_admin` | Super Admin | `platform` | Onboard/manage tenants, users, tenant types, account status, global settings; optional subscriptions; read platform audits. | Expose secrets; grant ordinary users cross-tenant bypass. |
| `landlord_admin` | Landlord / Kireeye (Admin) | `landlord` | Full property/tenancy/rent/maintenance/reports for own workspace; approve/reject **manual rent** payments; manage landlord staff. | Approve water/electricity payments; access other landlord workspaces. |
| `landlord_staff` | Landlord Staff | `landlord` | Limited property/rent/maintenance ops as granted by admin (no membership admin by default). | Approve payments unless explicitly granted; cross-tenant access. |
| `renter` | Renter / Kirayste | `landlord` (membership) and/or platform renter registration | Browse listings; view own tenancy/rent charges; submit rent (and utility if also customer); submit maintenance. | Approve any payment; manage other renters’ data. |
| `utility_admin` | Water/Electricity Company Admin | matching utility tenant | Full company ops: customers, link properties, meters, readings, bills, payments, staff, reports; approve/reject **own service** manual payments. | Access other companies; approve rent or the other utility’s payments. |
| `utility_staff` | Water/Electricity Company Staff | matching utility tenant | Operational tasks (meters/readings/bills/payments) within permitted_tasks; may approve payments only if granted. | Cross-company or rent approval; escalate beyond assigned tasks. |
| `utility_customer` | Utility Customer | matching utility tenant | View own accounts/readings/bills/balance/history; submit utility payments. | Staff ops; other customers’ data; approve payments. |

**Critical approval rule:** Landlords approve rent only; `utility_admin` / authorized `utility_staff` approve only payments inside their own company tenant and matching `service_type`.

### 7.3 Permission matrix (final — OQ-10 closed)

Legend: **C** create · **R** read · **U** update · **A** approve/reject · **—** denied · **own** only own records · **tenant** only active membership tenant · **\*** via Edge Function / service role (not client).

| Capability | super_admin | landlord_admin | landlord_staff | renter | utility_admin | utility_staff | utility_customer |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Manage platform tenants / global settings | C/R/U | — | — | — | — | — | — |
| Manage tenant memberships (own tenant) | C/R/U | C/R/U | — | — | C/R/U | — | — |
| CRUD properties (own landlord tenant) | — | C/R/U | R/U (limited) | R listed + own | C premises / R search-link | R search-link | R own linked |
| Assign / move-out renters | — | C/U | U if granted | — | — | — | — |
| Browse available listings | — | R own | R own | R | — | — | — |
| Rent charges ledger | — | R/U tenant | R tenant | R own | — | — | — |
| Submit rent payment (Pending) | — | — | — | C own | — | — | — |
| Approve/reject **rent** payment | — | A | A if granted | — | — | — | — |
| Link utility account to property (no duplicate) | — | — | — | — | C/U tenant | C/U if granted | — |
| Meters / readings / bill generation | — | — | — | — | C/R/U | C/R/U if granted | R own account |
| Submit utility payment (Pending) | — | — | — | C if responsible | — | — | C own |
| Approve/reject **water** payment | — | — | — | — | A water tenant only | A if granted | — |
| Approve/reject **electricity** payment | — | — | — | — | A electricity tenant only | A if granted | — |
| Maintenance request | — | R/U status | R/U if granted | C/R own | — | — | — |
| Tenant-scoped reports | R platform | R landlord | R limited | — | R company | R limited | — |
| Audit logs | R | R limited tenant | — | — | R limited tenant | — | — |
| Private payment proof files | — | R reviewer | R if reviewer | R own | R reviewer | R if reviewer | R own |
| API payment verify / idempotent apply | * | * | * | * trigger only | * | * | * trigger only |

#### 7.3.1 Enforcement layers (must all agree)

1. **UI** — hide unauthorized actions (React role-aware routes/components).
2. **Supabase RLS** — default-deny policies on every tenant-scoped table; never trust client `tenant_id`.
3. **Edge Functions** — privileged workflows (API payment verify, bill issue with responsibility snapshot, assignment/move-out transactions).
4. **Audit** — payment decisions, meter corrections, assignments, move-outs, permission changes → `audit_logs` (append-only).

#### 7.3.2 Hard negatives (acceptance / NFR-019)

| Forbidden action | Expected result |
| --- | --- |
| Landlord updates `utility_payments.status` | Denied (RLS + API) |
| Water Company A reads Water Company B accounts | Denied |
| Electricity staff approves water payment | Denied |
| Renter B reads Renter A rent/utility payments | Denied |
| Client declares API payment success without server verify | Ignored; bill unchanged |
| Duplicate provider callback | Second apply rejected (unique `provider_transaction_id`) |

---

## 8. Business Process Overview

### 8.1 Tenant onboarding and access

1. Super Admin (or supported registration flow) onboards a tenant (landlord workspace, Water Company, or Electricity Company) with type, status, and settings.
2. Users authenticate; membership and role are validated server-side.
3. User sees only dashboards and actions permitted by role and tenant membership.

### 8.2 Rental property and tenancy

1. Landlord creates/publishes property (details, rent, photos, status).
2. Renter searches/filters available properties and expresses interest / contacts landlord.
3. Landlord invites/assigns renter; system tracks `owner_id`, `current_renter_id`, rent, due date, tenancy dates.
4. System prevents conflicting active assignments unless an explicitly approved multi-occupancy rule is adopted.
5. On completed move-out, property returns to Available for the next renter; history is preserved.

### 8.3 Rent payment

1. System maintains rent ledger (due, paid, balance, history).
2. **Manual path:** Renter submits amount, date, method/reference, optional proof → status `Pending` → landlord Approve/Reject (rejection reason recorded) → audit fields stored.
3. **API path (if provider selected):** payment attempt created → server-side provider call → server-side verification/callback → bill/charge updated once (idempotent).

### 8.4 Utility linking, metering, and billing

1. Company staff search for existing rental property and link utility account/meter, or register premises if not present.
2. Staff record meter readings; consumption = current − previous; reject implausible values unless authorized correction/reset.
3. Bills generated from consumption, unit rates, and configured charges; responsible party snapped for the period (current renter if rented; owner if owner-occupied).
4. Customers view readings, bills, due dates, balances, and payment history.
5. Manual utility payment → `Pending` → matching utility company Approve/Reject; API payments verified server-side once.

### 8.5 Maintenance

1. Renter submits request (description, category, urgency, optional photo).
2. Landlord updates status: Pending → In Progress → Completed.
3. Renter tracks progress.

### 8.6 Reporting and audit

1. Role- and tenant-scoped reports for occupancy, rent, collections, consumption, arrears, and (if enabled) subscriptions.
2. Audit trail for payment decisions, meter corrections, assignments, move-outs, and permission changes.

---

## 9. Functional Requirements

| ID | Title | Description | Priority | Relevant role(s) | Acceptance criteria | Source / phase |
| --- | --- | --- | --- | --- | --- | --- |
| FR-001 | User authentication | Authenticate users via **Supabase Auth** and establish secure sessions. | Must Have | All | Only authenticated users access protected dashboards; sessions map to membership/role. | Architecture §2, §7; Phase 1 |
| FR-002 | User profiles | Maintain identity/profile and contact details; credentials remain with auth provider. | Must Have | All | Profile data can be viewed/updated per authorization; credentials not stored insecurely in app tables as plaintext secrets. | Architecture §4 |
| FR-003 | Tenant registration and onboarding | Support registration/onboarding for landlords, renters, Water Companies, and Electricity Companies; Super Admin tools for tenant onboarding, types, status, settings. | Must Have | Super Admin, registering users | New tenants can be created with type/status; unauthorized users cannot alter platform-wide tenant settings. | Roadmap Phase 1 |
| FR-004 | Tenant memberships and RBAC | Represent user–tenant–role–status–permissions; enforce server-side. | Must Have | All | Users see only permitted actions; UI hiding alone is insufficient. | Roadmap Phase 1; Architecture §3, §7 |
| FR-005 | Super Admin platform management | Manage tenants, users, tenant types, account status, global settings; optional subscriptions/fees if enabled. | Must Have | Super Admin | Platform operations are limited to Super Admin and auditable. | Roadmap Phase 1, 5–6 |
| FR-006 | Property CRUD | Create/read/update properties: address/name, district, location, type, rent price, photos, description, contact details. | Must Have | Landlord | Landlord can publish and update a property they manage. | Roadmap Phase 2 |
| FR-007 | Property status management | Manage statuses Available, Occupied, Vacant (as defined in roadmap). | Must Have | Landlord | Status updates reflect occupancy/assignment state after allowed operations. | Roadmap Phase 2 |
| FR-008 | Property search and filter | Search/filter available properties by location, district, price, and attributes. | Must Have | Renter | Renter can browse and filter available properties. | Roadmap Phase 2 |
| FR-009 | Property detail view | Show images, rent, location, and landlord contact/chat option. | Must Have | Renter, Landlord | Detail page displays required listing information to authorized viewers. | Roadmap Phase 2 |
| FR-010 | Interest, invite, and assignment | Renter expresses interest/contacts landlord; landlord invites and assigns renter; track owner, current renter, rent, due date, tenancy dates. | Must Have | Landlord, Renter | Only authorized landlord assigns renters to properties they manage; assignment fields persisted. | Roadmap Phase 2 |
| FR-011 | Move-out and availability | Complete move-out and return property to Available; preserve tenancy history. | Must Have | Landlord | Completed move-out makes property available for next renter; history retained. | Roadmap Phase 2; Architecture §13 |
| FR-012 | Prevent conflicting assignments | Prevent conflicting active rental assignments for one property unless an explicitly approved rule allows multi-occupancy. | Must Have | Landlord | Conflicting active assignments are rejected by default. | Roadmap Phase 2 AC; Architecture §13 |
| FR-013 | Landlord dashboard | Show properties, renters, rent due/overdue, payments, and reports. | Must Have | Landlord | Dashboard reflects landlord’s own tenant-scoped data only. | Roadmap Phase 2 |
| FR-014 | Rent ledger | Track due dates, amounts due/paid, balances, and history. | Must Have | Landlord, Renter | Payment/ledger records include amount, reference, method, date, status, related tenancy/property. | Roadmap Phase 3 |
| FR-015 | Manual rent payment submission | Submit amount, date, method/reference, optional proof; initial status Pending. | Must Have | Renter | Manual rent payment remains Pending until landlord review. | Roadmap Phase 3; Architecture §8.2 |
| FR-016 | Landlord rent payment review | Approve or reject manual rent payment; record rejection reason, reviewer, timestamp. | Must Have | Landlord | Only landlord of the property/tenancy can decide; decision audited. | Roadmap Phase 3–4 AC; Architecture §7–8 |
| FR-017 | API rent/utility payment attempt | Create payment attempt for rent charge or utility bill; call provider from secure server-side function. | Should Have | Renter, Utility Customer | Client cannot declare success without server verification. | Architecture §8.1; Phase 3–4 |
| FR-018 | Server-side payment verification | Verify provider response/signed callback server-side; store amount, currency, provider transaction ID, method, timestamps, status. | Must Have | System / privileged functions | Verified API payments update related bill/charge; secrets stay server-side. | Architecture §8.1; Phase 4 AC |
| FR-019 | Idempotent payment application | Protect against repeated callbacks so one provider transaction is not applied more than once. | Must Have | System | Duplicate callbacks do not create duplicate successful applications. | Architecture §8.1; Phase 4 AC |
| FR-020 | Utility premises registration | Utility company may register premises if not already in IJAARO, then create account/meter. | Must Have | Water/Electricity Staff | Premises/account/meter created only by authorized company staff within their tenant. | Roadmap Phase 3; Architecture §5.2 |
| FR-021 | Link utility account to existing property | Staff search by property ID/address/location/approved identifier and link account/meter without duplicating property. | Must Have | Water/Electricity Staff | Existing rental properties link to utility accounts without duplicate properties. | Roadmap Phase 3; Architecture §5.1 |
| FR-022 | Utility account and meter management | Store utility accounts, meters, unit prices, consumption, bills; manage status and service type. | Must Have | Water/Electricity Staff | Records link to correct account, property, and responsible customer. | Roadmap Phase 3–4 |
| FR-023 | Meter reading capture | Record periodic readings with value/date/recorded_by; show prior readings. | Must Have | Water/Electricity Staff | Readings stored with validation/correction metadata as applicable. | Roadmap Phase 4; Architecture §4, §9 |
| FR-024 | Bill generation | Generate bills using consumption, unit rates, and configured charges; assign responsible party for period. | Must Have | Water/Electricity Staff | Bill totals use configured rates; responsible party stored on bill. | Roadmap Phase 3–4; Architecture §9 |
| FR-025 | Customer utility views | Customers view readings, bills, due date, outstanding balance, and payment history for own accounts. | Must Have | Utility Customer, Renter | Customers access only own relevant accounts/bills/history. | Roadmap Phase 3–4; Architecture §7 |
| FR-026 | Manual utility payment review | Manual utility payment Pending until authorized matching company approves/rejects. | Must Have | Water/Electricity Staff, Utility Customer | Landlords cannot approve utility payments; unrelated companies cannot approve them. | Roadmap Phase 4 AC |
| FR-027 | Separate company dashboards | Provide separate Water and Electricity Company dashboards with tenant-scoped data. | Must Have | Water/Electricity Staff | Water and electricity company records remain isolated. | Roadmap Phase 4 |
| FR-028 | Staff memberships | Manage company staff users, roles, and permitted tasks within tenant. | Must Have | Water/Electricity Admin | Staff can perform only assigned operational tasks in their tenant. | Architecture §4, §7 |
| FR-029 | Maintenance request submission | Renter submits description, category, urgency, optional photo. | Must Have | Renter | Renter can submit and track own maintenance requests. | Roadmap Phase 5 |
| FR-030 | Maintenance status workflow | Landlord updates Pending, In Progress, Completed; renter sees progress. | Must Have | Landlord, Renter | Status changes visible to renter; unauthorized users cannot update. | Roadmap Phase 5 |
| FR-031 | Notifications | Notify on rent payment events, utility bill/due/payment events, maintenance events, assignment/move-out, and optional subscription events. | Should Have | All relevant | Events generate notifications without exposing sensitive details inappropriately. | Architecture §10; Phase 4–5 |
| FR-032 | Role-scoped reports | Landlord occupancy/rent/payment/tenancy reports; utility consumption/bills/collections/arrears; Super Admin tenant/account/(optional) subscription reports. | Must Have | Landlord, Utility staff, Super Admin | Reports reconcile with stored bills/payments and respect role/tenant permissions. | Roadmap Phase 4–5 |
| FR-033 | Audit logging | Record actor, tenant, action, entity reference, timestamp, safe metadata for sensitive actions. | Must Have | System, Super Admin | Sensitive changes are traceable; payment decisions and meter corrections audited. | Roadmap Phase 1, 5; Architecture §12 |
| FR-034 | Private file storage | Store property/maintenance photos and payment proof with type/size validation and controlled access. | Must Have | Landlord, Renter, Utility staff | Payment proof visible only to payer and authorized reviewer(s). | Architecture §11 |
| FR-035 | Document exports | PDF/CSV generation with permission checks before sensitive exports. | Should Have | Authorized roles | Exports enforce same permissions as source records. | Architecture §2, §11 |
| FR-036 | Mobile role-aware app | Flutter mobile app with role-aware navigation using same backend services. | Should Have | All end users | Mobile users receive role-appropriate navigation and data scope. | Architecture §2; Phase 5 |
| FR-037 | Optional subscriptions/platform fees | Plans, limits, billing history, overdue handling if confirmed in scope. | Could Have | Super Admin, Landlord, Companies | If included, end-to-end subscription flow works; else not required for v1 release. | Roadmap Phase 6 |

---

## 10. Non-Functional Requirements

| ID | Title | Description | Priority | Relevant role(s) | Acceptance criteria | Source / phase |
| --- | --- | --- | --- | --- | --- | --- |
| NFR-001 | Multi-tenant RLS isolation | PostgreSQL RLS on tenant-scoped tables for SELECT/INSERT/UPDATE/DELETE; default deny. | Must Have | All | Unauthorized cross-tenant operations fail in tests across UI/API/queries/exports. | Architecture §3, §12, §15; Phase 1 |
| NFR-002 | Server-side authorization | Validate role, membership, ownership, and workflow state server-side; do not trust client-supplied `tenant_id`. | Must Have | All | Privilege checks succeed/fail correctly without relying on UI alone. | Architecture §3, §7 |
| NFR-003 | Secret protection | Payment/email/provider secrets and unrestricted storage credentials never in frontend/mobile code. | Must Have | Developers, Super Admin | Production uses HTTPS; no API secrets exposed in client code. | Architecture §11–12; Phase 6 |
| NFR-004 | HTTPS and secure sessions | Production hosting with HTTPS and secure session handling. | Must Have | All | Production traffic is HTTPS; session handling follows secure practices. | Architecture §12, §14; Phase 6 |
| NFR-005 | Input validation | Validate property forms, profiles, meter readings, payment references, public forms, and uploads. | Must Have | All | Invalid/implausible inputs rejected or routed through authorized correction flows. | Architecture §9, §12 |
| NFR-006 | Rate limiting / abuse protection | Protect public endpoints and authentication against abuse. | Should Have | System | Public/auth endpoints have abuse protections configured. | Architecture §12 |
| NFR-007 | Transaction integrity | Use transactions for payment recording and bill/charge status updates. | Must Have | System | Bill/payment state remains consistent after success/failure paths. | Architecture §13 |
| NFR-008 | Auditability and non-silent overwrite | Preserve payment decision history; use traceable adjustments rather than silent overwrites. | Must Have | System | Historical decisions remain inspectable. | Architecture §13 |
| NFR-009 | Historical data retention | Keep historical tenancy, readings, bills, and payments. | Must Have | System | Past records remain available to authorized roles after occupancy changes. | Architecture §13 |
| NFR-010 | Responsive web UX | Responsive web interfaces for dashboards and workflows. | Must Have | All | Core workflows usable on desktop and mobile web viewports. | Roadmap Phase 5 |
| NFR-011 | Environments and migrations | Separate dev/staging/production; versioned DB migrations; documented rollback/restore. | Must Have | Ops / Developers | Environments separated; migration/restore procedures documented. | Architecture §14; Phase 6 |
| NFR-012 | Backups and monitoring | Configure backups, monitoring, error reporting/alerts. | Must Have | Ops | Backup/restore and monitoring procedures documented and tested at release readiness. | Roadmap Phase 6; Architecture §14–15 |
| NFR-013 | Testing coverage | Unit/integration, RLS isolation, payment, e2e workflow, usability, regression tests. | Must Have | QA / Developers | Critical rental, utility, payment, and isolation tests pass before release. | Architecture §2, §15; Phase 6 |
| NFR-014 | Least privilege | Least-privilege credentials and dependency updates. | Should Have | Ops / Developers | Credentials scoped; dependency update practice defined. | Architecture §12 |
| NFR-015 | Safe notifications | Avoid exposing sensitive details in notifications; direct users to authenticated pages when appropriate. | Should Have | All | Notifications do not leak sensitive payment/account details inappropriately. | Architecture §10 |
| NFR-016 | Tenant route safety | Unknown, disabled, or mismatched tenant routes fail safely. | Must Have | System | Tenant resolution tested for valid, invalid, and disabled tenants. | Architecture §6; Phase 6 AC |

### 10.1 Technology stack (v1)

| Layer | Technology / design | Status |
| --- | --- | --- |
| Web frontend | **React.js + TypeScript**; **Tailwind CSS**; **shadcn/ui** (Vite or Next.js host) | **Confirmed** |
| Mobile | Flutter (Android/iOS), role-aware navigation on same Supabase backend | Should Have / Proposed client |
| Backend/API | **Supabase** (PostgREST + **Edge Functions** for privileged workflows) | **Confirmed** |
| Database | **Supabase PostgreSQL** — FKs, constraints, transactions, indexes, **RLS** | **Confirmed** |
| Authentication | **Supabase Auth**; `profiles.id` = `auth.users.id` | **Confirmed** |
| File storage | **Supabase Storage** (private buckets + signed URLs after authz) | **Confirmed** |
| Schema / ERD | `DATABASE_DESIGN.md` + `ijaaro-database.erd.json` (ERD Editor) | **Confirmed** |
| Payments | Somalia-supported provider after API/webhook confirmation | To confirm |
| Notifications | Email + in-app; SMS/WhatsApp optional if in scope | Partially open |
| Hosting | HTTPS host for React app + Supabase cloud project | To confirm (provider) |
| Documents | PDF/CSV with permission checks | Confirmed approach |
| Testing | Unit/integration, RLS isolation, payment, e2e | Required |

---

## 11. Multi-Tenant Architecture and Data Isolation Requirements

| ID | Title | Description | Priority | Relevant role(s) | Acceptance criteria | Source / phase |
| --- | --- | --- | --- | --- | --- | --- |
| FR-038 | Shared DB multi-tenancy model | One shared database and schema; tenant-scoped records use `tenant_id`. | Must Have | System | No schema-per-tenant or DB-per-tenant model used. | Architecture §3 |
| FR-039 | Tenant ID coverage | Every tenant-scoped table includes `tenant_id` directly or is protected through a securely enforced parent relationship. | Must Have | System | Isolation tests cover direct and related records/joins. | Architecture §3, §12 |
| FR-040 | RLS default deny | Explicit policies for applicable SELECT/INSERT/UPDATE/DELETE; default deny. | Must Have | System | Missing policy does not grant access. | Architecture §3 |
| FR-041 | Membership-checked tenant context | After login (and for subdomain/slug entry), verify active membership before tenant-scoped operations. | Must Have | All | Mismatched/disabled tenant access fails safely. | Architecture §6–7 |
| FR-042 | Super Admin scoped platform powers | Super Admin has explicitly scoped platform-level permissions; ordinary users cannot bypass tenant boundaries. | Must Have | Super Admin | Platform ops limited and auditable. | Architecture §3; Phase 1 AC |
| FR-043 | Optional tenant subdomains | Optional company/tenant subdomains for entry points/branding; resolve slug → tenant → branding. | Should Have | Super Admin, Tenants | Valid resolution works; invalid/disabled fail safely. | Architecture §6; Phase 6 |
| FR-044 | Cross-tenant isolation testing | Test unauthorized cross-tenant read/insert/update/delete across roles and critical operations. | Must Have | QA | Water Company A cannot access Water Company B; rental tenants isolated likewise. | Roadmap Phase 1; Architecture §15 |

**Core entities (from architecture data model):** users/profiles, tenants, tenant_memberships, properties, rental_assignments/tenancies, rent_charges/rent_payments, utility_accounts, meters, meter_readings, utility_bills, utility_payments, maintenance_requests, staff_memberships, subscriptions/platform_fees (optional), notifications, audit_logs.

---

## 12. Business Rules

| ID | Rule | Priority | Notes / source |
| --- | --- | --- | --- |
| BR-011 | A user must not access another tenant’s private data without explicit authorization. | Must Have | Cross-phase rules; Architecture §3 |
| BR-012 | Manual payments start with `Pending` status. | Must Have | Phases 3–4; Architecture §8.2 |
| BR-013 | Payment approval/rejection must be authorized by the correct role and must be auditable (reviewer + timestamp; rejection reason for rent). | Must Have | Architecture §7–8 |
| BR-014 | API-based payments must be verified on the server side; client screens cannot declare success. | Must Have | Cross-phase rules; Architecture §8.1 |
| BR-015 | Repeated payment callbacks must not create duplicate transactions/applications. | Must Have | Architecture §8.1 |
| BR-016 | Existing properties should be linked to utility records where appropriate instead of creating duplicate property records. | Must Have | Cross-phase rules; Architecture §5 |
| BR-017 | Historical utility bills must retain the responsible party recorded when the bill was created. | Must Have | Architecture §5.3 |
| BR-018 | Previous renters’ unpaid balances must not automatically transfer to a new renter. | Must Have | Architecture §5.3; Phase 3 AC |
| BR-019 | Conflicting active rental assignments must be prevented unless an explicitly approved business rule allows them. | Must Have | Phase 2 AC; Architecture §13 |
| BR-020 | Meter consumption = current reading − previous reading. | Must Have | Architecture §9 |
| BR-021 | Bill total = (units consumed × unit price) + applicable charges. | Must Have | Architecture §9 |
| BR-022 | Meter corrections, resets, and unusual/negative/implausible readings must follow an authorized process and be recorded. | Must Have | Architecture §9, §13 |
| BR-023 | Sensitive credentials and payment secrets must never be exposed in frontend/mobile code. | Must Have | Architecture §11–12; Phase 6 |
| BR-024 | Uploaded payment proof is evidence for review, not automatic confirmation. | Must Have | Architecture §8.2 |
| BR-025 | Bills are assigned to the person responsible during the billing period: normally current renter if rented, or owner if owner-occupied. | Must Have | Architecture §5.3 |
| BR-026 | Landlords confirm rent; Water Company confirms water payments; Electricity Company confirms electricity payments. | Must Have | Cross-phase rules |
| BR-027 | Conditional features (subscriptions, chat, specific payment provider) require confirmation before implementation. | Must Have | Roadmap cross-phase rules; Architecture §16 |

### 12.1 Recommended payment statuses

Pending; Processing; Paid/Confirmed; Rejected; Failed; Cancelled; Refunded (only if refunds are implemented).

---

## 13. Rental Property and Tenancy Management

| ID | Title | Description | Priority | Relevant role(s) | Acceptance criteria | Source / phase |
| --- | --- | --- | --- | --- | --- | --- |
| FR-045 | Property ownership fields | Persist `owner_id`, occupancy status, and `current_renter_id` as applicable. | Must Have | Landlord | Authorized landlord manages only properties they own/manage. | Roadmap Phase 2; Architecture §4 |
| FR-046 | Tenancy history | Use rental_assignments/tenancies to preserve dates, rent amount, due rules, active status, and history. | Must Have | Landlord, Renter | Prior tenancies remain available after move-out. | Architecture §4, §13 |
| FR-047 | Listing contact pathway | Provide landlord contact/chat option on property detail (exact channel TBD). | Should Have | Renter, Landlord | Renter can initiate contact through the approved v1 method. | Roadmap Phase 2; Open question |
| AC-001 | Property publish | Landlord can create and publish a property with required listing fields and photos. | Must Have | Landlord | Published property appears as Available when appropriate and is searchable. | Phase 2 |
| AC-002 | Assignment authorization | Only the authorized landlord can assign a renter to a managed property. | Must Have | Landlord | Unauthorized assignment attempts fail. | Phase 2 |
| AC-003 | Move-out availability | After completed move-out, property is Available for a new renter. | Must Have | Landlord | Status and current renter fields reflect move-out. | Phase 2 |

---

## 14. Rent Payment Management

| ID | Title | Description | Priority | Relevant role(s) | Acceptance criteria | Source / phase |
| --- | --- | --- | --- | --- | --- | --- |
| FR-048 | Rent charge tracking | Track rent periods, amounts due/paid, balances, and history. | Must Have | Landlord, Renter | Ledger consistent with payment records. | Phase 3 |
| FR-049 | Store provider references | When API provider used, store provider transaction reference and status. | Should Have | System | Payment record includes provider reference when applicable. | Phase 3 |
| FR-050 | Rent review audit fields | Store reviewer and timestamp for approve/reject; rejection reason required on reject. | Must Have | Landlord | Audit log/payment record shows decision metadata. | Architecture §8.2 |
| AC-004 | Manual rent Pending gate | Manual rent payment cannot become Paid/Confirmed without landlord approval. | Must Have | Landlord, Renter | Status transitions enforced. | Phase 3 AC |
| AC-005 | Rent payment record completeness | Records include amount, reference, method, date, status, related tenancy/property. | Must Have | Landlord, Renter | Incomplete critical fields rejected. | Phase 3 AC |

---

## 15. Water and Electricity Utility Management

| ID | Title | Description | Priority | Relevant role(s) | Acceptance criteria | Source / phase |
| --- | --- | --- | --- | --- | --- | --- |
| FR-051 | Service-type separation | Water and electricity operations remain separate by tenant/service type with isolated data. | Must Have | Water/Electricity Staff | Cross-service unauthorized access fails. | Phase 4 |
| FR-052 | Customer management | Companies manage customers and associated accounts within tenant. | Must Have | Water/Electricity Staff | Customer records scoped to company tenant. | Phase 4 |
| FR-053 | Utility payment notifications | Notify customers about bills, due dates, and payment results. | Should Have | Utility Customer | Customers receive due/payment event notifications via agreed channels. | Phase 4; Architecture §10 |
| AC-006 | Company isolation | Water and electricity company records remain isolated from each other and from unrelated tenants. | Must Have | Utility staff | Isolation tests pass. | Phase 4 AC |
| AC-007 | Matching-company payment review | Only the relevant utility company can approve/reject its manual payments. | Must Have | Water/Electricity Staff | Landlord and unrelated company review attempts fail. | Phase 4 AC |

---

## 16. Meter Readings and Billing Calculations

| ID | Title | Description | Priority | Relevant role(s) | Acceptance criteria | Source / phase |
| --- | --- | --- | --- | --- | --- | --- |
| FR-054 | Consumption calculation | Units consumed = current reading − previous reading. | Must Have | Water/Electricity Staff | Example: 100 → 130 at $0.50/unit ⇒ 30 units, $15 base before extra charges. | Architecture §9; Phase 3 AC |
| FR-055 | Bill total calculation | Bill total = (units × unit price) + applicable configured charges. | Must Have | Water/Electricity Staff | Totals match configured rates/charges. | Architecture §9 |
| FR-056 | Implausible reading handling | Reject negative or implausible readings unless authorized correction/reset workflow is recorded. | Must Have | Water/Electricity Staff | Unauthorized implausible readings are rejected; corrections audited. | Architecture §9, §13 |
| FR-057 | Meter replacement/reset procedures | Support defined procedures for replacement/reset, estimated readings, corrections, disputed bills. | Should Have | Water/Electricity Staff | Corrections leave validation/correction metadata and audit trail. | Architecture §13 |
| AC-008 | Reading-to-bill integrity | Readings and bills link to correct account, property, and responsible customer; consumption and totals correct. | Must Have | Utility staff, Customer | Phase 3–4 billing AC satisfied. | Phases 3–4 |

---

## 17. Utility Account and Property Linking

| ID | Title | Description | Priority | Relevant role(s) | Acceptance criteria | Source / phase |
| --- | --- | --- | --- | --- | --- | --- |
| FR-058 | Search-before-create linking | Staff search existing rental property before creating utility linkage. | Must Have | Water/Electricity Staff | Duplicate property not created when reliable match exists. | Architecture §5.1 |
| FR-059 | Later reconciliation | If premises registered first by utility company, later rental property can be reconciled/linked through authorized process. | Should Have | Water/Electricity Staff, Landlord | Authorized link removes/avoid duplicates rather than leaving unchecked duplicates. | Architecture §5.2 |
| FR-060 | Responsibility snapshot on bill | Persist occupancy/responsible-party snapshot on each bill. | Must Have | System | Future renter does not inherit historical debt automatically. | Architecture §5.3 |
| AC-009 | No duplicate on link | Linking utility account to existing rental property does not create a second property record for the same premises. | Must Have | Utility staff | Phase 3 linking AC satisfied. | Phase 3 |
| AC-010 | Historic responsibility retained | After renter change, old bills keep original responsible party; new renter responsible for future bills. | Must Have | Utility staff, Renter | Occupancy responsibility release tests pass. | Architecture §15 |

---

## 18. Maintenance Request Management

| ID | Title | Description | Priority | Relevant role(s) | Acceptance criteria | Source / phase |
| --- | --- | --- | --- | --- | --- | --- |
| FR-061 | Request fields | Capture property, renter, category, description, optional photo, status, timestamps. | Must Have | Renter | Request created with required fields. | Architecture §4; Phase 5 |
| FR-062 | Landlord maintenance workflow | Landlord updates Pending → In Progress → Completed. | Must Have | Landlord | Invalid status transitions prevented; renter sees updates. | Phase 5 |
| AC-011 | Maintenance end-to-end | Renter submits request; landlord updates status; renter sees progress. | Must Have | Renter, Landlord | Phase 5 maintenance AC satisfied. | Phase 5 |

---

## 19. Notifications and Communication

| ID | Title | Description | Priority | Relevant role(s) | Acceptance criteria | Source / phase |
| --- | --- | --- | --- | --- | --- | --- |
| FR-063 | Rent payment notifications | Notify on rent payment submitted, approved, or rejected. | Should Have | Landlord, Renter | Parties receive event notifications without inappropriate sensitive leakage. | Architecture §10 |
| FR-064 | Utility billing notifications | Notify on bill generated and due/overdue reminders. | Should Have | Utility Customer | Due/overdue reminders delivered via agreed channel(s). | Architecture §10 |
| FR-065 | Utility payment notifications | Notify on utility payment submitted, approved, or rejected. | Should Have | Utility Customer, Utility staff | Status notifications delivered to relevant parties. | Architecture §10 |
| FR-066 | Maintenance notifications | Notify when request created or status changed. | Should Have | Landlord, Renter | Both parties informed of relevant changes. | Architecture §10 |
| FR-067 | Tenancy lifecycle notifications | Notify on renter invitation, assignment, and move-out status updates. | Should Have | Landlord, Renter | Lifecycle events trigger notifications. | Architecture §10 |
| FR-068 | Optional subscription notifications | Subscription/platform-fee events if feature enabled. | Could Have | Super Admin, Tenants | Only applicable if subscriptions in scope. | Architecture §10 |

**Open:** Exact channels (email, in-app, SMS, WhatsApp) and whether v1 uses contact links vs in-app chat require confirmation (see Section 26).

---

## 20. Reports and Audit Logs

| ID | Title | Description | Priority | Relevant role(s) | Acceptance criteria | Source / phase |
| --- | --- | --- | --- | --- | --- | --- |
| FR-069 | Landlord reports | Occupancy, rent due/overdue, payment history, tenancy activity. | Must Have | Landlord | Reports show only landlord’s authorized tenant-scoped data. | Phase 5 |
| FR-070 | Utility company reports | Readings, consumption, bills, collections, paid/unpaid accounts, arrears. | Must Have | Water/Electricity Staff | Reports reconcile with stored bills and payments. | Phase 4–5 |
| FR-071 | Super Admin reports | Tenants, active accounts, and subscriptions/platform fees if enabled. | Should Have | Super Admin | Platform reports available to Super Admin only. | Phase 5 |
| FR-072 | Audit trail coverage | Audit payment decisions, meter corrections, assignments, move-outs, permission changes, tenant/user changes. | Must Have | System | Records include actor, timestamp, action, relevant record/entity reference. | Phase 5; Architecture §12 |
| AC-012 | Report permission enforcement | Reports respect role and tenant permissions. | Must Have | All reporting roles | Unauthorized report access fails. | Phase 5 AC |
| AC-013 | Audit completeness for sensitive changes | Sensitive changes record actor, timestamp, action, and relevant record. | Must Have | System | Sampled sensitive workflows leave audit entries. | Phase 5 AC |

---

## 21. Security, Privacy, and Access Control

| ID | Title | Description | Priority | Relevant role(s) | Acceptance criteria | Source / phase |
| --- | --- | --- | --- | --- | --- | --- |
| NFR-017 | Privacy of payment proof | Payment proof remains private to payer and authorized reviewer(s). | Must Have | Payer, reviewers | Unauthorized users cannot access proof files. | Architecture §11 |
| NFR-018 | Controlled media access | Property/maintenance photos stored with controlled access and validation. | Must Have | Landlord, Renter | Invalid file types/sizes rejected; access controlled. | Architecture §11 |
| NFR-019 | Role authorization matrix enforcement | Permission matrix must explicitly enforce rent vs water vs electricity approval boundaries. | Must Have | All | Landlord cannot approve utility payments; tests prove boundaries. | Architecture §7, §15 |
| NFR-020 | Synthetic/anonymized test data | Use synthetic or anonymized data for testing when practical. | Should Have | QA | Production personal data not required for routine tests. | Architecture §14 |
| AC-014 | Isolation release gate | Tenant A cannot read/change Tenant B records through UI, API, queries, or exports. | Must Have | QA | Isolation test area passes before release. | Architecture §15 |
| AC-015 | Role release gate | Each role can perform only permitted actions. | Must Have | QA | Role authorization test area passes. | Architecture §15 |

---

## 22. Payment Verification and Approval Workflows

### 22.1 Workflow summary

| Payment type | Submitter | Initial status | Approver / verifier | Success rule |
| --- | --- | --- | --- | --- |
| Manual rent | Renter | Pending | Landlord | Approve/Reject with audit; reject reason on reject |
| Manual water | Customer/Renter | Pending | Water Company authorized staff | Same company tenant only |
| Manual electricity | Customer/Renter | Pending | Electricity Company authorized staff | Same company tenant only |
| API rent/utility | Customer/Renter via app | Processing/Pending attempt | Server-side provider verification | Verified once; idempotent |

### 22.2 Requirements

| ID | Title | Description | Priority | Relevant role(s) | Acceptance criteria | Source / phase |
| --- | --- | --- | --- | --- | --- | --- |
| FR-073 | Payment attempt binding | API payment attempt tied to a specific rent charge or utility bill. | Must Have | System | Attempt cannot be applied to unrelated bill/charge. | Architecture §8.1 |
| FR-074 | Secure provider invocation | Provider requests only from secure server-side function. | Must Have | System | No provider secret usage from client. | Architecture §8.1 |
| FR-075 | Consistent bill update | On verified success, update related bill/charge consistently inside a transaction. | Must Have | System | Bill/payment states remain consistent. | Architecture §8.1, §13 |
| AC-016 | API single application | Verified API payments update the related bill once only. | Must Have | System | Repeated callback test does not double-apply. | Phase 4 AC |
| AC-017 | Approval boundary tests | Landlords cannot approve water/electricity payments; unrelated companies cannot approve them. | Must Have | QA | Negative authorization tests pass. | Phase 4 AC |

**Release guidance from roadmap:** Do not launch payment workflows until authorization, provider verification, duplicate-payment protection, and audit logs are tested.

---

## 23. Project Phases and Delivery Roadmap

Delivery order matches the IJAARO Project Roadmap v1.0.

### Phase 1 — Platform Foundation and Multi-Tenant Security

**Objective:** Establish shared infrastructure, secure tenant isolation, account access, and core records.

**Scope:**
- Shared database, backend, and application structure.
- Authentication, tenant membership, and RBAC.
- `tenant_id` on tenant-scoped records + PostgreSQL RLS.
- Super Admin tools for tenant onboarding, tenant types, account status, global settings.
- Registration support for landlords, renters, Water Companies, Electricity Companies.
- Core records for users, tenants, properties, utility accounts, and staff.
- Audit logs for sensitive actions.

**Phase acceptance criteria:**
- Users see only dashboards/actions permitted by role.
- Water Company A cannot access Water Company B; water and electricity tenants remain isolated.
- Unauthorized cross-tenant reads/writes fail in tests.
- Super Admin platform operations are limited and auditable.

### Phase 2 — Rental Property and Tenancy Operations

**Objective:** Allow landlords to publish properties and manage renter assignments and move-outs.

**Scope:** Property CRUD; status management; search/filter; detail page; interest/contact; invite/assign; track ownership/renter/rent/dates; move-out to Available; landlord dashboard.

**Phase acceptance criteria:**
- Landlord can publish and update a property.
- Renter can browse and filter available properties.
- Only authorized landlord can assign renters to managed properties.
- System prevents conflicting active assignments unless explicitly designed otherwise.
- Completed move-out makes the property available for the next renter.

### Phase 3 — Rent Payments, Utility Linking and Metering

**Objective:** Track rent and connect properties to water/electricity services without duplicate property records.

**Scope:** Rent ledger; payment API support where selected; manual rent Pending → landlord review; premises registration if needed; link existing property to utility account/meter; accounts/meters/readings/prices/consumption/bills; responsible-party assignment; preserve historic responsibility; customer views.

**Phase acceptance criteria:**
- Payment records include amount, reference, method, date, status, related tenancy/property.
- Manual rent payment remains Pending until landlord review.
- Existing rental properties can be linked to utility accounts without duplicate properties.
- Consumption equals current − previous; bill totals use configured unit rates.
- Historical utility bills are not transferred incorrectly to a new renter.

### Phase 4 — Utility Billing, Payments and Company Operations

**Objective:** Provide separate water and electricity workflows for companies and their customers.

**Scope:** Separate dashboards; manage customers/properties/meters/readings/bills/payments/staff/reports; periodic readings; bill generation; API payment with server-side verification; manual utility Pending → company review; notifications; collections reports.

**Phase acceptance criteria:**
- Water and electricity company records remain isolated.
- Readings and bills link to correct account, property, and responsible customer.
- Verified API payments update the related bill once only.
- Landlords cannot approve water/electricity payments; unrelated companies cannot either.
- Reports reconcile with stored bills and payment records.

### Phase 5 — Maintenance, Reporting and Auditability

**Objective:** Complete rental support and operational reporting.

**Scope:** Maintenance requests; landlord status workflow; landlord reports; utility reports; Super Admin reports (including subscriptions/fees if enabled); audit trail; responsive web and mobile on same services.

**Phase acceptance criteria:**
- Renter can submit and track maintenance requests.
- Landlord can update status; renter can see progress.
- Reports respect role and tenant permissions.
- Sensitive changes record actor, timestamp, action, and relevant record.

### Phase 6 — Deployment, Subscriptions and Release Readiness

**Objective:** Prepare a secure production release and optional self-service SaaS billing.

**Scope:** Production hosting, domain routing, HTTPS, secrets; optional subdomains; optional subscriptions/platform fees; backups, monitoring, error reporting, migrations; security/payment/usability/isolation/regression tests; deployment and user guides.

**Phase acceptance criteria:**
- Production uses HTTPS; no API secrets in client code.
- Tenant resolution tested for valid, invalid, and disabled tenants.
- Backup/restore and deployment steps documented.
- If subscriptions included, agreed flow works end-to-end.
- Critical rental, utility, payment, and isolation tests pass.

**Suggested order note (roadmap):** Build security and tenant isolation first, then rental operations, rent payments and utility linking, then meter billing and utility payments, followed by maintenance, reports, and deployment.

---

## 24. Acceptance Criteria

Program-level acceptance criteria (in addition to per-requirement AC items above):

| ID | Title | Description | Priority | Relevant role(s) | Acceptance criteria | Source / phase |
| --- | --- | --- | --- | --- | --- | --- |
| AC-018 | Single platform architecture | One platform/backend/database serving web and mobile clients. | Must Have | All | No requirement for separate siloed utility/rental backends. | Overview; Architecture §1 |
| AC-019 | Rental workflow release gate | Create property → publish → interest/contact → invite/assign → rent tracking → move-out → available. | Must Have | Landlord, Renter | End-to-end rental workflow test passes. | Architecture §15 |
| AC-020 | Rent payment release gate | API verification (if enabled) and manual Pending → landlord Approve/Reject work correctly. | Must Have | Landlord, Renter | Payment tests pass before launch. | Architecture §15; roadmap warning |
| AC-021 | Utility linking release gate | Existing rental property links to utility account without duplicate creation. | Must Have | Utility staff | Linking tests pass. | Architecture §15 |
| AC-022 | Meter/billing release gate | Consumption, unit rate, bill total, and responsible party are correct. | Must Have | Utility staff | Billing calculation tests pass. | Architecture §15 |
| AC-023 | Utility payment release gate | Only matching company reviews manual payments; verified API payment applied once. | Must Have | Utility staff | Utility payment tests pass. | Architecture §15 |
| AC-024 | Occupancy responsibility release gate | New renter responsible for future bills; old bills retain original responsible party. | Must Have | Utility staff, Renter | Responsibility tests pass. | Architecture §15 |
| AC-025 | Maintenance release gate | Renter creates request; landlord updates; renter sees changes. | Must Have | Renter, Landlord | Maintenance tests pass. | Architecture §15 |
| AC-026 | Operations release gate | Backup, monitoring, deployment, and secret-handling procedures documented. | Must Have | Ops | Phase 6 operations AC satisfied. | Architecture §15; Phase 6 |
| AC-027 | Phase 1 isolation gate | Unauthorized cross-tenant reads/writes fail; role dashboards enforced. | Must Have | QA | Phase 1 AC checklist complete. | Phase 1 |
| AC-028 | Subscription conditional gate | If subscriptions are in scope, end-to-end flow works; if not, feature not required for release. | Could Have | Super Admin | Stakeholder decision recorded. | Phase 6 |

---

## 25. Risks, Constraints, and Dependencies

### 25.1 Risks

| Risk | Impact | Mitigation direction (from sources) |
| --- | --- | --- |
| Incomplete RLS/policy coverage | Cross-tenant data leakage | Default-deny RLS; isolation tests before Phase 1 sign-off and before release |
| Client-trusted payment success | False paid status / fraud | Server-side verification; no secrets in clients; idempotency |
| Duplicate property records | Data inconsistency across rental and utilities | Search-and-link workflow; authorized reconciliation |
| Unclear move-out debt policy | Disputes at move-out | Display balances; business policy decision required (open question) |
| Unconfirmed payment provider APIs | Delayed Phase 3–4 payments | Confirm Somalia-supported provider webhook/API access before build |
| Scope creep on chat/SMS/subscriptions | Delivery delay | Treat as conditional features requiring confirmation |
| Permission matrix drift vs RLS | Authorization bugs | Matrix locked in BRD §7.3; RLS + Edge Functions must match; isolation tests before release |

### 25.2 Constraints

- One shared platform/backend/database model (not separate systems).
- Tenant isolation must use `tenant_id` + roles + PostgreSQL RLS.
- Approval boundaries are role-specific and non-interchangeable.
- Conditional features require confirmation before implementation.
- Web stack is confirmed: React.js, Tailwind CSS, shadcn/ui, Supabase (Auth, PostgreSQL+RLS, Edge Functions, Storage). Hosting provider and payment provider remain to confirm.

### 25.3 Dependencies

- Confirmation of hosting, auth provider, and domain/subdomain strategy.
- Confirmation of payment provider(s) and merchant/API requirements.
- Stakeholder decisions on subscriptions/platform fees, communication channels, billing policy details, move-out unpaid-balance policy, and canonical property vs premises model.
- Availability of private storage for photos and payment proof.
- Test environments with synthetic/anonymized data where practical.

---

## 26. Open Questions and Decisions Requiring Confirmation

Do not treat the items below as decided. Each requires stakeholder confirmation.

| # | Open question | Why it matters | Status |
| --- | --- | --- | --- |
| OQ-01 | Final web/mobile stack, hosting provider, and database/auth provider | Affects implementation, deployment, SSL/domain setup, and auth integration | **Partially closed:** web = React.js + Tailwind + shadcn/ui; DB/Auth = Supabase. Still open: hosting vendor; Flutter timing |
| OQ-02 | Payment provider(s) for rent, water, and electricity, including API/webhook capability | Blocks reliable API payment, verification, and idempotency design | Requires confirmation |
| OQ-03 | Whether contact links are enough for v1 or in-app chat is required | Changes Phase 2 communication UX and scope | Requires confirmation |
| OQ-04 | Whether tenant subscriptions/platform fees are required in v1 or a later phase | Determines Phase 6 mandatory vs optional billing work | Requires confirmation |
| OQ-05 | Whether each landlord has an individual workspace or owners can be grouped in a landlord tenant | Affects tenancy model and membership design | **Working decision for v1:** one landlord workspace = one `tenants` row (`tenant_type = landlord`); multi-owner grouping deferred |
| OQ-06 | Whether company-created premises and landlord-created properties share one canonical property entity or use a linked premises abstraction | Affects data model uniqueness and linking workflows | **Working decision for v1:** single canonical `properties` table; utility may create then reconcile (see ERD / DATABASE_DESIGN) |
| OQ-07 | Final utility billing policies: due dates, unit rates, extra fees, partial payments, arrears, estimated readings, corrections | Affects bill calculation engine and dispute handling | Requires confirmation |
| OQ-08 | How outstanding balances are handled when a renter moves out (system can display balances, but business policy decides the rule) | Affects move-out completion rules and collections process | Requires confirmation |
| OQ-09 | Notification channels: email, in-app, SMS, WhatsApp — which are in scope for v1 | Affects Phase 4–5 notification delivery design | Requires confirmation |
| OQ-10 | Exact role names and full permission matrix | Sources state these should be finalized before implementation | **Closed** — see §7.2–7.3 |
| OQ-11 | Whether refunds are implemented (Refunded status only if refunds are implemented) | Affects payment state machine | Requires confirmation |
| OQ-12 | Tenant/company subdomain strategy for production | Affects DNS, HTTPS, and tenant resolution testing | Requires confirmation |

---

## 27. Glossary

| Term | Definition |
| --- | --- |
| IJAARO | Integrated Rental Property and Utility Management System (multi-tenant SaaS) |
| Tenant | Company/workspace boundary (e.g., landlord workspace, water company, electricity company) with isolated data |
| `tenant_id` | Identifier used to scope records to a tenant |
| RLS | PostgreSQL Row-Level Security enforcing access at the database layer |
| Super Admin | Platform-level administrator for tenants, users, global settings, optional SaaS billing |
| Landlord / Kireeye | Property owner/manager role for rental operations and rent payment review |
| Renter / Kirayste | Tenant occupying or seeking rental property |
| Water Company Staff | Authorized users operating water utility workflows within their tenant |
| Electricity Company Staff | Authorized users operating electricity utility workflows within their tenant |
| Utility Customer | End customer viewing/paying their own utility accounts and bills |
| Utility account | Service account linking company tenant, property/premises, customer, and meters |
| Meter reading | Recorded meter value used to calculate consumption |
| Consumption | Current reading minus previous reading |
| Manual payment | User-submitted payment with reference/proof that starts as Pending |
| API payment | Provider-processed payment verified server-side |
| Responsible party | Person assigned responsibility for a bill during its billing period |
| Audit log | Trace record of actor, action, entity, timestamp, and safe metadata |
| Platform fee / subscription | Optional SaaS billing constructs if enabled |
| Confirmed technology | React.js, Tailwind CSS, shadcn/ui, Supabase (Auth, PostgreSQL+RLS, Edge Functions, Storage) |
| ERD | Visual schema file `ijaaro-database.erd.json` for ERD Editor (dineug.vuerd-vscode) |

---

## 28. Requirements Traceability Matrix

| Requirement ID | Summary | Phase | Primary stakeholders / roles | Related AC |
| --- | --- | --- | --- | --- |
| BR-001 | Unified multi-tenant platform | 1–6 | All | AC-018 |
| BR-002 | Tenant data isolation | 1, 6 | Super Admin, All | AC-014, AC-027 |
| BR-003 | Rental property operations | 2 | Landlord, Renter | AC-001, AC-002, AC-003, AC-019 |
| BR-004 | Secure payments | 3–4, 6 | Landlord, Utility staff, Customers | AC-004, AC-005, AC-016, AC-017, AC-020, AC-023 |
| BR-005 | Link without duplicates | 3 | Utility staff | AC-009, AC-021 |
| BR-006 | Preserve bill responsibility | 3–4 | Utility staff, Renters | AC-010, AC-024 |
| BR-007 | Utility company operations | 4 | Water/Electricity staff, Customers | AC-006, AC-007, AC-008 |
| BR-008 | Maintenance and reporting | 5 | Renter, Landlord, Utility staff, Super Admin | AC-011, AC-012, AC-013, AC-025 |
| BR-009 | Release readiness | 6 | Ops, Super Admin | AC-026, AC-014–AC-023 |
| BR-010 | Optional subscriptions | 6 | Super Admin | AC-028 |
| BR-011–BR-027 | Business rules (isolation, payments, linking, metering, secrets) | Cross-phase | All / System | AC-004, AC-007, AC-009, AC-010, AC-014–AC-017, AC-022–AC-024 |
| FR-001–FR-005 | Auth, profiles, tenants, memberships, Super Admin | 1 | Super Admin, All | AC-027, AC-015 |
| FR-006–FR-013, FR-045–FR-047 | Property and tenancy | 2 | Landlord, Renter | AC-001–AC-003, AC-019 |
| FR-014–FR-019, FR-048–FR-050, FR-073–FR-075 | Rent/API payments and verification | 3–4 | Landlord, Renter, System | AC-004, AC-005, AC-016, AC-020 |
| FR-020–FR-028, FR-051–FR-060 | Utilities, linking, metering, billing, company ops | 3–4 | Utility staff, Customers | AC-006–AC-010, AC-021–AC-024 |
| FR-029–FR-030, FR-061–FR-062 | Maintenance | 5 | Renter, Landlord | AC-011, AC-025 |
| FR-031, FR-063–FR-068 | Notifications | 4–5 | All relevant | (channel decisions OQ-03, OQ-09) |
| FR-032–FR-033, FR-069–FR-072 | Reports and audit | 1, 5 | Reporting roles | AC-012, AC-013 |
| FR-034–FR-036 | Files, exports, mobile | 5–6 | All | NFR/AC privacy and role gates |
| FR-037 | Optional subscriptions | 6 | Super Admin | AC-028 |
| FR-038–FR-044 | Multi-tenant architecture controls | 1, 6 | System, Super Admin | AC-014, AC-027, NFR-016 |
| NFR-001–NFR-020 | Security, reliability, UX, ops NFRs | 1–6 | System, Ops, QA | AC-014–AC-017, AC-026 |

---

## Appendix A — Source Alignment Checklist

- [x] One platform / one backend / one database / web + mobile documented
- [x] `tenant_id` + RBAC + PostgreSQL RLS documented
- [x] Six roadmap phases included in correct order
- [x] Role permission and payment approval boundaries consistent
- [x] Property–utility linking and no-duplicate rule documented
- [x] Historical responsible-party rule documented
- [x] Manual Pending and server-side API verification documented
- [x] Idempotent callback protection documented
- [x] Maintenance, reports, audit, deployment documented
- [x] Open questions marked as requiring confirmation
- [x] Technology stack confirmed for web (React.js, Tailwind, shadcn/ui, Supabase); remaining opens marked To confirm
- [x] Role names + full permission matrix finalized (§7.2–7.3); OQ-10 closed
- [x] Requirement IDs assigned (BR / FR / NFR / AC)
- [x] Database ERD linked (`ijaaro-database.erd.json`)

## Appendix B — Known Gaps Requiring Clarification

These gaps are intentional reflections of unresolved source decisions (not omissions of decided rules):

1. Hosting vendor + Flutter release timing (remainder of OQ-01).
2. Payment provider selection and API capability (OQ-02).
3. Communication approach: contact links vs chat; SMS/WhatsApp vs email/in-app (OQ-03, OQ-09).
4. Subscriptions/platform fees in v1 (OQ-04, BR-010, FR-037).
5. ~~Landlord workspace grouping~~ → v1 working decision recorded (OQ-05).
6. ~~Canonical property vs premises~~ → single `properties` table (OQ-06).
7. Detailed billing policy parameters (OQ-07).
8. Move-out completion rules with unpaid balances (OQ-08).
9. ~~Final role-name/permission matrix~~ → closed in §7.3 (OQ-10).
10. Refund support (OQ-11).
11. Production subdomain strategy (OQ-12).

---

*End of BRD-1.md v1.1 — derived from IJAARO Project Roadmap v1.0 and IJAARO Technical Architecture v1.0; stack and permission matrix finalized for implementation.*
