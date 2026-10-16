/**
 * Shared server-side types for Edge Functions and privileged workflows.
 * Keep in sync with frontend/src/types/database.ts and DATABASE_DESIGN.md.
 */

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

export type ProvisionTenantRequest = {
  name: string;
  slug: string;
  tenant_type: TenantType;
  status?: TenantStatus;
  owner_user_id?: string | null;
  owner_role?: AppRole | null;
  branding?: Record<string, unknown>;
  settings?: Record<string, unknown>;
};

export type SetTenantStatusRequest = {
  tenant_id: string;
  status: TenantStatus;
};

export type AssignRenterRequest = {
  property_id: string;
  renter_id: string;
  rent_amount: number;
  start_date: string;
  due_day?: number | null;
  currency?: string;
  notes?: string | null;
  create_initial_charge?: boolean;
};

export type CompleteMoveOutRequest = {
  assignment_id: string;
  end_date?: string | null;
  notes?: string | null;
};

export type ReviewRentPaymentRequest = {
  payment_id: string;
  decision: "approve" | "reject";
  rejection_reason?: string | null;
  payment_type?: "rent";
};

export type ManageMembershipRequest = {
  tenant_id: string;
  user_id: string;
  role: AppRole;
  status?: MembershipStatus;
};
