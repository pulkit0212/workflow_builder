import jsPDF from "jspdf";
import type { MeetingDetailRecord } from "@/features/meetings/types";
import {
  COL,
  PDF_CONTENT_W,
  PDF_MARGIN,
  PDF_PAGE_W,
  pdfActionTable,
  pdfBody,
  pdfBulletList,
  pdfDecisionList,
  pdfFooter,
  pdfNextPage,
  pdfNumberedList,
  pdfSafeBasename,
  pdfSection,
  pdfSetText,
  pdfTitleBlock,
  pdfWrap,
} from "@/lib/pdf/report-pdf-base";

export function generateMeetingPdf(meeting: MeetingDetailRecord): void {
  const doc = new jsPDF({ unit: "mm", format: "a4" });

  const metaLines: string[] = [];
  if (meeting.scheduledStartTime) {
    const d = new Date(meeting.scheduledStartTime);
    metaLines.push(
      [
        d.toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "short", day: "numeric" }),
        d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }),
      ].join(" · ")
    );
  }
  if (meeting.meetingDuration) {
    const mins = Math.round(meeting.meetingDuration / 60);
    metaLines.push(`Duration · ${mins} min`);
  }
  if (meeting.provider) {
    metaLines.push(String(meeting.provider).replace(/_/g, " "));
  }

  let y = pdfTitleBlock(doc, meeting.title || "Meeting summary", metaLines);

  if (meeting.summary) {
    y = pdfSection(doc, "Meeting summary", y);
    y = pdfBody(doc, meeting.summary, y);
  }

  const keyPoints = meeting.keyPoints ?? [];
  if (keyPoints.length > 0) {
    y = pdfSection(doc, "Key discussion points", y);
    y = pdfNumberedList(doc, keyPoints.map(String), y);
  }

  const keyDecisions = meeting.keyDecisions ?? [];
  if (keyDecisions.length > 0) {
    y = pdfSection(doc, "Key decisions", y);
    y = pdfDecisionList(doc, keyDecisions.map(String), y);
  }

  const risks = meeting.risksAndBlockers ?? [];
  if (risks.length > 0) {
    y = pdfSection(doc, "Risks & blockers", y);
    y = pdfBulletList(doc, risks.map(String), y);
  }

  const actionItems = meeting.actionItems ?? [];
  if (actionItems.length > 0) {
    y = pdfSection(doc, "Action items", y);
    y = pdfActionTable(
      doc,
      actionItems.map((item) => {
        const assignee =
          ((item as Record<string, unknown>).assignee_name as string | undefined) ||
          item.owner ||
          "Unassigned";
        const rawStatus = (item as Record<string, unknown>).status as string | undefined;
        const status = (rawStatus || (item.completed ? "done" : "pending")).toLowerCase();
        return {
          task: item.task || "",
          owner: assignee,
          due: item.dueDate || item.deadline || "—",
          status,
        };
      }),
      y
    );
  }

  const insights = meeting.insights as Record<string, unknown> | null;
  if (insights) {
    y = pdfSection(doc, "Insights", y);

    const sentiment = insights.sentiment as { overall?: string } | undefined;
    if (sentiment?.overall) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      pdfSetText(doc, COL.muted);
      doc.text("Overall sentiment", PDF_MARGIN, y);
      doc.setFont("helvetica", "normal");
      pdfSetText(doc, COL.ink);
      doc.text(String(sentiment.overall), PDF_MARGIN + 38, y);
      y += 7;
    }

    if (typeof insights.engagementScore === "number") {
      y = pdfNextPage(doc, y, 8);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      pdfSetText(doc, COL.muted);
      doc.text("Engagement", PDF_MARGIN, y);
      doc.setFont("helvetica", "normal");
      pdfSetText(doc, COL.ink);
      doc.text(`${insights.engagementScore}/100`, PDF_MARGIN + 38, y);
      y += 7;
    }

    const topics = insights.topics as Array<{ title: string; summary?: string }> | undefined;
    if (topics && topics.length > 0) {
      y += 2;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      pdfSetText(doc, COL.muted);
      doc.text("Topics covered", PDF_MARGIN, y);
      y += 6;
      y = pdfBulletList(
        doc,
        topics.map((t) => (t.summary ? `${t.title} — ${t.summary}` : t.title)),
        y
      );
    }

    const speakers = insights.speakers as Array<{ name: string; talkTimePercent: number; sentiment?: string }> | undefined;
    if (speakers && speakers.length > 0) {
      y += 2;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      pdfSetText(doc, COL.muted);
      doc.text("Speakers", PDF_MARGIN, y);
      y += 6;
      y = pdfBulletList(
        doc,
        speakers.map(
          (sp) =>
            `${sp.name} · ${sp.talkTimePercent}% talk time${sp.sentiment ? ` · ${sp.sentiment}` : ""}`
        ),
        y
      );
    }
    y += 2;
  }

  if (meeting.transcript) {
    y = pdfSection(doc, "Transcript", y);
    const blocks = meeting.transcript.split(/\n(?=[A-Z][^:]+:)/);
    for (const block of blocks) {
      const colonIdx = block.indexOf(":");
      if (colonIdx > 0 && colonIdx < 40) {
        const speaker = block.slice(0, colonIdx).trim();
        const text = block.slice(colonIdx + 1).trim();

        y = pdfNextPage(doc, y, 10);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        pdfSetText(doc, COL.muted);
        doc.text(`${speaker}:`, PDF_MARGIN, y);
        y += 5;

        if (text) {
          const lines = pdfWrap(doc, text, PDF_CONTENT_W - 4);
          const lh = 4.8;
          y = pdfNextPage(doc, y, lines.length * lh + 2);
          doc.setFont("helvetica", "normal");
          doc.setFontSize(9.5);
          pdfSetText(doc, COL.ink);
          doc.text(lines, PDF_MARGIN + 3, y);
          y += lines.length * lh + 4;
        }
      } else {
        const lines = pdfWrap(doc, block.trim(), PDF_CONTENT_W);
        if (lines.length === 0 || (lines.length === 1 && !lines[0]?.trim())) continue;
        const lh = 4.8;
        y = pdfNextPage(doc, y, lines.length * lh + 2);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9.5);
        pdfSetText(doc, COL.ink);
        doc.text(lines, PDF_MARGIN, y);
        y += lines.length * lh + 4;
      }
    }
  }

  pdfFooter(doc, "Artivaa AI · Meeting summary");

  const safeName = pdfSafeBasename(meeting.title || "meeting", "meeting");
  doc.save(`${safeName}-summary.pdf`);
}
