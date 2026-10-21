import type { ServiceType, TenantType } from "@/types/database";

export type UtilityKind = "water" | "electricity";

export const KIND_TENANT_TYPE: Record<UtilityKind, TenantType> = {
  water: "water_company",
  electricity: "electricity_company",
};

export const KIND_SERVICE_TYPE: Record<UtilityKind, ServiceType> = {
  water: "water",
  electricity: "electricity",
};

export const KIND_LABEL: Record<UtilityKind, string> = {
  water: "Water",
  electricity: "Electricity",
};

export function utilityPath(kind: UtilityKind, suffix = "") {
  return `/app/${kind}${suffix}`;
}

/**
 * Water monthly bills may be issued months ahead, but only months that have
 * started count toward balance / payment. Future months stay hidden until their
 * period begins (e.g. after October is paid and November arrives, Nov balance shows).
 */
export function isBillPeriodOpen(bill: {
  period_start: string;
  balance?: number | null;
  status?: string;
}): boolean {
  if (bill.status === "cancelled") return false;
  if (bill.balance != null && Number(bill.balance) <= 0) return false;
  const periodMonth = bill.period_start.slice(0, 7); // YYYY-MM
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  return periodMonth <= currentMonth;
}
