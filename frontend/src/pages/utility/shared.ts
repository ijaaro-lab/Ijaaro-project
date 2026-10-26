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
