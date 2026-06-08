---
marp: true
theme: default
paginate: true
size: 16:9
style: |
  section {
    font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
    background: #0f0f14;
    color: #f4f4f5;
  }
  section.lead {
    text-align: center;
    justify-content: center;
  }
  section.lead h1 {
    font-size: 2.4em;
    color: #ffffff;
  }
  h1 { color: #a78bfa; font-size: 1.8em; }
  h2 { color: #c4b5fd; font-size: 1.2em; font-weight: 400; margin-top: -0.5em; }
  strong { color: #e9d5ff; }
  a { color: #a78bfa; }
  table { font-size: 0.75em; width: 100%; }
  th { background: #6C3FF5; color: white; }
  td { background: #1a1a24; }
  ul { font-size: 0.85em; line-height: 1.5; }
  .accent { color: #6C3FF5; }
  footer { color: #71717a; font-size: 0.5em; }
---

<!-- _class: lead -->

# Artivaa AI

## Meeting Intelligence Platform

**Make every meeting actionable — automatically.**

artivaa-frontend.vercel.app

May 2026 · Confidential

---

# The Problem

| Pain | Today |
|------|-------|
| **Meetings are black holes** | Decisions & deadlines lost in conversation |
| **Manual notes fail** | Can't participate and capture everything |
| **Tools are fragmented** | Calendar, Slack, Jira, email — all siloed |
| **Hybrid work** | Meet, Teams, Zoom — no unified layer |
| **Slow follow-up** | Summaries arrive late or never |

---

# Our Solution

**Artivaa** = AI notetaker + transcription + summaries + team workspaces + integrations

```
Calendar → Bot joins Meet/Teams/Zoom → Record & transcribe
    → Gemini AI summary → Action items → Share to Slack/Gmail/Notion/Jira
```

**Mission:** Nothing discussed in a meeting gets lost.

**Vision:** Default meeting intelligence layer for modern teams — India-first, global-ready.

---

# Product Highlights

- **AI Notetaker Bot** — Google Meet, Microsoft Teams, Zoom
- **Whisper transcription** + **Gemini 2.5** summaries
- **Action items** — AI extract + reporter/assignee workflow
- **Team workspaces** — invites, admin approval, shared meetings
- **Calendar sync** — Google, Teams, Outlook
- **Integrations** — Slack, Gmail, Notion, Jira, Zapier, webhooks
- **AI Tools** — Email, Document, Task generators + Meeting Summarizer
- **INR billing** — Free · Pro ₹99 · Elite ₹199 · 30-day trial

---

# How It Works

1. Connect calendar (Google / Microsoft)
2. See upcoming meetings on dashboard
3. **Start bot** → joins video call as notetaker
4. Audio → **OpenAI Whisper** → full transcript
5. **Google Gemini** → summary, decisions, risks, sentiment, chapters
6. Action items saved → optional **auto-share** to Slack, email, etc.
7. Team reviews history, assigns tasks, exports **PDF**

---

# Target Users

| Segment | Use case |
|---------|----------|
| **Founders & PMs** | Never miss decisions from investor / sprint calls |
| **Consultants** | Client meeting notes + follow-up emails |
| **Sales teams** | Call summaries + CRM-ready action items |
| **Remote SMB teams** | Shared workspace + governance |

**Geography:** India-first pricing (Razorpay INR), architecture ready for global scale.

---

# Technology Stack

| Layer | Stack |
|-------|-------|
| **Frontend** | Next.js 15, React 19, TypeScript, Tailwind |
| **API** | Express.js, TypeScript, Drizzle ORM |
| **Database** | PostgreSQL (Neon serverless) |
| **Auth** | Clerk |
| **AI** | Gemini 2.5 Flash, OpenAI Whisper, GPT (optional) |
| **Bot** | Playwright, ffmpeg, Node.js |
| **Payments** | Razorpay |
| **Infra** | Vercel + Render + Neon |

Property-based testing (Vitest + fast-check) on critical flows.

---

# Architecture

```
Browser (Vercel Next.js)
        ↓ Clerk JWT
Express API (Render)
        ↓                    ↓
   Neon PostgreSQL      Bot Docker (Render)
                              Playwright + Whisper + Gemini
        ↓
Clerk · Razorpay · Google · Microsoft · Gemini
```

**API-first** · **Multi-tenant** · **Catalog-driven** plans & integrations (DB, not code deploys)

---

# Business Model

| Plan | Price | Includes |
|------|-------|----------|
| **Free** | ₹0 | AI tools unlimited, 7 meeting previews/mo |
| **Pro** | ₹99/mo | Bot + transcription + summary, 20 meetings |
| **Elite** | ₹199/mo | Unlimited + team workspaces |
| **Trial** | 30 days free | Full Elite access |

**Future revenue:** Team seats · Enterprise SSO · API access · White-label bot

**Infra cost at early scale:** ~₹500–1,500/mo + per-meeting AI API usage

---

# Competitive Edge

- **Multi-platform bot** — Meet + Teams + Zoom (not vendor-locked)
- **India INR subscriptions** — underserved vs USD-only competitors
- **Workspace governance** — admin-approved moves, team invites
- **AI tool suite included** — not just meeting notes
- **Rich integrations** — Slack, Gmail, Notion, Jira out of the box
- **Self-hostable** — Docker monorepo for enterprise/on-prem path
- **Hindi language** preference in settings (EN/HI roadmap)

---

# Traction & Status

| Milestone | Status |
|-----------|--------|
| Full product (MVP → feature-rich) | ✅ |
| Production live (Vercel + Render + Neon) | ✅ |
| Clerk auth + Razorpay billing | ✅ |
| Google + Microsoft calendar OAuth | ✅ |
| Meeting bot pipeline | ✅ Built |
| Bot cloud deploy | 🔄 In progress |
| Custom domain + mobile | 📋 Roadmap |

**Live:** artivaa-frontend.vercel.app

---

# Roadmap (12 Months)

| Quarter | Focus |
|---------|-------|
| **Q1** | Bot production hardening, monitoring (Sentry) |
| **Q2** | Job queue (Redis/BullMQ), real-time status |
| **Q3** | Team admin console, SSO, Hindi UI |
| **Q4** | API marketplace, on-prem Docker, scale metrics |

**Market:** $2B+ meeting intelligence TAM · India SMB + global-ready architecture

---

# Security & Compliance

- Clerk for auth · JWT on all protected API routes
- Webhook HMAC (Razorpay, Clerk Svix)
- Secrets in env only — never in git
- User data deletion endpoint
- Private recording storage · CORS locked to frontend origin
- Rate limiting + Helmet security headers

---

<!-- _class: lead -->

# The Ask

### Pre-seed / Seed round

**Raising:** ₹[X] for [Y] months runway

**Use of funds:**
- Bot infrastructure & AI API credits
- Go-to-market (India SMB + prosumer)
- 2 engineers (bot reliability + integrations)

**Contact:** [your email] · [LinkedIn]

---

<!-- _class: lead -->

# Thank You

## Artivaa AI

**artivaa-frontend.vercel.app**

github.com/pulkit0212/artivaa-frontend
github.com/pulkit0212/artivaa-backend

*Confidential — for investor discussions only*
