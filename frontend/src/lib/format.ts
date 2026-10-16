export function money(amount: number | null | undefined, currency = "USD") {
  if (amount == null || Number.isNaN(Number(amount))) return "—";
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(Number(amount));
}

export function statusTone(
  status: string,
): "success" | "warning" | "info" | "danger" | "neutral" {
  switch (status) {
    case "available":
    case "paid":
    case "active":
    case "completed":
    case "valid":
      return "success";
    case "pending":
    case "partial":
    case "processing":
    case "vacant":
    case "estimated":
      return "warning";
    case "occupied":
    case "due":
    case "issued":
    case "corrected":
      return "info";
    case "overdue":
    case "rejected":
    case "failed":
    case "cancelled":
    case "disputed":
      return "danger";
    case "draft":
    case "reset":
      return "neutral";
    default:
      return "neutral";
  }
}
