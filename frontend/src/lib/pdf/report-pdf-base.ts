import jsPDF from "jspdf";

export const PDF_PAGE_W = 210;
export const PDF_PAGE_H = 297;
export const PDF_MARGIN = 18;
export const PDF_CONTENT_W = PDF_PAGE_W - PDF_MARGIN * 2;

/** Sober palette: dark text, neutral rules, accent used sparingly */
export const COL = {
  ink: [33, 37, 41] as const,
  muted: [107, 114, 128] as const,
  rule: [229, 231, 235] as const,
  accent: [108, 63, 245] as const,
  panel: [249, 250, 251] as const,
};

export function pdfSetText(doc: jsPDF, rgb: readonly [number, number, number]) {
  doc.setTextColor(rgb[0], rgb[1], rgb[2]);
}

export function pdfSetFill(doc: jsPDF, rgb: readonly [number, number, number]) {
  doc.setFillColor(rgb[0], rgb[1], rgb[2]);
}

export function pdfSetDraw(doc: jsPDF, rgb: readonly [number, number, number]) {
  doc.setDrawColor(rgb[0], rgb[1], rgb[2]);
}

export function pdfWrap(doc: jsPDF, text: string, maxW: number): string[] {
  return doc.splitTextToSize(text.trim() || " ", maxW) as string[];
}

export function pdfNextPage(doc: jsPDF, y: number, reserveMm: number): number {
  const footerBand = 14;
  if (y + reserveMm > PDF_PAGE_H - footerBand) {
    doc.addPage();
    return PDF_MARGIN + 6;
  }
  return y;
}

export function pdfFooter(doc: jsPDF, brandLeft: string) {
  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    pdfSetDraw(doc, COL.rule);
    doc.setLineWidth(0.15);
    doc.line(PDF_MARGIN, PDF_PAGE_H - 12, PDF_PAGE_W - PDF_MARGIN, PDF_PAGE_H - 12);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    pdfSetText(doc, COL.muted);
    doc.text(brandLeft, PDF_MARGIN, PDF_PAGE_H - 7);
    doc.text(`Page ${p} / ${total}`, PDF_PAGE_W - PDF_MARGIN, PDF_PAGE_H - 7, { align: "right" });
  }
}

/** Title area: typography-led, no heavy color bands */
export function pdfTitleBlock(doc: jsPDF, title: string, metaLines: string[]): number {
  let y = PDF_MARGIN + 8;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  pdfSetText(doc, COL.ink);
  const titleLines = pdfWrap(doc, title || "Summary", PDF_CONTENT_W);
  doc.text(titleLines, PDF_MARGIN, y);
  y += titleLines.length * 7 + 4;

  pdfSetDraw(doc, COL.accent);
  doc.setLineWidth(0.5);
  doc.line(PDF_MARGIN, y, PDF_MARGIN + 32, y);
  y += 5;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  pdfSetText(doc, COL.muted);
  const gen = `Generated ${new Date().toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}`;
  let metaIdx = 0;
  for (const line of metaLines) {
    if (!line) continue;
    doc.text(line, PDF_MARGIN, y);
    if (metaIdx === 0) {
      doc.setFontSize(8);
      pdfSetText(doc, COL.muted);
      doc.text(gen, PDF_PAGE_W - PDF_MARGIN, y, { align: "right" });
      doc.setFontSize(9);
    }
    metaIdx++;
    y += 4.5;
  }
  if (metaIdx === 0) {
    doc.setFontSize(8);
    pdfSetText(doc, COL.muted);
    doc.text(gen, PDF_PAGE_W - PDF_MARGIN, y, { align: "right" });
    doc.setFontSize(9);
    y += 4.5;
  }

  y += 8;
  pdfSetDraw(doc, COL.rule);
  doc.setLineWidth(0.2);
  doc.line(PDF_MARGIN, y, PDF_PAGE_W - PDF_MARGIN, y);
  return y + 10;
}

export function pdfSection(doc: jsPDF, label: string, y: number): number {
  y = pdfNextPage(doc, y, 18);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  pdfSetText(doc, COL.ink);
  doc.text(label, PDF_MARGIN, y);
  y += 3;
  pdfSetDraw(doc, COL.rule);
  doc.setLineWidth(0.2);
  doc.line(PDF_MARGIN, y, PDF_PAGE_W - PDF_MARGIN, y);
  return y + 9;
}

export function pdfBody(doc: jsPDF, text: string, y: number): number {
  const lines = pdfWrap(doc, text, PDF_CONTENT_W);
  const lineH = 5;
  y = pdfNextPage(doc, y, lines.length * lineH + 4);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  pdfSetText(doc, COL.ink);
  doc.text(lines, PDF_MARGIN, y);
  return y + lines.length * lineH + 6;
}

/** Numbered items with subtle circular index (matches app overview style) */
export function pdfNumberedList(doc: jsPDF, items: string[], y: number): number {
  const lineH = 5;
  let idx = 0;
  for (const raw of items) {
    idx++;
    const text = String(raw);
    const lines = pdfWrap(doc, text, PDF_CONTENT_W - 14);
    const blockH = Math.max(lines.length * lineH + 2, 8);
    y = pdfNextPage(doc, y, blockH + 4);

    const cx = PDF_MARGIN + 4;
    const cy = y + 3;
    pdfSetDraw(doc, COL.accent);
    doc.setLineWidth(0.15);
    doc.circle(cx, cy, 3.3, "S");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    pdfSetText(doc, COL.accent);
    doc.text(String(idx).padStart(2, "0"), cx, cy + 2.3, { align: "center" });

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    pdfSetText(doc, COL.ink);
    doc.text(lines, PDF_MARGIN + 12, y + 4);
    y += lines.length * lineH + 4;
  }
  return y + 2;
}

/** Decision-style list: light rows + accent dash */
export function pdfDecisionList(doc: jsPDF, items: string[], y: number): number {
  const lineH = 5;
  const textLeft = PDF_MARGIN + 5;
  for (const raw of items) {
    const text = String(raw);
    const lines = pdfWrap(doc, text, PDF_CONTENT_W - 8);
    const rowH = lines.length * lineH + 6;
    y = pdfNextPage(doc, y, rowH + 2);

    pdfSetFill(doc, COL.panel);
    doc.rect(PDF_MARGIN, y - 2, PDF_CONTENT_W, rowH, "F");
    pdfSetFill(doc, COL.accent);
    doc.rect(PDF_MARGIN, y - 2, 1.3, rowH, "F");
    pdfSetDraw(doc, COL.rule);
    doc.setLineWidth(0.15);
    doc.line(PDF_MARGIN, y + rowH - 2, PDF_PAGE_W - PDF_MARGIN, y + rowH - 2);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    pdfSetText(doc, COL.ink);
    doc.text(lines, textLeft, y + 4);
    y += rowH;
  }
  return y + 4;
}

export function pdfBulletList(doc: jsPDF, items: string[], y: number): number {
  const lineH = 5;
  for (const raw of items) {
    const text = String(raw);
    const lines = pdfWrap(doc, text, PDF_CONTENT_W - 8);
    const blockH = lines.length * lineH + 3;
    y = pdfNextPage(doc, y, blockH);
    pdfSetText(doc, COL.muted);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text("•", PDF_MARGIN + 1, y + 4);
    pdfSetText(doc, COL.ink);
    doc.text(lines, PDF_MARGIN + 6, y + 4);
    y += lines.length * lineH + 2;
  }
  return y + 4;
}

export type PdfActionRow = { task: string; owner: string; due: string; status?: string };

export function pdfActionTable(doc: jsPDF, rows: PdfActionRow[], y: number): number {
  if (rows.length === 0) return y;

  const colTask = PDF_MARGIN + 1;
  const colOwner = PDF_MARGIN + 98;
  const colDue = PDF_MARGIN + 138;
  const colSt = PDF_MARGIN + 168;
  const taskW = colOwner - colTask - 4;
  const hdrH = 7;

  y = pdfNextPage(doc, y, hdrH + 8);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  pdfSetText(doc, COL.muted);
  doc.text("Task", colTask, y);
  doc.text("Owner", colOwner, y);
  doc.text("Due", colDue, y);
  doc.text("Status", colSt, y);
  y += hdrH - 1;
  pdfSetDraw(doc, COL.rule);
  doc.setLineWidth(0.2);
  doc.line(PDF_MARGIN, y, PDF_PAGE_W - PDF_MARGIN, y);
  y += 5;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const taskLines = pdfWrap(doc, r.task, taskW);
    const rowH = Math.max(taskLines.length * 4.5 + 4, 9);
    y = pdfNextPage(doc, y, rowH + 2);

    if (i % 2 === 0) {
      pdfSetFill(doc, COL.panel);
      doc.rect(PDF_MARGIN, y - 2, PDF_CONTENT_W, rowH, "F");
    }

    pdfSetText(doc, COL.ink);
    doc.text(taskLines, colTask, y + 3);
    pdfSetText(doc, COL.muted);
    doc.text(pdfWrap(doc, r.owner, 34).slice(0, 2), colOwner, y + 3);
    doc.text(pdfWrap(doc, r.due, 26).slice(0, 1), colDue, y + 3);
    pdfSetText(doc, COL.ink);
    const st = (r.status || "pending").replace(/_/g, " ");
    doc.text(pdfWrap(doc, st, 28).slice(0, 1), colSt, y + 3);

    y += rowH;
    pdfSetDraw(doc, COL.rule);
    doc.setLineWidth(0.08);
    doc.line(PDF_MARGIN, y, PDF_PAGE_W - PDF_MARGIN, y);
  }

  return y + 6;
}

export function pdfSafeBasename(title: string, fallback: string): string {
  const base = (title || fallback).replace(/[^a-z0-9]+/gi, "-").replace(/-+/g, "-").replace(/^-|-$/gi, "").toLowerCase();
  return base || fallback;
}
