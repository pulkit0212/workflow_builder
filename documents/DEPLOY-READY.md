# Artivaa — Deploy Ready Checklist (June 2026)

Use this before pushing to `artivaa-backend` / `artivaa-frontend` and redeploying.

---

## Code verification (done in monorepo)

| Check | Status |
|-------|--------|
| Express API `npm run build` | ✅ Pass |
| Next.js frontend `npm run build` | ✅ Pass |
| Plan-gate unit tests | ✅ Pass (`frontend/src/lib/plan-gate-errors.test.ts`) |
| Express API unit tests | ⚠️ 1 pre-existing failure in `config.test.ts` (CORS dev fallback) — **does not block deploy** |

---

## 8 live issues — status

| # | Issue | Code fix | You do at deploy |
|---|--------|----------|------------------|
| 1 | Render API down | N/A (infra) | Render Dashboard → **Resume** → **Manual Deploy** |
| 2 | Latest backend not live | ✅ Ready in monorepo | Push `artivaa-backend` → redeploy |
| 3 | `BOT_UPLOAD_SECRET` missing | ✅ Documented in `render.yaml` + `.env.example` | Set same secret on **API + bot** (Render or Mac `.env`) |
| 4 | Bot not 24/7 (ngrok) | N/A (Oracle later) | Mac dev: ngrok + `BOT_BASE_URL`; prod: Oracle VM |
| 5 | Audio not in UI | ✅ Upload route + bot upload + player message | After #1–3: test meeting → upload logs OK |
| 6 | Gemini summary 503 | ✅ `summarize.js` retry + model fallback (already in bot) | Redeploy bot / restart Mac bot |
| 7 | Email Generator double fetch | ✅ Fixed | Push frontend |
| 8 | `render.yaml` incomplete | ✅ Fixed (BOT_UPLOAD_SECRET, GEMINI, etc.) | Reference when creating Render services |

**Bonus fix (this session):** Free plan → Action Items shows **upgrade message** instead of "Failed to update".

---

## Files changed — push these

### → `artivaa-backend` repo

```
express-api/src/routes/action-items.ts    # plan gate message + GET by-user check
render.yaml                               # full env var list
deploy/.env.example                       # BOT_UPLOAD_SECRET note
```

Already on main (verify before push):

```
express-api/src/routes/recordings-upload.ts
express-api/src/lib/recording-path.ts
python-services/.../legacy-bot/index.js   # uploadRecordingToApi
python-services/.../legacy-bot/summarize.js
```

### → `artivaa-frontend` repo

```
src/lib/plan-gate-errors.ts
src/lib/plan-gate-errors.test.ts
src/app/dashboard/action-items/page.tsx
src/features/tools/email-generator/components/email-generator-workspace.tsx
src/features/meetings/components/meeting-detail.tsx   # clearer audio message
```

---

## Render — API service (`artivaa-backend.onrender.com`)

Your live URL is **`https://artivaa-backend.onrender.com`** (not `artivaa-api`).

### Required env vars

| Variable | Example / notes |
|----------|-----------------|
| `DATABASE_URL` | Neon pooled URL |
| `ALLOWED_ORIGINS` | `https://artivaa-frontend.vercel.app` (exact, no trailing slash) |
| `FRONTEND_URL` | `https://artivaa-frontend.vercel.app` |
| `CLERK_SECRET_KEY` | From Clerk dashboard |
| `CLERK_WEBHOOK_SECRET` | From Clerk webhooks |
| `BOT_BASE_URL` | ngrok URL (dev) or `http://ORACLE_IP:8000` (prod) |
| `BOT_UPLOAD_SECRET` | `openssl rand -hex 32` — **same on bot** |
| `GEMINI_API_KEY` | `AIzaSy...` from AI Studio |
| `RECORDINGS_DIR` | `./private/recordings` |
| `RAZORPAY_*` | If billing enabled |

### After deploy — verify

```bash
curl -s https://artivaa-backend.onrender.com/health
# Expected: {"status":"ok"}
```

---

## Vercel — Frontend

| Variable | Value |
|----------|--------|
| `NEXT_PUBLIC_API_URL` | `https://artivaa-backend.onrender.com` |
| Clerk keys | Same as dev / production instance |

Redeploy after env change.

---

## Mac bot (dev testing)

`legacy-bot/.env`:

```bash
EXPRESS_API_URL=https://artivaa-backend.onrender.com
BOT_UPLOAD_SECRET=<same as Render API>
DATABASE_URL=<Neon>
GEMINI_API_KEY=<key>
MEETING_AUDIO_MAC_DEVICE=BlackHole 2ch
MEETING_MIC_MAC_DEVICE=MacBook Air Microphone
```

```bash
# Terminal 1
bash backend/scripts/mac-start-bot.sh

# Terminal 2
ngrok http 8000
# → set Render BOT_BASE_URL to ngrok https URL
```

---

## Post-deploy smoke test (15 min)

1. [ ] `/health` → `ok`
2. [ ] Sign in on Vercel app
3. [ ] Dashboard loads meetings (no CORS error)
4. [ ] Free user → Action Items → upgrade banner (not generic error)
5. [ ] Pro/trial user → edit action item → saves
6. [ ] Start Notetaker on test Meet → transcript appears
7. [ ] Bot logs: `[Upload] Recording uploaded to API`
8. [ ] Meeting detail → audio player plays

---

## Push commands (monorepo → split repos)

From `workflow_builder` after commit:

```bash
# Example — adjust remotes/paths to your setup
# Backend
rsync or git subtree push to artivaa-backend

# Frontend  
rsync or git subtree push to artivaa-frontend
```

Or copy changed files manually into each repo, then:

```bash
git add -A && git commit -m "Plan-gate UX, render env docs, email search fix"
git push origin main
```

Render + Vercel auto-deploy on push (if connected).

---

**Ready to deploy:** ✅ Yes — code builds clean. Complete Render env vars (#3) and Resume API (#1) when you push.
