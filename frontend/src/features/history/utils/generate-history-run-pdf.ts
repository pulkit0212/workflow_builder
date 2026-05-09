import jsPDF from "jspdf";
import {
  pdfActionTable,
  pdfBody,
  pdfBulletList,
  pdfDecisionList,
  pdfFooter,
  pdfNumberedList,
  pdfSafeBasename,
  pdfSection,
  pdfTitleBlock,
  type PdfActionRow,
} from "@/lib/pdf/report-pdf-base";

export type HistoryRunPdfInput = {
  title: string | null;
  createdAt: string;
  tool: { slug: string; name: string };
  outputJson: Record<string, unknown> | null;
};

function formatRunDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function dueFromRow(item: Record<string, unknown>): string {
  const v = item.due_date ?? item.dueDate ?? item.deadline;
  return typeof v === "string" && v.trim() ? v : "—";
}

function ownerFromRow(item: Record<string, unknown>): string {
  const v = item.owner;
  return typeof v === "string" && v.trim() ? v : "Unassigned";
}

function taskFromRow(item: Record<string, unknown>): string {
  const v = item.task;
  return typeof v === "string" ? v : "";
}

function priorityFromRow(item: Record<string, unknown>): string | undefined {
  const v = item.priority;
  return typeof v === "string" ? v : undefined;
}

/** Task / Owner / Due / Status (Done·Open); priority shown in task text when present */
function meetingStyleActionRows(items: unknown[]): PdfActionRow[] {
  return items
    .filter((x): x is Record<string, unknown> => x !== null && typeof x === "object")
    .map((item) => {
      const completed = item.completed === true;
      const pri = priorityFromRow(item);
      const task = taskFromRow(item);
      const taskDisplay = pri ? `${task} (${pri})` : task;
      return {
        task: taskDisplay,
        owner: ownerFromRow(item),
        due: dueFromRow(item),
        status: completed ? "Done" : "Open",
      };
    })
    .filter((r) => r.task.trim().length > 0);
}

function meetingSummarizerPdf(doc: jsPDF, output: Record<string, unknown>, startY: number): number {
  let y = startY;
  const summary = typeof output.summary === "string" ? output.summary : "";
  if (summary) {
    y = pdfSection(doc, "Summary", y);
    y = pdfBody(doc, summary, y);
  }
  const keyPoints = Array.isArray(output.key_points) ? (output.key_points as unknown[]).map(String) : [];
  if (keyPoints.length > 0) {
    y = pdfSection(doc, "Key points", y);
    y = pdfNumberedList(doc, keyPoints, y);
  }
  const rawItems = Array.isArray(output.action_items) ? output.action_items : [];
  const rows = meetingStyleActionRows(rawItems);
  if (rows.length > 0) {
    y = pdfSection(doc, "Action items", y);
    y = pdfActionTable(doc, rows, y);
  }
  return y;
}

function emailGeneratorPdf(doc: jsPDF, output: Record<string, unknown>, startY: number): number {
  let y = startY;
  const subject = typeof output.subject === "string" ? output.subject : "";
  const body = typeof output.body === "string" ? output.body : "";
  if (subject) {
    y = pdfSection(doc, "Subject", y);
    y = pdfBody(doc, subject, y);
  }
  if (body) {
    y = pdfSection(doc, "Email body", y);
    y = pdfBody(doc, body, y);
  }
  return y;
}

function taskGeneratorPdf(doc: jsPDF, output: Record<string, unknown>, startY: number): number {
  let y = startY;
  const summary = typeof output.summary === "string" ? output.summary : "";
  if (summary) {
    y = pdfSection(doc, "Summary", y);
    y = pdfBody(doc, summary, y);
  }
  const tasks = Array.isArray(output.tasks) ? output.tasks : [];
  const lines: string[] = [];
  tasks.forEach((t) => {
    if (!t || typeof t !== "object") return;
    const rec = t as Record<string, unknown>;
    const task = taskFromRow(rec);
    if (!task) return;
    const bits = [task];
    const own = ownerFromRow(rec);
    const due = dueFromRow(rec);
    if (own !== "Unassigned") bits.push(`Owner: ${own}`);
    if (due !== "—") bits.push(`Due: ${due}`);
    const pri = priorityFromRow(rec);
    if (pri) bits.push(`Priority: ${pri}`);
    const notes = typeof rec.notes === "string" && rec.notes.trim() ? rec.notes.trim() : "";
    lines.push(bits.join(" · ") + (notes ? `\n${notes}` : ""));
  });
  if (lines.length > 0) {
    y = pdfSection(doc, "Tasks", y);
    y = pdfNumberedList(doc, lines, y);
  }
  return y;
}

function documentAnalyzerPdf(doc: jsPDF, output: Record<string, unknown>, startY: number): number {
  let y = startY;
  const summary = typeof output.summary === "string" ? output.summary : "";
  if (summary) {
    y = pdfSection(doc, "Summary", y);
    y = pdfBody(doc, summary, y);
  }
  const keyPoints = Array.isArray(output.key_points) ? (output.key_points as unknown[]).map(String) : [];
  if (keyPoints.length > 0) {
    y = pdfSection(doc, "Key points", y);
    y = pdfNumberedList(doc, keyPoints, y);
  }
  const rawActions = Array.isArray(output.action_items) ? output.action_items : [];
  const rows = meetingStyleActionRows(rawActions);
  if (rows.length > 0) {
    y = pdfSection(doc, "Action items", y);
    y = pdfActionTable(doc, rows, y);
  }
  const decisions = Array.isArray(output.decisions) ? (output.decisions as unknown[]).map(String) : [];
  if (decisions.length > 0) {
    y = pdfSection(doc, "Decisions", y);
    y = pdfDecisionList(doc, decisions, y);
  }
  const risks = Array.isArray(output.risks) ? (output.risks as unknown[]).map(String) : [];
  if (risks.length > 0) {
    y = pdfSection(doc, "Risks & blockers", y);
    y = pdfBulletList(doc, risks, y);
  }
  return y;
}

/** PDF export for a saved AI tool run (all four dashboard tools). */
export function generateHistoryRunPdf(run: HistoryRunPdfInput): void {
  if (!run.outputJson || Object.keys(run.outputJson).length === 0) return;

  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const metaLines = [run.tool.name, formatRunDate(run.createdAt)];
  let y = pdfTitleBlock(doc, run.title || run.tool.name, metaLines);

  switch (run.tool.slug) {
    case "email-generator":
      y = emailGeneratorPdf(doc, run.outputJson, y);
      break;
    case "task-generator":
      y = taskGeneratorPdf(doc, run.outputJson, y);
      break;
    case "document-analyzer":
      y = documentAnalyzerPdf(doc, run.outputJson, y);
      break;
    case "meeting-summarizer":
    default:
      y = meetingSummarizerPdf(doc, run.outputJson, y);
      break;
  }

  pdfFooter(doc, `Artivaa AI · ${run.tool.name}`);

  const base = pdfSafeBasename(run.title || run.tool.slug, run.tool.slug);
  doc.save(`${base}-report.pdf`);
}
