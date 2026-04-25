# Artivaa AI — Meeting Intelligence Platform

Artivaa is an AI-powered meeting intelligence platform. It automatically joins your meetings, records audio, generates transcripts, creates AI summaries, extracts action items, and lets your team collaborate on meeting insights through workspaces.

---

## What the App Does

- **AI Notetaker Bot** — Joins Google Meet, Microsoft Teams, or Zoom and records the meeting automatically
- **Transcription** — Converts meeting audio to text using OpenAI Whisper
- **AI Summaries** — Generates structured meeting notes using Google Gemini
- **Action Items** — Automatically extracts tasks and follow-ups from meetings
- **Calendar Sync** — Connects with Google Calendar, Microsoft Teams, and Outlook to show upcoming meetings
- **Workspaces** — Share meetings with your team, assign action items, manage members
- **Integrations** — Auto-share meeting outputs to Slack, Gmail, Notion, and Jira
- **Billing** — Subscription plans via Razorpay

---

## Monorepo Structure

```
Artivaa AI/                              # Root monorepo
├── frontend/                            # Next.js 15 web app (UI + API proxy routes)
├── backend/
│   ├── express-api/                     # Standalone Express.js REST API (port 3001)
│   └── python-services/
│       └── ai-processing-service/
│           └── legacy-bot/              # AI Meeting Bot (Node.js + Python + Playwright)
├── .gitignore                           # Root gitignore
└── README.md                            # This file
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 15, React 19, TypeScript, Tailwind CSS |
| Backend API | Express.js 4, TypeScript, Drizzle ORM |
| Database | PostgreSQL |
| Auth | Clerk |
| AI Transcription | OpenAI Whisper |
| AI Summaries | Google Gemini |
| Bot Automation | Playwright (Chromium) |
| Audio Capture | ffmpeg + PulseAudio |
| Payments | Razorpay |
| Calendar APIs | Google Calendar API, Microsoft Graph API |
| Testing | Vitest + fast-check (property-based testing) |

---

## Repositories

| Repo | Description |
|------|-------------|
| [artivaa-ai](https://github.com/pulkit0212/artivaa-ai) | Main monorepo (this repo) |
| [artivaa-frontend](https://github.com/pulkit0212/artivaa-frontend) | Frontend only |
| [artivaa-backend](https://github.com/pulkit0212/artivaa-backend) | Backend only |

---

## Quick Start

### Prerequisites

- Node.js 18+
- PostgreSQL database (local or hosted)
- Clerk account — [clerk.com](https://clerk.com)
- Google Cloud project (Calendar API + Gemini AI)
- OpenAI API key (for Whisper transcription)

### 1. Clone the repo

```bash
git clone https://github.com/pulkit0212/artivaa-ai.git
cd artivaa-ai
```

### 2. Set up Frontend

```bash
cd frontend
cp .env.example .env.local
npm install
# Fill in .env.local with your keys (see frontend/README.md)
npm run db:push
npm run dev
```

Runs at: `http://localhost:3000`

### 3. Set up Backend API

```bash
cd backend/express-api
cp .env.example .env
npm install
# Fill in .env with your keys (see backend/README.md)
npm run dev
```

Runs at: `http://localhost:3001`

### 4. Set up the Bot (optional — for recording meetings)

```bash
cd backend/python-services/ai-processing-service/legacy-bot
npm install
pip3 install openai-whisper ffmpeg-python
npx playwright install chromium
node setupProfile.js   # one-time browser profile setup
```

---

## Environment Variables

Each service has its own `.env` file. Copy from `.env.example` and fill in:

| Service | File |
|---------|------|
| Frontend | `frontend/.env.local` |
| Backend API | `backend/express-api/.env` |
| Bot | `backend/python-services/ai-processing-service/legacy-bot/.env` |

See each service's README for the full list of required variables.

---

## Sub-project READMEs

- [`frontend/README.md`](./frontend/README.md) — Next.js setup, env vars, scripts, project structure
- [`backend/README.md`](./backend/README.md) — Express API + Bot setup, API reference, architecture

---

## Important Rules

- **Never commit `.env` files** — they contain secrets
- **Never commit `node_modules/`** — run `npm install` after cloning
- **Never commit `private/recordings/*.wav`** — audio files are private and large
- **Never commit `.tmp/`** — temporary agent/bot files
