#!/usr/bin/env node
/**
 * Generate editable Artivaa product brief as native .docx
 * Usage: node scripts/generate-product-brief-doc.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
  ShadingType,
  PageBreak,
  ExternalHyperlink,
  AlignmentType,
  BorderStyle,
} from "docx";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const outPath = path.join(root, "artivaa-product-brief.docx");

const FEATURES = [
  { letter: "A", title: "Action Items", items: ["AI-extracted tasks from transcripts (task, owner, due date, priority)", "Manual create, edit, complete, delete", "Reporter and Assignee roles", "Filter by workspace, meeting, user, status", "Bulk save from meeting output; export action items", "Stats dashboard — pending / completed counts", "Workspace-scoped and personal views", "Status: pending, in progress, completed with timestamps"] },
  { letter: "B", title: "Billing & Subscriptions", items: ["Free — AI tools unlimited + 7 meeting previews/month", "Pro (Rs 99/mo) — Full bot, transcription, summaries, 20 meetings/month", "Elite (Rs 199/mo) — Unlimited meetings + team workspaces + priority support", "30-day Trial — Full Elite access", "Razorpay payments (orders, webhooks, invoice history)", "Plan catalog from database; monthly usage counter with auto reset"] },
  { letter: "C", title: "Calendar & Scheduling", items: ["Google Calendar OAuth sync", "Microsoft Teams and Outlook calendar OAuth", "Today's meetings + upcoming meetings panel", "Auto-link bot sessions to calendar events", "Share calendar meetings to workspace"] },
  { letter: "D", title: "Dashboard", items: ["Personal mode vs Workspace mode switcher", "Quick stats: meetings, action items, usage", "Upcoming meetings widget and recent activity", "Plan badge and trial countdown", "Responsive sidebar navigation"] },
  { letter: "E", title: "Email & Notifications", items: ["Email Generator AI tool (professional / friendly / concise / formal)", "Post-meeting follow-up email draft generation", "Gmail integration for auto-send after meetings", "Resend for workspace invite emails", "Email notification preferences (summary, action items, digest, updates)"] },
  { letter: "F", title: "Follow-ups & Sharing", items: ["Auto-share meeting summary to configured integrations after bot completes", "Manual share modal per meeting", "Share to workspace with admin approval for cross-workspace moves", "Follow-up needed flag on meetings"] },
  { letter: "G", title: "Google Meet & Multi-Platform Bot", items: ["AI Notetaker bot joins Google Meet, Microsoft Teams, and Zoom", "Platform auto-detection from meeting URL", "Custom bot display name (e.g. Artivaa Notetaker)", "Start / stop bot from dashboard", "Real-time status: joining, recording, processing, complete, failed"] },
  { letter: "H", title: "History & Reports", items: ["Full meeting history with search and filters", "Reports page — AI insights from past meetings", "Meeting detail: transcript, summary, metadata", "Visibility controls (personal vs workspace)"] },
  { letter: "I", title: "Integrations Hub", items: ["Calendar: Google, Microsoft Teams, Outlook", "Productivity: Slack, Gmail, Notion, Jira (webhooks)", "Custom Webhooks and Zapier", "Per-integration enable/disable + connection test", "Setup wizard with step-by-step UI instructions"] },
  { letter: "J", title: "Jira Integration", items: ["Push action items / decisions to Jira via webhook", "Configurable webhook URL per user", "Auto-share target preference in settings"] },
  { letter: "K", title: "Key Decisions & AI Insights", items: ["Key decisions, risks and blockers, key topics from transcript", "Meeting sentiment analysis (Positive / Neutral / Negative)", "Smart insights JSON per meeting", "Chapter breakdown — timestamped meeting sections", "Follow-up meeting needed flag"] },
  { letter: "L", title: "Landing & Marketing", items: ["Public marketing homepage with animations", "Feature sections: bot, calendar, workspaces, tools, pricing", "Live plan comparison; Sign-in / Sign-up via Clerk"] },
  { letter: "M", title: "Meeting Assistant & AI Tools", items: ["Meeting Summarizer — paste transcript to structured summary", "Email Generator — context to professional emails", "Document Analyzer — upload PDF/DOCX for AI analysis", "Task Generator — content to actionable task list", "Gemini (primary) or OpenAI provider; AI run history"] },
  { letter: "N", title: "Notetaker Bot (Technical)", items: ["Playwright Chromium automation", "ffmpeg audio capture; OpenAI Whisper transcription", "Google Gemini 2.5 Flash for summaries and insights", "HTTP API: POST /start, POST /stop", "Direct Neon DB read/write for session state"] },
  { letter: "O", title: "OAuth & Auth", items: ["Clerk authentication (sign-in, sign-up, JWT sessions)", "Clerk webhooks sync users to Postgres", "Google OAuth (Calendar + Gmail); Microsoft OAuth (Teams/Outlook)", "Protected API routes with JWT + rate limiting"] },
  { letter: "P", title: "Preferences & Settings", items: ["Account — profile, plan, usage", "Preferences — email notifications, AI tone, summary length, language (EN/HI), bot name", "Auto-share targets: Slack, Gmail, Notion, Jira", "Bot tab — display name, audio source", "Usage tab — meetings used, limits, data deletion", "Payments tab — plan, invoices, upgrade"] },
  { letter: "Q", title: "Quality & Testing", items: ["Vitest unit and integration tests", "fast-check property-based tests", "API route tests; bot unit tests (audio, transcription, recovery)"] },
  { letter: "R", title: "Recording & Transcription", items: ["In-meeting audio recording to WAV", "Whisper speech-to-text with retry logic", "Recording metadata: size, duration, timestamps", "Minimum audio validation; silence detection"] },
  { letter: "S", title: "Search", items: ["Full-text meeting search API", "pg_trgm fuzzy search on summaries", "Search across personal and workspace meetings"] },
  { letter: "T", title: "Team Workspaces", items: ["Create Personal or Team workspaces", "Owner, members, roles; invite by email or link", "Join requests, transfer ownership, leave workspace", "Workspace dashboard: meetings, action items, members, pending moves", "Member picker for assigning action items"] },
  { letter: "U", title: "Usage & Limits", items: ["Per-plan limits enforced server-side", "Meeting bot, transcription, summary, history toggles", "Meetings per month cap; team workspace (Elite+)", "Usage stats API; trial days remaining display"] },
  { letter: "V", title: "Video Platforms", items: ["Google Meet, Microsoft Teams, Zoom join automation", "Unsupported platform graceful error", "Meeting URL deduplication with calendar events"] },
  { letter: "W", title: "Workspace Move Governance", items: ["Request to move personal meeting to team workspace", "Admin approve / reject with optional note", "Pending move requests panel; audit trail"] },
  { letter: "X", title: "Export & Documents", items: ["PDF export of meeting summary", "Action items export endpoint", "Document upload analysis (PDF, DOCX)"] },
  { letter: "Y", title: "Your Data (Privacy)", items: ["User data deletion API", "Recordings stored privately; secrets in env only", "CORS restricted; Helmet security headers; rate limiting"] },
  { letter: "Z", title: "Zapier & Webhooks", items: ["Zapier integration (5000+ apps)", "Custom webhook endpoints", "Razorpay payment webhooks (HMAC verified)", "Clerk user webhooks (Svix verified); Slack post after meetings"] },
];

function bold(text) {
  return new TextRun({ text, bold: true });
}

function normal(text) {
  return new TextRun({ text });
}

function para(children, opts = {}) {
  return new Paragraph({ children: Array.isArray(children) ? children : [children], ...opts });
}

function heading1(text) {
  return new Paragraph({ text, heading: HeadingLevel.HEADING_1, spacing: { before: 360, after: 200 } });
}

function heading2(text) {
  return new Paragraph({ text, heading: HeadingLevel.HEADING_2, spacing: { before: 240, after: 120 } });
}

function bullet(text) {
  return new Paragraph({
    children: [normal(text)],
    bullet: { level: 0 },
    spacing: { after: 80 },
  });
}

function linkPara(label, url) {
  return new Paragraph({
    children: [
      new ExternalHyperlink({
        children: [new TextRun({ text: label, style: "Hyperlink" })],
        link: url,
      }),
    ],
    spacing: { after: 120 },
  });
}

function makeTable(headers, rows) {
  const colCount = headers.length;
  const widthPct = Math.floor(100 / colCount);
  const headerRow = new TableRow({
    children: headers.map(
      (h) =>
        new TableCell({
          width: { size: widthPct, type: WidthType.PERCENTAGE },
          shading: { fill: "DBEAFE", type: ShadingType.CLEAR },
          children: [para(bold(h), { spacing: { before: 80, after: 80 } })],
        })
    ),
  });
  const dataRows = rows.map(
    (row) =>
      new TableRow({
        children: row.map(
          (cell, idx) =>
            new TableCell({
              width: { size: widthPct, type: WidthType.PERCENTAGE },
              children: [
                para(typeof cell === "string" ? normal(cell) : cell, {
                  spacing: { before: 80, after: 80 },
                }),
              ],
            })
        ),
      })
  );
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [headerRow, ...dataRows],
  });
}

function cellBoldNormal(boldText, normalText) {
  return [bold(boldText), normal(normalText)];
}

const children = [];

// Cover
children.push(
  new Paragraph({ spacing: { before: 2400 } }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: "Artivaa AI", bold: true, size: 56, color: "1D4ED8" })],
    spacing: { after: 200 },
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: "Product & Features Brief", size: 32, color: "475569" })],
    spacing: { after: 400 },
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: "Meeting intelligence — join, record, summarize, execute", size: 22, color: "64748B" })],
    spacing: { after: 200 },
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: "May 2026 · Confidential", size: 20, color: "64748B" })],
    spacing: { after: 200 },
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [
      new ExternalHyperlink({
        children: [new TextRun({ text: "artivaa-frontend.vercel.app", style: "Hyperlink" })],
        link: "https://artivaa-frontend.vercel.app",
      }),
    ],
  }),
  new Paragraph({ children: [new PageBreak()] })
);

// 1. Overview
children.push(heading1("1. Product Overview"));
children.push(
  para([
    bold("One-liner: "),
    normal(
      "Artivaa is an AI-powered meeting intelligence platform that joins your calls, records and transcribes them, turns conversations into structured summaries and action items, and helps teams collaborate through workspaces and integrations."
    ),
  ], {
    shading: { fill: "EFF6FF", type: ShadingType.CLEAR },
    border: { left: { style: BorderStyle.SINGLE, size: 12, color: "2563EB" } },
    indent: { left: 200 },
    spacing: { after: 200 },
  })
);
children.push(para([bold("Live product: "), normal("https://artivaa-frontend.vercel.app")], { spacing: { after: 120 } }));
children.push(para([bold("Mission: "), normal("Make every meeting actionable — automatically.")], { spacing: { after: 120 } }));
children.push(
  para([
    bold("Vision: "),
    normal(
      "Become the default meeting intelligence layer for modern teams — join, record, understand, share, execute — across any video platform."
    ),
  ], { spacing: { after: 200 } })
);
children.push(para(bold("Who we serve:"), { spacing: { after: 80 } }));
["Individual professionals (consultants, founders, PMs)", "Small and mid-size teams (product, sales, ops)", "India-first pricing (INR via Razorpay), global-ready architecture"].forEach(
  (t) => children.push(bullet(t))
);

// 2. Problem
children.push(heading1("2. Problem We Solve"));
children.push(
  makeTable(
    ["Pain point", "Reality today"],
    [
      cellBoldNormal("Meetings are black holes", "Decisions, owners, and deadlines are spoken but never captured consistently"),
      cellBoldNormal("Manual note-taking fails", "Humans miss context while trying to participate"),
      cellBoldNormal("Tools are fragmented", "Calendar, notes, tasks, Slack, email, and Jira live in separate silos"),
      cellBoldNormal("Remote and hybrid work", "Meet, Teams, and Zoom dominate — teams need one layer on top of all three"),
      cellBoldNormal("Follow-up is slow", "Summaries and action items arrive late (or never), so momentum dies"),
    ]
  )
);
children.push(new Paragraph({ spacing: { after: 200 } }));

// 3. How it works
children.push(heading1("3. How Artivaa Works"));
const flow = `Calendar connected → Upcoming meetings visible
↓
User starts AI Notetaker bot → Joins Meet / Teams / Zoom
↓
Audio recorded → Whisper transcription → Gemini AI summary
↓
Action items extracted → Workspace shared → Auto-post to Slack / Gmail / Notion / Jira
↓
Team reviews history, assigns tasks, exports PDF, tracks usage on dashboard`;
children.push(
  new Paragraph({
    children: [new TextRun({ text: flow, font: "Courier New", size: 20 })],
    shading: { fill: "F8FAFC", type: ShadingType.CLEAR },
    spacing: { before: 120, after: 200 },
  })
);

// 4. Pricing
children.push(heading1("4. Pricing Plans"));
children.push(
  makeTable(
    ["Plan", "Price (INR/mo)", "What's included"],
    [
      ["Free", "Rs 0", "AI tools unlimited + 7 meeting previews/month"],
      ["Pro", "Rs 99", "Full bot, transcription, summaries, 20 meetings/month"],
      ["Elite", "Rs 199", "Unlimited meetings + team workspaces + priority support"],
      ["Trial", "Rs 0 (30 days)", "Full Elite access for conversion"],
    ]
  )
);
children.push(new Paragraph({ spacing: { after: 200 } }));

// 5. Integrations
children.push(heading1("5. Integrations"));
children.push(
  makeTable(
    ["Category", "Integrations"],
    [
      ["Calendar", "Google Calendar, Microsoft Teams, Microsoft Outlook"],
      ["Productivity", "Slack, Gmail, Notion, Jira"],
      ["Automation", "Custom Webhooks, Zapier (5000+ apps)"],
      ["Payments", "Razorpay (INR subscriptions)"],
      ["Auth", "Clerk, Google OAuth, Microsoft OAuth"],
      ["AI", "Google Gemini 2.5 Flash, OpenAI Whisper / GPT"],
    ]
  )
);
children.push(new Paragraph({ spacing: { after: 200 } }));

// 6. Tech stack
children.push(heading1("6. Technology Stack"));
children.push(
  makeTable(
    ["Layer", "Technology"],
    [
      ["Frontend", "Next.js 15, React 19, TypeScript, Tailwind CSS, Clerk"],
      ["Backend API", "Node.js 20, Express.js, Drizzle ORM, PostgreSQL (Neon)"],
      ["AI Bot", "Playwright, ffmpeg, Whisper (Python), Gemini 2.5 Flash"],
      ["Hosting", "Vercel (frontend), Render (API + bot), Neon (database)"],
      ["Payments and Email", "Razorpay, Resend"],
    ]
  )
);

// 7. Features A-Z
children.push(new Paragraph({ children: [new PageBreak()] }));
children.push(heading1("7. Complete Feature List (A to Z)"));
children.push(para(normal("Edit this section freely — add, remove, or rewrite any feature below."), { spacing: { after: 200 } }));

for (const f of FEATURES) {
  children.push(heading2(`${f.letter} — ${f.title}`));
  for (const item of f.items) children.push(bullet(item));
}

// 8. Why Artivaa
children.push(new Paragraph({ children: [new PageBreak()] }));
children.push(heading1("8. Why Artivaa?"));
children.push(
  makeTable(
    ["Dimension", "Artivaa advantage"],
    [
      ["Multi-platform bot", "One product for Meet + Teams + Zoom"],
      ["India-first billing", "Razorpay INR pricing vs USD-only competitors"],
      ["Workspace governance", "Admin-approved meeting moves, team invites, assignee workflows"],
      ["AI tool suite", "Email, document, task generators — not just meeting notes"],
      ["Integrations", "Slack, Gmail, Notion, Jira, webhooks, Zapier — per user"],
      ["Language", "English + Hindi preference built into settings"],
    ]
  )
);
children.push(new Paragraph({ spacing: { after: 200 } }));

// 9. Status
children.push(heading1("9. Current Status"));
children.push(
  makeTable(
    ["Milestone", "Status"],
    [
      ["Product built (MVP to feature-rich)", "Complete"],
      ["Production deploy (Vercel + Render + Neon)", "Live"],
      ["Auth (Clerk)", "Live"],
      ["Payments (Razorpay)", "Integrated"],
      ["Calendar OAuth (Google + Microsoft)", "Integrated"],
      ["Meeting bot pipeline", "Built (production deploy in progress)"],
      ["Custom domain", "Planned"],
    ]
  )
);
children.push(new Paragraph({ spacing: { after: 200 } }));

// 10. Roadmap
children.push(heading1("10. Roadmap (Next 12 Months)"));
children.push(
  makeTable(
    ["Quarter", "Focus"],
    [
      ["Q1", "Bot production hardening, mobile polish, monitoring"],
      ["Q2", "Redis job queue, real-time meeting status via WebSocket"],
      ["Q3", "Team admin console, SSO (SAML), Hindi UI localization"],
      ["Q4", "API marketplace, on-prem Docker bundle"],
    ]
  )
);
children.push(new Paragraph({ spacing: { after: 200 } }));

// 11. Team
children.push(heading1("11. Team & Contact"));
children.push(para(normal("Edit the placeholders below before sharing:"), { spacing: { after: 120 } }));
children.push(
  makeTable(
    ["Field", "Details"],
    [
      ["Founder(s)", "[Your name, background]"],
      ["Stage", "Pre-seed / Seed"],
      ["Raising", "Rs [X] for [Y] months runway"],
      ["Use of funds", "Bot infra, GTM, engineers, AI API credits"],
      ["Email", "[your@email.com]"],
      ["LinkedIn", "[linkedin.com/in/you]"],
    ]
  )
);

children.push(
  new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: "Document version: May 2026 · Artivaa AI · Confidential", size: 18, color: "64748B" })],
    spacing: { before: 600 },
  })
);

const doc = new Document({
  creator: "Artivaa AI",
  title: "Artivaa AI — Product & Features Brief",
  styles: {
    default: {
      document: { run: { font: "Calibri", size: 22 } },
    },
  },
  sections: [
    {
      properties: {
        page: { margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } },
      },
      children,
    },
  ],
});

const buffer = await Packer.toBuffer(doc);
fs.writeFileSync(outPath, buffer);

const rtfPath = path.join(root, "artivaa-product-brief.rtf");
try {
  execSync(`textutil -convert rtf "${outPath}" -output "${rtfPath}"`, { stdio: "pipe" });
  console.log(`Pages-friendly RTF written: ${rtfPath}`);
} catch {
  console.log("RTF skipped (textutil not available — use .docx in Pages via File → Open)");
}

console.log(`Word doc written: ${outPath}`);
