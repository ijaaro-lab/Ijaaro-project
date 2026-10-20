export type TenantType =
  | "platform"
  | "landlord"
  | "water_company"
  | "electricity_company";

export type TenantStatus = "pending" | "active" | "suspended" | "disabled";

export type MembershipStatus = "invited" | "active" | "disabled";

export type AppRole =
  | "super_admin"
  | "landlord_admin"
  | "landlord_staff"
  | "renter"
  | "utility_admin"
  | "utility_staff"
  | "utility_customer";

export type PropertyStatus = "available" | "occupied" | "vacant";
export type PropertyType = "apartment" | "house" | "shop" | "office" | "other";
export type AssignmentStatus = "invited" | "active" | "completed" | "cancelled";
export type ChargeStatus = "due" | "partial" | "paid" | "overdue" | "cancelled";
export type PaymentStatus =
  | "pending"
  | "processing"
  | "paid"
  | "rejected"
  | "failed"
  | "cancelled"
  | "refunded";
export type PaymentMethod =
  | "cash"
  | "bank_transfer"
  | "mobile_money"
  | "card"
  | "other"
  | "api_provider";

export type Profile = {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  avatar_url: string | null;
  preferred_language: string;
  created_at: string;
  updated_at: string;
};

export type Tenant = {
  id: string;
  name: string;
  slug: string;
  subdomain: string;
  tenant_type: TenantType;
  status: TenantStatus;
  branding: Record<string, unknown>;
  settings: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type TenantMembership = {
  id: string;
  tenant_id: string;
  user_id: string;
  role: AppRole;
  status: MembershipStatus;
  permissions: Record<string, unknown>;
  invited_by: string | null;
  created_at: string;
  updated_at: string;
};

export type AuditLog = {
  id: string;
  tenant_id: string | null;
  actor_id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type Property = {
  id: string;
  tenant_id: string;
  owner_id: string;
  current_renter_id: string | null;
  name: string | null;
  address_line: string;
  district: string | null;
  city: string | null;
  property_type: PropertyType;
  description: string | null;
  rent_amount: number | null;
  currency: string;
  status: PropertyStatus;
  contact_phone: string | null;
  contact_email: string | null;
  created_by_tenant_id: string | null;
  created_source: string;
  is_listed: boolean;
  created_at: string;
  updated_at: string;
};

export type PropertyPhoto = {
  id: string;
  property_id: string;
  tenant_id: string;
  storage_path: string;
  sort_order: number;
  created_at: string;
};

export type RentalAssignment = {
  id: string;
  tenant_id: string;
  property_id: string;
  landlord_id: string;
  renter_id: string;
  rent_amount: number;
  currency: string;
  due_day: number | null;
  start_date: string;
  end_date: string | null;
  status: AssignmentStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type RentCharge = {
  id: string;
  tenant_id: string;
  assignment_id: string;
  property_id: string;
  renter_id: string;
  period_start: string;
  period_end: string;
  due_date: string;
  amount_due: number;
  amount_paid: number;
  balance: number;
  status: ChargeStatus;
  created_at: string;
  updated_at: string;
};

export type RentPayment = {
  id: string;
  tenant_id: string;
  rent_charge_id: string;
  property_id: string;
  assignment_id: string;
  payer_id: string;
  amount: number;
  currency: string;
  method: PaymentMethod;
  reference: string | null;
  provider: string | null;
  provider_transaction_id: string | null;
  idempotency_key: string | null;
  proof_path: string | null;
  status: PaymentStatus;
  submitted_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
};

// ---------------------------------------------------------------------------
// Utility (water / electricity) domain — Phase 3–4
// ---------------------------------------------------------------------------
export type ServiceType = "water" | "electricity";
export type ReadingStatus = "valid" | "estimated" | "corrected" | "reset" | "disputed";
export type BillStatus =
  | "draft"
  | "issued"
  | "partial"
  | "paid"
  | "overdue"
  | "cancelled"
  | "disputed";
export type UtilityAccountStatus = "active" | "inactive" | "suspended" | "closed";
export type MeterStatus = "active" | "inactive" | "replaced" | "faulty";
export type ResponsiblePartyRole = "renter" | "owner" | "customer";

export type ExtraChargesConfig = {
  fixed_amount?: number;
  items?: { label?: string; amount: number }[];
};

export type UtilityAccount = {
  id: string;
  tenant_id: string;
  property_id: string;
  service_type: ServiceType;
  account_number: string;
  customer_id: string;
  status: UtilityAccountStatus;
  effective_from: string | null;
  effective_to: string | null;
  unit_price: number;
  extra_charges_config: ExtraChargesConfig;
  created_at: string;
  updated_at: string;
};

export type Meter = {
  id: string;
  tenant_id: string;
  utility_account_id: string;
  meter_number: string;
  service_type: ServiceType;
  status: MeterStatus;
  installed_at: string | null;
  replaced_at: string | null;
  created_at: string;
  updated_at: string;
};

export type MeterReading = {
  id: string;
  tenant_id: string;
  meter_id: string;
  utility_account_id: string;
  reading_value: number;
  previous_reading_value: number | null;
  reading_date: string;
  units_consumed: number | null;
  status: ReadingStatus;
  recorded_by: string;
  correction_of_id: string | null;
  correction_reason: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type UtilityBill = {
  id: string;
  tenant_id: string;
  utility_account_id: string;
  property_id: string;
  meter_reading_id: string | null;
  service_type: ServiceType;
  period_start: string;
  period_end: string;
  previous_reading: number;
  current_reading: number;
  units_consumed: number;
  unit_price: number;
  extra_charges: number;
  total_amount: number;
  amount_paid: number;
  balance: number;
  due_date: string;
  status: BillStatus;
  responsible_party_id: string;
  responsible_party_role: ResponsiblePartyRole;
  occupancy_snapshot: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type UtilityPayment = {
  id: string;
  tenant_id: string;
  utility_bill_id: string;
  utility_account_id: string;
  payer_id: string;
  amount: number;
  currency: string;
  method: PaymentMethod;
  reference: string | null;
  provider: string | null;
  provider_transaction_id: string | null;
  idempotency_key: string | null;
  proof_path: string | null;
  status: PaymentStatus;
  submitted_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
};

export type PropertySearchResult = {
  id: string;
  address_line: string;
  district: string | null;
  city: string | null;
  name: string | null;
  status: PropertyStatus;
  owner_id: string;
  current_renter_id: string | null;
  landlord_tenant_id: string;
};

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: Partial<Profile> & { id: string };
        Update: Partial<Profile>;
      };
      tenants: {
        Row: Tenant;
        Insert: Partial<Tenant> & {
          name: string;
          slug: string;
          tenant_type: TenantType;
        };
        Update: Partial<Tenant>;
      };
      tenant_memberships: {
        Row: TenantMembership;
        Insert: Partial<TenantMembership> & {
          tenant_id: string;
          user_id: string;
          role: AppRole;
        };
        Update: Partial<TenantMembership>;
      };
      audit_logs: {
        Row: AuditLog;
        Insert: never;
        Update: never;
      };
      properties: {
        Row: Property;
        Insert: Partial<Property> & {
          tenant_id: string;
          owner_id: string;
          address_line: string;
        };
        Update: Partial<Property>;
      };
      property_photos: {
        Row: PropertyPhoto;
        Insert: Partial<PropertyPhoto> & {
          property_id: string;
          tenant_id: string;
          storage_path: string;
        };
        Update: Partial<PropertyPhoto>;
      };
      rental_assignments: {
        Row: RentalAssignment;
        Insert: never;
        Update: Partial<Pick<RentalAssignment, "notes" | "end_date">>;
      };
      rent_charges: {
        Row: RentCharge;
        Insert: Partial<RentCharge> & {
          tenant_id: string;
          assignment_id: string;
          property_id: string;
          renter_id: string;
          period_start: string;
          period_end: string;
          due_date: string;
          amount_due: number;
          balance: number;
        };
        Update: Partial<RentCharge>;
      };
      rent_payments: {
        Row: RentPayment;
        Insert: Partial<RentPayment> & {
          rent_charge_id: string;
          amount: number;
        };
        Update: Partial<Pick<RentPayment, "proof_path" | "reference" | "method">>;
      };
      utility_accounts: {
        Row: UtilityAccount;
        Insert: Partial<UtilityAccount> & {
          tenant_id: string;
          property_id: string;
          service_type: ServiceType;
          account_number: string;
          customer_id: string;
        };
        Update: Partial<UtilityAccount>;
      };
      meters: {
        Row: Meter;
        Insert: Partial<Meter> & {
          tenant_id: string;
          utility_account_id: string;
          meter_number: string;
          service_type: ServiceType;
        };
        Update: Partial<Meter>;
      };
      meter_readings: {
        Row: MeterReading;
        Insert: never;
        Update: never;
      };
      utility_bills: {
        Row: UtilityBill;
        Insert: never;
        Update: never;
      };
      utility_payments: {
        Row: UtilityPayment;
        Insert: Partial<UtilityPayment> & {
          utility_bill_id: string;
          amount: number;
        };
        Update: Partial<Pick<UtilityPayment, "proof_path" | "reference" | "method">>;
      };
    };
    Functions: {
      is_super_admin: { Args: Record<string, never>; Returns: boolean };
      is_member_of: { Args: { p_tenant_id: string }; Returns: boolean };
      has_role: {
        Args: { p_tenant_id: string; p_roles: AppRole[] };
        Returns: boolean;
      };
      can_manage_landlord_ops: { Args: { p_tenant_id: string }; Returns: boolean };
      can_approve_rent: { Args: { p_tenant_id: string }; Returns: boolean };
      provision_tenant: {
        Args: {
          p_name: string;
          p_slug: string;
          p_tenant_type: TenantType;
          p_status?: TenantStatus;
          p_owner_user_id?: string | null;
          p_owner_role?: AppRole | null;
          p_branding?: Record<string, unknown>;
          p_settings?: Record<string, unknown>;
          p_owner_email?: string | null;
          p_subdomain?: string | null;
          p_activate?: boolean;
        };
        Returns: {
          tenant: Tenant;
          membership: TenantMembership | null;
          workspace: { slug: string; subdomain: string; path: string };
        };
      };
      self_provision_tenant: {
        Args: {
          p_name: string;
          p_slug: string;
          p_tenant_type: TenantType;
          p_subdomain?: string | null;
          p_branding?: Record<string, unknown>;
        };
        Returns: {
          tenant: Tenant;
          membership: TenantMembership;
          workspace: { slug: string; subdomain: string; path: string };
        };
      };
      update_tenant_branding: {
        Args: {
          p_tenant_id: string;
          p_branding: Record<string, unknown>;
        };
        Returns: Tenant;
      };
      lookup_profile_by_email: {
        Args: { p_email: string };
        Returns: Array<{
          id: string;
          full_name: string;
          email: string | null;
          phone: string | null;
        }>;
      };
      resolve_tenant_workspace: {
        Args: { p_key: string };
        Returns: {
          id: string;
          name: string;
          slug: string;
          subdomain: string;
          tenant_type: TenantType;
          status: TenantStatus;
          branding: Record<string, unknown>;
        } | null;
      };
      tenant_is_operable: { Args: { p_tenant_id: string }; Returns: boolean };
      can_operate_in_tenant: { Args: { p_tenant_id: string }; Returns: boolean };
      set_tenant_status: {
        Args: { p_tenant_id: string; p_status: TenantStatus };
        Returns: Tenant;
      };
      update_tenant: {
        Args: {
          p_tenant_id: string;
          p_name?: string | null;
          p_slug?: string | null;
          p_subdomain?: string | null;
          p_status?: TenantStatus | null;
        };
        Returns: Tenant;
      };
      delete_tenant: {
        Args: { p_tenant_id: string };
        Returns: {
          id: string;
          name: string;
          slug: string;
          tenant_type: TenantType;
        };
      };
      manage_membership: {
        Args: {
          p_tenant_id: string;
          p_user_id: string;
          p_role: AppRole;
          p_status?: MembershipStatus;
        };
        Returns: TenantMembership;
      };
      list_company_member_profiles: {
        Args: { p_tenant_id: string };
        Returns: Array<{
          membership_id: string;
          user_id: string;
          full_name: string | null;
          email: string | null;
          phone: string | null;
          role: AppRole;
          membership_status: MembershipStatus;
          created_at: string;
        }>;
      };
      assign_renter: {
        Args: {
          p_property_id: string;
          p_renter_id: string;
          p_rent_amount: number;
          p_start_date: string;
          p_due_day?: number | null;
          p_currency?: string;
          p_notes?: string | null;
          p_create_initial_charge?: boolean;
        };
        Returns: {
          assignment: RentalAssignment;
          initial_charge_id: string | null;
        };
      };
      complete_move_out: {
        Args: {
          p_assignment_id: string;
          p_end_date?: string | null;
          p_notes?: string | null;
        };
        Returns: { assignment: RentalAssignment };
      };
      create_rent_charge: {
        Args: {
          p_assignment_id: string;
          p_period_start: string;
          p_period_end: string;
          p_due_date: string;
          p_amount_due?: number | null;
        };
        Returns: RentCharge;
      };
      review_rent_payment: {
        Args: {
          p_payment_id: string;
          p_decision: string;
          p_rejection_reason?: string | null;
        };
        Returns: { payment: RentPayment; charge: RentCharge };
      };
      search_properties_for_link: {
        Args: {
          p_query: string;
          p_limit?: number;
        };
        Returns: PropertySearchResult[];
      };
      create_utility_premises: {
        Args: {
          p_company_tenant_id: string;
          p_address_line: string;
          p_owner_id: string;
          p_name?: string | null;
          p_district?: string | null;
          p_city?: string | null;
          p_property_type?: PropertyType;
          p_contact_phone?: string | null;
          p_contact_email?: string | null;
        };
        Returns: Property;
      };
      link_utility_account: {
        Args: {
          p_company_tenant_id: string;
          p_property_id: string;
          p_customer_id: string;
          p_account_number: string;
          p_unit_price?: number;
          p_extra_charges_config?: ExtraChargesConfig;
          p_meter_number?: string | null;
          p_effective_from?: string | null;
          p_ensure_customer_membership?: boolean;
        };
        Returns: { account: UtilityAccount; meter: Meter | null };
      };
      record_meter_reading: {
        Args: {
          p_meter_id: string;
          p_reading_value: number;
          p_reading_date?: string | null;
          p_status?: ReadingStatus;
          p_correction_of_id?: string | null;
          p_correction_reason?: string | null;
          p_notes?: string | null;
        };
        Returns: MeterReading;
      };
      generate_utility_bill: {
        Args: {
          p_meter_reading_id: string;
          p_period_start: string;
          p_period_end: string;
          p_due_date?: string | null;
          p_unit_price?: number | null;
        };
        Returns: UtilityBill;
      };
      register_utility_house: {
        Args: {
          p_company_tenant_id: string;
          p_address_line: string;
          p_account_number: string;
          p_monthly_amount: number;
          p_name?: string | null;
          p_district?: string | null;
          p_city?: string | null;
          p_contact_phone?: string | null;
          p_contact_email?: string | null;
          p_customer_email?: string | null;
          p_meter_number?: string | null;
          p_property_type?: PropertyType;
        };
        Returns: {
          house: Pick<
            Property,
            | "id"
            | "name"
            | "address_line"
            | "district"
            | "city"
            | "contact_phone"
            | "contact_email"
            | "property_type"
            | "status"
          >;
          account: UtilityAccount;
          meter: Meter | null;
          monthly_amount: number;
        };
      };
      generate_flat_utility_bill: {
        Args: {
          p_utility_account_id: string;
          p_period_start: string;
          p_period_end: string;
          p_due_date?: string | null;
        };
        Returns: UtilityBill;
      };
      review_utility_payment: {
        Args: {
          p_payment_id: string;
          p_decision: string;
          p_rejection_reason?: string | null;
        };
        Returns: { payment: UtilityPayment; bill: UtilityBill };
      };
      register_utility_payment_by_ops: {
        Args: {
          p_utility_bill_id: string;
          p_amount: number;
          p_method: PaymentMethod;
          p_reference?: string | null;
          p_proof_path?: string | null;
          p_idempotency_key?: string | null;
        };
        Returns: UtilityPayment;
      };
      adjust_utility_bill_by_ops: {
        Args: {
          p_utility_bill_id: string;
          p_total_amount?: number | null;
          p_cancel?: boolean;
        };
        Returns: UtilityBill;
      };
      update_utility_customer_by_ops: {
        Args: {
          p_utility_account_id: string;
          p_name?: string | null;
          p_address_line?: string | null;
          p_district?: string | null;
          p_city?: string | null;
          p_contact_phone?: string | null;
          p_contact_email?: string | null;
          p_account_number?: string | null;
          p_monthly_amount?: number | null;
        };
        Returns: Record<string, unknown>;
      };
      deactivate_utility_account_by_admin: {
        Args: { p_utility_account_id: string };
        Returns: UtilityAccount;
      };
    };
  };
};
