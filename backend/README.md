# Artivaa Backend

This repo contains all backend services for the Artivaa AI Meeting Platform:

1. **`express-api/`** — Standalone Express.js REST API server (Node.js + TypeScript)
2. **`python-services/ai-processing-service/legacy-bot/`** — AI Meeting Bot (Node.js + Python)

---

## Architecture Overview

```
backend/
├── express-api/                          # REST API server (port 3001)
│   ├── src/
│   │   ├── app.ts                        # Express app setup
│   │   ├── index.ts                      # Server entry point
│   │   ├── config.ts                     # Env config
│   │   ├── db/
│   │   │   ├── client.ts                 # Drizzle PostgreSQL client
│   │   │   └── schema/                   # DB table definitions
│   │   ├── middleware/
│   │   │   ├── clerk-auth.ts             # Clerk JWT validation
│   │   │   ├── error-handler.ts          # Global error handler
│   │   │   ├── rate-limiter.ts           # 100 req/min per user
│   │   │   └── request-logger.ts         # Morgan request logging
│   │   ├── routes/                       # API route handlers
│   │   └── lib/                          # Shared utilities
│   └── package.json
│
└── python-services/
    └── ai-processing-service/
        └── legacy-bot/                   # Meeting bot service
            ├── index.js                  # Bot entry point + session management
            ├── meetingBot.js             # Core bot logic (join, record, leave)
            ├── audioCapture.js           # Audio recording via ffmpeg
            ├── transcribe.py             # Whisper transcription (Python)
            ├── summarize.js              # Gemini AI summary generation
            ├── setupProfile.js           # One-time browser profile setup
            ├── logger.js                 # Logging utility
            ├── platforms/
            │   ├── googleMeet.js         # Google Meet automation
            │   ├── teams.js              # Microsoft Teams automation
            │   └── zoom.js               # Zoom automation
            └── __tests__/               # Bot unit tests
```

---

## Service 1: Express API

The main REST API server. All frontend API calls go through here.

### Tech Stack
- Node.js 18+ + TypeScript
- Express.js 4
- Drizzle ORM + PostgreSQL
- Clerk JWT authentication
- Vitest for testing

### Setup

```bash
cd express-api
npm install
cp .env.example .env
# Fill in .env values (see below)
npm run dev
```

Server starts at: `http://localhost:3001`
Health check: `GET http://localhost:3001/health`

### Environment Variables

```env
PORT=3001
NODE_ENV=development
DATABASE_URL=postgresql://user:password@localhost:5432/artivaa
CLERK_SECRET_KEY=sk_...
CLERK_WEBHOOK_SECRET=whsec_...
ALLOWED_ORIGINS=http://localhost:3000
BOT_SERVICE_URL=http://localhost:4000
RECORDINGS_DIR=./private/recordings
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_GEMINI_API_KEY=...
OPENAI_API_KEY=sk-...
RAZORPAY_KEY_ID=...
RAZORPAY_KEY_SECRET=...
```

### Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start with ts-node |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run production build |
| `npm test` | Run test suite |

### API Domains

| Domain | Routes |
|--------|--------|
| Health | `GET /health` |
| Auth | `POST /api/webhooks/clerk`, `GET /api/profile/me` |
| Meetings | `GET/POST/PATCH/DELETE /api/meetings`, `/api/meetings/:id/...` |
| Calendar | `GET /api/calendar/status`, `/api/calendar/connect/:provider` |
| Workspaces | `GET/POST /api/workspaces`, `/api/workspace/:id/...` |
| Invites | `GET /api/invite/validate`, `POST /api/invite/accept` |
| Action Items | `GET/POST/PATCH/DELETE /api/action-items` |
| Settings | `GET/PATCH /api/settings/account`, `/bot`, `/preferences` |
| Integrations | `GET/POST /api/integrations` |
| Recordings | `GET /api/recordings/:meetingId` |

---

## Service 2: AI Meeting Bot

The bot automatically joins meetings, records audio, transcribes with Whisper, and generates AI summaries with Gemini.

### Tech Stack
- Node.js + Playwright (browser automation)
- Python 3 + OpenAI Whisper (transcription)
- Google Gemini API (AI summaries)
- ffmpeg (audio capture via PulseAudio)
- PostgreSQL (session state)

### How It Works

1. **Bot joins meeting** — Playwright opens a browser, navigates to the meeting URL, and joins as a bot participant
2. **Audio capture** — ffmpeg records audio from the virtual PulseAudio monitor source
3. **Pre-recording check** — Audio level is checked before recording starts to avoid silent recordings
4. **Transcription** — After the meeting ends, `transcribe.py` sends the WAV file to OpenAI Whisper API (with retry logic)
5. **Summary** — `summarize.js` sends the transcript to Google Gemini to generate structured meeting notes and action items
6. **Session update** — Meeting session status is updated in PostgreSQL throughout the process

### Supported Platforms

| Platform | File |
|----------|------|
| Google Meet | `platforms/googleMeet.js` |
| Microsoft Teams | `platforms/teams.js` |
| Zoom | `platforms/zoom.js` |

### Setup

**Step 1 — Install Node dependencies:**
```bash
cd python-services/ai-processing-service/legacy-bot
npm install
```

**Step 2 — Install Python dependencies:**
```bash
pip3 install openai-whisper ffmpeg-python
# On some systems:
pip3 install --break-system-packages openai-whisper ffmpeg-python
```

**Step 3 — Install ffmpeg (system-level):**
```bash
# Ubuntu/Debian
sudo apt install ffmpeg pulseaudio

# macOS
brew install ffmpeg
```

**Step 4 — Install Playwright browsers:**
```bash
npx playwright install chromium
```

**Step 5 — Set up browser profile (one-time):**

This creates a persistent browser profile so the bot stays logged into Google/Teams accounts:
```bash
node setupProfile.js
```

**Step 6 — Environment variables:**
```bash
cp .env.example .env
```

```env
DATABASE_URL=postgresql://user:password@localhost:5432/artivaa
OPENAI_API_KEY=sk-...
GOOGLE_GEMINI_API_KEY=...
MEETING_AUDIO_SOURCE=default
BOT_DISPLAY_NAME=Artivaa Notetaker
```

### Running the Bot

The bot is started/stopped via the Express API (`POST /api/meetings/:id/bot/start`). It does not need to be run manually in production.

For local testing:
```bash
node index.js
```

### Session Recovery

On startup, the bot automatically recovers any sessions that were stuck in `capturing`, `waiting_for_join`, `processing`, or `summarizing` states due to a previous crash. These are marked as `failed` with `errorCode: 'server_restart'`.

### Running Bot Tests

```bash
npm test
```

---

## Database

Both services share the same PostgreSQL database. Schema is managed from the `frontend/` project using Drizzle ORM.

To apply schema changes:
```bash
cd ../frontend
npm run db:push
```

---

## Important Notes

- **Never commit `.env` files** — they contain secrets
- **Never commit `node_modules/`** — run `npm install` after cloning
- **Never commit `private/recordings/*.wav`** — audio files are large and private
- **Never commit `tmp/`** — bot temp files
