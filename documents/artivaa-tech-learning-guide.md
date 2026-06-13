# Artivaa — Tech Learning Guide

> **Purpose:** Learn every technology in Artivaa — what it does, how it works, and why we chose it.  
> Written for a developer who knows **Java/Kotlin** and wants to grow into **full-stack + AI + DevOps**.

**How to use this doc:**
- Read one section per day
- Build a small experiment for each topic
- Cross-reference `artivaa-product-technical-handbook.md` for product context
- Use this doc in new Cursor chats: *"Read artivaa-tech-learning-guide.md section on X"*

### ⭐ JavaScript, TypeScript, Next.js, Node — detailed guide

Agar JS/TS/Next/Node **depth** se seekhna hai (line-by-line, Java/Kotlin comparisons, exercises), pehle yeh padho:

👉 **[artivaa-js-ts-next-node-guide.md](./artivaa-js-ts-next-node-guide.md)** (~32 chapters, 4-week plan)

Neeche sections 2–3 aur 6 short overview hain — full detail us file mein hai.

---

## Table of contents

1. [Big picture — how web apps work](#1-big-picture--how-web-apps-work)
2. [JavaScript — overview (→ deep guide)](#2-javascript--overview--deep-guide)
3. [TypeScript — overview (→ deep guide)](#3-typescript--overview--deep-guide)
4. [React & Next.js — overview (→ deep guide)](#4-react--nextjs--overview--deep-guide)
5. [Tailwind CSS & UI](#5-tailwind-css--ui)
6. [Clerk authentication](#6-clerk-authentication)
7. [Node.js & Express — overview (→ deep guide)](#7-nodejs--express--overview--deep-guide)
8. [PostgreSQL & Drizzle ORM](#8-postgresql--drizzle-orm)
9. [Meeting bot — Playwright](#9-meeting-bot--playwright)
10. [Audio capture — ffmpeg & BlackHole](#10-audio-capture--ffmpeg--blackhole)
11. [Whisper transcription](#11-whisper-transcription)
12. [Gemini AI — summaries & tools](#12-gemini-ai--summaries--tools)
13. [Real-time polling & state](#13-real-time-polling--state)
14. [Workspaces & multi-tenancy](#14-workspaces--multi-tenancy)
15. [Integrations & OAuth](#15-integrations--oauth)
16. [Razorpay billing](#16-razorpay-billing)
17. [Deployment — Vercel, Render, Oracle](#17-deployment--vercel-render-oracle)
18. [Docker & containers](#18-docker--containers)
19. [Security patterns](#19-security-patterns)
20. [Java/Kotlin → this stack mapping](#20-javakotlin--this-stack-mapping)
21. [Learning roadmap (12 weeks)](#21-learning-roadmap-12-weeks)

---

## 1. Big picture — how web apps work

### The three layers

```
Presentation  →  Frontend (Next.js)     "What user sees"
Business      →  API (Express)          "Rules, auth, data access"
Data/AI       →  DB + Bot + AI models   "Storage and heavy processing"
```

**Java/Android analogy:**

| Artivaa | Android equivalent |
|---------|-------------------|
| Next.js UI | Jetpack Compose screens |
| Express API | Retrofit + your backend server |
| PostgreSQL | Room / remote DB |
| Clerk | Firebase Auth / Clerk Android SDK |
| Bot service | Background Service / WorkManager |

### Request lifecycle (one button click)

1. User clicks **"Start Notetaker"** in browser
2. React component calls `clientApiFetch('/api/meetings/123/bot/start')`
3. Browser sends HTTPS request with Clerk JWT in header
4. Express verifies JWT, checks user owns meeting, calls bot HTTP
5. Bot joins Google Meet, starts ffmpeg
6. Express returns `202 Accepted`
7. React polls `/status` every 3 seconds until `completed`
8. UI re-renders with transcript and summary

**Key insight:** The frontend never talks to the bot directly. Always through the API. This is the **BFF (Backend for Frontend)** pattern.

---

## 2. JavaScript — overview (→ deep guide)

**Full detail:** [artivaa-js-ts-next-node-guide.md — Part A (sections 1–9)](./artivaa-js-ts-next-node-guide.md#part-a--javascript)

JavaScript woh language hai jisme Artivaa ka **frontend logic**, **Express API**, aur **meeting bot** likha hai. Tum Java/Kotlin jaante ho — yeh mental map rakho:

| Tum jaante ho | JavaScript equivalent |
|---------------|----------------------|
| `val` / `var` | `const` / `let` |
| `String`, `Int` | Sab `string`, `number` — types runtime pe loose (TS fix karta hai) |
| Method | `function` ya arrow `() => {}` |
| Lambda | Arrow function |
| `List.map { }` | `array.map(x => ...)` |
| `suspend fun` + coroutines | `async function` + `await` |
| `interface` | TypeScript `interface` (JS mein nahi) |
| Gradle dependencies | `npm install` + `package.json` |

### Teen cheezein jo pehle din samajhni hain

**1. Async/await har jagah hai** — API call, DB, file read — sab `await` se. Node single-thread hai; blocking code poora server rok deta hai.

**2. Objects aur arrays Java se alag feel karte hain** — `{ id, title }` destructuring, spread `...obj`, `.map/.filter` streams jaisa.

**3. Modules** — har file `import` / `export`. Artivaa mein `@/` = `frontend/src/`.

### Pehla experiment (5 min)

Browser console (F12) ya terminal:

```bash
node -e "
async function demo() {
  const nums = [1, 2, 3];
  const doubled = nums.map(n => n * 2);
  console.log(doubled);
}
demo();
"
```

Phir deep guide ka **Section 6 (Async)** padho — woh sabse important hai.

---

## 3. TypeScript — overview (→ deep guide)

**Full detail:** [artivaa-js-ts-next-node-guide.md — Part B (sections 10–15)](./artivaa-js-ts-next-node-guide.md#part-b--typescript)

TypeScript = JavaScript + **compile-time types**. Kotlin jaisa feel — galat field name likhoge to build fail.

### Artivaa mein kahan dikhega

| Location | Example |
|----------|---------|
| `frontend/src/features/*/types.ts` | API response shapes |
| `frontend/src/**/*.tsx` | Component props typed |
| `backend/express-api/src/**/*.ts` | Routes, DB schema |

### Ek real type (Artivaa)

```typescript
export interface MeetingDetailRecord {
  id: string;
  title: string;
  status: MeetingStatus;
  transcript: string | null;      // nullable — Kotlin String?
  recordingUrl: string | null;
}
```

### Union types (Kotlin sealed class jaisa)

```typescript
type TodayMeetingsResult =
  | { status: "connected"; meetings: GoogleCalendarMeeting[] }
  | { status: "auth_required"; message: string; meetings: GoogleCalendarMeeting[] };
```

`if (result.status === "auth_required")` ke baad TypeScript jaanta hai `message` exist karta hai.

### Kyun zaroori hai

- API typo compile time pe pakad lo (`meeting.titel` ❌)
- Cursor/VS Code autocomplete
- Naye developer (ya AI) ko contract clear

**Study file:** `frontend/src/features/meetings/types.ts`

---

## 4. React & Next.js — overview (→ deep guide)

**Full detail:**
- React: [Part C (sections 16–20)](./artivaa-js-ts-next-node-guide.md#part-c--react)
- Next.js: [Part D (sections 21–25)](./artivaa-js-ts-next-node-guide.md#part-d--nextjs)

### React — UI library

Components = functions jo JSX return karte hain. Data change → automatic re-render.

| Compose | React |
|---------|-------|
| `@Composable` | `function Component()` |
| `mutableStateOf` | `useState` |
| `LaunchedEffect` | `useEffect` |
| `CompositionLocal` | `Context` |

**Artivaa structure:**

```
frontend/src/
├── app/                    # Next.js pages (URLs)
│   └── dashboard/meetings/[id]/page.tsx
├── features/meetings/      # Domain logic (Repository pattern jaisa)
│   ├── api.ts              # HTTP calls
│   ├── types.ts            # Data classes
│   └── components/         # UI
└── lib/api-client.ts       # Auth + fetch wrapper
```

### Next.js — React + routing + deploy

| File | URL |
|------|-----|
| `app/dashboard/meetings/page.tsx` | `/dashboard/meetings` |
| `app/dashboard/meetings/[id]/page.tsx` | `/dashboard/meetings/:id` |

**Server vs Client:** Interactive UI (buttons, polling) → file ke top pe `"use client"`. Artivaa meeting detail yahi pattern use karti hai.

### Ek button click ka poora flow

```
Click "Start Notetaker"
  → meeting-detail.tsx onClick
  → features/meetings/api.ts → clientApiFetch POST /bot/start
  → Express API → bot HTTP
  → 202 Accepted
  → useEffect polling GET /status har 3 sec
  → completed → transcript UI update
```

### Key files padhne ka order

1. `frontend/src/lib/api-client.ts`
2. `frontend/src/features/meetings/api.ts`
3. `frontend/src/features/meetings/components/meeting-detail.tsx`
4. `frontend/src/app/dashboard/meetings/[id]/page.tsx`

```bash
cd frontend && npm run dev
# localhost:3000 — button label change karo, hot reload dekho
```

---

## 5. Tailwind CSS & UI

### What it is

Utility-first CSS. Instead of writing CSS files, you apply classes directly:

```tsx
<div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
```

**Equivalent CSS:**
```css
.card { border-radius: 12px; border: 1px solid #e5e7eb; background: white; padding: 20px; }
```

### Why Tailwind (not plain CSS or Material UI)?

| Reason | Detail |
|--------|--------|
| Speed | No context switching to CSS files |
| Consistency | Design tokens in `tailwind.config.ts` |
| Small bundle | Unused classes purged at build |
| Custom design | Artivaa brand (#6C3FF5) without fighting a component library |

### Artivaa design tokens

| Token | Value | Usage |
|-------|-------|-------|
| Primary | `#6C3FF5` | Buttons, accents |
| Text | `#202124` | Headings |
| Border | `#DADCE0` | Cards |
| Background | `#F8F9FA` | Page bg |

### Radix UI

Artivaa uses **Radix** for accessible primitives (dialogs, dropdowns) + Tailwind for styling.

**Android analogy:** Radix ≈ Material3 components; Tailwind ≈ Modifier chains.

### Experiment

Change a card in `meeting-detail.tsx` — add `hover:shadow-lg transition-shadow`.

---

## 6. Clerk authentication

### What it is

**Authentication as a service.** Handles sign-up, sign-in, sessions, JWT tokens — you don't build auth from scratch.

### Why Clerk (not Firebase Auth or custom JWT)?

| Clerk | Custom auth |
|-------|-------------|
| Pre-built UI | Build login forms yourself |
| JWT sessions | Manage refresh tokens |
| Webhooks sync users | Write user sync logic |
| Works with Next.js + Express | More integration work |
| Free tier 10k MAU | Same |

### How it works in Artivaa

```
1. User signs in on /sign-in
2. Clerk sets session cookie + provides JWT
3. Frontend: useAuth() → getToken() → Bearer header
4. Express: clerkAuth middleware → verifyToken() → req.appUser
5. Clerk webhook → POST /api/webhooks/clerk → sync users table
```

### Key code paths

| Layer | File |
|-------|------|
| Frontend auth | `@clerk/nextjs` in layout |
| Token in API calls | `frontend/src/lib/api-client.ts` |
| Verify on backend | `backend/express-api/src/middleware/clerk-auth.ts` |
| User sync | `backend/express-api/src/lib/user-sync-cache.ts` |

### JWT flow (deep)

```
Clerk issues JWT:
{
  "sub": "user_abc123",     ← Clerk user ID
  "exp": 1234567890,
  "iss": "https://clerk..."
}

Express verifies signature with CLERK_SECRET_KEY
→ sub mapped to users.id in Postgres
→ req.appUser available in all routes
```

**Android parallel:** When you build the Android app, you'll use **Clerk Android SDK** — same JWT, same Express API.

### Experiment

1. Sign in on localhost
2. DevTools → Network → any `/api/meetings` call
3. Copy `Authorization: Bearer eyJ...` header
4. Use in Postman (`docs/postman/`)

---

## 7. Node.js & Express — overview (→ deep guide)

**Full detail:** [artivaa-js-ts-next-node-guide.md — Part E (sections 26–30)](./artivaa-js-ts-next-node-guide.md#part-e--nodejs--express)

### Node.js — JavaScript server pe

Browser ke bina JS run karta hai. Artivaa API `backend/express-api/` yahan chalti hai.

| Java | Node |
|------|------|
| JVM | V8 engine |
| `main()` | `src/index.ts` run |
| `System.getenv()` | `process.env.PORT` |
| Multi-thread default | Single thread + async I/O |

**Entry point** (`index.ts`):
1. `.env` load
2. Express app create
3. Port 3001 listen
4. SIGTERM → DB pool close → clean exit (Render deploy ke liye)

### Express — REST API framework (Spring Boot lite)

```
Request
  → helmet (security headers)
  → cors (Vercel origin allow)
  → express.json (body parse)
  → clerkAuth (JWT → req.appUser)
  → rateLimiter
  → route handler
  → errorHandler
```

| Spring Boot | Express |
|-------------|---------|
| `@RestController` | `Router()` + handlers |
| `@PreAuthorize` | `clerkAuth` middleware |
| `@PathVariable` | `req.params.id` |
| `@RequestBody` | `req.body` |
| `@ControllerAdvice` | `errorHandler` middleware |
| Retrofit client | `fetch()` in `bot-client.ts` |

### Middleware — pipeline samajh lo

Har middleware `(req, res, next)` hai. `next()` call karo taaki agla step chale. Response bhej diya to ruk jao.

**clerkAuth flow:**
```
Authorization: Bearer eyJ...
  → verifyToken (Clerk secret)
  → sync user in Postgres
  → req.appUser = { id, email, ... }
  → next()
```

### Real route — bot start (simplified)

```typescript
meetingsRouter.post("/:id/bot/start", async (req, res, next) => {
  const userId = req.appUser.id;
  const meeting = await getMeetingForUser(req.params.id, userId);
  await botClient.startBot({ meetingId: meeting.id, meetingUrl: meeting.meetUrl });
  res.status(202).json({ status: "accepted" });  // client polling shuru karega
});
```

**202** = accepted, abhi background mein bot kaam kar raha hai.

### npm commands

```bash
cd backend/express-api
npm install          # dependencies (Gradle sync jaisa)
npm run dev          # local server :3001
curl http://localhost:3001/health
```

### Key files

| File | Kya seekho |
|------|------------|
| `src/index.ts` | Server start, graceful shutdown |
| `src/app.ts` | Middleware order, route mounting |
| `src/middleware/clerk-auth.ts` | JWT verify |
| `src/routes/meetings.ts` | Business logic |
| `src/lib/bot-client.ts` | Bot ko HTTP call |

---

## 8. PostgreSQL & Drizzle ORM

### What it is

- **PostgreSQL** — relational database (like MySQL, but more features)
- **Drizzle ORM** — TypeScript-first query builder (like Room/JPA for Node)
- **Neon** — serverless Postgres hosting (auto-scaling, connection pooling)

### Why PostgreSQL?

| Feature | Use in Artivaa |
|---------|----------------|
| JSON columns | Store summary, insights, action_items as JSON |
| UUID primary keys | Meeting IDs shared across API + bot |
| Foreign keys | workspace → members → meetings |
| Full-text search (future) | Search transcripts |

### Why Drizzle (not Prisma, not raw SQL)?

| Drizzle | Prisma |
|---------|--------|
| Lightweight | Heavier runtime |
| SQL-like syntax | Own query language |
| Schema in TypeScript | Schema in `.prisma` file |
| Shared schema frontend + backend | Usually backend only |

### Schema example

```typescript
// backend/express-api/src/db/schema/meeting-sessions.ts
export const meetingSessions = pgTable("meeting_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id),
  status: varchar("status", { length: 50 }),
  transcript: text("transcript"),
  summary: jsonb("summary"),
  recordingUrl: varchar("recording_url", { length: 500 }),
});
```

**Kotlin/Room analogy:**

```kotlin
@Entity(tableName = "meeting_sessions")
data class MeetingSession(
  @PrimaryKey val id: String,
  val userId: String,
  val status: String,
  val transcript: String?
)
```

### Neon connection pooling

```
App → pooled URL (hostname contains "-pooler")
    → Neon connection pooler
    → Postgres (serverless, scales to zero)
```

Bot and API both use the **same pooled URL** with SSL:
```
?sslmode=require
```

### Key queries in Artivaa

| Operation | Where |
|-----------|-------|
| Create meeting | `POST /api/meetings` → INSERT |
| Bot status update | `legacy-bot/index.js` → raw SQL UPDATE |
| List reports | `GET /api/meetings/reports` → SELECT with pagination |
| Workspace filter | `WHERE workspace_id = $1` |

### Experiment

```bash
psql "$DATABASE_URL" -c "SELECT id, status, title FROM meeting_sessions LIMIT 5;"
```

---

## 9. Meeting bot — Playwright

### What it is

**Playwright** — browser automation library. Controls Chrome/Chromium programmatically: open URLs, click buttons, read page content.

### Why Playwright (not Selenium, not Puppeteer)?

| Playwright | Selenium | Puppeteer |
|------------|----------|-----------|
| Modern API | Older, verbose | Chrome only |
| Auto-wait for elements | Manual waits | Chrome only |
| Multi-browser | Yes | No |
| Maintained by Microsoft | Yes | Google |

### How bot joins Google Meet

```javascript
// legacy-bot/platforms/googleMeet.js (simplified)
await page.goto(meetingUrl);
await page.fill('input[placeholder="Your name"]', BOT_NAME);
await page.click('button:has-text("Join now")');
// Wait for meeting UI → return { status: "joined" }
```

**What happens:**
1. Chromium opens (visible on Mac, headless on Oracle)
2. Navigates to Meet URL
3. Fills bot name, clicks Join
4. Detects waiting room vs joined
5. Starts ffmpeg recording

### Bot HTTP API

Bot is a **separate Node.js HTTP server** on port 8000:

```
POST /start  { meetingId, meetingUrl }  → join + record
POST /stop   { meetingId }              → stop + transcribe + summarize
GET  /health                            → { status: "ok" }
```

Express calls it via `BOT_BASE_URL` — never exposed to browser.

### Bot profile (Google login)

Google Meet requires authentication. Bot uses a **persistent browser profile** (cookies/localStorage):

```bash
cd frontend && npm run setup:bot-profile
# Opens browser → log in to Google → profile saved to tmp/bot-profile/
```

On Oracle: copy profile folder to VM, mount in Docker volume.

### Platform detection

```javascript
// meetingBot.js routes URL to correct handler
meet.google.com  → googleMeet.js
zoom.us          → zoom.js
teams.microsoft  → teams.js
```

### Experiment

Set `BOT_HEADLESS=false` in bot `.env`, run bot, watch Chromium join a test Meet.

---

## 10. Audio capture — ffmpeg & BlackHole

### What it is

- **ffmpeg** — command-line tool to record/transcode audio and video
- **BlackHole** — virtual audio driver on Mac (routes system audio to an app)

### The core problem

Google Meet plays remote audio through **speakers**. A normal **microphone** only captures your voice, not remote participants. You need **system audio capture**.

### Mac solution (dev)

```
Multi-Output Device
  ├── BlackHole 2ch    → ffmpeg reads this (remote Meet audio)
  └── MacBook Speakers → you still hear the meeting

ffmpeg input 1: BlackHole 2ch     (output/remote)
ffmpeg input 2: MacBook Mic       (your voice)
         ↓ amix filter
    single WAV file → Whisper
```

Code: `legacy-bot/audioCapture.js`

### Linux/Oracle solution (production)

```javascript
// PulseAudio default monitor
MEETING_AUDIO_SOURCE=default
// ffmpeg -f pulse -i default ...
```

Docker entrypoint starts PulseAudio daemon before Node.

### Why ffmpeg (not browser MediaRecorder)?

| ffmpeg | Browser API |
|--------|-------------|
| Works headless on server | Needs browser tab audio API |
| Mix multiple inputs | Single stream only |
| Consistent WAV output | Format varies |
| Industry standard | Limited server-side support |

### Silence detection

Before recording, bot probes audio level:

```javascript
// 2-second ffmpeg probe → parse RMS dBFS
if (level < -60 dBFS) → abort with silent_audio_source
```

Prevents recording 30 minutes of silence.

### Experiment

```bash
# Mac: test BlackHole captures YouTube audio
ffmpeg -f avfoundation -i ":BlackHole 2ch" -t 5 test.wav
afplay test.wav
```

---

## 11. Whisper transcription

### What it is

**OpenAI Whisper** — open-source speech-to-text model. Runs **locally** on bot machine (Python), not via OpenAI API.

### Why local Whisper (not Google Speech API, not Gemini audio)?

| Local Whisper | Cloud API |
|---------------|-----------|
| Free (no per-minute cost) | Pay per minute |
| Works offline on bot | Needs internet |
| Good accuracy | Similar accuracy |
| Privacy — audio stays on bot | Audio sent to third party |
| Already in Docker image | Extra integration |

Model used: **`small`** — balance of speed vs accuracy on CPU.

### How it runs

```javascript
// index.js spawns Python process
const output = await transcribeQueued(wavPath);

// transcribe.py
model = whisper.load_model("small")
result = model.transcribe(audio_path, language="en", ...)
print(json.dumps({"transcript": result["text"]}))
```

Node reads stdout JSON → saves to DB.

### Hallucination detection

Whisper on silence produces fake repetitive text ("the the the...", "who is the who is the...").

Artivaa rejects these in `transcribe.py`:
- Compression ratio check
- Repeated phrase detection
- Consecutive word repetition

### Whisper parameters (learn what each does)

| Parameter | Value | Why |
|-----------|-------|-----|
| `condition_on_previous_text` | `False` | Prevents loop hallucination |
| `compression_ratio_threshold` | `2.0` | Rejects repetitive output |
| `no_speech_threshold` | `0.6` | Skip silent segments |
| `temperature` | `0.0` | Deterministic — no randomness |
| `language` | `"en"` | Force English |

### Experiment

```bash
cd legacy-bot
python transcribe.py /path/to/meeting.wav
```

---

## 12. Gemini AI — summaries & tools

### What it is

**Google Gemini** — large language model (LLM). Used for text generation: summaries, action items, insights, email drafts.

### Why Gemini (not OpenAI GPT, not Claude)?

| Gemini | GPT-4 |
|--------|-------|
| Google ecosystem fit | OpenAI ecosystem |
| `responseMimeType: "application/json"` — structured output | Need prompt engineering for JSON |
| Competitive pricing | Similar |
| Already used for Google Calendar context | — |
| Free tier for dev | Free tier limited |

Model: **`gemini-2.5-flash`** — fast, cheap, good for summaries.

### How summarization works

```javascript
// summarize.js
const prompt = `Analyze this transcript... Return ONLY valid JSON: { summary, key_decisions, action_items... }`;
const response = await fetch(
  `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent`,
  { headers: { "x-goog-api-key": GEMINI_API_KEY }, body: JSON.stringify({ contents: [...] }) }
);
const structured = JSON.parse(extractText(response));
```

### Retry on 503

Gemini sometimes returns `503 UNAVAILABLE` (high demand). Artivaa retries with:
- Exponential backoff (5s, 10s, 15s, 20s)
- Model fallback: `2.5-flash` → `2.0-flash` → `1.5-flash`

### Structured output pattern

Instead of free text, we force JSON:

```json
{
  "summary": "2-4 sentences...",
  "key_decisions": ["Decision 1"],
  "action_items": [{ "task": "...", "owner": "...", "priority": "High" }],
  "risks_and_blockers": [],
  "meeting_sentiment": "Positive"
}
```

Saved to `meeting_sessions.summary` (JSONB column).

### AI tools (non-bot)

Same Gemini API, different prompts:

| Tool | Input | Output |
|------|-------|--------|
| Meeting summarizer | Transcript text | Summary JSON |
| Document analyzer | PDF/DOCX text | Analysis JSON |
| Task generator | Free text | Task list JSON |
| Email generator | Context | Email draft |

Runs stored in `ai_runs` table for history.

### Prompt engineering basics (learn this)

1. **Role:** "You are Artivaa, a professional meeting intelligence assistant"
2. **Task:** "Analyze this transcript and extract..."
3. **Format:** "Return ONLY valid JSON. No markdown."
4. **Rules:** "action_items must have clear action verbs"
5. **Examples:** (optional few-shot)

### Experiment

Get a Gemini key from [aistudio.google.com](https://aistudio.google.com). Paste a transcript into AI Studio chat with the prompt from `summarize.js`.

---

## 13. Real-time polling & state

### The problem

Bot takes 1–5 minutes to join, record, transcribe, summarize. UI must show live progress without WebSockets.

### Solution: polling

```typescript
// meeting-detail.tsx (simplified)
useEffect(() => {
  if (!isActiveBotStatus(status)) return;
  const interval = setInterval(async () => {
    const data = await fetchMeetingStatus(meetingId);
    setSession(data);
    if (data.status === "completed") clearInterval(interval);
  }, 3000);
  return () => clearInterval(interval);
}, [meetingId, status]);
```

### Why polling (not WebSockets, not SSE)?

| Polling | WebSockets |
|---------|------------|
| Simple HTTP | Persistent connection |
| Works through Render/Vercel | Needs WS support on server |
| Good enough for 3s updates | Better for real-time chat |
| Bot already writes to DB | Would need push from bot |

For Artivaa's use case (status every few seconds), polling is the right tradeoff.

### Status states UI maps to

| Status | UI shows |
|--------|----------|
| `waiting_for_join` | "Bot is joining..." |
| `capturing` | "Recording..." |
| `processing` | "Transcribing..." |
| `summarizing` | "Generating summary..." |
| `completed` | Full report |
| `failed` | Error message |

### Compose/Android parallel

When you build Android app, use the same pattern:

```kotlin
// Kotlin Flow polling
flow {
  while (currentCoroutineContext().isActive) {
    emit(api.getMeetingStatus(id))
    delay(3_000)
  }
}.flowOn(Dispatchers.IO)
```

---

## 14. Workspaces & multi-tenancy

### What it is

**Multi-tenancy** — one app serves many teams. Each workspace is an isolated team with its own meetings and action items.

### Data model

```
workspaces (id, name, owner_id)
  └── workspace_members (workspace_id, user_id, role)
  └── workspace_invites (email, token, role)
  └── meeting_sessions (workspace_id) ← scoped
  └── action_items (workspace_id) ← scoped
```

### Personal vs team mode

Frontend `WorkspaceProvider`:
- **Personal mode** — `x-workspace-id` header not sent → user's own data
- **Team mode** — header set → filtered to workspace

```typescript
// api-client.ts
headers["x-workspace-id"] = activeWorkspaceId;
```

Backend reads header in route handlers.

### Role-based access

| Role | Can do |
|------|--------|
| owner | Delete workspace, transfer ownership |
| admin | Invite members, approve move requests |
| member | View shared meetings, action items |

### Why header-based scoping (not subdomain per team)?

| Header scoping | Subdomain (slack.com/team) |
|----------------|---------------------------|
| Simple | DNS + SSL per tenant |
| Works on free Vercel | Needs wildcard domain |
| Good for MVP | Enterprise pattern |

### Experiment

Create a workspace in UI → invite a test email → accept invite → switch workspace in header.

---

## 15. Integrations & OAuth

### What it is

**OAuth 2.0** — standard protocol for "Login with Google" / "Connect Calendar" without sharing passwords.

### Google Calendar flow

```
1. User clicks "Connect Google" on /dashboard/integrations
2. Redirect to Google consent screen
3. Google redirects back with ?code=...
4. Backend exchanges code for access_token + refresh_token
5. Tokens stored in user_integrations table
6. Backend uses token to fetch calendar events
```

### OAuth roles

| Term | Artivaa |
|------|---------|
| Resource owner | User |
| Client | Artivaa app |
| Authorization server | Google / Microsoft |
| Access token | Short-lived key to call Calendar API |

### Auto-share after meeting

When meeting completes, `triggerAutoShare()` reads user's enabled integrations and posts summary to Slack/Gmail/Notion/Jira.

Uses DB flag `auto_share_done` to run only once.

### Why OAuth is hard (common bugs)

| Bug | Fix |
|-----|-----|
| `redirect_uri_mismatch` | Exact URI in Google Console |
| Token expired | Refresh token flow |
| Missing scopes | Add Calendar scope in consent |

---

## 16. Razorpay billing

### What it is

**Razorpay** — payment gateway for India (UPI, cards, netbanking). Handles checkout UI and webhooks.

### Flow

```
1. User selects plan on /dashboard/billing
2. Frontend: POST /api/payment/create-order → Razorpay order_id
3. Razorpay checkout modal opens (client-side JS)
4. User pays
5. Frontend: POST /api/payment/verify → HMAC signature check
6. Backend updates subscriptions table
7. Razorpay webhook confirms (backup)
```

### Why Razorpay (not Stripe)?

- Primary market India
- UPI support
- INR pricing

### Meeting quota

```typescript
// lib/meeting-quota.ts
// Free plan: X meetings/month
// Before POST /api/meetings → check subscription + usage
```

---

## 17. Deployment — Vercel, Render, Oracle

### Vercel (frontend)

- **What:** Serverless hosting for Next.js
- **How:** Git push → auto build → CDN deploy
- **Why:** Zero DevOps, free tier, perfect Next.js support

```
git push artivaa-frontend → Vercel builds → artivaa-frontend.vercel.app
```

### Render (API)

- **What:** Cloud platform for web services
- **How:** Connect GitHub repo, set build/start commands
- **Why:** Simple Node.js hosting, env vars UI, health checks

```
artivaa-backend/express-api → npm ci && npm run build → npm start
Health: GET /health
```

**Cold start:** Free/starter tier sleeps after inactivity → first request slow (~30s).

### Oracle Cloud (bot)

- **What:** Free ARM VM (Always Free tier)
- **How:** Ubuntu VM + Docker + `oracle-deploy-bot.sh`
- **Why:** 24/7 bot for $0; Render bot costs $25/mo

See `documents/artivaa-deploy-without-domain.md` Phase 5 for full steps.

### ngrok (dev only)

- **What:** Tunnel localhost to public HTTPS URL
- **Why:** Render needs to reach Mac bot during development
- **Limitation:** URL changes every restart → update `BOT_BASE_URL`

---

## 18. Docker & containers

### What it is

**Docker** — packages app + all dependencies into an image that runs identically anywhere.

### Artivaa bot Dockerfile

```dockerfile
FROM mcr.microsoft.com/playwright:v1.49.1-jammy  # Chromium pre-installed
RUN apt-get install ffmpeg python3-pip pulseaudio
COPY legacy-bot/ .
RUN pip3 install openai-whisper
CMD ["node", "index.js"]
```

**Why Playwright base image?** Chromium + system deps pre-baked — saves hours of setup.

### Docker commands you'll use

```bash
docker build -f Dockerfile.bot -t artivaa-bot .
docker run -d -p 8000:8000 --env-file artivaa-bot.env artivaa-bot
docker logs -f artivaa-bot
```

**Android analogy:** Docker image ≈ APK; container ≈ app process running on device.

### docker-compose (local full stack)

`deploy/docker-compose.yml` runs Postgres + API + frontend together for local testing.

---

## 19. Security patterns

### What Artivaa implements

| Pattern | Where |
|---------|-------|
| JWT auth | Clerk on all protected routes |
| CORS whitelist | `ALLOWED_ORIGINS` — only Vercel can call API |
| Rate limiting | `express-rate-limit` on API |
| Helmet | Security HTTP headers |
| Webhook HMAC | Razorpay + Svix (Clerk) signature verify |
| Bot upload secret | `X-Bot-Upload-Secret` header — bot only |
| SQL parameterized queries | `$1, $2` — no SQL injection |
| Env secrets | Never in git — `.env.example` has placeholders |

### Common mistakes to avoid

- ❌ Committing `.env` files
- ❌ Exposing `BOT_BASE_URL` bot port to frontend
- ❌ Skipping CORS config in production
- ❌ Using `SELECT * FROM users WHERE id = '${userId}'` (injection risk)

---

## 20. Java/Kotlin → this stack mapping

| Concept | Java/Android | Artivaa stack |
|---------|--------------|---------------|
| UI | Jetpack Compose | React + Next.js |
| Navigation | NavController | Next.js App Router |
| State | ViewModel + StateFlow | useState + useEffect / Context |
| HTTP client | Retrofit | fetch + api-client.ts |
| DI | Hilt | Manual (hooks + context) |
| Local DB | Room | PostgreSQL (server-side) |
| Auth | Firebase/Clerk SDK | Clerk JS + JWT |
| Background work | WorkManager | Bot service (separate process) |
| Build | Gradle | npm + TypeScript compiler |
| Deploy | Play Store | Vercel + Render |
| Tests | JUnit + Espresso | Vitest + fast-check |

### Skills you already have → what to learn next

| You know | Learn next | Artivaa file to read |
|----------|------------|---------------------|
| Kotlin data classes | TypeScript interfaces | `features/meetings/types.ts` |
| Retrofit | fetch + api-client | `lib/api-client.ts` |
| ViewModel | React hooks + Context | `meeting-detail.tsx` |
| Compose state | useState/useEffect | Any component |
| Room migrations | Drizzle + SQL migrations | `db/schema/`, `db/migrations/` |
| Gradle modules | npm monorepo | `frontend/`, `backend/` |
| Android Services | Node bot HTTP server | `legacy-bot/index.js` |

---

## 21. Learning roadmap (12 weeks)

### Weeks 1–2: Web fundamentals

**Primary doc:** [artivaa-js-ts-next-node-guide.md](./artivaa-js-ts-next-node-guide.md) — Part A + B (JS + TS)

- [ ] Part A sections 1–9 — JavaScript (especially **Section 6 Async**)
- [ ] Part B sections 10–15 — TypeScript
- [ ] Exercises in Section 31 (guide ke end mein)
- [ ] **Build:** Console/Node mein fake meeting array `.map` karke print karo

**Resources:** Deep guide first, then [react.dev/learn](https://react.dev/learn) for React preview

### Weeks 3–4: Next.js + Artivaa frontend

**Primary doc:** [artivaa-js-ts-next-node-guide.md](./artivaa-js-ts-next-node-guide.md) — Part C + D (React + Next)

- [ ] Part C sections 16–20 — React hooks, useEffect, Context
- [ ] Part D sections 21–25 — App Router, Server vs Client, Artivaa fetch flow
- [ ] Study order: Section 32 file list (api-client → meeting-detail)
- [ ] Tailwind CSS utility classes (Section 5 of this doc)
- [ ] Clerk auth flow (Section 6 of this doc)
- [ ] **Build:** Add a "Copy transcript" button to meeting detail

### Weeks 5–6: Backend & database

**Primary doc:** [artivaa-js-ts-next-node-guide.md](./artivaa-js-ts-next-node-guide.md) — Part E (Node + Express)

- [ ] Part E sections 26–30 — Node, npm, middleware, Artivaa API walkthrough
- [ ] Read `backend/express-api/src/routes/meetings.ts` line-by-line with guide open
- [ ] PostgreSQL basics (SELECT, INSERT, JOIN)
- [ ] Drizzle schema reading
- [ ] Postman — test all meeting endpoints
- [ ] **Build:** Add `GET /api/meetings/:id/transcript` export endpoint

### Weeks 7–8: Bot & AI pipeline

- [ ] Playwright basics — open Meet, take screenshot
- [ ] ffmpeg — record 10 seconds of mic audio
- [ ] Run Whisper locally on a WAV file
- [ ] Gemini API — summarize a paragraph in AI Studio
- [ ] Read `legacy-bot/index.js` end-to-end
- [ ] **Build:** Run full bot locally on a test Meet

### Weeks 9–10: DevOps & deployment

- [ ] Docker — build and run bot image locally
- [ ] Deploy Render API (follow deploy runbook)
- [ ] Deploy Oracle VM bot
- [ ] Environment variables — understand every one
- [ ] **Build:** Full E2E meeting on production stack

### Weeks 11–12: Android app (your strength)

- [ ] Read `artivaa-android-compose-plan.md`
- [ ] Jetpack Compose + Retrofit + Clerk Android
- [ ] Build Sprint 1: auth + meeting list
- [ ] Connect to same Express API you now understand

---

## Feature → Technology quick reference

| Feature | Frontend | API | Bot/AI | Storage |
|---------|----------|-----|--------|---------|
| Sign in | Clerk React | clerkAuth middleware | — | `users` |
| Meeting list | React + fetch | Express + SQL | — | `meeting_sessions` |
| Start bot | Button → API | bot-client.ts | Playwright | status in DB |
| Recording | — | — | ffmpeg | WAV file |
| Transcript | Display tab | GET meeting | Whisper | `transcript` column |
| Summary | Display tab | GET meeting | Gemini | `summary` JSONB |
| Insights | Charts/tab | GET meeting | Gemini | `insights` JSONB |
| Action items | CRUD page | action-items.ts | Gemini extract | `action_items` |
| Audio player | ExoPlayer/web audio | recordings.ts | upload POST | WAV on Render disk |
| Workspaces | Context + header | workspaces.ts | — | `workspaces` |
| Calendar | OAuth redirect | calendar.ts | — | `user_integrations` |
| Billing | Razorpay modal | payment.ts | — | `subscriptions` |
| AI tools | Tool pages | tools.ts | Gemini | `ai_runs` |
| Integrations | Settings page | integrations.ts | — | `integrations` |

---

## Glossary

| Term | Meaning |
|------|---------|
| JWT | JSON Web Token — auth credential |
| ORM | Object-Relational Mapping — type-safe DB queries |
| BFF | Backend for Frontend — API tailored for UI |
| LLM | Large Language Model — Gemini, GPT |
| WAV | Uncompressed audio format for Whisper |
| Headless | Browser without visible window |
| Polling | Repeated HTTP requests for updates |
| OAuth | Standard for third-party login/connect |
| CORS | Cross-Origin Resource Sharing — browser security |
| JSONB | Postgres JSON column type with indexing |
| Webhook | Server-to-server HTTP callback on events |
| Cold start | Delay when serverless service wakes up |

---

*Study one section at a time. Build small experiments. The best way to learn this stack is to trace one meeting from button click to summary in the database.*
