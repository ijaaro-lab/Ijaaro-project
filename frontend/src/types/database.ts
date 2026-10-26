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
export type PropertyType = "apartment" | "house" | "villa" | "shop" | "office" | "other";
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
  /**
   * Legacy optional field — do not use for uniqueness.
   * Landlord-scoped usernames live in tenant_renter_usernames (RP-1.3.2).
   */
  username?: string | null;
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
  neighborhood: string | null;
  bedrooms: number | null;
  kitchens: number | null;
  bathrooms: number | null;
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

/** Allowlisted marketplace card fields from list_marketplace_listings(). */
export type MarketplaceListingSummary = {
  id: string;
  name: string | null;
  district: string | null;
  city: string | null;
  property_type: PropertyType;
  status: PropertyStatus;
  rent_amount: number | null;
  currency: string;
};

/** Allowlisted marketplace detail from get_marketplace_listing(). */
export type MarketplaceListing = MarketplaceListingSummary & {
  address_line: string;
  description: string | null;
  contact_phone: string | null;
  contact_email: string | null;
};

/** Landlord public website cards (list_landlord_public_listings). Same allowlist as marketplace cards. */
export type LandlordPublicListingSummary = MarketplaceListingSummary;

/**
 * Landlord public website detail (get_landlord_public_listing).
 * Extends marketplace detail with public-safe room counts and neighborhood.
 */
export type LandlordPublicListing = MarketplaceListing & {
  neighborhood: string | null;
  bedrooms: number | null;
  kitchens: number | null;
  bathrooms: number | null;
};

export type RentalApplicationStatus = "pending" | "accepted" | "rejected";

export type RentalApplication = {
  id: string;
  tenant_id: string;
  property_id: string;
  applicant_user_id: string;
  requested_username: string;
  message: string | null;
  status: RentalApplicationStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type MyRentalApplicationRow = {
  id: string;
  tenant_id: string;
  property_id: string;
  requested_username: string;
  message: string | null;
  status: RentalApplicationStatus;
  reviewed_at: string | null;
  created_at: string;
  property_name: string | null;
  property_district: string | null;
  property_city: string | null;
};

export type LandlordRentalApplicationRow = {
  id: string;
  tenant_id: string;
  property_id: string;
  applicant_user_id: string;
  requested_username: string;
  message: string | null;
  status: RentalApplicationStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  property_name: string | null;
  property_district: string | null;
  property_city: string | null;
  applicant_full_name: string | null;
  applicant_email: string | null;
  applicant_phone: string | null;
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
  meter_reading_id: string;
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
        /** Direct client updates: identity + status are immutable (use assign/move-out RPCs). */
        Update: Partial<
          Pick<RentalAssignment, "rent_amount" | "currency" | "due_day" | "notes" | "end_date">
        >;
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
      /** Active landlord_admin or landlord_staff — property CRUD (not delete) / photo upload. */
      can_manage_landlord_properties: {
        Args: { p_tenant_id: string };
        Returns: boolean;
      };
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
      /** Landlord-admin-only email lookup for staff/renter linking (not SA lookup). */
      lookup_profile_by_email_for_landlord_admin: {
        Args: { p_email: string; p_tenant_id: string };
        Returns: Array<{
          id: string;
          full_name: string;
          email: string | null;
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
      manage_membership: {
        Args: {
          p_tenant_id: string;
          p_user_id: string;
          p_role: AppRole;
          p_status?: MembershipStatus;
        };
        Returns: TenantMembership;
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
      /** service_role / postgres only — automatic monthly rent charge batch. */
      generate_monthly_rent_charges: {
        Args: {
          p_as_of?: string;
          p_max_months?: number;
        };
        Returns: {
          as_of: string;
          month_cap: string;
          max_months: number;
          assignments_scanned: number;
          created: number;
          skipped_duplicate: number;
          skipped_ineligible: number;
        };
      };
      review_rent_payment: {
        Args: {
          p_payment_id: string;
          p_decision: string;
          p_rejection_reason?: string | null;
        };
        Returns: { payment: RentPayment; charge: RentCharge };
      };
      /** Landlord ops: active renter profiles on a landlord tenant (RP-1.3.6 migration mirror). */
      list_same_tenant_member_profiles: {
        Args: { p_tenant_id: string };
        Returns: {
          user_id: string;
          full_name: string | null;
          email: string | null;
          role: AppRole;
          membership_status: MembershipStatus;
        }[];
      };
      /** Landlord admin: landlord_staff profiles (active/disabled) for staff management. */
      list_landlord_staff_profiles: {
        Args: { p_tenant_id: string };
        Returns: {
          user_id: string;
          full_name: string | null;
          email: string | null;
          role: AppRole;
          membership_status: MembershipStatus;
        }[];
      };
      list_marketplace_listings: {
        Args: Record<string, never>;
        Returns: MarketplaceListingSummary[];
      };
      get_marketplace_listing: {
        Args: { p_id: string };
        Returns: MarketplaceListing[];
      };
      list_landlord_public_listings: {
        Args: { p_tenant_key: string };
        Returns: LandlordPublicListingSummary[];
      };
      get_landlord_public_listing: {
        Args: { p_tenant_key: string; p_property_id: string };
        Returns: LandlordPublicListing[];
      };
      submit_rental_application: {
        Args: {
          p_tenant_key: string;
          p_property_id: string;
          p_requested_username: string;
          p_message?: string | null;
        };
        Returns: RentalApplication;
      };
      list_my_rental_applications: {
        Args: { p_tenant_key?: string | null };
        Returns: MyRentalApplicationRow[];
      };
      list_landlord_rental_applications: {
        Args: { p_status?: RentalApplicationStatus | null };
        Returns: LandlordRentalApplicationRow[];
      };
      review_rental_application: {
        Args: { p_application_id: string; p_decision: string };
        Returns: RentalApplication;
      };
      check_landlord_username_available: {
        Args: { p_tenant_key: string; p_username: string };
        Returns: boolean;
      };
      landlord_username_available: {
        Args: {
          p_tenant_id: string;
          p_username: string;
          p_exclude_user_id?: string | null;
        };
        Returns: boolean;
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
      review_utility_payment: {
        Args: {
          p_payment_id: string;
          p_decision: string;
          p_rejection_reason?: string | null;
        };
        Returns: { payment: UtilityPayment; bill: UtilityBill };
      };
    };
  };
};
