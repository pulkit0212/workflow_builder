# Artivaa AI — Investor Pitch Deck (Product & Technology Brief)

> **One-liner:** Artivaa is an AI-powered meeting intelligence platform that joins your calls, records and transcribes them, turns conversations into structured summaries and action items, and helps teams collaborate through workspaces and integrations — so nothing discussed in a meeting gets lost.

**Live product:** [artivaa-frontend.vercel.app](https://artivaa-frontend.vercel.app)  
**Repos:** [artivaa-frontend](https://github.com/pulkit0212/artivaa-frontend) · [artivaa-backend](https://github.com/pulkit0212/artivaa-backend)

---

## 1. The Problem We Solve

| Pain | Reality today |
|------|----------------|
| **Meetings are black holes** | Decisions, owners, and deadlines are spoken but never captured consistently |
| **Manual note-taking fails** | Humans miss context while trying to participate |
| **Tools are fragmented** | Calendar, notes, tasks, Slack, email, and Jira live in separate silos |
| **Remote & hybrid work** | Google Meet, Teams, and Zoom dominate — teams need one layer on top of all three |
| **Follow-up is slow** | Summaries and action items arrive late (or never), so momentum dies |

---

## 2. Our Mission & Vision

**Mission:** Make every meeting actionable — automatically.

**Vision:** Become the default **meeting intelligence layer** for modern teams: join → record → understand → share → execute — across any video platform, in any language, with team governance built in.

**Who we serve:**
- Individual professionals (consultants, founders, PMs)
- Small & mid-size teams (product, sales, ops)
- India-first pricing (INR via Razorpay), global-ready architecture

---

## 3. What Artivaa Does (Product in 30 Seconds)

```
Calendar connected → Upcoming meetings visible
        ↓
User starts AI Notetaker bot → Joins Meet / Teams / Zoom
        ↓
Audio recorded → Whisper transcription → Gemini AI summary
        ↓
Action items extracted → Workspace shared → Auto-post to Slack / Gmail / Notion / Jira
        ↓
Team reviews history, assigns tasks, exports PDF, tracks usage on dashboard
```

---

## 4. Complete Feature List (A → Z)

### A — Action Items
- AI-extracted tasks from meeting transcripts (task, owner, due date, priority)
- Manual create, edit, complete, delete
- **Reporter** and **Assignee** roles (who reported vs who owns the task)
- Filter by workspace, meeting, user, status
- Bulk save from meeting output
- Export action items
- Stats dashboard (pending / completed counts)
- Workspace-scoped and personal views
- Status tracking: pending, in progress, completed with timestamps

### B — Billing & Subscriptions
- **Free** — AI tools unlimited + 7 meeting previews/month
- **Pro (₹99/mo)** — Full bot, transcription, summaries, 20 meetings/month
- **Elite (₹199/mo)** — Unlimited meetings + team workspaces + priority support
- **30-day Trial** — Full Elite access
- Razorpay payments (orders, webhooks, invoice history)
- Plan catalog driven from database (admin can update features/limits)
- Monthly meeting usage counter with automatic reset
- Upgrade / downgrade flows on billing page

### C — Calendar & Scheduling
- **Google Calendar** OAuth sync
- **Microsoft Teams** calendar OAuth
- **Microsoft Outlook** calendar OAuth
- Today's meetings view
- Upcoming meetings panel
- Calendar feed API for dashboard
- Auto-link bot sessions to calendar events (`external_calendar_event_id`)
- Share calendar meetings to workspace
- Orphan calendar meeting cleanup scripts

### D — Dashboard
- Personal mode vs **Workspace mode** switcher
- Quick stats: meetings, action items, usage
- Upcoming meetings widget
- Recent activity
- Plan badge and trial countdown
- Responsive sidebar navigation

### E — Email & Notifications
- **Email Generator** AI tool (professional / friendly / concise / formal tone)
- Post-meeting **follow-up email** draft generation
- **Gmail** integration for auto-send after meetings
- **Resend** for workspace invite emails
- Email notification preferences (summary ready, action items, weekly digest, product updates)
- HTML meeting summary emails

### F — Follow-ups & Sharing
- Auto-share meeting summary to configured integrations after bot completes
- Manual share modal per meeting
- Share to workspace (with admin approval flow for cross-workspace moves)
- Integration share failures surfaced to user
- Follow-up needed flag on meetings

### G — Google Meet (and multi-platform bot)
- **AI Notetaker bot** joins meetings automatically
- Supported platforms: **Google Meet**, **Microsoft Teams**, **Zoom**
- Platform auto-detection from meeting URL
- Custom **bot display name** (e.g. "Artivaa Notetaker")
- Start / stop bot from dashboard
- Real-time meeting status polling (joining, recording, processing, complete, failed)
- Browser profile persistence for Google login state
- Stuck session recovery logic

### H — History & Reports
- Full **meeting history** with search and filters
- **Reports** page — AI-generated insights from past meetings
- History run detail view
- Meeting detail page with full transcript, summary, metadata
- Soft-delete / draft status handling
- Visibility controls (personal vs workspace)

### I — Integrations Hub
- **Calendar:** Google Calendar, Microsoft Teams, Microsoft Outlook
- **Productivity:** Slack (webhook), Gmail, Notion (webhook), Jira (webhook)
- **Promo / extensibility:** Custom Webhooks, Zapier
- Per-integration enable/disable toggle
- Connection test button
- Setup wizard with step-by-step instructions in UI
- Plan-gated integration catalog (database-driven)
- OAuth token storage with refresh for Google

### J — Jira (via integration)
- Push action items / decisions to Jira via Make.com/Zapier webhook
- Configurable webhook URL per user
- Auto-share target preference in settings

### K — Key Decisions & AI Insights
- **Key decisions** extracted from transcript
- **Risks & blockers** identification
- **Key topics** tagging
- **Meeting sentiment** analysis (Positive / Neutral / Negative)
- **Smart insights** JSON payload per meeting
- **Chapter breakdown** — timestamped meeting sections
- **Follow-up meeting needed** boolean flag

### L — Landing & Marketing
- Public marketing homepage with animations (Framer Motion)
- Feature sections: bot, calendar, workspaces, tools, pricing
- Plan comparison from live plan definitions
- Sign-in / Sign-up CTAs (Clerk)
- Tool showcase from registry

### M — Meeting Assistant & AI Tools
- **Meeting Summarizer** — paste transcript → structured summary
- **Email Generator** — context → professional emails
- **Document Analyzer** — upload PDF/DOCX → AI analysis
- **Task Generator** — content → actionable task list
- Tool catalog with badges (POPULAR, NEW), plan allow-lists
- AI run history with input hash deduplication
- Configurable AI provider: **Gemini** (primary) or **OpenAI**
- Server-side tool execution pipeline with Zod schemas

### N — Notetaker Bot (Technical)
- Playwright Chromium automation (headful for anti-bot bypass)
- ffmpeg audio capture (PulseAudio on Linux, AVFoundation on Mac)
- OpenAI **Whisper** transcription (Python)
- Google **Gemini 2.5 Flash** for summarization, insights, chapters
- HTTP API: `POST /start`, `POST /stop` (Express API triggers bot)
- Direct Neon DB read/write for session state
- Private recordings directory
- Bot profile setup script for first-time Google auth

### O — OAuth & Auth
- **Clerk** authentication (sign-in, sign-up, JWT sessions)
- Clerk webhooks → user sync to Postgres (`user.created`, `user.updated`, `user.deleted`)
- Google OAuth via Auth.js for Calendar + Gmail scopes
- Microsoft OAuth for Teams/Outlook calendar
- Protected API routes with Clerk JWT + rate limiting
- Optional Clerk-less dev mode warnings

### P — Preferences & Settings
- **Account** tab — profile, plan, usage
- **Preferences** tab — database-driven preference catalog:
  - Email notifications (4 toggles)
  - AI behavior: email tone, summary length, language (EN/HI), bot name
  - Auto-share targets: Slack, Gmail, Notion, Jira
- **Bot** tab — display name, audio source configuration
- **Usage** tab — meetings used, limits, data deletion (GDPR-style)
- **Payments** tab — plan, invoices, upgrade

### Q — Quality & Testing
- **Vitest** unit and integration tests
- **fast-check** property-based tests (workspace, auth, action items, redirects)
- API route tests for settings, meetings, workspaces
- Bot unit tests (audio capture, transcription retry, stuck session recovery)
- Debug tests panel (dev only)

### R — Recording & Transcription
- In-meeting audio recording to WAV
- Whisper speech-to-text with retry logic
- Recording metadata: size, duration, start/end timestamps
- Recording URL / file path storage
- Minimum audio size validation (skip silent meetings)
- Audio level probe before recording (silence detection)

### S — Search
- Full-text meeting search API
- pg_trgm index on summary for fuzzy search
- Search across user's meetings and workspace meetings

### T — Team Workspaces
- Create **Personal** or **Team** workspaces
- Workspace owner, members, roles
- **Invite by email** or shareable invite link/token
- Join requests and invite validation
- Transfer ownership
- Leave workspace
- Workspace dashboard: meetings count, action items, members, pending moves
- Workspace-scoped meetings and action items
- Member picker for assigning action items
- Workspace cards and switcher in UI

### U — Usage & Limits
- Per-plan limits enforced server-side:
  - Meeting bot on/off
  - Transcription, summary, action items, history on/off
  - Meetings per month cap
  - Team workspace access (Elite+)
- Usage stats API
- Monthly counter reset
- Trial days remaining display

### V — Video Platforms
- Google Meet join automation
- Microsoft Teams join automation
- Zoom join automation
- Unsupported platform graceful error
- Normalized meeting URL matching
- Meeting link deduplication with calendar events

### W — Workspace Move Governance
- Request to move personal meeting → team workspace
- Admin **approve / reject** with optional note
- Pending move requests panel
- Prevents duplicate move requests
- Audit: who moved, when, status

### X — eXport & Documents
- **PDF export** of meeting summary (jsPDF)
- Action items export endpoint
- Document upload analysis (PDF, DOCX via mammoth/pdf-parse)

### Y — Your Data (Privacy controls)
- User data deletion API
- Recordings stored privately (not in git)
- Environment-based secrets (never committed)
- CORS restricted to known frontend origins
- Helmet security headers on API
- Rate limiting on authenticated routes

### Z — Zapier & Webhooks
- Zapier integration promo card (5000+ apps)
- Custom webhook endpoints for internal systems
- Razorpay payment webhooks (HMAC verified)
- Clerk user webhooks (Svix signature verified)
- Slack incoming webhook post after meetings

---

## 5. Technology Stack

### Frontend
| Layer | Technology |
|-------|------------|
| Framework | **Next.js 15** (App Router) |
| UI | **React 19**, **TypeScript**, **Tailwind CSS** |
| Components | Radix UI, Framer Motion, Lucide icons |
| Auth | **Clerk** (@clerk/nextjs) |
| Forms | React Hook Form + Zod |
| PDF | jsPDF |
| ORM (schema) | **Drizzle ORM** |
| Testing | Vitest, fast-check |

### Backend API
| Layer | Technology |
|-------|------------|
| Runtime | **Node.js 20**, **Express.js 4**, **TypeScript** |
| ORM | **Drizzle ORM** |
| Database | **PostgreSQL** (Neon serverless) |
| Auth | Clerk JWT verification (@clerk/backend) |
| Payments | **Razorpay** (orders, webhooks) |
| Email | **Resend** |
| Validation | Zod |
| Security | Helmet, CORS, express-rate-limit |
| Testing | Vitest, Supertest |

### AI & Bot Layer
| Layer | Technology |
|-------|------------|
| Meeting bot | **Playwright** (Chromium automation) |
| Transcription | **OpenAI Whisper** (Python) |
| Summaries & insights | **Google Gemini 2.5 Flash** |
| Optional AI | OpenAI GPT-4.1-mini |
| Audio | **ffmpeg** + PulseAudio / AVFoundation |
| Bot runtime | Node.js HTTP server (legacy-bot) |

### Infrastructure (Production — Live)
| Service | Provider | Role |
|---------|----------|------|
| Frontend hosting | **Vercel** | Next.js SSR/edge |
| API hosting | **Render** | Express API |
| Bot hosting | **Render** (Docker) | Playwright + Whisper |
| Database | **Neon** | PostgreSQL (pooled) |
| Auth | **Clerk** | User management |
| Payments | **Razorpay** | INR subscriptions |
| Source control | **GitHub** | CI/CD via auto-deploy |

### External APIs
- Google Calendar API, Gmail API, Google OAuth
- Microsoft Graph (Teams / Outlook calendar)
- Google Generative AI (Gemini)
- OpenAI API (Whisper + optional GPT)
- Razorpay REST + Webhooks
- Resend transactional email
- Svix (Clerk webhook verification)

### DevOps & Quality
- Docker Compose full-stack local dev (`deploy/docker-compose.yml`)
- Separate Dockerfiles: API, Web, Bot
- SQL migrations + Drizzle schema push
- Property-based testing for critical business logic
- `.env` secret management (never committed)

---

## 6. Architecture (High Level)

```
┌─────────────────────────────────────────────────────────────┐
│  Browser / Mobile Web                                        │
│  artivaa-frontend.vercel.app (Next.js 15)                   │
└──────────────────────────┬──────────────────────────────────┘
                           │ HTTPS + Clerk JWT
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  Express API (Render) — REST /api/*                         │
│  Auth · Meetings · Workspaces · Billing · Integrations      │
└──────────┬──────────────────────────────┬───────────────────┘
           │                              │
           ▼                              ▼
┌──────────────────────┐    ┌───────────────────────────────┐
│  Neon PostgreSQL      │    │  Meeting Bot (Render Docker)  │
│  Users · Meetings ·   │    │  Playwright · ffmpeg · Whisper│
│  Workspaces · Plans   │    │  Gemini summarization         │
└──────────────────────┘    └───────────────────────────────┘
           │
           ▼
┌──────────────────────────────────────────────────────────────┐
│  External: Clerk · Razorpay · Google · Microsoft · Gemini    │
└──────────────────────────────────────────────────────────────┘
```

**Design principles:**
- **API-first** — Express owns business logic; Next.js is UI + thin proxy routes
- **Multi-tenant** — user + workspace scoping on every query
- **Catalog-driven UI** — plans, tools, integrations, preferences from DB (no hardcoded redeploy for config)
- **Idempotent migrations** — safe SQL seeds for production

---

## 7. Business Model & Monetization

| Plan | Price (INR/mo) | Target user |
|------|----------------|-------------|
| Free | ₹0 | Try AI tools + limited meeting previews |
| Pro | ₹99 | Individual power users |
| Elite | ₹199 | Teams + unlimited meetings |
| Trial | ₹0 (30 days) | Conversion funnel to Elite |

**Revenue streams:**
1. Monthly subscriptions (Razorpay)
2. Future: team seats, enterprise SSO, API access, white-label bot

**Unit economics (infra, current stack):**
- ~₹500–1,500/mo cloud at early scale (Vercel free + Render API + Render Bot + Neon free)
- Scales with meeting volume (Whisper + Gemini API costs per meeting)

---

## 8. Competitive Differentiation

| Dimension | Artivaa advantage |
|-----------|-------------------|
| **Multi-platform bot** | One product for Meet + Teams + Zoom (not locked to one vendor) |
| **India-first billing** | Razorpay INR pricing — underserved vs USD-only competitors |
| **Workspace governance** | Admin-approved meeting moves, team invites, assignee workflows |
| **AI tool suite included** | Email, document, task generators — not just meeting notes |
| **Open integration catalog** | Slack, Gmail, Notion, Jira, webhooks, Zapier — configurable per user |
| **Self-hostable architecture** | Monorepo + Docker — enterprise can deploy on-prem later |
| **Hindi language preference** | Built into settings catalog (EN/HI) |

---

## 9. Current Traction & Status

| Milestone | Status |
|-----------|--------|
| Product built (MVP → feature-rich) | ✅ Complete |
| Production deploy (Vercel + Render + Neon) | ✅ Live |
| Auth (Clerk) | ✅ Live |
| Payments (Razorpay test mode) | ✅ Integrated |
| Calendar OAuth (Google + Microsoft) | ✅ Integrated |
| Meeting bot pipeline | ✅ Built (deploy in progress) |
| Property-based test suite | ✅ In codebase |
| Custom domain | ⏳ Planned |
| Mobile app | ⏳ Roadmap |
| Enterprise SSO | ⏳ Roadmap |

---

## 10. Roadmap (Next 12 Months)

| Quarter | Focus |
|---------|-------|
| **Q1** | Bot production hardening, mobile-responsive polish, Sentry monitoring |
| **Q2** | Redis job queue (BullMQ), real-time meeting status via WebSocket |
| **Q3** | Team admin console, SSO (SAML), Hindi UI full localization |
| **Q4** | API marketplace, on-prem Docker bundle, Series A metrics dashboard |

---

## 11. Market Opportunity (Brief)

- **TAM:** Global meeting intelligence + AI notetaker market ($2B+ and growing)
- **SAM:** India + SMB remote teams using Google Workspace / Microsoft 365
- **SOM:** Individual professionals and 5–50 person teams priced in INR

**Trends tailwinds:**
- Hybrid work permanent → more video meetings
- LLM cost dropping → viable per-meeting AI economics
- India digital payments (UPI/Razorpay) → low friction subscription

---

## 12. Security & Compliance (Investor FAQ)

- Secrets in environment variables only (never in repo)
- Clerk handles password/OAuth security
- API rate limiting + JWT on every protected route
- Webhook signature verification (Clerk Svix, Razorpay HMAC)
- User data deletion endpoint
- Recordings stored in private directory, not CDN
- CORS locked to known frontend origin
- PostgreSQL row-level scoping by user_id / workspace_id

---

## 13. Team & Ask

> *Fill in before investor meetings:*

| | |
|---|---|
| **Founder(s)** | [Your name, background] |
| **Stage** | Pre-seed / Seed |
| **Raising** | ₹[X] for [Y] months runway |
| **Use of funds** | Bot infra, GTM, 2 engineers, Gemini/Whisper API credits |
| **Contact** | [email] · [LinkedIn] |

---

## 14. Quick Links

| Resource | URL |
|----------|-----|
| Live app | https://artivaa-frontend.vercel.app |
| Frontend repo | https://github.com/pulkit0212/artivaa-frontend |
| Backend repo | https://github.com/pulkit0212/artivaa-backend |
| Deploy guide | `artivaa-deploy-without-domain.md` |

---

*Document version: May 2026 · Artivaa AI · Confidential — for investor discussions only.*
