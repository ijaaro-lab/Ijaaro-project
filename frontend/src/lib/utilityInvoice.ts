import { money } from "@/lib/format";
import type { UtilityBill } from "@/types/database";
import type { UtilityKind } from "@/pages/utility/shared";
import { KIND_LABEL } from "@/pages/utility/shared";

export type UtilityInvoiceInput = {
  bill: UtilityBill;
  kind: UtilityKind;
  companyName: string;
  accountNumber?: string | null;
  customerLabel?: string | null;
};

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/** Build a print-ready HTML invoice for a utility bill. */
export function buildUtilityInvoiceHtml(input: UtilityInvoiceInput): string {
  const { bill, kind, companyName, accountNumber, customerLabel } = input;
  const service = KIND_LABEL[kind];
  const invoiceNo = bill.id.slice(0, 8).toUpperCase();
  const issued = bill.created_at.slice(0, 10);
  const rows = [
    ["Service", service],
    ["Account", accountNumber || "—"],
    ["Customer", customerLabel || "—"],
    ["Period", `${bill.period_start} → ${bill.period_end}`],
    ["Due date", bill.due_date],
    ["Previous reading", String(bill.previous_reading)],
    ["Current reading", String(bill.current_reading)],
    ["Units consumed", String(bill.units_consumed)],
    ["Unit price", money(bill.unit_price)],
    ["Extra charges", money(bill.extra_charges)],
    ["Total", money(bill.total_amount)],
    ["Amount paid", money(bill.amount_paid)],
    ["Balance", money(bill.balance)],
    ["Status", bill.status],
  ];

  const tableRows = rows
    .map(
      ([k, v]) =>
        `<tr><td style="padding:8px 0;color:#5b6b7c;border-bottom:1px solid #e5eaf0;">${escapeHtml(k)}</td><td style="padding:8px 0;text-align:right;font-weight:600;border-bottom:1px solid #e5eaf0;">${escapeHtml(String(v))}</td></tr>`,
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(service)} invoice ${escapeHtml(invoiceNo)}</title>
  <style>
    body { font-family: Inter, system-ui, sans-serif; color: #0b1f3a; margin: 0; padding: 32px; background: #fff; }
    .sheet { max-width: 720px; margin: 0 auto; }
    h1 { font-size: 22px; margin: 0 0 4px; }
    .muted { color: #5b6b7c; font-size: 13px; }
    .head { display: flex; justify-content: space-between; gap: 16px; margin-bottom: 28px; }
    table { width: 100%; border-collapse: collapse; font-size: 14px; }
    .actions { margin-top: 28px; display: flex; gap: 8px; }
    button { border: 0; border-radius: 8px; padding: 10px 14px; font-weight: 600; cursor: pointer; }
    .primary { background: #f5c400; color: #0b1f3a; }
    .ghost { background: #eef3f8; color: #0b1f3a; }
    @media print {
      .actions { display: none; }
      body { padding: 0; }
    }
  </style>
</head>
<body>
  <div class="sheet">
    <div class="head">
      <div>
        <h1>${escapeHtml(companyName)}</h1>
        <div class="muted">${escapeHtml(service)} invoice</div>
      </div>
      <div style="text-align:right">
        <div style="font-weight:700">Invoice #${escapeHtml(invoiceNo)}</div>
        <div class="muted">Issued ${escapeHtml(issued)}</div>
      </div>
    </div>
    <table>${tableRows}</table>
    <div class="actions">
      <button class="primary" onclick="window.print()">Print / Save as PDF</button>
      <button class="ghost" onclick="window.close()">Close</button>
    </div>
  </div>
</body>
</html>`;
}

/** Open invoice in a new window for print / Save as PDF. */
export function openUtilityInvoice(input: UtilityInvoiceInput): void {
  const html = buildUtilityInvoiceHtml(input);
  const win = window.open("", "_blank", "noopener,noreferrer,width=820,height=900");
  if (!win) {
    downloadUtilityInvoiceHtml(input);
    return;
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
}

/** Download invoice as a standalone HTML file. */
export function downloadUtilityInvoiceHtml(input: UtilityInvoiceInput): void {
  const html = buildUtilityInvoiceHtml(input);
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const invoiceNo = input.bill.id.slice(0, 8).toUpperCase();
  a.href = url;
  a.download = `${KIND_LABEL[input.kind].toLowerCase()}-invoice-${invoiceNo}.html`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
