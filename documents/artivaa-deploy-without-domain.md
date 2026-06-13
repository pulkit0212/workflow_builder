# Artivaa — Deploy Without a Domain (Living Runbook)

> Live stack without a custom domain. Adding a domain later = update env vars + OAuth redirect URIs.
>
> **Last updated:** June 2026 — reflects Mac dev bot testing, Oracle production bot plan, and current gaps.

---

## Table of contents

1. [What is done](#1-what-is-done)
2. [Current state](#2-current-state)
3. [Gaps before fully live](#3-gaps-before-fully-live)
4. [Target architecture (production)](#4-target-architecture-production)
5. [GitHub repos](#5-github-repos)
6. [Phase 1 — Neon DB](#phase-1--neon-db)
7. [Phase 2 — Render API](#phase-2--render-api)
8. [Phase 3 — Vercel Frontend](#phase-3--vercel-frontend)
9. [Phase 4 — Auth & OAuth](#phase-4--auth--oauth)
10. [Phase 5 — Bot on Oracle Cloud (PRODUCTION)](#phase-5--bot-on-oracle-cloud-production)
11. [Phase 5B — Mac + ngrok (DEV ONLY)](#phase-5b--mac--ngrok-dev-only)
12. [Phase 6 — Audio upload & recordings](#phase-6--audio-upload--recordings)
13. [Phase 7 — Monitoring & go-live](#phase-7--monitoring--go-live)
14. [Master go-live checklist](#master-go-live-checklist)
15. [Monthly cost](#monthly-cost)
16. [Common errors](#common-errors)
17. [Appendix — Domain later](#appendix--domain-later)

---

## 1. What is done

### Infrastructure & deploy

| Item | Status | Notes |
|------|--------|-------|
| Neon PostgreSQL | ✅ Done | Pooled `DATABASE_URL`, tables migrated |
| Vercel frontend | ✅ Live | `artivaa-frontend.vercel.app` |
| Render API service | ⚠️ Created but **down** | `artivaa-api.onrender.com` → `/health` = 404 (`no-server`) — **resume + redeploy needed** |
| GitHub repos split | ✅ Done | `artivaa-frontend`, `artivaa-backend`, monorepo `workflow_builder` |
| Clerk auth (dev) | ✅ Done | Sign-in working on web |
| Google OAuth | ✅ Partial | Calendar connect configured |
| Microsoft OAuth | ✅ Partial | Azure app + redirect URIs |
| Razorpay test keys | ✅ Done | Billing code ready, live keys pending |

### Bot & meeting intelligence (tested on Mac)

| Item | Status | Notes |
|------|--------|-------|
| Bot join Google Meet | ✅ Working | Playwright + bot profile |
| Input + output audio | ✅ Fixed | `BlackHole 2ch` + `MacBook Air Microphone` mix (Mac only) |
| Transcription (Whisper) | ✅ Working | Real speech captured in tests |
| Summary (Gemini) | ⚠️ Fixed in code | 503 retry + model fallback added — deploy pending |
| Insights & chapters | ✅ Working | Gemini |
| Action items save | ✅ Working | Neon DB |
| Bot start/stop from UI | ✅ Working | Via Render → ngrok → Mac |
| Meet mic on/off | ✅ Correct | User controls Meet mic; recording is independent via ffmpeg |

### Code fixes (monorepo + pushed to artivaa-backend / artivaa-frontend)

| Fix | Repo | What |
|-----|------|------|
| `meetingUrl` passed to bot on start | backend + frontend | Bot joins without missing link |
| `waiting_for_join` on bot start | backend | UI polling starts immediately |
| Mic + BlackHole mix (`audioCapture.js`) | backend | Both input and output captured |
| Hallucination detection (`transcribe.py`) | backend | Rejects fake Whisper loops |
| Summary retry on 503 (`summarize.js`) | backend | Error JSON no longer saved as summary |
| Recording upload route | backend | `POST /api/recordings/:id/upload` |
| Bot uploads WAV after meeting | backend (legacy-bot) | `EXPRESS_API_URL` + `BOT_UPLOAD_SECRET` |
| Status endpoint `recordingUrl` fallback | backend | Audio player gets URL |
| AudioPlayer 404 message | frontend | Shows "Recording not available" |
| Google Meet mic logic | backend | Bot does not force mute/unmute |
| Postman collection | docs/postman | API testing |
| Android Compose plan | `artivaa-android-compose-plan.md` | Mobile app roadmap |

### Dev tooling done

- [x] `backend/scripts/mac-start-bot.sh` — local bot start
- [x] `backend/scripts/oracle-deploy-bot.sh` — Oracle VM deploy script
- [x] `backend/Dockerfile.bot` + `docker-entrypoint-bot.sh` — cloud bot image
- [x] `backend/artivaa-bot.env.example` — Oracle env template
- [x] BlackHole 2ch installed on Mac (Multi-Output Device for Meet audio)

---

## 2. Current state

**Development stack (as of last test):**

```
Browser (any device)
   ↓
Vercel  →  artivaa-frontend.vercel.app
   ↓ NEXT_PUBLIC_API_URL
Render  →  artivaa-api.onrender.com   ← ⚠️ CURRENTLY DOWN — fix first
   ↓ BOT_BASE_URL
ngrok   →  https://xxxx.ngrok-free.dev
   ↓
Mac     →  legacy-bot :8000  (BlackHole + mic, Playwright visible browser)
   ↓
Neon    →  PostgreSQL
```

**What works end-to-end on Mac dev:**
- Join Meet → record 51s → transcript ✅ → summary ⚠️ (Gemini 503 sometimes) → insights ✅
- Audio upload to Render ❌ (API down + upload 404)

**What does NOT work for real users yet:**
- Render API suspended → app API calls fail
- Bot only runs when Mac + ngrok are on → not 24/7
- Audio player in UI → needs Render live + successful upload
- Oracle bot → **not deployed yet** (planned)

---

## 3. Gaps before fully live

### 🔴 Blockers (must fix before beta users)

| # | Gap | Action |
|---|-----|--------|
| 1 | Render API down | Dashboard → **Resume** → **Redeploy** → verify `/health` |
| 2 | Latest backend not on Render | Push `artivaa-backend` + redeploy (upload route, audio mix, summary retry) |
| 3 | Latest frontend on Vercel | Redeploy `artivaa-frontend` (audio player fixes) |
| 4 | `BOT_UPLOAD_SECRET` missing on Render | Same value as bot `.env` → Render env → redeploy |
| 5 | Bot not 24/7 | **Deploy Oracle VM** (see Phase 5) — Mac is dev only |
| 6 | `BOT_BASE_URL` points to ngrok | Change to Oracle public URL after VM deploy |
| 7 | Gemini API key | Use valid `AIzaSy...` key from [aistudio.google.com/apikey](https://aistudio.google.com/apikey) |
| 8 | Secrets rotation | Rotate Neon password, Gemini, bot secrets if exposed in chat/git |

### 🟡 Important (first real users)

| # | Gap | Action |
|---|-----|--------|
| 9 | Google Meet bot profile on Oracle | One-time `setup:bot-profile` or copy profile to VM |
| 10 | Oracle firewall port 8000 | Ingress from Render outbound IP (or restrict later) |
| 11 | Full E2E test | Meeting → transcript + summary + **audio in UI** |
| 12 | `ALLOWED_ORIGINS` on Render | Exact Vercel URL |
| 13 | Clerk webhook live | `POST /api/webhooks/clerk` on Render |
| 14 | Recording storage | Render disk is ephemeral — plan S3/R2 for v1.1 |

### 🟢 Can wait (post-launch)

| # | Gap | Action |
|---|-----|--------|
| 15 | Custom domain | Vercel + Clerk Production + OAuth URIs |
| 16 | Clerk Production instance | When domain is ready |
| 17 | Razorpay live keys | When taking payments |
| 18 | Sentry / Better Uptime | Monitoring |
| 19 | Regenerate summary button | UI retry on Gemini 503 |
| 20 | Android app | See `artivaa-android-compose-plan.md` |

---

## 4. Target architecture (production)

**Decision: Bot = Oracle Cloud Free VM. API = Render. Frontend = Vercel.**

```
Browser (web / future Android)
   ↓
Vercel  →  artivaa-frontend.vercel.app
   ↓ NEXT_PUBLIC_API_URL
Render  →  artivaa-api.onrender.com
   ↓ BOT_BASE_URL = http://ORACLE_PUBLIC_IP:8000
Oracle  →  Ubuntu VM — Docker artivaa-bot :8000
   │         Playwright headless + PulseAudio + Whisper
   │         POST recording → Render /api/recordings/:id/upload
   ↓
Neon    →  PostgreSQL (shared by API + bot)
Clerk   →  Auth (Development → Production later)
Gemini  →  Summary, insights, chapters
```

**Why Oracle (not Render bot / not Mac)?**

| Option | Cost | 24/7 | Audio | Verdict |
|--------|------|------|-------|---------|
| Mac + ngrok | Free | ❌ | ✅ Best (BlackHole) | **Dev only** |
| Render Docker bot | ~$25/mo | ✅ | ⚠️ Cloud audio hard | Skip |
| **Oracle Free A1** | **Free** | ✅ | ⚠️ Linux PulseAudio | **Production choice** |
| Hetzner CX32 | ~€12/mo | ✅ | ✅ | Backup if Oracle fails |

---

## 5. GitHub repos

| Repo | Deploy target | Root |
|------|---------------|------|
| [artivaa-frontend](https://github.com/pulkit0212/artivaa-frontend) | Vercel | Next.js app |
| [artivaa-backend](https://github.com/pulkit0212/artivaa-backend) | Render (API) + Oracle (bot) | `express-api/` + `python-services/.../legacy-bot/` |
| [workflow_builder](https://github.com/pulkit0212/workflow_builder) | Local monorepo | Full source of truth |

**Sync rule:** Change code in monorepo → push to `artivaa-backend` / `artivaa-frontend` → redeploy.

---

## Phase 1 — Neon DB

### Status: ✅ DONE

- [x] Project `artivaa` on neon.tech
- [x] Pooled connection string (`-pooler` in hostname)
- [x] `npm run db:push` (frontend) + `npm run migrate:sql` (express-api)
- [x] Tables: `users`, `meeting_sessions`, `workspaces`, `action_items`, etc.

### Verify

```bash
psql "$DATABASE_URL" -c "\dt"
```

### If resetting DB (careful)

```bash
cd frontend && npm run db:push
cd ../backend/express-api && npm run migrate:sql
```

---

## Phase 2 — Render API

### Status: ⚠️ DEPLOYED BUT DOWN — fix first

### Step 2.1 — Service settings

| Setting | Value |
|---------|--------|
| Name | `artivaa-api` |
| Repo | `artivaa-backend` |
| Root Directory | `express-api` |
| Runtime | Node |
| Build | `npm ci && npm run build` |
| Start | `npm start` |
| Health | `/health` |
| `NODE_VERSION` | `20` |

### Step 2.2 — Environment variables (complete list)

```env
NODE_ENV=production
NODE_VERSION=20

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

RESEND_API_KEY=              # optional — workspace invites
EMAIL_FROM=                  # optional

RECORDINGS_DIR=./private/recordings

# Bot — Oracle public URL (NOT ngrok in production)
BOT_BASE_URL=http://YOUR_ORACLE_PUBLIC_IP:8000

# Bot recording upload auth
BOT_UPLOAD_SECRET=<openssl rand -hex 32>
```

### Step 2.3 — Resume if suspended

1. render.com → **artivaa-api**
2. If **Suspended** → **Resume**
3. **Manual Deploy** → latest commit
4. Test:

```bash
curl https://artivaa-api.onrender.com/health
# Expected: {"status":"ok"}
```

### Step 2.4 — Verify upload route

```bash
curl -X POST "https://artivaa-api.onrender.com/api/recordings/test/upload" \
  -H "X-Bot-Upload-Secret: wrong"
# Expected: 401 Unauthorized (route exists)
# 404 = old code still deployed
```

---

## Phase 3 — Vercel Frontend

### Status: ✅ LIVE — redeploy after env changes

### Environment variables

```env
NEXT_PUBLIC_APP_URL=https://artivaa-frontend.vercel.app
NEXT_PUBLIC_API_URL=https://artivaa-api.onrender.com

NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/dashboard
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/dashboard

DATABASE_URL=<Neon pooled URL>

GEMINI_API_KEY=AIzaSy_...
DEFAULT_AI_PROVIDER=gemini

GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
AUTH_GOOGLE_ID=...
AUTH_GOOGLE_SECRET=...
AUTH_URL=https://artivaa-frontend.vercel.app
AUTH_SECRET=<random-32-chars>

MICROSOFT_CLIENT_ID=...
MICROSOFT_CLIENT_SECRET=...

RAZORPAY_KEY_ID=rzp_test_...
```

> `NEXT_PUBLIC_*` variables are baked at build time. After changing them, **Redeploy** is required.

### Verify

1. Sign in → Dashboard loads
2. DevTools Network → API calls → `artivaa-api.onrender.com` → **200**

---

## Phase 4 — Auth & OAuth

### Clerk — Status: ✅ Dev mode working

- [x] Development instance keys on Vercel + Render
- [ ] Webhook endpoint live on Render (verify after API resume)
- [ ] Production instance (when domain is ready)

**Webhook URL:**

```
https://artivaa-api.onrender.com/api/webhooks/clerk
```

Events: `user.created`, `user.updated`, `user.deleted`

### Google Calendar OAuth

**Redirect URI (Google Cloud Console):**

```
https://artivaa-frontend.vercel.app/api/auth/callback/google
```

APIs enabled: Google Calendar API, Gmail API (optional)

### Microsoft OAuth

**Azure redirect URI:**

```
https://artivaa-frontend.vercel.app/api/calendar/callback/microsoft
```

---

## Phase 5 — Bot on Oracle Cloud (PRODUCTION)

> **This is the main production bot plan.** Mac + ngrok is for development only (Phase 5B).

### 5.0 — Oracle account & capacity (important notes)

| Item | Detail |
|------|--------|
| Free tier | Ampere A1 — **4 OCPU, 24 GB RAM** total (free forever) |
| Region tried | Mumbai — **A1 often out of capacity** |
| Fallback | Try **AD-1** in Mumbai, or **Hyderabad / Singapore / US** |
| VM shape | `VM.Standard.A1.Flex` — **2 OCPU + 12 GB RAM** is enough for the bot |
| OS | **Ubuntu 22.04** or 24.04 ARM64 |
| Cost | **$0** on Always Free (if capacity is available) |

**If A1 capacity is unavailable:**
1. Change availability domain (AD-1 vs AD-2)
2. Try a different region
3. Retry the next day (capacity opens up)
4. Last resort: Hetzner CX32 (~€12/mo)

---

### 5.1 — Create Oracle VM (step-by-step)

1. [cloud.oracle.com](https://cloud.oracle.com) → **Compute** → **Instances** → **Create Instance**
2. Settings:

| Field | Value |
|-------|--------|
| Name | `artivaa-bot` |
| Image | Ubuntu 22.04 **Minimal** aarch64 |
| Shape | `VM.Standard.A1.Flex` → 2 OCPU, 12 GB RAM |
| Boot volume | 50 GB (default OK) |
| Public IP | **Assign public IPv4** ✅ |
| SSH key | Paste your Mac `~/.ssh/id_ed25519.pub` |

3. **Create** → note **Public IP** (e.g. `129.146.xxx.xxx`)

---

### 5.2 — Oracle networking (Security List)

**VCN** → Security List → **Ingress Rules** → Add:

| Source | Protocol | Port | Why |
|--------|----------|------|-----|
| `0.0.0.0/0` | TCP | 22 | SSH (restrict to your IP later) |
| `0.0.0.0/0` | TCP | 8000 | Bot HTTP (Render calls this) |

> Production hardening: restrict port 8000 to Render outbound IPs only. Start with `0.0.0.0/0` for testing.

**Ubuntu firewall (on VM):**

```bash
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 8000 -j ACCEPT
sudo netfilter-persistent save
```

---

### 5.3 — VM setup (one-time)

SSH into VM:

```bash
ssh ubuntu@YOUR_ORACLE_PUBLIC_IP
```

Install Docker:

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker ubuntu
# Log out and back in
```

Clone backend repo:

```bash
git clone https://github.com/pulkit0212/artivaa-backend.git
cd artivaa-backend
```

Create bot env file:

```bash
cp artivaa-bot.env.example artivaa-bot.env
nano artivaa-bot.env
```

**`artivaa-bot.env` (Oracle production):**

```env
NODE_ENV=production
BOT_PORT=8000
BOT_HOST=0.0.0.0
BOT_HEADLESS=true
BOT_NAME=Artivaa Notetaker

# Linux audio — PulseAudio in Docker entrypoint
MEETING_AUDIO_SOURCE=default

# Same Neon pooled URL as Render API
DATABASE_URL=postgresql://...@...-pooler....neon.tech/neondb?sslmode=require

GEMINI_API_KEY=AIzaSy_...
OPENAI_API_KEY=                          # optional fallback

# Upload recording to Render after each meeting
EXPRESS_API_URL=https://artivaa-api.onrender.com
BOT_UPLOAD_SECRET=<same as Render BOT_UPLOAD_SECRET>
```

Deploy:

```bash
bash scripts/oracle-deploy-bot.sh
```

Expected:

```
{"status":"ok"}   # from /health
[Bot] HTTP server listening on 0.0.0.0:8000
```

---

### 5.4 — Link Render API → Oracle bot

Render → **artivaa-api** → Environment:

```env
BOT_BASE_URL=http://YOUR_ORACLE_PUBLIC_IP:8000
```

**Redeploy API.**

Test from your Mac:

```bash
curl http://YOUR_ORACLE_PUBLIC_IP:8000/health
# {"status":"ok"}
```

Test from app: Start bot on a meeting → Oracle VM logs should show a join attempt.

---

### 5.5 — Google Meet bot profile (critical)

The bot needs a logged-in Google session for Meet.

**Option A — Setup on Mac, copy to Oracle (recommended first time):**

```bash
# Mac monorepo
cd frontend
npm run setup:bot-profile
# Complete Google login in browser window
# Profile saved to tmp/bot-profile/
```

Copy to Oracle:

```bash
scp -r tmp/bot-profile ubuntu@ORACLE_IP:~/artivaa-backend/bot-profile/
```

Mount in Docker (update `oracle-deploy-bot.sh` or run manually):

```bash
docker run -d \
  --name artivaa-bot \
  --restart unless-stopped \
  -p 8000:8000 \
  --env-file artivaa-bot.env \
  -v ~/artivaa-backend/bot-profile:/bot/bot-profile \
  artivaa-bot:latest
```

**Option B — Headless login on Oracle (harder):** Xvfb + manual login once via VNC.

**Profile refresh:** Re-run setup when the Google session expires.

---

### 5.6 — Oracle bot env reference (full)

| Variable | Required | Purpose |
|----------|----------|---------|
| `DATABASE_URL` | ✅ | Neon — status, transcript, summary save |
| `GEMINI_API_KEY` | ✅ | Summary, insights, chapters |
| `BOT_HEADLESS` | ✅ | `true` on Oracle (no display) |
| `BOT_HOST` | ✅ | `0.0.0.0` — listen on all interfaces |
| `MEETING_AUDIO_SOURCE` | ✅ | `default` — Linux PulseAudio |
| `EXPRESS_API_URL` | ✅ | Render API — recording upload |
| `BOT_UPLOAD_SECRET` | ✅ | Must match Render |
| `BOT_NAME` | Optional | Display name in Meet |
| `OPENAI_API_KEY` | Optional | Fallback AI |

**Mac-only vars (NOT on Oracle):**

| Variable | Platform |
|----------|----------|
| `MEETING_AUDIO_MAC_DEVICE` | Mac only (BlackHole) |
| `MEETING_MIC_MAC_DEVICE` | Mac only |

---

### 5.7 — Oracle maintenance commands

```bash
# Logs
docker logs -f artivaa-bot

# Restart after env change
docker rm -f artivaa-bot
bash scripts/oracle-deploy-bot.sh

# Update code
cd ~/artivaa-backend && git pull
bash scripts/oracle-deploy-bot.sh

# Health
curl http://127.0.0.1:8000/health
```

---

### 5.8 — Oracle vs Mac audio (realistic expectations)

| Platform | Audio capture | Quality |
|----------|---------------|---------|
| **Mac dev** | BlackHole + mic mix | ⭐⭐⭐⭐⭐ Best for testing |
| **Oracle Linux** | PulseAudio `default` | ⭐⭐⭐ Good — test in real Meet |
| **Render Docker** | Same as Oracle | ⭐⭐⭐ but costs $25/mo |

After the first meeting on Oracle, check transcript quality. If weak, tune `MEETING_AUDIO_SOURCE` or consider Hetzner.

---

### 5.9 — Oracle deployment checklist

```
[ ] Oracle account + A1 VM created (note public IP)
[ ] Security list: port 22 + 8000 open
[ ] Docker installed on VM
[ ] artivaa-backend cloned
[ ] artivaa-bot.env filled (Neon, Gemini, EXPRESS_API_URL, BOT_UPLOAD_SECRET)
[ ] bash scripts/oracle-deploy-bot.sh → /health OK
[ ] Bot profile copied + mounted (Google Meet login)
[ ] Render BOT_BASE_URL = http://ORACLE_IP:8000
[ ] Render BOT_UPLOAD_SECRET set
[ ] Render API redeployed
[ ] Test: app → Start bot → Oracle logs show join
[ ] Test: meeting end → transcript + summary + upload log
[ ] Test: UI → audio player works
```

---

## Phase 5B — Mac + ngrok (DEV ONLY)

> Use Oracle for production. The Mac stack is for local development and debugging only.

### When to use Mac bot

- Testing BlackHole audio quality
- Debugging Playwright with `BOT_HEADLESS=false` (visible browser)
- Proving the flow works before Oracle deploy

### Mac setup (quick reference)

1. **BlackHole 2ch** + **Multi-Output Device** (BlackHole + MacBook Speakers)
2. System Output → Multi-Output Device
3. `legacy-bot/.env`:

```env
DATABASE_URL=<Neon pooled URL>
GEMINI_API_KEY=AIzaSy_...
BOT_HEADLESS=false
MEETING_AUDIO_MAC_DEVICE=BlackHole 2ch
MEETING_MIC_MAC_DEVICE=MacBook Air Microphone
EXPRESS_API_URL=https://artivaa-api.onrender.com
BOT_UPLOAD_SECRET=<same as Render>
```

4. Terminal 1: `bash backend/scripts/mac-start-bot.sh`
5. Terminal 2: `ngrok http 8000`
6. Render `BOT_BASE_URL` = ngrok HTTPS URL (no trailing slash)
7. **Redeploy Render** after every ngrok URL change

### Mac dev checklist

```
[ ] BlackHole installed + Mac rebooted
[ ] Multi-Output Device selected
[ ] ffmpeg test: RMS > -60 dBFS with audio playing
[ ] Bot + ngrok both running
[ ] Render BOT_BASE_URL = current ngrok URL
[ ] Bot logs: "remote: BlackHole 2ch, mic: MacBook Air Microphone"
```

---

## Phase 6 — Audio upload & recordings

### Why it is needed

The bot saves WAV files on the VM/Mac. The frontend plays audio from the **Render API** (`GET /api/recordings/:id`). The bot must **upload** after each meeting.

### Flow

```
Meeting ends on bot
   → ffmpeg WAV ready
   → POST /api/recordings/{meetingId}/upload  (X-Bot-Upload-Secret)
   → Render saves to RECORDINGS_DIR
   → DB: recording_url = /api/recordings/{id}
   → Frontend AudioPlayer streams from Render
```

### Required env (both sides)

| Where | Variable |
|-------|----------|
| Render API | `BOT_UPLOAD_SECRET` |
| Oracle / Mac bot | `EXPRESS_API_URL` + `BOT_UPLOAD_SECRET` (same secret) |

### Limitation

Render free/starter disk is **ephemeral**. Recordings may be deleted on redeploy.

**Future (v1.1):** Upload to S3 / Cloudflare R2 instead of Render disk.

### Manual upload (old meetings)

```bash
MEETING_ID="your-meeting-uuid"
WAV="path/to/meeting-${MEETING_ID}.wav"

curl -X POST "https://artivaa-api.onrender.com/api/recordings/${MEETING_ID}/upload" \
  -H "X-Bot-Upload-Secret: YOUR_SECRET" \
  -F "recording=@${WAV};type=audio/wav"
```

---

## Phase 7 — Monitoring & go-live

### Better Uptime (free)

Monitors:
- `https://artivaa-api.onrender.com/health`
- `https://artivaa-frontend.vercel.app`
- `http://ORACLE_PUBLIC_IP:8000/health`

### Logs

| Service | Where |
|---------|--------|
| API | Render → artivaa-api → Logs |
| Bot | `ssh oracle` → `docker logs -f artivaa-bot` |
| DB | Neon dashboard → Monitoring |

### Soft launch criteria

- [ ] 5 consecutive test meetings: join → transcript → summary → audio OK
- [ ] Render API uptime 24h+
- [ ] Oracle bot uptime 24h+ (no manual restart)
- [ ] 3 beta users can sign in and run meetings

---

## Master go-live checklist

### ✅ Already done

```
[x] Neon DB live + migrated
[x] Vercel frontend deployed
[x] Clerk dev auth working
[x] Mac bot: join, record, transcript tested
[x] BlackHole + mic mix working (Mac)
[x] Code: upload route, summary retry, audio fixes
[x] GitHub repos: artivaa-frontend, artivaa-backend
[x] Postman collection (docs/postman/)
[x] Android plan (artivaa-android-compose-plan.md)
```

### 🔴 Remaining for fully live

```
RENDER API
[ ] Resume artivaa-api (currently down)
[ ] Redeploy latest artivaa-backend
[ ] /health returns {"status":"ok"}
[ ] BOT_UPLOAD_SECRET set
[ ] ALLOWED_ORIGINS = Vercel URL
[ ] BOT_BASE_URL = Oracle IP (not ngrok)

ORACLE BOT (PRODUCTION)
[ ] A1 VM created — note public IP
[ ] Port 8000 open in security list
[ ] Docker + artivaa-backend cloned
[ ] artivaa-bot.env complete
[ ] oracle-deploy-bot.sh → /health OK
[ ] Google bot profile mounted
[ ] Test meeting from app

VERCEL
[ ] NEXT_PUBLIC_API_URL = live Render URL
[ ] Redeploy after env changes

END-TO-END
[ ] Start bot → join Meet → stop → transcript in UI
[ ] Summary generates (not error JSON)
[ ] Audio player plays recording
[ ] Action items appear

SECURITY
[ ] Rotate exposed secrets (Neon, Gemini, BOT_UPLOAD_SECRET)
[ ] Valid Gemini key (AIzaSy... format)

OPTIONAL BEFORE PUBLIC LAUNCH
[ ] Clerk webhook verified
[ ] Google + Microsoft calendar connect tested
[ ] Better Uptime monitors
[ ] Razorpay test payment flow
```

---

## Monthly cost

### Target stack (Oracle bot)

| Service | Cost |
|---------|------|
| Vercel Hobby | Free |
| Render API Starter | $0–7/mo |
| **Oracle A1 VM** | **Free** (Always Free tier) |
| Neon Free | Free |
| Clerk ≤10k MAU | Free |
| ngrok | Free (dev only) |
| Gemini API | Pay per use (~$0–5/mo low traffic) |
| **Total** | **~$0–10/mo** |

### Alternatives (if Oracle capacity fails)

| Option | Cost |
|--------|------|
| Render bot (Standard 2GB) | ~$25/mo |
| Hetzner CX32 | ~€12/mo |
| Mac always on | Free (not reliable) |

---

## Common errors

| Error | Reason | Fix |
|-------|--------|-----|
| Render `/health` 404 `no-server` | Service suspended/deleted | Resume + redeploy on Render |
| `[Upload] API rejected recording: 404` | API down or upload route not deployed | Fix Render + redeploy backend |
| `[Upload] skipping cloud upload` | Bot missing `EXPRESS_API_URL` or `BOT_UPLOAD_SECRET` | Add to bot `.env`, restart bot |
| `silent_audio_source` | BlackHole silent at probe time | Multi-Output + audio playing before bot start |
| Transcript only "you" | Mac: only BlackHole, no mic mix | Use mic + BlackHole mix (fixed in code) |
| Summary = error JSON | Gemini 503, old code | Deploy summary retry fix |
| `Bot service unavailable` | Wrong `BOT_BASE_URL` | Oracle IP or ngrok URL + redeploy Render |
| ngrok URL changed | Free ngrok new URL each restart | Update Render `BOT_BASE_URL` |
| Oracle A1 out of capacity | Mumbai AD full | Try AD-1, other region, retry later |
| CORS fail | Wrong `ALLOWED_ORIGINS` | Exact Vercel URL on Render |
| `redirect_uri_mismatch` | Google OAuth | Add Vercel callback URI |
| Gemini 403 leaked key | Key in git/chat | New key from AI Studio |
| Audio player empty | Upload failed or old meeting | Re-run meeting after Render live |

---

## Appendix — Domain later

When you add a custom domain (e.g. `app.artivaa.com`):

```
1. DNS: app → Vercel, api → Render (optional)
2. Vercel: NEXT_PUBLIC_APP_URL, NEXT_PUBLIC_API_URL, AUTH_URL
3. Render: ALLOWED_ORIGINS, FRONTEND_URL
4. Google + Azure OAuth redirect URIs update
5. Clerk → Production instance + live keys
6. Razorpay live mode
```

---

## Appendix — Local dev (monorepo)

```bash
# Terminal 1 — API
cd backend/express-api && npm run dev    # :3001

# Terminal 2 — Frontend
cd frontend && npm run dev               # :3000

# Terminal 3 — Bot (Mac)
bash backend/scripts/mac-start-bot.sh    # :8000

# Terminal 4 — ngrok (if testing with Render)
ngrok http 8000
```

**Local env:**
- `frontend/.env.local`: `NEXT_PUBLIC_API_URL=http://localhost:3001`
- `backend/express-api/.env`: `BOT_BASE_URL=http://localhost:8000`

**API testing:** `docs/postman/Artivaa-API.postman_collection.json`

---

## Quick reference — env vars by service

| Variable | Render API | Vercel | Oracle Bot | Mac Bot |
|----------|:----------:|:------:|:----------:|:-------:|
| `DATABASE_URL` | ✅ | ✅ | ✅ | ✅ |
| `CLERK_SECRET_KEY` | ✅ | ✅ | ❌ | ❌ |
| `GEMINI_API_KEY` | ✅ | ✅ | ✅ | ✅ |
| `BOT_BASE_URL` | ✅ | ❌ | ❌ | ❌ |
| `BOT_UPLOAD_SECRET` | ✅ | ❌ | ✅ | ✅ |
| `EXPRESS_API_URL` | ❌ | ❌ | ✅ | ✅ |
| `ALLOWED_ORIGINS` | ✅ | ❌ | ❌ | ❌ |
| `NEXT_PUBLIC_API_URL` | ❌ | ✅ | ❌ | ❌ |
| `MEETING_AUDIO_MAC_DEVICE` | ❌ | ❌ | ❌ | ✅ |
| `MEETING_AUDIO_SOURCE` | ❌ | ❌ | ✅ | ❌ |
| `BOT_HEADLESS` | ❌ | ❌ | `true` | `false` |

---

*Update this doc after every major deploy — especially Oracle IP, ngrok URL, and checklist ticks.*
