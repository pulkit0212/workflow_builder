# Artivaa Bot — Mac Local Setup (Render API se connect)

> Bot **tumhare Mac** pe chalega. **Render API** (live) Mac bot ko **tunnel** se call karega.  
> Jab demo / testing ho tab Mac **on** + bot + tunnel **running** hona chahiye.

---

## Architecture

```
Vercel (frontend)  →  Render artivaa-api  →  ngrok/Cloudflare URL  →  Mac :8000 (bot)
                                                      ↓
                                                 Neon DB (same)
```

---

## Part A — One-time setup (Mac)

### A1. Dependencies

```bash
# Homebrew tools (agar nahi hain)
brew install ffmpeg

# Tunnel — pick ONE:
brew install ngrok/ngrok/ngrok          # simple, free URL har restart pe badal sakta hai
# OR
brew install cloudflare/cloudflare/cloudflared
```

### A2. Bot folder

```bash
cd ~/Documents/workflow_builder/backend/python-services/ai-processing-service/legacy-bot

npm install
npx playwright install chromium

# Whisper (Python)
python3 -m venv ~/.whisper-venv
~/.whisper-venv/bin/pip install openai-whisper ffmpeg-python
```

### A3. Bot `.env` file

```bash
cp .env.example .env
nano .env
```

**Mac ke liye yeh values:**

```env
BOT_PORT=8000
NODE_ENV=development
BOT_HEADLESS=false

DATABASE_URL=<Neon pooled URL — same as Render API / frontend>
GEMINI_API_KEY=<same as production>
OPENAI_API_KEY=<optional, Whisper local ke liye>

BOT_NAME=Artivaa Notetaker
```

> `DATABASE_URL` aur `GEMINI_API_KEY` copy karo: `backend/express-api/.env` ya Render dashboard se.

**Mac pe `BOT_HEADLESS=false`** — browser dikhega, Google Meet join easy.

### A4. Google Meet profile (one-time)

Browser mein Google login save karne ke liye:

```bash
cd ~/Documents/workflow_builder/frontend
npm run setup:bot-profile
```

Chromium khulega → Google account se login karo → band karo.  
Profile save: `legacy-bot/tmp/bot-profile/`

### A5. (Optional) BlackHole — meeting audio record ke liye

Bina iske bot join ho sakta hai lekin **audio / transcript weak** ho sakta hai.

1. [BlackHole 2ch](https://existential.audio/blackhole/) install  
2. Mac **Audio MIDI Setup** → Multi-Output Device (Speakers + BlackHole)  
3. Meeting ke time system output Multi-Output pe set karo  

---

## Part B — Har demo / test session (3 terminals)

### Terminal 1 — Bot start

```bash
cd ~/Documents/workflow_builder/backend/python-services/ai-processing-service/legacy-bot
node index.js
```

Dikhna chahiye:
```
[Bot] HTTP server listening on 0.0.0.0:8000
```

Local test:
```bash
curl http://localhost:8000/health
# {"status":"ok","service":"artivaa-bot"}
```

### Terminal 2 — Tunnel (internet expose)

**ngrok:**
```bash
ngrok http 8000
```

Output mein **Forwarding** line copy karo, e.g.:
```
https://abc123.ngrok-free.app
```

**Cloudflare (alternative):**
```bash
cloudflared tunnel --url http://localhost:8000
```

### Terminal 3 — Render API update

1. [render.com](https://render.com) → **artivaa-api** → **Environment**
2. Set:
   ```env
   BOT_BASE_URL=https://abc123.ngrok-free.app
   ```
   > **No trailing slash.** `http://` vs `https://` — jo ngrok de wahi use karo.

3. **Save Changes** → **Manual Deploy** (API redeploy ~1–2 min)

Har baar ngrok **restart** pe URL badlega → Render mein **BOT_BASE_URL update + redeploy** dubara.

---

## Part C — App se test

1. https://artivaa-frontend.vercel.app → Sign in  
2. **Meetings** → Google Meet link daalo  
3. **Start bot**  
4. Terminal 1 (bot logs) mein join attempt dekho  
5. Chromium window khul sakti hai (headless false)  
6. **Stop bot** → summary / action items app mein check karo  

Agar **503 Bot unavailable**:
- Bot Terminal 1 running hai?
- ngrok running hai?
- Render `BOT_BASE_URL` = exact ngrok URL?
- API redeploy hua?

---

## Quick start script

Project mein script hai (bot start):

```bash
bash ~/Documents/workflow_builder/backend/scripts/mac-start-bot.sh
```

Tunnel alag terminal mein manually chalao.

---

## Important rules

| Rule | Kyon |
|------|------|
| Mac sleep band rakho demo ke time | Bot ruk jayega |
| 3 cheezein saath chalu: bot + tunnel + Render URL | Ek bhi missing = 503 |
| ngrok URL change → Render update | Free ngrok |
| Production users ke liye yeh temporary hai | Mac 24/7 nahi |

---

## Checklist

```
One-time:
[ ] npm install + playwright chromium
[ ] whisper venv + pip install
[ ] legacy-bot/.env (Neon DATABASE_URL, GEMINI_API_KEY, BOT_HEADLESS=false)
[ ] npm run setup:bot-profile (Google login)

Each session:
[ ] Terminal 1: node index.js
[ ] Terminal 2: ngrok http 8000
[ ] Render BOT_BASE_URL = ngrok https URL
[ ] Render API manual deploy
[ ] Vercel app → Start bot test
```

---

*Mac bot = ₹0, demo-friendly. 24/7 ke liye baad mein Oracle / VPS.*
