/**
 * Minimal PDF builder (no external deps) — text + bordered tables.
 */

export type PdfLine = {
  text: string;
  x?: number;
  size?: number;
  bold?: boolean;
};

export type PdfTable = {
  title?: string;
  headers: string[];
  rows: string[][];
  /** Relative column weights (default equal). */
  colWeights?: number[];
};

function escapePdfText(s: string): string {
  return s
    .replace(/\u2026/g, "...") // …
    .replace(/[\u2013\u2014]/g, "-") // – —
    .replace(/[\u00B7\u2022\u2219]/g, "-") // · • ∙
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\$/g, "USD ")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    .replace(/[^\x20-\x7E]/g, "");
}

function approxTextWidth(text: string, size: number): number {
  // Helvetica average glyph ≈ 0.5em
  return text.length * size * 0.5;
}

function buildPdf(stream: string, pageW: number, pageH: number): Blob {
  const objects: string[] = [];
  objects.push("1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj");
  objects.push("2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj");
  objects.push(
    `3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>endobj`,
  );
  objects.push(`4 0 obj<< /Length ${stream.length} >>stream\n${stream}\nendstream endobj`);
  objects.push("5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj");
  objects.push("6 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>endobj");

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [0];
  for (const obj of objects) {
    offsets.push(pdf.length);
    pdf += `${obj}\n`;
  }
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let i = 1; i < offsets.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer<< /Size ${objects.length + 1} /Root 1 0 R >>\n`;
  pdf += `startxref\n${xref}\n%%EOF`;
  return new Blob([pdf], { type: "application/pdf" });
}

function triggerDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName.endsWith(".pdf") ? fileName : `${fileName}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function downloadTextPdf(opts: {
  fileName: string;
  lines: PdfLine[];
  pageWidth?: number;
  pageHeight?: number;
}): void {
  const pageW = opts.pageWidth ?? 612;
  const pageH = opts.pageHeight ?? 792;
  const margin = 48;
  let y = pageH - margin;

  const ops: string[] = ["BT"];
  for (const line of opts.lines) {
    const size = line.size ?? 11;
    const x = line.x ?? margin;
    const font = line.bold ? "F2" : "F1";
    if (y < margin) break;
    ops.push(`/${font} ${size} Tf`);
    ops.push(`1 0 0 1 ${x} ${y} Tm`);
    ops.push(`(${escapePdfText(line.text)}) Tj`);
    y -= size + 6;
  }
  ops.push("ET");
  triggerDownload(buildPdf(ops.join("\n"), pageW, pageH), opts.fileName);
}

/** Report PDF with header + one or more bordered tables. */
export function downloadTablePdf(opts: {
  fileName: string;
  title: string;
  subtitle?: string;
  meta?: string[];
  tables: PdfTable[];
  pageWidth?: number;
  pageHeight?: number;
}): void {
  const pageW = opts.pageWidth ?? 612;
  const pageH = opts.pageHeight ?? 792;
  const margin = 40;
  const tableWidth = pageW - margin * 2;
  const rowH = 22;
  const padX = 8;
  const padY = 6;
  let y = pageH - margin;

  const gfx: string[] = [];
  const text: string[] = ["BT"];

  const drawText = (str: string, x: number, ty: number, size: number, bold = false) => {
    // Reset fill to black — prior `rg` fills (header tint) would otherwise paint text light blue.
    text.push("0 0 0 rg");
    text.push(`/${bold ? "F2" : "F1"} ${size} Tf`);
    text.push(`1 0 0 1 ${x} ${ty} Tm`);
    text.push(`(${escapePdfText(str)}) Tj`);
  };

  const ensureSpace = (need: number) => {
    if (y - need < margin) {
      y = margin; // single page — stop drawing further
      return false;
    }
    return true;
  };

  // Header
  drawText(opts.title, margin, y, 16, true);
  y -= 20;
  if (opts.subtitle) {
    drawText(opts.subtitle, margin, y, 11, true);
    y -= 16;
  }
  for (const m of opts.meta ?? []) {
    drawText(m, margin, y, 10, false);
    y -= 14;
  }
  y -= 10;

  for (const table of opts.tables) {
    const cols = Math.max(table.headers.length, 1);
    const weights = table.colWeights?.length === cols
      ? table.colWeights
      : Array.from({ length: cols }, () => 1);
    const weightSum = weights.reduce((a, b) => a + b, 0) || 1;
    const widths = weights.map((w) => (tableWidth * w) / weightSum);

    if (table.title) {
      if (!ensureSpace(30)) break;
      drawText(table.title, margin, y, 12, true);
      y -= 18;
    }

    const allRows = [table.headers, ...table.rows];
    for (let r = 0; r < allRows.length; r++) {
      if (!ensureSpace(rowH + 4)) break;
      const isHeader = r === 0;
      const row = allRows[r];
      const boxTop = y;
      const boxBottom = y - rowH;

      // Row background for header
      if (isHeader) {
        gfx.push("0.92 0.94 0.97 rg");
        gfx.push(`${margin} ${boxBottom} ${tableWidth} ${rowH} re`);
        gfx.push("f");
      }

      // Outer + cell borders
      gfx.push("0.7 0.75 0.82 RG");
      gfx.push("0.6 w");
      gfx.push(`${margin} ${boxBottom} ${tableWidth} ${rowH} re`);
      gfx.push("S");

      let x = margin;
      for (let c = 0; c < cols; c++) {
        if (c > 0) {
          gfx.push(`${x} ${boxBottom} m`);
          gfx.push(`${x} ${boxTop} l`);
          gfx.push("S");
        }
        const cell = String(row[c] ?? "");
        const size = isHeader ? 10 : 10;
        let shown = cell;
        const maxW = widths[c] - padX * 2;
        while (shown.length > 1 && approxTextWidth(shown, size) > maxW) {
          shown = shown.slice(0, -1);
        }
        if (shown !== cell && shown.length > 1) shown = `${shown.slice(0, -1)}…`;
        drawText(shown, x + padX, boxBottom + padY, size, isHeader);
        x += widths[c];
      }

      y -= rowH;
    }
    y -= 16;
  }

  text.push("ET");
  const stream = `${gfx.join("\n")}\n${text.join("\n")}`;
  triggerDownload(buildPdf(stream, pageW, pageH), opts.fileName);
}
