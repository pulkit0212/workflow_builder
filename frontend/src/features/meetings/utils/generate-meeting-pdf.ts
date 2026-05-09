import jsPDF from "jspdf";
import type { MeetingDetailRecord } from "@/features/meetings/types";

// ── Colours & constants ───────────────────────────────────────────────────────
const PURPLE = [108, 63, 245] as const;   // #6C3FF5
const DARK   = [32,  33,  36] as const;   // #202124
const GREY   = [95,  99, 104] as const;   // #5F6368
const LIGHT  = [248, 249, 250] as const;  // #F8F9FA
const WHITE  = [255, 255, 255] as const;
const LINE   = [218, 220, 224] as const;  // #DADCE0

const PAGE_W  = 210;
const PAGE_H  = 297;
const MARGIN  = 16;
const CONTENT = PAGE_W - MARGIN * 2;

// ── Helpers ───────────────────────────────────────────────────────────────────
function setColor(doc: jsPDF, rgb: readonly [number, number, number], type: "fill" | "text" | "draw" = "text") {
  if (type === "fill")  doc.setFillColor(rgb[0], rgb[1], rgb[2]);
  if (type === "text")  doc.setTextColor(rgb[0], rgb[1], rgb[2]);
  if (type === "draw")  doc.setDrawColor(rgb[0], rgb[1], rgb[2]);
}

function wrapText(doc: jsPDF, text: string, maxWidth: number): string[] {
  return doc.splitTextToSize(text, maxWidth) as string[];
}

function addPageIfNeeded(doc: jsPDF, y: number, needed = 10): number {
  if (y + needed > PAGE_H - MARGIN) {
    doc.addPage();
    return MARGIN + 6;
  }
  return y;
}

// ── Section header ────────────────────────────────────────────────────────────
function sectionHeader(doc: jsPDF, title: string, y: number): number {
  y = addPageIfNeeded(doc, y, 14);
  setColor(doc, PURPLE, "fill");
  doc.roundedRect(MARGIN, y, CONTENT, 8, 1.5, 1.5, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  setColor(doc, WHITE, "text");
  doc.text(title.toUpperCase(), MARGIN + 4, y + 5.5);
  return y + 12;
}

// ── Bullet item ───────────────────────────────────────────────────────────────
function bulletItem(doc: jsPDF, text: string, y: number, indent = MARGIN + 4): number {
  const lines = wrapText(doc, text, CONTENT - (indent - MARGIN) - 6);
  y = addPageIfNeeded(doc, y, lines.length * 5 + 2);
  setColor(doc, PURPLE, "fill");
  doc.circle(indent + 1, y + 2, 1, "F");
  setColor(doc, DARK, "text");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(lines, indent + 4, y + 3.5);
  return y + lines.length * 5 + 1;
}

// ── Body paragraph ────────────────────────────────────────────────────────────
function bodyText(doc: jsPDF, text: string, y: number): number {
  const lines = wrapText(doc, text, CONTENT);
  y = addPageIfNeeded(doc, y, lines.length * 5 + 2);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  setColor(doc, DARK, "text");
  doc.text(lines, MARGIN, y);
  return y + lines.length * 5 + 2;
}

// ── Divider ───────────────────────────────────────────────────────────────────
function divider(doc: jsPDF, y: number): number {
  setColor(doc, LINE, "draw");
  doc.setLineWidth(0.2);
  doc.line(MARGIN, y, PAGE_W - MARGIN, y);
  return y + 4;
}

// ── Main export ───────────────────────────────────────────────────────────────
export function generateMeetingPdf(meeting: MeetingDetailRecord): void {
  const doc = new jsPDF({ unit: "mm", format: "a4" });

  // ── Cover / header ──────────────────────────────────────────────────────────
  setColor(doc, PURPLE, "fill");
  doc.rect(0, 0, PAGE_W, 38, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  setColor(doc, WHITE, "text");
  const titleLines = wrapText(doc, meeting.title || "Meeting Summary", CONTENT);
  doc.text(titleLines, MARGIN, 16);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  const metaParts: string[] = [];
  if (meeting.scheduledStartTime) {
    const d = new Date(meeting.scheduledStartTime);
    metaParts.push(d.toLocaleDateString("en-US", { weekday: "short", year: "numeric", month: "short", day: "numeric" }));
    metaParts.push(d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }));
  }
  if (meeting.meetingDuration) {
    const mins = Math.round(meeting.meetingDuration / 60);
    metaParts.push(`${mins} min`);
  }
  if (meeting.provider) metaParts.push(meeting.provider.replace("_", " "));
  doc.text(metaParts.join("  ·  "), MARGIN, 32);

  // Generated timestamp (top-right)
  doc.setFontSize(7);
  setColor(doc, [200, 190, 255], "text");
  doc.text(`Generated ${new Date().toLocaleDateString()}`, PAGE_W - MARGIN, 32, { align: "right" });

  let y = 46;

  // ── Overview / Summary ──────────────────────────────────────────────────────
  if (meeting.summary) {
    y = sectionHeader(doc, "Meeting Summary", y);
    y = bodyText(doc, meeting.summary, y);
    y += 4;
  }

  // ── Key Discussion Points ───────────────────────────────────────────────────
  const keyPoints = meeting.keyPoints ?? [];
  if (keyPoints.length > 0) {
    y = sectionHeader(doc, "Key Discussion Points", y);
    for (const point of keyPoints) {
      y = bulletItem(doc, String(point), y);
    }
    y += 4;
  }

  // ── Key Decisions ───────────────────────────────────────────────────────────
  const keyDecisions = meeting.keyDecisions ?? [];
  if (keyDecisions.length > 0) {
    y = sectionHeader(doc, "Key Decisions", y);
    for (const decision of keyDecisions) {
      y = bulletItem(doc, String(decision), y);
    }
    y += 4;
  }

  // ── Risks & Blockers ────────────────────────────────────────────────────────
  const risks = meeting.risksAndBlockers ?? [];
  if (risks.length > 0) {
    y = sectionHeader(doc, "Risks & Blockers", y);
    for (const risk of risks) {
      y = bulletItem(doc, String(risk), y);
    }
    y += 4;
  }

  // ── Action Items ────────────────────────────────────────────────────────────
  const actionItems = meeting.actionItems ?? [];
  if (actionItems.length > 0) {
    y = sectionHeader(doc, "Action Items", y);

    // Table header
    y = addPageIfNeeded(doc, y, 10);
    setColor(doc, LIGHT, "fill");
    doc.rect(MARGIN, y, CONTENT, 7, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    setColor(doc, GREY, "text");
    doc.text("TASK", MARGIN + 2, y + 4.8);
    doc.text("OWNER", MARGIN + 100, y + 4.8);
    doc.text("DUE", MARGIN + 135, y + 4.8);
    doc.text("STATUS", MARGIN + 162, y + 4.8);
    y += 8;

    for (let i = 0; i < actionItems.length; i++) {
      const item = actionItems[i];
      const taskLines = wrapText(doc, item.task || "", 95);
      const rowH = Math.max(taskLines.length * 4.5 + 3, 8);
      y = addPageIfNeeded(doc, y, rowH + 1);

      if (i % 2 === 0) {
        setColor(doc, [250, 248, 255], "fill");
        doc.rect(MARGIN, y, CONTENT, rowH, "F");
      }

      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      setColor(doc, DARK, "text");
      doc.text(taskLines, MARGIN + 2, y + 4);
      const assigneeDisplay = (item as Record<string, unknown>).assignee_name as string | undefined || item.owner || "Unassigned";
      doc.text(assigneeDisplay, MARGIN + 100, y + 4);
      doc.text(item.dueDate || item.deadline || "—", MARGIN + 135, y + 4);

      // Status badge
      const rawStatus = (item as Record<string, unknown>).status as string | undefined;
      const status = (rawStatus || (item.completed ? "done" : "pending")).toLowerCase();
      const statusColor: readonly [number, number, number] =
        status === "done" || status === "completed" ? [22, 163, 74] :
        status === "in_progress" || status === "in progress" ? [37, 99, 235] :
        [95, 99, 104];
      setColor(doc, statusColor, "text");
      doc.setFont("helvetica", "bold");
      doc.text(status.replace("_", " "), MARGIN + 162, y + 4);

      y += rowH + 1;
    }
    y += 4;
  }

  // ── Insights ────────────────────────────────────────────────────────────────
  const insights = meeting.insights as Record<string, unknown> | null;
  if (insights) {
    y = sectionHeader(doc, "Insights", y);

    // Sentiment
    const sentiment = insights.sentiment as { overall?: string; score?: number } | undefined;
    if (sentiment?.overall) {
      y = addPageIfNeeded(doc, y, 8);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      setColor(doc, GREY, "text");
      doc.text("Overall Sentiment:", MARGIN, y);
      setColor(doc, DARK, "text");
      doc.text(String(sentiment.overall), MARGIN + 38, y);
      y += 6;
    }

    // Engagement score
    if (typeof insights.engagementScore === "number") {
      y = addPageIfNeeded(doc, y, 8);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      setColor(doc, GREY, "text");
      doc.text("Engagement Score:", MARGIN, y);
      setColor(doc, DARK, "text");
      doc.text(`${insights.engagementScore}/100`, MARGIN + 38, y);
      y += 6;
    }

    // Topics
    const topics = insights.topics as Array<{ title: string; summary?: string }> | undefined;
    if (topics && topics.length > 0) {
      y += 2;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      setColor(doc, GREY, "text");
      doc.text("Topics Covered:", MARGIN, y);
      y += 5;
      for (const topic of topics) {
        y = bulletItem(doc, topic.title + (topic.summary ? ` — ${topic.summary}` : ""), y);
      }
    }

    // Speaker breakdown
    const speakers = insights.speakers as Array<{ name: string; talkTimePercent: number; sentiment?: string }> | undefined;
    if (speakers && speakers.length > 0) {
      y += 2;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      setColor(doc, GREY, "text");
      doc.text("Speaker Breakdown:", MARGIN, y);
      y += 5;
      for (const sp of speakers) {
        const line = `${sp.name} — ${sp.talkTimePercent}% talk time${sp.sentiment ? ` · ${sp.sentiment}` : ""}`;
        y = bulletItem(doc, line, y);
      }
    }

    y += 4;
  }

  // ── Transcript ──────────────────────────────────────────────────────────────
  if (meeting.transcript) {
    y = sectionHeader(doc, "Transcript", y);

    // Parse speaker blocks
    const blocks = meeting.transcript.split(/\n(?=[A-Z][^:]+:)/);
    for (const block of blocks) {
      const colonIdx = block.indexOf(":");
      if (colonIdx > 0 && colonIdx < 40) {
        const speaker = block.slice(0, colonIdx).trim();
        const text = block.slice(colonIdx + 1).trim();

        y = addPageIfNeeded(doc, y, 8);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8.5);
        setColor(doc, PURPLE, "text");
        doc.text(speaker + ":", MARGIN, y);
        y += 4.5;

        if (text) {
          const lines = wrapText(doc, text, CONTENT - 4);
          y = addPageIfNeeded(doc, y, lines.length * 4.5 + 2);
          doc.setFont("helvetica", "normal");
          doc.setFontSize(8.5);
          setColor(doc, DARK, "text");
          doc.text(lines, MARGIN + 4, y);
          y += lines.length * 4.5 + 3;
        }
      } else {
        // Plain paragraph
        const lines = wrapText(doc, block.trim(), CONTENT);
        if (lines.length === 0) continue;
        y = addPageIfNeeded(doc, y, lines.length * 4.5 + 2);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8.5);
        setColor(doc, DARK, "text");
        doc.text(lines, MARGIN, y);
        y += lines.length * 4.5 + 3;
      }
    }
    y += 4;
  }

  // ── Footer on every page ────────────────────────────────────────────────────
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    setColor(doc, LINE, "draw");
    doc.setLineWidth(0.2);
    doc.line(MARGIN, PAGE_H - 10, PAGE_W - MARGIN, PAGE_H - 10);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    setColor(doc, GREY, "text");
    doc.text("Artivaa AI — Meeting Summary", MARGIN, PAGE_H - 6);
    doc.text(`Page ${p} of ${totalPages}`, PAGE_W - MARGIN, PAGE_H - 6, { align: "right" });
  }

  // ── Save ────────────────────────────────────────────────────────────────────
  const safeName = (meeting.title || "meeting").replace(/[^a-z0-9]/gi, "-").toLowerCase();
  doc.save(`${safeName}-summary.pdf`);
}
