# Artivaa — Product & Technical Handbook

> **Purpose:** Single source of truth for developers, future maintainers, and AI assistants.  
> Read this file first to understand what Artivaa is, how it is built, and what remains to ship.

**Product name:** Artivaa AI  
**Category:** AI meeting intelligence platform  
**Last updated:** June 2026

---

## Table of contents

1. [Product overview](#1-product-overview)
2. [User personas & core jobs](#2-user-personas--core-jobs)
3. [Feature catalog](#3-feature-catalog)
4. [System architecture](#4-system-architecture)
5. [Repository layout](#5-repository-layout)
6. [Meeting lifecycle (end-to-end)](#6-meeting-lifecycle-end-to-end)
7. [API surface](#7-api-surface)
8. [Database model](#8-database-model)
9. [External services](#9-external-services)
10. [Environment variables](#10-environment-variables)
11. [Deployment topology](#11-deployment-topology)
12. [Current status & gaps](#12-current-status--gaps)
13. [How to extend the product](#13-how-to-extend-the-product)
14. [Conventions for contributors](#14-conventions-for-contributors)
15. [Related documents](#15-related-documents)

---

## 1. Product overview

Artivaa is a **meeting intelligence platform** that:

1. **Joins** video meetings (Google Meet, Zoom, Microsoft Teams) via an automated bot
2. **Records** audio from the meeting (system output + microphone on Mac; PulseAudio on Linux)
3. **Transcribes** speech using OpenAI Whisper
4. **Summarizes** using Google Gemini (summary, key points, decisions, risks, action items)
5. **Generates insights** (engagement score, speakers, topics, chapters, sentiment)
6. **Stores** everything in PostgreSQL for reports, search, and team workspaces
7. **Shares** outputs to integrations (Slack, Gmail, Notion, Jira) when configured

Additional capabilities beyond live meetings:

- **Manual AI tools** — upload audio/docs and run summarizer, document analyzer, task generator, email generator
- **Team workspaces** — shared meetings, action items, invites, move requests
- **Calendar sync** — Google Calendar and Microsoft Outlook/Teams OAuth
- **Billing** — Razorpay subscriptions with usage quotas

---

## 2. User personas & core jobs

| Persona | Job to be done | Key features |
|---------|----------------|--------------|
| Individual professional | Never miss meeting notes | Bot, transcript, summary, action items |
| Team lead | Share outcomes with team | Workspaces, invites, shared reports |
| PM / ops | Track tasks from meetings | Action items, export, integrations |
| Founder / sales | Follow-up fast | Email generator, meeting reports |
| Admin | Control billing & settings | Billing, preferences, bot settings |

---

## 3. Feature catalog

### 3.1 Authentication & onboarding

| Feature | Description | Frontend | Backend |
|---------|-------------|----------|---------|
| Sign in / Sign up | Clerk-hosted auth UI | `/sign-in`, `/sign-up` | Clerk JWT verified in `clerkAuth` middleware |
| User sync | Clerk user → `users` table | Webhook + first API call | `POST /api/webhooks/clerk`, `lib/user-sync-cache.ts` |
| Workspace invite | Email/link invite to team | `/invite/[token]` | `GET /api/invite/validate`, `POST /api/invite/accept` |

### 3.2 Dashboard & meetings

| Feature | Description | Frontend path | Backend |
|---------|-------------|---------------|---------|
| Dashboard home | Today’s meetings, stats, calendar snippet | `/dashboard` | `GET /api/meetings/today`, workspace dashboard |
| Meetings list | Calendar events + bot sessions | `/dashboard/meetings` | `GET /api/meetings`, `/calendar-feed` |
| Meeting detail | Transcript, summary, insights, audio, bot control | `/dashboard/meetings/[id]` | `GET /api/meetings/:id`, `GET /api/meetings/:id/status` |
| Create meeting | Manual meeting session | UI forms | `POST /api/meetings` |
| Start bot | Bot joins Meet/Zoom/Teams | Start Notetaker button | `POST /api/meetings/:id/bot/start` → bot `POST /start` |
| Stop bot | End capture early | Stop button | `POST /api/meetings/:id/bot/stop` → bot `POST /stop` |
| Status polling | Live bot state in UI | `meeting-detail.tsx` polls every ~3s | `GET /api/meetings/:id/status` |
| Reports | Completed meeting history | `/dashboard/reports` | `GET /api/meetings/reports` |
| Recording playback | WAV stream in Transcript tab | `AudioPlayer` component | `GET /api/recordings/:meetingId` |
| Share to workspace | Move personal meeting to team | Share button | `POST /api/meetings/:id/move-to-workspace` |
| Share to integrations | Auto-share on complete | Triggered on status poll | `triggerAutoShare()` in `meeting-sessions.ts` |

**Meeting status flow:**

```
draft → waiting_for_join → waiting_for_admission → capturing
  → processing → summarizing → completed | failed
```

Defined in: `frontend/src/features/meetings/meeting-status.ts`, bot `index.js`, DB `meeting_sessions.status`.

### 3.3 Bot & audio pipeline

| Step | Technology | Location |
|------|------------|----------|
| Join meeting | Playwright Chromium | `legacy-bot/platforms/googleMeet.js`, `zoom.js`, `teams.js` |
| Record audio | ffmpeg | `legacy-bot/audioCapture.js` |
| Mac capture | BlackHole 2ch + MacBook mic mix | `MEETING_AUDIO_MAC_DEVICE`, `MEETING_MIC_MAC_DEVICE` |
| Linux capture | PulseAudio `default` | `MEETING_AUDIO_SOURCE` |
| Transcribe | Whisper (Python) | `legacy-bot/transcribe.py` |
| Summarize | Gemini 2.5 Flash | `legacy-bot/summarize.js` |
| Save to DB | Direct Postgres from bot | `legacy-bot/index.js` → `onStatusUpdate()` |
| Upload recording | Multipart POST to API | `POST /api/recordings/:id/upload` |

**Important:** Meet mic on/off is **user-controlled** in Google Meet UI. Recording uses **OS-level audio capture**, independent of Meet mute state.

### 3.4 Workspaces (teams)

| Feature | Frontend | Backend |
|---------|----------|---------|
| List/create workspaces | `/dashboard/workspace` | `GET/POST /api/workspaces` |
| Members & roles | Workspace admin UI | `PATCH/DELETE /api/workspaces/:id/members/:memberId` |
| Invites | Email + link | `POST /api/workspaces/:id/invite` |
| Workspace dashboard | Stats, meetings count | `GET /api/workspaces/:id/dashboard` |
| Workspace meetings | Shared meeting list | `GET /api/workspaces/:id/meetings` |
| Move requests | Approve/reject meeting moves | `move-requests` routes |
| Workspace switcher | Header/sidebar context | `WorkspaceProvider` + `x-workspace-id` header |

**Scoping rule:** When `x-workspace-id` header is set, API filters meetings and action items to that workspace.

### 3.5 Action items

| Feature | Frontend | Backend |
|---------|----------|---------|
| List & filter | `/dashboard/action-items` | `GET /api/action-items` |
| Create / edit / complete | UI CRUD | `POST/PATCH/DELETE /api/action-items` |
| Stats | Dashboard widgets | `GET /api/action-items/stats` |
| Export CSV | Export button | `GET /api/action-items/export` |
| From meetings | Auto-created by bot | Bot inserts into `action_items` table |

### 3.6 Integrations

| Integration | Purpose | Connect flow |
|-------------|---------|--------------|
| Google Calendar | Sync events, OAuth | `/api/calendar/connect/google` |
| Microsoft Teams/Outlook | Calendar sync | `/api/calendar/connect/microsoft` |
| Slack | Post summary | Integrations settings + auto-share |
| Gmail | Send summary email | OAuth + auto-share |
| Notion | Push notes | API token in integrations |
| Jira | Create issues from action items | API token in integrations |

Catalog loaded from DB: `integration_catalog` table + `routes/integrations.ts`.

### 3.7 AI tools (manual, non-bot)

| Tool | Route | API |
|------|-------|-----|
| Meeting summarizer | `/dashboard/tools/meeting-summarizer` | `POST /api/tools/meeting-summarizer/run` |
| Document analyzer | `/dashboard/tools/document-analyzer` | `POST /api/tools/document-analyzer` |
| Task generator | `/dashboard/tools/task-generator` | `POST /api/tools/task-generator` |
| Email generator | `/dashboard/tools/email-generator` | `POST /api/tools/email-generator` |
| Tool history | `/dashboard/history` | `GET /api/ai-runs` |

Runs stored in `ai_runs` table with input/output JSON.

### 3.8 Billing & usage

| Feature | Frontend | Backend |
|---------|----------|---------|
| Plans catalog | `/dashboard/billing` | `GET /api/subscription/plans` |
| Current subscription | Billing page | `GET /api/subscription` |
| Razorpay checkout | Payment modal | `POST /api/payment/create-order`, `/verify` |
| Webhooks | — | `POST /api/webhooks/razorpay` |
| Meeting quota | Enforced on create | `lib/meeting-quota.ts` |
| Usage stats | Settings | `GET /api/usage/stats`, `/api/settings/usage` |

### 3.9 Settings

| Area | API |
|------|-----|
| Account profile | `GET/PATCH /api/settings/account` |
| Bot preferences (name, auto-join) | `GET/POST /api/settings/bot` |
| User preferences (summary length, auto-share) | `GET/PATCH /api/settings/preferences` |
| Preferences catalog (dynamic fields) | `GET /api/settings/preferences/catalog` |

---

## 4. System architecture

### Production target

```
┌─────────────┐     HTTPS      ┌──────────────────┐
│   Browser   │ ──────────────►│ Vercel (Next.js) │
│  / Android  │                │ artivaa-frontend │
└─────────────┘                └────────┬─────────┘
                                        │ NEXT_PUBLIC_API_URL
                                        │ Authorization: Bearer <Clerk JWT>
                                        │ x-workspace-id: <uuid>
                                        ▼
                               ┌──────────────────┐
                               │ Render (Express) │
                               │  artivaa-api     │
                               └────────┬─────────┘
                    BOT_BASE_URL       │              BOT_UPLOAD_SECRET
                         │             │                      ▲
                         ▼             ▼                      │
                ┌──────────────┐  ┌─────────┐         ┌──────┴───────┐
                │ Oracle VM    │  │  Neon   │         │ Upload WAV   │
                │ legacy-bot   │──►│ Postgres│◄────────│ after meeting│
                │ :8000 Docker │  └─────────┘         └──────────────┘
                └──────────────┘
                         │
                    Playwright + ffmpeg + Whisper + Gemini
```

### Development (Mac bot)

Same as above, but bot runs on Mac with ngrok tunnel instead of Oracle:

```
Render API → ngrok → Mac :8000 (BOT_HEADLESS=false, BlackHole audio)
```

### Request flow (typical authenticated call)

1. User signs in via Clerk → session JWT in browser
2. Frontend `clientApiFetch()` adds `Authorization: Bearer <token>`
3. If workspace selected, adds `x-workspace-id` header
4. Express `clerkAuth` middleware verifies JWT, syncs user to `users` table
5. Route handler queries Neon via Drizzle/raw SQL
6. JSON response → frontend feature component renders UI

---

## 5. Repository layout

```
workflow_builder/                    # Monorepo (source of truth)
├── frontend/                        # Next.js 15 app → Vercel
│   └── src/
│       ├── app/                     # Pages (App Router)
│       ├── features/                # Feature modules (api, types, components)
│       ├── components/              # Shared layout, UI
│       ├── lib/                     # api-client, auth helpers
│       └── hooks/
├── backend/
│   ├── express-api/                 # Express API → Render
│   │   └── src/
│   │       ├── routes/              # All REST endpoints
│   │       ├── middleware/          # clerkAuth, rateLimiter, errors
│   │       ├── db/schema/           # Drizzle schema (shared)
│   │       └── lib/                 # bot-client, meeting-quota, etc.
│   └── python-services/
│       └── ai-processing-service/
│           └── legacy-bot/          # Meeting bot → Oracle/Mac
│               ├── index.js         # HTTP server, orchestration
│               ├── audioCapture.js  # ffmpeg recording
│               ├── transcribe.py    # Whisper
│               ├── summarize.js     # Gemini
│               └── platforms/       # googleMeet, zoom, teams
├── deploy/                          # docker-compose local stack
├── docs/postman/                    # API collection
└── documents/                       # Runbooks, this handbook
```

**GitHub split repos:**

| Repo | Deploy |
|------|--------|
| `artivaa-frontend` | Vercel |
| `artivaa-backend` | Render + Oracle |
| `workflow_builder` | Local development |

**Sync rule:** Develop in monorepo → push relevant folders to deploy repos → redeploy.

---

## 6. Meeting lifecycle (end-to-end)

### Step-by-step

| # | Actor | Action | DB status |
|---|-------|--------|-----------|
| 1 | User | Creates or selects calendar meeting | `scheduled` / new session |
| 2 | User | Clicks "Start Notetaker" | `waiting_for_join` |
| 3 | API | `POST /bot/start` → bot `POST /start` | — |
| 4 | Bot | Playwright opens Meet URL, joins | `capturing` |
| 5 | Bot | ffmpeg records WAV (BlackHole+mic or PulseAudio) | — |
| 6 | Bot | Meeting ends (auto-detect or stop) | `processing` |
| 7 | Bot | Whisper transcribes | `summarizing` |
| 8 | Bot | Gemini summarizes + insights + chapters | — |
| 9 | Bot | Inserts action items, updates session | `completed` |
| 10 | Bot | Uploads WAV to Render API | `recording_url` set |
| 11 | API | Auto-share to integrations (once) | — |
| 12 | User | Views report in UI | — |

### Key files

| Concern | File |
|---------|------|
| Bot start from API | `backend/express-api/src/routes/meetings.ts` → `lib/bot-client.ts` |
| Bot orchestration | `legacy-bot/index.js` |
| UI polling | `frontend/src/features/meetings/components/meeting-detail.tsx` |
| Status API | `GET /api/meetings/:id/status` |
| Auto-share | `backend/express-api/src/routes/meeting-sessions.ts` → `triggerAutoShare()` |

### Failure modes

| Error code | Meaning |
|------------|---------|
| `silent_audio_source` | No audio detected before recording |
| `transcription_failed` | Whisper error or hallucination rejected |
| `empty_transcript` | Transcript too short |
| `bot_stop_failed` | Browser/ffmpeg crash |
| `recording_start_failed` | ffmpeg could not start |
| Gemini 503 | Summary retry in code; may show placeholder |

---

## 7. API surface

Full Postman collection: `docs/postman/Artivaa-API.postman_collection.json`

### Auth model

- **Protected routes:** `Authorization: Bearer <Clerk session JWT>`
- **Public routes:** `/health`, `/api/invite/validate`, `/api/calendar/connect/*`, bot upload (`X-Bot-Upload-Secret`)
- **Webhooks:** Svix signature (Clerk), HMAC (Razorpay)

### Route mounting

See `backend/express-api/src/app.ts` for exact mount order. Bot upload route is mounted **before** Clerk auth on `/api/recordings`.

### Workspace header

```
x-workspace-id: <uuid>
```

Sent by `frontend/src/lib/api-client.ts` when a team workspace is active.

---

## 8. Database model

Schema: `backend/express-api/src/db/schema/`

### Core entities

```
users
  └── subscriptions (plan, trial, razorpay_ids, usage)
  └── user_preferences
  └── meeting_sessions (transcript, summary, status, recording, workspace)
  └── action_items
  └── workspaces (owner)
        └── workspace_members
        └── workspace_invites
  └── integrations (slack, gmail, notion, jira)
  └── user_integrations (google, microsoft oauth)
  └── ai_runs (tool history)
```

### `meeting_sessions` important columns

| Column | Purpose |
|--------|---------|
| `status` | Bot lifecycle state |
| `transcript` | Full Whisper output |
| `summary` | JSON — summary text + structured fields |
| `action_items` | JSON array (also normalized to `action_items` table) |
| `insights`, `chapters` | JSON from Gemini |
| `recording_file_path`, `recording_url` | Local path + API URL for playback |
| `workspace_id`, `visibility` | Team sharing |
| `meeting_link` | Google Meet / Zoom / Teams URL |
| `error_code`, `failure_reason` | Failure debugging |

### Migrations

```bash
# Drizzle base schema
cd frontend && npm run db:push

# SQL migrations (catalogs, indexes)
cd backend/express-api && npm run migrate:sql
```

---

## 9. External services

| Service | Used for | Config |
|---------|----------|--------|
| **Clerk** | Auth, user webhooks | `CLERK_*` keys |
| **Neon** | PostgreSQL hosting | `DATABASE_URL` |
| **Vercel** | Frontend hosting | Git connect |
| **Render** | API hosting | `render.yaml` |
| **Oracle Cloud** | Bot VM (planned prod) | Manual VM + Docker |
| **Google Gemini** | Summary, insights, tools | `GEMINI_API_KEY` |
| **OpenAI Whisper** | Transcription (local Python) | Bundled in bot, no API key for Whisper itself |
| **Razorpay** | Payments (INR) | `RAZORPAY_*` |
| **Google Cloud** | Calendar OAuth | `GOOGLE_CLIENT_ID/SECRET` |
| **Microsoft Azure** | Teams/Outlook OAuth | `MICROSOFT_CLIENT_ID/SECRET` |
| **Resend** | Transactional email (optional) | `RESEND_API_KEY` |
| **ngrok** | Dev bot tunnel | Manual, free tier |

---

## 10. Environment variables

Quick matrix (see deploy runbook for full list):

| Variable | Frontend | API | Bot |
|----------|:--------:|:---:|:---:|
| `DATABASE_URL` | ✅ | ✅ | ✅ |
| `NEXT_PUBLIC_API_URL` | ✅ | — | — |
| `CLERK_SECRET_KEY` | ✅ | ✅ | — |
| `GEMINI_API_KEY` | ✅ | ✅ | ✅ |
| `BOT_BASE_URL` | — | ✅ | — |
| `BOT_UPLOAD_SECRET` | — | ✅ | ✅ |
| `EXPRESS_API_URL` | — | — | ✅ |
| `ALLOWED_ORIGINS` | — | ✅ | — |
| `MEETING_AUDIO_MAC_DEVICE` | — | — | Mac only |
| `MEETING_AUDIO_SOURCE` | — | — | Linux only |

---

## 11. Deployment topology

| Component | Production | Development |
|-----------|------------|-------------|
| Frontend | Vercel | `localhost:3000` |
| API | Render | `localhost:3001` |
| Bot | Oracle VM Docker | Mac + ngrok |
| DB | Neon | Neon (shared) or local Postgres |

Detailed steps: `documents/artivaa-deploy-without-domain.md`

---

## 12. Current status & gaps

### ✅ Working (tested)

- Vercel frontend live
- Neon DB migrated
- Clerk sign-in
- Mac bot: join Meet, record, transcribe, insights
- BlackHole + mic audio capture (Mac)
- Code fixes for upload, summary retry, polling

### ⚠️ Partially working

- Render API (intermittently down — needs resume/redeploy)
- Summary (Gemini 503 — retry code deployed, needs redeploy)
- Audio playback in UI (needs Render live + successful upload)
- Google/Microsoft calendar (configured, needs full E2E test)

### ❌ Not done yet

- Oracle bot production deploy
- 24/7 bot uptime
- S3/R2 for persistent recordings
- Clerk Production instance + custom domain
- Razorpay live mode
- Android app (plan exists: `artivaa-android-compose-plan.md`)
- Regenerate summary UI button

### Priority order to go fully live

1. Resume Render API + redeploy latest backend
2. Set `BOT_UPLOAD_SECRET` on Render + bot
3. Deploy Oracle VM bot (Phase 5 in deploy runbook)
4. Update `BOT_BASE_URL` to Oracle IP
5. Full E2E test: meeting → transcript + summary + audio player
6. Rotate exposed secrets

---

## 13. How to extend the product

### Add a new API endpoint

1. Create handler in `backend/express-api/src/routes/<domain>.ts`
2. Mount in `app.ts` if new router
3. Add Clerk auth unless public
4. Add frontend `api.ts` in matching `features/<domain>/`
5. Add to Postman collection
6. Push to `artivaa-backend` + redeploy Render

### Add a new dashboard page

1. Create `frontend/src/app/dashboard/<page>/page.tsx`
2. Create feature module under `frontend/src/features/<name>/`
3. Add nav link in `dashboard-sidebar.tsx`
4. Use `useApiFetch()` for API calls

### Add a new meeting platform

1. Create `legacy-bot/platforms/<platform>.js` with `join*` and `watch*End`
2. Register in `legacy-bot/meetingBot.js`
3. Add provider enum in frontend schema

### Add a new integration (auto-share)

1. Seed `integration_catalog` migration
2. Implement sender in `triggerAutoShare()` or dedicated lib
3. Add UI in integrations settings page

---

## 14. Conventions for contributors

### Frontend

- **Feature-first:** `src/features/<domain>/api.ts`, `types.ts`, `components/`
- **Pages are thin:** logic lives in feature components
- **API client:** always use `clientApiFetch` / `useApiFetch` — never hardcode API URL
- **Workspace context:** respect `WorkspaceProvider` — personal vs team mode

### Backend

- **Snake_case in DB**, camelCase in JSON responses (`toCamel()` helper)
- **Errors:** throw `AppError` subclasses → global `errorHandler`
- **Auth:** all `/api/*` routes use `clerkAuth` except documented public routes
- **Bot calls:** always through `lib/bot-client.ts` — never call bot URL from frontend directly

### Bot

- **Status updates:** use `onStatusUpdate()` — keeps DB in sync with UI polling
- **Never commit secrets** in `.env.example`
- **Mac vs Linux:** audio env vars differ — see `audioCapture.js`

### Git workflow

```
feature branch → workflow_builder monorepo
              → push to artivaa-frontend / artivaa-backend
              → Vercel auto-deploy / Render manual deploy
```

---

## 15. Related documents

| Document | Purpose |
|----------|---------|
| `documents/artivaa-deploy-without-domain.md` | Deploy runbook, Oracle bot, checklists |
| `documents/artivaa-tech-learning-guide.md` | Deep tech explanations for learning |
| `artivaa-android-compose-plan.md` | Android app roadmap |
| `docs/postman/Artivaa-API.postman_collection.json` | API testing |
| `README.md` | Quick start |

---

## AI assistant quick context

When working on this codebase:

1. **Three services:** frontend (Next.js), API (Express), bot (Node+Python)
2. **Single database:** Neon Postgres — bot writes directly, API reads/writes
3. **Auth:** Clerk JWT on API; bot uses shared secret for upload only
4. **Meeting flow:** UI → API → bot HTTP → Whisper → Gemini → DB → upload → UI poll
5. **Production bot target:** Oracle VM, not Mac ngrok
6. **Audio on Mac:** BlackHole + mic mix; on Linux: PulseAudio
7. **Do not** call bot from frontend — always via Express API

---

*Update this handbook when adding major features or changing architecture.*
