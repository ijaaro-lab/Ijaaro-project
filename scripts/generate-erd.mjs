/**
 * Generates ijaaro-database.erd.json for dineug ERD Editor (vuerd-vscode 3.x)
 * Layout mirrors multi-tenant SaaS flow:
 *   Platform landing → Tenant provisioning → isolated tenant domains (Landlord | Utility)
 */
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const OPT = { AI: 1, PK: 2, UQ: 4, NN: 8 };
const REL = { ZeroOne: 2, ZeroN: 4, OneOnly: 8, OneN: 16 };
const ON = { none: 1, noAction: 2, cascade: 4, setNull: 8, setDefault: 16, restrict: 32 };

const tables = {};
const columns = {};
const relationships = {};
const indexes = {};
const indexColumns = {};
const memos = {};
const tableGroups = {};

function addGroup(id, name, color, x, y, width, height) {
  tableGroups[id] = { id, name, color, ui: { x, y, width, height } };
}

function addTable(id, name, comment, x, y, color, groupId, cols) {
  const columnIds = [];
  for (const c of cols) {
    const cid = `${id}__${c.name}`;
    columnIds.push(cid);
    columns[cid] = {
      id: cid,
      tableId: id,
      name: c.name,
      comment: c.comment || '',
      dataType: c.type,
      default: c.default ?? '',
      options: c.options ?? 0,
    };
  }
  tables[id] = {
    id,
    name,
    comment,
    columnIds,
    groupId,
    ui: { x, y, color },
  };
}

function addRel(id, type, startTable, startCols, endTable, endCols, onDelete = ON.restrict, onUpdate = ON.cascade) {
  relationships[id] = {
    id,
    relationshipType: type,
    onDelete,
    onUpdate,
    start: { tableId: startTable, columnIds: startCols.map((c) => `${startTable}__${c}`) },
    end: { tableId: endTable, columnIds: endCols.map((c) => `${endTable}__${c}`) },
  };
}

function addIndex(id, name, tableId, colNames, unique = false) {
  const indexColumnIds = [];
  for (const col of colNames) {
    const icid = `${id}__${col}`;
    indexColumnIds.push(icid);
    indexColumns[icid] = {
      id: icid,
      indexId: id,
      columnId: `${tableId}__${col}`,
      orderType: 1,
    };
  }
  indexes[id] = { id, name, tableId, indexColumnIds, unique };
}

const PK = OPT.PK | OPT.NN;
const NN = OPT.NN;
const UQ = OPT.UQ | OPT.NN;

// ═══════════════════════════════════════════════════════════
// GROUPS — separated like trainhub multi-tenant lanes
// ═══════════════════════════════════════════════════════════
addGroup('grp_platform', '1. PLATFORM & AUTH\n(ijaaro.com landing → login)', '#1e3a8a', 40, 40, 1180, 520);
addGroup('grp_provision', '2. TENANT PROVISIONING\n(register landlord / water / electricity)', '#5b21b6', 1280, 40, 900, 520);
addGroup('grp_landlord', '3A. LANDLORD TENANT\nslug.ijaaro.com  |  roles: landlord_admin · landlord_staff · renter', '#065f46', 40, 620, 2100, 780);
addGroup('grp_utility', '3B. UTILITY COMPANY TENANT\nwater|electricity.ijaaro.com  |  roles: utility_admin · utility_staff · utility_customer', '#9a3412', 40, 1480, 2500, 900);
addGroup('grp_cross', '4. CROSS-CUTTING\n(notifications · audit — tenant scoped)', '#334155', 2200, 40, 720, 520);

// ═══════════════════════════════════════════════════════════
// 1. PLATFORM & AUTH
// ═══════════════════════════════════════════════════════════
addTable('profiles', 'profiles', 'Auth profile = auth.users.id', 80, 120, '#2563eb', 'grp_platform', [
  { name: 'id', type: 'UUID', options: PK, comment: '= auth.users.id', default: 'gen_random_uuid()' },
  { name: 'full_name', type: 'TEXT', options: NN },
  { name: 'phone', type: 'TEXT' },
  { name: 'email', type: 'TEXT' },
  { name: 'avatar_url', type: 'TEXT' },
  { name: 'preferred_language', type: 'TEXT', default: "'so'" },
  { name: 'created_at', type: 'TIMESTAMPTZ', options: NN, default: 'now()' },
  { name: 'updated_at', type: 'TIMESTAMPTZ', options: NN, default: 'now()' },
]);

// ═══════════════════════════════════════════════════════════
// 2. TENANT PROVISIONING
// ═══════════════════════════════════════════════════════════
addTable('tenants', 'tenants', 'Workspace: platform | landlord | water | electricity', 1340, 120, '#7c3aed', 'grp_provision', [
  { name: 'id', type: 'UUID', options: PK, default: 'gen_random_uuid()' },
  { name: 'name', type: 'TEXT', options: NN },
  { name: 'slug', type: 'TEXT', options: UQ, comment: 'subdomain key e.g. acme.ijaaro.com' },
  { name: 'tenant_type', type: 'tenant_type', options: NN, comment: 'platform|landlord|water_company|electricity_company' },
  { name: 'status', type: 'tenant_status', options: NN, default: "'pending'" },
  { name: 'branding', type: 'JSONB' },
  { name: 'settings', type: 'JSONB' },
  { name: 'created_at', type: 'TIMESTAMPTZ', options: NN, default: 'now()' },
  { name: 'updated_at', type: 'TIMESTAMPTZ', options: NN, default: 'now()' },
]);

addTable('tenant_memberships', 'tenant_memberships', 'User ↔ Tenant ↔ Role (RBAC)', 1700, 120, '#db2777', 'grp_provision', [
  { name: 'id', type: 'UUID', options: PK, default: 'gen_random_uuid()' },
  { name: 'tenant_id', type: 'UUID', options: NN },
  { name: 'user_id', type: 'UUID', options: NN },
  { name: 'role', type: 'app_role', options: NN, comment: 'super_admin|landlord_*|renter|utility_*' },
  { name: 'status', type: 'membership_status', options: NN, default: "'invited'" },
  { name: 'permissions', type: 'JSONB', comment: 'optional task overrides' },
  { name: 'invited_by', type: 'UUID' },
  { name: 'created_at', type: 'TIMESTAMPTZ', options: NN, default: 'now()' },
  { name: 'updated_at', type: 'TIMESTAMPTZ', options: NN, default: 'now()' },
]);

// ═══════════════════════════════════════════════════════════
// 3A. LANDLORD TENANT DOMAIN
// ═══════════════════════════════════════════════════════════
addTable('properties', 'properties', 'Canonical premises (no duplicates)', 80, 720, '#059669', 'grp_landlord', [
  { name: 'id', type: 'UUID', options: PK, default: 'gen_random_uuid()' },
  { name: 'tenant_id', type: 'UUID', comment: 'landlord workspace' },
  { name: 'owner_id', type: 'UUID', options: NN },
  { name: 'current_renter_id', type: 'UUID' },
  { name: 'name', type: 'TEXT' },
  { name: 'address_line', type: 'TEXT', options: NN },
  { name: 'district', type: 'TEXT' },
  { name: 'city', type: 'TEXT' },
  { name: 'property_type', type: 'property_type' },
  { name: 'description', type: 'TEXT' },
  { name: 'rent_amount', type: 'NUMERIC(12,2)' },
  { name: 'currency', type: 'TEXT', default: "'USD'" },
  { name: 'status', type: 'property_status', options: NN, default: "'available'" },
  { name: 'contact_phone', type: 'TEXT' },
  { name: 'contact_email', type: 'TEXT' },
  { name: 'created_by_tenant_id', type: 'UUID' },
  { name: 'created_source', type: 'TEXT', comment: 'landlord|water_company|electricity_company' },
  { name: 'is_listed', type: 'BOOLEAN', options: NN, default: 'true' },
  { name: 'created_at', type: 'TIMESTAMPTZ', options: NN, default: 'now()' },
  { name: 'updated_at', type: 'TIMESTAMPTZ', options: NN, default: 'now()' },
]);

addTable('property_photos', 'property_photos', 'Listing photos (private storage)', 480, 720, '#10b981', 'grp_landlord', [
  { name: 'id', type: 'UUID', options: PK, default: 'gen_random_uuid()' },
  { name: 'property_id', type: 'UUID', options: NN },
  { name: 'tenant_id', type: 'UUID', options: NN, comment: 'denormalized for RLS' },
  { name: 'storage_path', type: 'TEXT', options: NN },
  { name: 'sort_order', type: 'INT', default: '0' },
  { name: 'created_at', type: 'TIMESTAMPTZ', options: NN, default: 'now()' },
]);

addTable('rental_assignments', 'rental_assignments', 'Tenancy history; 1 ACTIVE / property', 800, 720, '#0d9488', 'grp_landlord', [
  { name: 'id', type: 'UUID', options: PK, default: 'gen_random_uuid()' },
  { name: 'tenant_id', type: 'UUID', options: NN },
  { name: 'property_id', type: 'UUID', options: NN },
  { name: 'landlord_id', type: 'UUID', options: NN },
  { name: 'renter_id', type: 'UUID', options: NN },
  { name: 'rent_amount', type: 'NUMERIC(12,2)', options: NN },
  { name: 'currency', type: 'TEXT', default: "'USD'" },
  { name: 'due_day', type: 'INT', comment: '1-28' },
  { name: 'start_date', type: 'DATE', options: NN },
  { name: 'end_date', type: 'DATE' },
  { name: 'status', type: 'assignment_status', options: NN },
  { name: 'notes', type: 'TEXT' },
  { name: 'created_at', type: 'TIMESTAMPTZ', options: NN, default: 'now()' },
  { name: 'updated_at', type: 'TIMESTAMPTZ', options: NN, default: 'now()' },
]);

addTable('rent_charges', 'rent_charges', 'Period rent ledger', 1200, 720, '#0891b2', 'grp_landlord', [
  { name: 'id', type: 'UUID', options: PK, default: 'gen_random_uuid()' },
  { name: 'tenant_id', type: 'UUID', options: NN },
  { name: 'assignment_id', type: 'UUID', options: NN },
  { name: 'property_id', type: 'UUID', options: NN },
  { name: 'renter_id', type: 'UUID', options: NN },
  { name: 'period_start', type: 'DATE', options: NN },
  { name: 'period_end', type: 'DATE', options: NN },
  { name: 'due_date', type: 'DATE', options: NN },
  { name: 'amount_due', type: 'NUMERIC(12,2)', options: NN },
  { name: 'amount_paid', type: 'NUMERIC(12,2)', options: NN, default: '0' },
  { name: 'balance', type: 'NUMERIC(12,2)', options: NN },
  { name: 'status', type: 'charge_status', options: NN },
  { name: 'created_at', type: 'TIMESTAMPTZ', options: NN, default: 'now()' },
  { name: 'updated_at', type: 'TIMESTAMPTZ', options: NN, default: 'now()' },
]);

addTable('rent_payments', 'rent_payments', 'Manual/API; landlord approves manual', 1580, 720, '#0284c7', 'grp_landlord', [
  { name: 'id', type: 'UUID', options: PK, default: 'gen_random_uuid()' },
  { name: 'tenant_id', type: 'UUID', options: NN },
  { name: 'rent_charge_id', type: 'UUID', options: NN },
  { name: 'property_id', type: 'UUID', options: NN },
  { name: 'assignment_id', type: 'UUID', options: NN },
  { name: 'payer_id', type: 'UUID', options: NN },
  { name: 'amount', type: 'NUMERIC(12,2)', options: NN },
  { name: 'currency', type: 'TEXT', default: "'USD'" },
  { name: 'method', type: 'payment_method', options: NN },
  { name: 'reference', type: 'TEXT' },
  { name: 'provider', type: 'TEXT' },
  { name: 'provider_transaction_id', type: 'TEXT', comment: 'unique when set' },
  { name: 'idempotency_key', type: 'TEXT' },
  { name: 'proof_path', type: 'TEXT' },
  { name: 'status', type: 'payment_status', options: NN, default: "'pending'" },
  { name: 'submitted_at', type: 'TIMESTAMPTZ', options: NN, default: 'now()' },
  { name: 'reviewed_by', type: 'UUID' },
  { name: 'reviewed_at', type: 'TIMESTAMPTZ' },
  { name: 'rejection_reason', type: 'TEXT' },
  { name: 'created_at', type: 'TIMESTAMPTZ', options: NN, default: 'now()' },
  { name: 'updated_at', type: 'TIMESTAMPTZ', options: NN, default: 'now()' },
]);

addTable('maintenance_requests', 'maintenance_requests', 'Renter creates; landlord updates status', 1580, 1120, '#65a30d', 'grp_landlord', [
  { name: 'id', type: 'UUID', options: PK, default: 'gen_random_uuid()' },
  { name: 'tenant_id', type: 'UUID', options: NN },
  { name: 'property_id', type: 'UUID', options: NN },
  { name: 'renter_id', type: 'UUID', options: NN },
  { name: 'category', type: 'TEXT' },
  { name: 'urgency', type: 'urgency', options: NN, default: "'medium'" },
  { name: 'description', type: 'TEXT', options: NN },
  { name: 'photo_path', type: 'TEXT' },
  { name: 'status', type: 'maintenance_status', options: NN, default: "'pending'" },
  { name: 'created_at', type: 'TIMESTAMPTZ', options: NN, default: 'now()' },
  { name: 'updated_at', type: 'TIMESTAMPTZ', options: NN, default: 'now()' },
]);

// ═══════════════════════════════════════════════════════════
// 3B. UTILITY COMPANY TENANT DOMAIN
// ═══════════════════════════════════════════════════════════
addTable('utility_accounts', 'utility_accounts', 'Links company tenant → property (no duplicate property)', 80, 1580, '#ea580c', 'grp_utility', [
  { name: 'id', type: 'UUID', options: PK, default: 'gen_random_uuid()' },
  { name: 'tenant_id', type: 'UUID', options: NN, comment: 'water OR electricity company' },
  { name: 'property_id', type: 'UUID', options: NN },
  { name: 'service_type', type: 'service_type', options: NN },
  { name: 'account_number', type: 'TEXT', options: NN },
  { name: 'customer_id', type: 'UUID', options: NN },
  { name: 'status', type: 'TEXT', options: NN, default: "'active'" },
  { name: 'effective_from', type: 'DATE' },
  { name: 'effective_to', type: 'DATE' },
  { name: 'unit_price', type: 'NUMERIC(12,4)' },
  { name: 'extra_charges_config', type: 'JSONB' },
  { name: 'created_at', type: 'TIMESTAMPTZ', options: NN, default: 'now()' },
  { name: 'updated_at', type: 'TIMESTAMPTZ', options: NN, default: 'now()' },
]);

addTable('meters', 'meters', 'Meters on an account', 520, 1580, '#f97316', 'grp_utility', [
  { name: 'id', type: 'UUID', options: PK, default: 'gen_random_uuid()' },
  { name: 'tenant_id', type: 'UUID', options: NN },
  { name: 'utility_account_id', type: 'UUID', options: NN },
  { name: 'meter_number', type: 'TEXT', options: NN },
  { name: 'service_type', type: 'service_type', options: NN },
  { name: 'status', type: 'TEXT', options: NN, default: "'active'" },
  { name: 'installed_at', type: 'DATE' },
  { name: 'replaced_at', type: 'DATE' },
  { name: 'created_at', type: 'TIMESTAMPTZ', options: NN, default: 'now()' },
  { name: 'updated_at', type: 'TIMESTAMPTZ', options: NN, default: 'now()' },
]);

addTable('meter_readings', 'meter_readings', 'Readings + correction chain', 900, 1580, '#fb923c', 'grp_utility', [
  { name: 'id', type: 'UUID', options: PK, default: 'gen_random_uuid()' },
  { name: 'tenant_id', type: 'UUID', options: NN },
  { name: 'meter_id', type: 'UUID', options: NN },
  { name: 'utility_account_id', type: 'UUID', options: NN },
  { name: 'reading_value', type: 'NUMERIC(14,3)', options: NN },
  { name: 'previous_reading_value', type: 'NUMERIC(14,3)' },
  { name: 'reading_date', type: 'DATE', options: NN },
  { name: 'units_consumed', type: 'NUMERIC(14,3)' },
  { name: 'status', type: 'reading_status', options: NN, default: "'valid'" },
  { name: 'recorded_by', type: 'UUID', options: NN },
  { name: 'correction_of_id', type: 'UUID' },
  { name: 'correction_reason', type: 'TEXT' },
  { name: 'notes', type: 'TEXT' },
  { name: 'created_at', type: 'TIMESTAMPTZ', options: NN, default: 'now()' },
  { name: 'updated_at', type: 'TIMESTAMPTZ', options: NN, default: 'now()' },
]);

addTable('utility_bills', 'utility_bills', 'IMMUTABLE responsible_party snapshot', 1340, 1580, '#c2410c', 'grp_utility', [
  { name: 'id', type: 'UUID', options: PK, default: 'gen_random_uuid()' },
  { name: 'tenant_id', type: 'UUID', options: NN },
  { name: 'utility_account_id', type: 'UUID', options: NN },
  { name: 'property_id', type: 'UUID', options: NN },
  { name: 'meter_reading_id', type: 'UUID' },
  { name: 'service_type', type: 'service_type', options: NN },
  { name: 'period_start', type: 'DATE', options: NN },
  { name: 'period_end', type: 'DATE', options: NN },
  { name: 'previous_reading', type: 'NUMERIC(14,3)' },
  { name: 'current_reading', type: 'NUMERIC(14,3)' },
  { name: 'units_consumed', type: 'NUMERIC(14,3)' },
  { name: 'unit_price', type: 'NUMERIC(12,4)' },
  { name: 'extra_charges', type: 'NUMERIC(12,2)', default: '0' },
  { name: 'total_amount', type: 'NUMERIC(12,2)', options: NN },
  { name: 'amount_paid', type: 'NUMERIC(12,2)', options: NN, default: '0' },
  { name: 'balance', type: 'NUMERIC(12,2)', options: NN },
  { name: 'due_date', type: 'DATE', options: NN },
  { name: 'status', type: 'bill_status', options: NN },
  { name: 'responsible_party_id', type: 'UUID', options: NN, comment: 'snapshot — never rewrite' },
  { name: 'responsible_party_role', type: 'TEXT', comment: 'renter|owner' },
  { name: 'occupancy_snapshot', type: 'JSONB' },
  { name: 'created_at', type: 'TIMESTAMPTZ', options: NN, default: 'now()' },
  { name: 'updated_at', type: 'TIMESTAMPTZ', options: NN, default: 'now()' },
]);

addTable('utility_payments', 'utility_payments', 'Company approves manual (same tenant only)', 1860, 1580, '#9a3412', 'grp_utility', [
  { name: 'id', type: 'UUID', options: PK, default: 'gen_random_uuid()' },
  { name: 'tenant_id', type: 'UUID', options: NN },
  { name: 'utility_bill_id', type: 'UUID', options: NN },
  { name: 'utility_account_id', type: 'UUID', options: NN },
  { name: 'payer_id', type: 'UUID', options: NN },
  { name: 'amount', type: 'NUMERIC(12,2)', options: NN },
  { name: 'currency', type: 'TEXT', default: "'USD'" },
  { name: 'method', type: 'payment_method', options: NN },
  { name: 'reference', type: 'TEXT' },
  { name: 'provider', type: 'TEXT' },
  { name: 'provider_transaction_id', type: 'TEXT' },
  { name: 'idempotency_key', type: 'TEXT' },
  { name: 'proof_path', type: 'TEXT' },
  { name: 'status', type: 'payment_status', options: NN, default: "'pending'" },
  { name: 'submitted_at', type: 'TIMESTAMPTZ', options: NN, default: 'now()' },
  { name: 'reviewed_by', type: 'UUID' },
  { name: 'reviewed_at', type: 'TIMESTAMPTZ' },
  { name: 'rejection_reason', type: 'TEXT' },
  { name: 'created_at', type: 'TIMESTAMPTZ', options: NN, default: 'now()' },
  { name: 'updated_at', type: 'TIMESTAMPTZ', options: NN, default: 'now()' },
]);

// ═══════════════════════════════════════════════════════════
// 4. CROSS-CUTTING
// ═══════════════════════════════════════════════════════════
addTable('notifications', 'notifications', 'In-app/email; safe body only', 2260, 100, '#64748b', 'grp_cross', [
  { name: 'id', type: 'UUID', options: PK, default: 'gen_random_uuid()' },
  { name: 'tenant_id', type: 'UUID' },
  { name: 'recipient_id', type: 'UUID', options: NN },
  { name: 'event_type', type: 'TEXT', options: NN },
  { name: 'channel', type: 'notification_channel', options: NN },
  { name: 'title', type: 'TEXT', options: NN },
  { name: 'body', type: 'TEXT', options: NN },
  { name: 'link_path', type: 'TEXT' },
  { name: 'delivery_status', type: 'delivery_status', options: NN, default: "'pending'" },
  { name: 'created_at', type: 'TIMESTAMPTZ', options: NN, default: 'now()' },
  { name: 'read_at', type: 'TIMESTAMPTZ' },
]);

addTable('audit_logs', 'audit_logs', 'Append-only sensitive actions', 2580, 100, '#334155', 'grp_cross', [
  { name: 'id', type: 'UUID', options: PK, default: 'gen_random_uuid()' },
  { name: 'tenant_id', type: 'UUID' },
  { name: 'actor_id', type: 'UUID', options: NN },
  { name: 'action', type: 'TEXT', options: NN },
  { name: 'entity_type', type: 'TEXT', options: NN },
  { name: 'entity_id', type: 'UUID' },
  { name: 'metadata', type: 'JSONB' },
  { name: 'created_at', type: 'TIMESTAMPTZ', options: NN, default: 'now()' },
]);

// ── Relationships ──────────────────────────────────────────
addRel('rel_tm_tenant', REL.OneN, 'tenants', ['id'], 'tenant_memberships', ['tenant_id']);
addRel('rel_tm_user', REL.OneN, 'profiles', ['id'], 'tenant_memberships', ['user_id']);
addRel('rel_tm_invited', REL.ZeroN, 'profiles', ['id'], 'tenant_memberships', ['invited_by'], ON.setNull);
addRel('rel_prop_tenant', REL.ZeroN, 'tenants', ['id'], 'properties', ['tenant_id'], ON.setNull);
addRel('rel_prop_owner', REL.OneN, 'profiles', ['id'], 'properties', ['owner_id']);
addRel('rel_prop_renter', REL.ZeroN, 'profiles', ['id'], 'properties', ['current_renter_id'], ON.setNull);
addRel('rel_photo_prop', REL.OneN, 'properties', ['id'], 'property_photos', ['property_id'], ON.cascade);
addRel('rel_ra_prop', REL.OneN, 'properties', ['id'], 'rental_assignments', ['property_id']);
addRel('rel_ra_tenant', REL.OneN, 'tenants', ['id'], 'rental_assignments', ['tenant_id']);
addRel('rel_ra_landlord', REL.OneN, 'profiles', ['id'], 'rental_assignments', ['landlord_id']);
addRel('rel_ra_renter', REL.OneN, 'profiles', ['id'], 'rental_assignments', ['renter_id']);
addRel('rel_rc_assign', REL.OneN, 'rental_assignments', ['id'], 'rent_charges', ['assignment_id']);
addRel('rel_rp_charge', REL.OneN, 'rent_charges', ['id'], 'rent_payments', ['rent_charge_id']);
addRel('rel_rp_payer', REL.OneN, 'profiles', ['id'], 'rent_payments', ['payer_id']);
addRel('rel_ua_tenant', REL.OneN, 'tenants', ['id'], 'utility_accounts', ['tenant_id']);
addRel('rel_ua_prop', REL.OneN, 'properties', ['id'], 'utility_accounts', ['property_id']);
addRel('rel_ua_cust', REL.OneN, 'profiles', ['id'], 'utility_accounts', ['customer_id']);
addRel('rel_meter_ua', REL.OneN, 'utility_accounts', ['id'], 'meters', ['utility_account_id'], ON.cascade);
addRel('rel_mr_meter', REL.OneN, 'meters', ['id'], 'meter_readings', ['meter_id']);
addRel('rel_mr_corr', REL.ZeroN, 'meter_readings', ['id'], 'meter_readings', ['correction_of_id'], ON.setNull);
addRel('rel_ub_ua', REL.OneN, 'utility_accounts', ['id'], 'utility_bills', ['utility_account_id']);
addRel('rel_ub_resp', REL.OneN, 'profiles', ['id'], 'utility_bills', ['responsible_party_id']);
addRel('rel_up_bill', REL.OneN, 'utility_bills', ['id'], 'utility_payments', ['utility_bill_id']);
addRel('rel_maint_prop', REL.OneN, 'properties', ['id'], 'maintenance_requests', ['property_id']);
addRel('rel_maint_renter', REL.OneN, 'profiles', ['id'], 'maintenance_requests', ['renter_id']);
addRel('rel_notif_recip', REL.OneN, 'profiles', ['id'], 'notifications', ['recipient_id']);
addRel('rel_audit_actor', REL.OneN, 'profiles', ['id'], 'audit_logs', ['actor_id']);

addIndex('idx_tm_tenant_user', 'uq_tenant_memberships_tenant_user', 'tenant_memberships', ['tenant_id', 'user_id'], true);
addIndex('idx_ua_acct', 'uq_utility_accounts_tenant_account', 'utility_accounts', ['tenant_id', 'account_number'], true);
addIndex('idx_meter_num', 'uq_meters_tenant_number', 'meters', ['tenant_id', 'meter_number'], true);
addIndex('idx_rp_provider', 'uq_rent_payments_provider_txn', 'rent_payments', ['provider_transaction_id'], true);
addIndex('idx_up_provider', 'uq_utility_payments_provider_txn', 'utility_payments', ['provider_transaction_id'], true);

// Flow memos (like the reference architecture diagram)
memos.memo_flow = {
  id: 'memo_flow',
  value:
    'IJAARO multi-tenant flow (like SaaS lanes)\n\n1) ijaaro.com landing\n2) Register tenant → provisioning\n3) slug.ijaaro.com login\n   • Landlord: admin / staff / renter\n   • Water Co: admin / staff / customer\n   • Electricity Co: admin / staff / customer\n\nIsolation: tenant_id + RLS\nApprovals never cross tenant type',
  ui: { x: 420, y: 160, width: 360, height: 280, color: '#fef3c7' },
};

memos.memo_roles_landlord = {
  id: 'memo_roles_landlord',
  value: 'LANDLORD LOGIN ROLES\n• landlord_admin\n• landlord_staff\n• renter\n\nApproves: RENT only',
  ui: { x: 1960, y: 720, width: 160, height: 160, color: '#d1fae5' },
};

memos.memo_roles_utility = {
  id: 'memo_roles_utility',
  value: 'UTILITY LOGIN ROLES\n• utility_admin\n• utility_staff\n• utility_customer\n\nApproves: OWN service only\n(water≠electricity)',
  ui: { x: 2260, y: 1580, width: 200, height: 180, color: '#ffedd5' },
};

const doc = {
  $schema: 'https://raw.githubusercontent.com/dineug/erd-editor/main/json-schema/schema.json',
  version: '3.0.0',
  settings: {
    originX: 0,
    originY: 0,
    zoomLevel: 0.45,
    show: 511,
    database: 16,
    databaseName: 'ijaaro',
    canvasType: 'ERD',
    language: 16,
    tableNameCase: 8,
    columnNameCase: 8,
    bracketType: 2,
    relationshipDataTypeSync: true,
    columnOrder: [1, 2, 4, 8, 16, 32, 64],
    maxWidthComment: 120,
    lockSettings: 0,
  },
  doc: {
    tableIds: Object.keys(tables),
    relationshipIds: Object.keys(relationships),
    indexIds: Object.keys(indexes),
    memoIds: Object.keys(memos),
    tableGroupIds: Object.keys(tableGroups),
  },
  collections: {
    tableEntities: tables,
    tableColumnEntities: columns,
    relationshipEntities: relationships,
    indexEntities: indexes,
    indexColumnEntities: indexColumns,
    memoEntities: memos,
    tableGroupEntities: tableGroups,
  },
};

const out = join(root, 'ijaaro-database.erd.json');
writeFileSync(out, JSON.stringify(doc, null, 2), 'utf8');
console.log(`Wrote ${out}`);
console.log(`Groups: ${Object.keys(tableGroups).length}`);
console.log(`Tables: ${Object.keys(tables).length}, Rels: ${Object.keys(relationships).length}`);
