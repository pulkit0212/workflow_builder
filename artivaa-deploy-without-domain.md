# Artivaa — Deploy Without a Domain (Free URLs)

> Sab kuch bina domain ke live hoga.
> Baad mein domain add karna = env vars + OAuth redirect URIs update karna.

**Last updated:** Render (API + Bot) + Vercel (Frontend) + Neon (DB) stack.

---

## Architecture (current)

```
Browser
   ↓
Vercel  →  artivaa-frontend.vercel.app   (Next.js — artivaa-frontend repo)
   ↓ NEXT_PUBLIC_API_URL
Render  →  artivaa-api.onrender.com       (Express — artivaa-backend/express-api)
   ↓ BOT_BASE_URL (private network)
Render  →  artivaa-bot:8000               (legacy-bot Docker — artivaa-backend)
   ↓
Neon    →  PostgreSQL
Clerk   →  Auth (Development instance)
```

---

## GitHub repos

| Repo | Kya hai |
|------|---------|
| [artivaa-frontend](https://github.com/pulkit0212/artivaa-frontend) | Next.js frontend → Vercel |
| [artivaa-backend](https://github.com/pulkit0212/artivaa-backend) | Express API + bot code → Render |
| [workflow_builder](https://github.com/pulkit0212/workflow_builder) | Local monorepo (optional) |

---

## Free URLs (placeholders — apna exact URL note karo)

| Service | Example URL |
|---------|-------------|
| Frontend | `https://artivaa-frontend.vercel.app` |
| API | `https://artivaa-api.onrender.com` |
| Bot | Private only (`http://artivaa-bot:8000` on Render network) |
| DB | Neon connection string only |

---

## PHASE 0 — Pehle Ye Collect Karo

### Step 0.1 — Accounts

- [ ] github.com
- [ ] neon.tech (database)
- [ ] render.com (API + bot)
- [ ] vercel.com (frontend)
- [ ] clerk.com (auth — **Development** instance)
- [ ] console.cloud.google.com (Google Calendar OAuth)
- [ ] portal.azure.com (Microsoft Teams / Outlook OAuth)
- [ ] (optional) sentry.io, betteruptime.com

### Step 0.2 — API keys (notes file mein)

```
CLERK_PUBLISHABLE_KEY   = pk_test_...
CLERK_SECRET_KEY        = sk_test_...
CLERK_WEBHOOK_SECRET    = whsec_...
RAZORPAY_KEY_ID         = rzp_test_...
RAZORPAY_KEY_SECRET     = ...
RAZORPAY_WEBHOOK_SECRET = ...
GEMINI_API_KEY          = AIzaSy_...
OPENAI_API_KEY          = sk-...          (optional)
GOOGLE_CLIENT_ID        = ...apps.googleusercontent.com
GOOGLE_CLIENT_SECRET    = GOCSPX-...
MICROSOFT_CLIENT_ID     = ...
MICROSOFT_CLIENT_SECRET = ...
DATABASE_URL            = postgresql://...@...-pooler....neon.tech/neondb?sslmode=require
```

> Clerk: **Development** instance use karo jab tak custom domain na ho.

---

## PHASE 1 — Database: Neon Postgres

### Step 1.1 — Project banao

1. neon.tech → **New Project**
2. Name: `artivaa`
3. Region: `AWS us-east-1` (ya closest)
4. **Create Project**

### Step 1.2 — Connection string

**Pooled connection** copy karo (hostname mein `-pooler` hona chahiye):

```
postgresql://user:pass@ep-xxx-pooler.region.aws.neon.tech/neondb?sslmode=require
```

Save as `DATABASE_URL` in:
- `backend/express-api/.env`
- `frontend/.env.local`

### Step 1.3 — Migrations (order important)

Monorepo se (local Mac):

```bash
# Step A — Drizzle base schema (frontend folder)
cd frontend
npm run db:push

# Step B — SQL migrations (express-api)
cd ../backend/express-api
npm run migrate:sql
```

Local data Neon par copy karna ho:

```bash
pg_dump "postgresql://localhost:5432/artivaa" --no-owner --no-acl -f /tmp/local.sql
# Neon public schema reset (careful — wipes remote)
psql "$DATABASE_URL" -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
psql "$DATABASE_URL" -f /tmp/local.sql
```

Verify: Neon dashboard → **Tables** → `users`, `meeting_sessions`, etc.

---

## PHASE 2 — API: Render

> Pehle wala RFC Railway use karta tha — ab **Render** use karte hain.

### Step 2.1 — Web Service banao

1. render.com → **New +** → **Web Service**
2. Connect GitHub repo: **`artivaa-backend`**
3. Settings:

| Setting | Value |
|---------|--------|
| Name | `artivaa-api` |
| Root Directory | `express-api` |
| Runtime | **Node** |
| Build Command | `npm ci && npm run build` |
| Start Command | `npm start` |
| Health Check Path | `/health` |

> Express TypeScript build output: `dist/src/index.js` ( `npm start` handles this).

### Step 2.2 — Environment variables

Render → **artivaa-api** → **Environment**:

```env
NODE_ENV=production
NODE_VERSION=20

# Render sets PORT automatically (usually 10000) — code reads process.env.PORT

DATABASE_URL=postgresql://...@...-pooler....neon.tech/neondb?sslmode=require

ALLOWED_ORIGINS=https://artivaa-frontend.vercel.app
FRONTEND_URL=https://artivaa-frontend.vercel.app

CLERK_SECRET_KEY=sk_test_...
CLERK_WEBHOOK_SECRET=whsec_...

RAZORPAY_KEY_ID=rzp_test_...
RAZORPAY_KEY_SECRET=...
RAZORPAY_WEBHOOK_SECRET=...

GEMINI_API_KEY=AIzaSy_...

GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...

RESEND_API_KEY=          # optional
EMAIL_FROM=              # optional
RECORDINGS_DIR=./private/recordings

# Phase 4 ke baad:
BOT_BASE_URL=http://artivaa-bot:8000
```

**Save** → auto redeploy.

### Step 2.3 — Private Network (Phase 4 ke liye)

Render → **artivaa-api** → **Settings** → **Private Network** → **Enable**

### Step 2.4 — Smoke test

```bash
curl https://YOUR-SERVICE.onrender.com/health
# Expected: {"status":"ok"}
```

Pehli request slow ho sakti hai (free/cold start).

### Step 2.5 — Optional later (RFC advanced)

Ye abhi **required nahi** — code direct HTTP se bot call karta hai:

- Redis + BullMQ queue
- Sentry (`@sentry/node`)

---

## PHASE 3 — Auth: Clerk (Development mode)

> App apna sign-in page use karti hai (`/sign-in`) — **Account Portal** redirects edit karne ki zaroorat nahi.

### Step 3.1 — API Keys

Clerk dashboard (top: **Development**) → **API Keys**:

| Key | Render | Vercel |
|-----|--------|--------|
| `CLERK_SECRET_KEY` | ✅ | ✅ |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | ❌ | ✅ |

### Step 3.2 — Redirect paths (env vars, not Clerk Domains page)

Vercel env:

```env
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/dashboard
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/dashboard
```

Development mode mein Clerk ka domain `*.clerk.accounts.dev` auto hota hai — custom domain add **mat karo** abhi.

### Step 3.3 — Clerk Webhook → Render API

Clerk → **Webhooks** → **Add Endpoint**:

```
https://YOUR-SERVICE.onrender.com/api/webhooks/clerk
```

Events: `user.created`, `user.updated`, `user.deleted`

Signing secret → Render `CLERK_WEBHOOK_SECRET`

### Step 3.4 — Google Calendar OAuth (Auth.js / NextAuth on Vercel)

**Google Cloud Console** → Credentials → OAuth Web client → **Authorized redirect URIs**:

```
https://artivaa-frontend.vercel.app/api/auth/callback/google
```

Enable APIs: **Google Calendar API**, **Gmail API**

**Vercel env:**

```env
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
AUTH_GOOGLE_ID=...          # same as GOOGLE_CLIENT_ID
AUTH_GOOGLE_SECRET=...      # same as GOOGLE_CLIENT_SECRET
AUTH_URL=https://artivaa-frontend.vercel.app
AUTH_SECRET=<random-32-char-string>
```

### Step 3.5 — Microsoft Teams / Outlook OAuth

**Azure Portal** → App registrations → **Authentication** → Redirect URI (Web):

```
https://artivaa-frontend.vercel.app/api/calendar/callback/microsoft
```

> Sirf `/microsoft` — **not** `/microsoft_teams` or `/microsoft_outlook`.

**Vercel env:**

```env
MICROSOFT_CLIENT_ID=...
MICROSOFT_CLIENT_SECRET=...
NEXT_PUBLIC_APP_URL=https://artivaa-frontend.vercel.app
```

---

## PHASE 4 — Bot: Render (recommended)

> RFC mein Hetzner tha — simpler path: **bot bhi Render par** (same `artivaa-backend` repo).
> Hetzner option neeche **Appendix A** mein.

Bot code: `python-services/ai-processing-service/legacy-bot/`  
API calls: `POST {BOT_BASE_URL}/start` and `/stop` with `{ meetingId }`

### Step 4.1 — Dockerfile.bot (repo root)

`artivaa-backend/Dockerfile.bot`:

```dockerfile
FROM mcr.microsoft.com/playwright:v1.49.1-jammy

RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg python3-pip \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /bot
COPY python-services/ai-processing-service/legacy-bot/package.json \
     python-services/ai-processing-service/legacy-bot/package-lock.json ./
RUN npm ci --omit=dev

COPY python-services/ai-processing-service/legacy-bot/ ./
RUN pip3 install --no-cache-dir openai-whisper ffmpeg-python

ENV BOT_PORT=8000
EXPOSE 8000
CMD ["node", "index.js"]
```

Commit + push to `artivaa-backend`.

### Step 4.2 — Bot Web Service on Render

1. render.com → **New +** → **Web Service**
2. Repo: **`artivaa-backend`**
3. Settings:

| Setting | Value |
|---------|--------|
| Name | `artivaa-bot` |
| Runtime | **Docker** |
| Dockerfile Path | `Dockerfile.bot` |
| Root Directory | blank (repo root) |
| Instance Type | **Standard (2 GB RAM minimum)** — Playwright needs memory |
| Public Networking | **Off** (optional — private only) |

4. **Private Network** → **Enable** (same as API)

### Step 4.3 — Bot environment variables

```env
NODE_ENV=production
BOT_PORT=8000
DATABASE_URL=<Neon pooled URL — same as API>
GEMINI_API_KEY=...
OPENAI_API_KEY=...              # optional
BOT_NAME=Artivaa Notetaker
MEETING_AUDIO_SOURCE=default    # Linux container default
```

### Step 4.4 — Link API to Bot

Render → **artivaa-api** → Environment:

```env
BOT_BASE_URL=http://artivaa-bot:8000
```

> Private network hostname = Render service name `artivaa-bot`.

Redeploy API.

### Step 4.5 — Bot profile (Google Meet login state)

Local one-time setup (monorepo):

```bash
cd frontend
npm run setup:bot-profile
```

Creates `tmp/bot-profile`. Production bot on Render starts fresh until profile is persisted (advanced: Render persistent disk).

### Step 4.6 — Verify

**Bot logs:**

```
[Bot] HTTP server listening on port 8000
```

**App test:**

1. Vercel → Sign in → Meetings
2. Google Meet link → **Start bot**
3. Bot logs mein join attempt dikhe
4. Stop → transcript/summary DB mein

### Step 4.7 — Render bot limitations (important)

| Limitation | Detail |
|------------|--------|
| RAM | Minimum 2 GB; 4 GB safer for Playwright |
| Audio | Cloud containers ≠ Mac PulseAudio — recording quality test karo |
| Headless | Code uses `headless: false` — cloud pe issue ho to code change |
| Cold start | Low tier pe bot sleep → first meeting slow |
| Cost | ~$7+/mo bot instance (Standard) |

Full production recording ke liye **Appendix A (Hetzner)** consider karo.

---

## PHASE 5 — Frontend: Vercel

### Step 5.1 — Project banao

1. vercel.com → **New Project** → **`artivaa-frontend`**
2. Framework: **Next.js**
3. Root Directory: blank
4. **Deploy mat dabao** — pehle env vars

### Step 5.2 — Environment variables

```env
# URLs — apna exact domain
NEXT_PUBLIC_APP_URL=https://artivaa-frontend.vercel.app
NEXT_PUBLIC_API_URL=https://YOUR-SERVICE.onrender.com

# Clerk
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/dashboard
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/dashboard

# Database (Next.js routes / Drizzle scripts)
DATABASE_URL=<Neon pooled URL>

# AI
GEMINI_API_KEY=...
OPENAI_API_KEY=...
DEFAULT_AI_PROVIDER=gemini

# Google OAuth (Calendar)
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
AUTH_GOOGLE_ID=...
AUTH_GOOGLE_SECRET=...
AUTH_URL=https://artivaa-frontend.vercel.app
AUTH_SECRET=<random-string>

# Microsoft OAuth
MICROSOFT_CLIENT_ID=...
MICROSOFT_CLIENT_SECRET=...

# Razorpay
RAZORPAY_KEY_ID=rzp_test_...
```

> ⚠️ `NEXT_PUBLIC_*` build time bake hote hain — set karke **Redeploy** karo.

### Step 5.3 — Vercel build settings

| Setting | Value |
|---------|--------|
| Root Directory | blank |
| Output Directory | blank (default) |
| Include files outside root | **Off** |

`next.config.ts`: `output: standalone` sirf Docker builds ke liye (`DOCKER_BUILD=1`) — Vercel par off.

### Step 5.4 — Deploy + test

1. **Deploy**
2. `https://artivaa-frontend.vercel.app` → Sign in → Dashboard
3. Network tab → API calls `onrender.com` → **200**
4. Render → `ALLOWED_ORIGINS` = exact Vercel URL

### Step 5.5 — Optional: Sentry

```bash
cd frontend
npx @sentry/wizard@latest -i nextjs
```

---

## PHASE 6 — Monitoring

### Step 6.1 — Better Uptime (free)

1. betteruptime.com → **New Monitor**
2. `https://YOUR-SERVICE.onrender.com/health`
3. `https://artivaa-frontend.vercel.app`
4. Interval: 1 min, email alert

### Step 6.2 — Render logs

- API: Render → artivaa-api → **Logs**
- Bot: Render → artivaa-bot → **Logs**

---

## Domain baad mein add karna ho to

```
1. DNS: app → Vercel, api → Render (optional subdomain)
2. Vercel: NEXT_PUBLIC_APP_URL, NEXT_PUBLIC_API_URL, AUTH_URL
3. Render: ALLOWED_ORIGINS, FRONTEND_URL
4. Google OAuth redirect URI update
5. Azure redirect URI update
6. Clerk → Production instance + live keys
```

---

## GO-LIVE CHECKLIST

```
PHASE 0
[ ] Accounts + keys collected

PHASE 1 — Neon
[ ] Pooled DATABASE_URL saved
[ ] db:push + migrate:sql run
[ ] Tables visible in Neon

PHASE 2 — Render API
[ ] artivaa-backend → express-api deployed
[ ] NODE_VERSION=20, health /health OK
[ ] All env vars set (Clerk, Razorpay, Gemini, CORS)
[ ] Private Network enabled

PHASE 3 — Clerk + OAuth
[ ] Dev keys on Vercel + Render
[ ] Webhook → /api/webhooks/clerk
[ ] Google redirect URI on Vercel domain
[ ] Azure redirect URI → /api/calendar/callback/microsoft
[ ] Integrations connect test

PHASE 4 — Render Bot
[ ] Dockerfile.bot pushed
[ ] artivaa-bot service (Docker, 2GB+ RAM)
[ ] Private Network on bot + API
[ ] BOT_BASE_URL=http://artivaa-bot:8000
[ ] Bot logs: listening on 8000
[ ] Meeting bot start/stop test

PHASE 5 — Vercel
[ ] artivaa-frontend deployed
[ ] NEXT_PUBLIC_API_URL = Render URL
[ ] Sign in + dashboard + API 200

PHASE 6 — Monitoring
[ ] Better Uptime on API + frontend

FINAL
[ ] Full meeting flow end-to-end
[ ] Google + Microsoft calendar connect
```

---

## Monthly cost (Render stack)

| Service | Cost |
|---------|------|
| Vercel (Hobby) | Free |
| Render API (Starter/Standard) | $0–7+/mo |
| Render Bot (Standard 2GB+) | ~$7+/mo |
| Neon (Free tier) | Free |
| Clerk (≤10k MAU) | Free |
| **Total (minimal bot)** | **~$7–15/mo** |

Hetzner bot add karo to +€12.49/mo (Appendix A).

---

## Common errors aur fix

| Error | Reason | Fix |
|-------|--------|-----|
| `dist/index.js` not found (Render) | Wrong start path | Use `npm start` → `dist/src/index.js` |
| `DATABASE_URL is not set` (Render) | Env missing | Render Environment tab |
| `NEXT_PUBLIC_API_URL is not configured` (Vercel build) | Env missing at build | Add var + redeploy |
| `path0/path0/routes-manifest.json` (Vercel) | Monorepo standalone config | No `output: standalone` on Vercel |
| `redirect_uri_mismatch` (Google) | Wrong OAuth URI | Add exact `.../api/auth/callback/google` |
| Microsoft `redirect_uri` invalid | Missing `NEXT_PUBLIC_APP_URL` or wrong Azure URI | `.../api/calendar/callback/microsoft` |
| API CORS fail | Wrong ALLOWED_ORIGINS | Exact Vercel URL on Render |
| `403 pulkitzwing` (git push) | Wrong GitHub account | `git remote set-url origin git@github.com:...` |
| Render crash + auto restart | Neon idle pool disconnect | `pool.on('error')` fix + pooled URL + NODE_VERSION=20 |
| Bot service unavailable | BOT_BASE_URL wrong / private network off | `http://artivaa-bot:8000` + both services on private network |
| Permission denied artivaa-backend | Repo not on GitHub | Create repo then push |

---

## Appendix A — Bot on Hetzner (optional, RFC original)

Agar Render bot recording weak ho, Hetzner CX32 use karo:

1. hetzner.com → CX32 Ubuntu 24.04 (Nuremberg)
2. Docker install + `Dockerfile.bot` deploy
3. Bind bot to private IP `10.0.0.2:8000`
4. Firewall: port 8000 sirf Render outbound IP se
5. Render API: `BOT_BASE_URL=http://HETZNER_PUBLIC_OR_PRIVATE_IP:8000`

Render outbound IP: Render dashboard → networking docs (region-specific).

Redis + BullMQ queue: future enhancement — code abhi synchronous HTTP bot call use karta hai.

---

## Appendix B — Monorepo local dev

```bash
# Terminal 1 — API
cd backend/express-api && npm run dev

# Terminal 2 — Frontend
cd frontend && npm run dev

# Terminal 3 — Bot (optional)
cd backend/python-services/ai-processing-service/legacy-bot && node index.js
# API .env: BOT_BASE_URL=http://localhost:8000
```

Docker full stack: `deploy/docker-compose.yml` (Postgres + API + web + optional bot profile).
