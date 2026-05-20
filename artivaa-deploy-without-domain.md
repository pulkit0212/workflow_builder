# Artivaa — Deploy Without a Domain (Free URLs)

> Sab kuch bina domain ke live hoga.
> Baad mein domain add karna = sirf 2 env vars change karna.

---

## Free URLs jo milenge

| Service | URL |
|---------|-----|
| Frontend | `https://artivaa.vercel.app` |
| API | `https://artivaa-api.up.railway.app` |
| Bot | Internal only (private IP, no public URL needed) |
| DB | Connection string only |

---

## PHASE 0 — Pehle Ye Collect Karo (Keys + Accounts)

### Step 0.1 — Ye accounts banao (sab free)

- [ ] github.com (code host karne ke liye)
- [ ] neon.tech (database)
- [ ] railway.app (API + Redis)
- [ ] vercel.com (frontend)
- [ ] hetzner.com/cloud (bot server)
- [ ] clerk.com (auth)
- [ ] sentry.io (error monitoring)
- [ ] betteruptime.com (uptime monitoring)

### Step 0.2 — Ye API keys collect karo pehle

Ek notes file mein sab likho:

```
CLERK_SECRET_KEY        = sk_test_xxx  (Clerk dashboard → API Keys)
CLERK_PUBLISHABLE_KEY   = pk_test_xxx  (same)
RAZORPAY_KEY_ID         = rzp_test_xxx (razorpay dashboard → Settings → API Keys)
RAZORPAY_KEY_SECRET     = xxx
GEMINI_API_KEY          = AIzaSy_xxx   (aistudio.google.com)
OPENAI_API_KEY          = sk-xxx       (platform.openai.com) — if used
SENTRY_DSN_API          = https://xxx@xxx.ingest.sentry.io/xxx
SENTRY_DSN_FRONTEND     = https://xxx@xxx.ingest.sentry.io/xxx
```

> Clerk mein pehle **Development** instance use karo — production instance tab set karo jab domain lo.

---

## PHASE 1 — Database: Neon Postgres

### Step 1.1 — Project banao

1. neon.tech → Sign up → **New Project**
2. Name: `artivaa`
3. Region: `AWS us-east-1`
4. Click **Create Project**

### Step 1.2 — Connection string copy karo

Dashboard pe ye dikhega — isko save karo as `DATABASE_URL`:
```
postgresql://username:password@ep-xxx.us-east-2.aws.neon.tech/neondb?sslmode=require
```

### Step 1.3 — Migrations run karo

```bash
# Apne API repo mein:
DATABASE_URL="your-neon-url" npm run migrate:sql:prod

# Frontend repo mein (agar Drizzle use karte ho):
DATABASE_URL="your-neon-url" npm run db:push
```

Verify: Neon dashboard → **Tables** → tables dikhni chahiye.

---

## PHASE 2 — API: Railway

### Step 2.1 — Project banao

1. railway.app → **New Project**
2. **Deploy from GitHub repo** → apna API repo select karo
3. Railway auto-detect karega Node.js

### Step 2.2 — Redis add karo

1. Railway project mein → **+ New** → **Database** → **Add Redis**
2. Redis service → **Variables** → `REDIS_URL` copy karo
   - Looks like: `redis://default:password@roundhouse.proxy.rlwy.net:12345`

### Step 2.3 — Dockerfile banao

API repo ke root mein `Dockerfile` create karo:

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3001
CMD ["node", "src/index.js"]
```

`.dockerignore` bhi banao:
```
node_modules
.env
.git
*.log
```

Commit + push karo — Railway automatically rebuild karega.

### Step 2.4 — BullMQ install karo

```bash
npm install bullmq ioredis
```

`src/lib/redis.js` banao:
```js
import { Redis } from 'ioredis';

export const redis = new Redis(process.env.REDIS_URL, {
  maxRetriesPerRequest: null,
});
```

`src/queues/meetingQueue.js` banao:
```js
import { Queue } from 'bullmq';
import { redis } from '../lib/redis.js';

export const meetingQueue = new Queue('meetings', {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
  },
});
```

Meeting route update karo:
```js
// PEHLE (bot directly call — timeout ho sakta hai):
const result = await axios.post(`${process.env.BOT_BASE_URL}/join`, { meetingUrl });

// BAAD MEIN (queue mein dalo — instant return):
import { meetingQueue } from '../queues/meetingQueue.js';
const job = await meetingQueue.add('join', { meetingUrl, userId, recordingId });
res.json({ status: 'queued', jobId: job.id });
```

### Step 2.5 — Sentry add karo

```bash
npm install @sentry/node
```

`src/index.js` ke bilkul upar (kisi bhi import se pehle):
```js
import * as Sentry from '@sentry/node';
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 0.1,
  environment: 'production',
});
```

Commit + push karo.

### Step 2.6 — Environment variables set karo

Railway → apna API service → **Variables** tab → ye sab add karo:

```env
NODE_ENV=production
PORT=3001

# Database
DATABASE_URL=postgresql://user:pass@ep-xxx.neon.tech/neondb?sslmode=require

# Redis (Step 2.2 se copy karo)
REDIS_URL=redis://default:xxxx@roundhouse.proxy.rlwy.net:12345

# Frontend URL (Vercel ka free URL — Phase 3 ke baad update karna)
ALLOWED_ORIGINS=https://artivaa.vercel.app
FRONTEND_URL=https://artivaa.vercel.app

# Clerk (development keys for now)
CLERK_SECRET_KEY=sk_test_xxxxxxxxxxxxxxxxxxxx
CLERK_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxxxxxx

# Razorpay (test keys for now)
RAZORPAY_KEY_ID=rzp_test_xxxxxxxxxxxx
RAZORPAY_KEY_SECRET=xxxxxxxxxxxxxxxxxxxx
RAZORPAY_WEBHOOK_SECRET=xxxxxxxxxxxxxxxxxxxx

# AI
GEMINI_API_KEY=AIzaSy_xxxxxxxxxxxxxxxxxxxx
OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxx

# Monitoring
SENTRY_DSN=https://xxx@xxx.ingest.sentry.io/xxx

# Bot (Phase 4 ke baad fill karna)
BOT_BASE_URL=http://10.0.0.2:8000
```

### Step 2.7 — Railway ka free URL note karo

Railway → your service → **Settings** → **Networking** → public URL dikhega:
```
https://artivaa-api.up.railway.app
```

Isko save karo — frontend mein use hoga.

### Step 2.8 — Railway outbound IP note karo

Railway → **Project Settings** → **Networking** → **Outbound IP** note karo.
Hetzner firewall ke liye chahiye hoga.

### Step 2.9 — Smoke test

```bash
curl https://artivaa-api.up.railway.app/health
# Expected: {"status":"ok"}
```

Fail ho to: Railway → Deployments → **View Logs** dekho.

---

## PHASE 3 — Auth: Clerk Setup

### Step 3.1 — Development instance configure karo

> Bina domain ke development instance use karo.
> Jab domain lo tab production instance banao.

Clerk dashboard → your app → **Configure** → **Domains**:
- Development URL: `https://artivaa.vercel.app` add karo

### Step 3.2 — Allowed URLs set karo

Clerk → **Paths** settings:
```
Sign-in URL:           /sign-in
Sign-up URL:           /sign-up
After sign-in URL:     /dashboard
After sign-up URL:     /dashboard
```

Clerk → **Domains** → Allowed redirect URLs:
```
https://artivaa.vercel.app
https://artivaa.vercel.app/sign-in
https://artivaa.vercel.app/sign-up
https://artivaa.vercel.app/dashboard
https://artivaa.vercel.app/api/auth/callback/google
```

### Step 3.3 — Google OAuth (optional but recommended)

1. console.cloud.google.com → APIs & Services → Credentials
2. **Create OAuth 2.0 Client ID** → Web application
3. Authorized redirect URIs:
   ```
   https://artivaa.vercel.app/api/auth/callback/google
   ```
4. Client ID + Secret → Clerk dashboard → **Social Connections → Google**

### Step 3.4 — Webhook setup

1. Clerk → **Webhooks** → **Add Endpoint**
2. URL: `https://artivaa-api.up.railway.app/webhooks/clerk`
3. Events: `user.created`, `user.updated`, `user.deleted`
4. **Create** → copy Signing Secret
5. Railway → `CLERK_WEBHOOK_SECRET` update karo

---

## PHASE 4 — Bot: Hetzner CX32

### Step 4.1 — Server banao

1. hetzner.com/cloud → **Create Server**
2. Location: **Nuremberg (nbg1)**
3. Image: **Ubuntu 24.04 LTS**
4. Type: **CX32** (4 vCPU, 8 GB RAM — €12.49/mo)
5. SSH Keys: apni public key upload karo
   ```bash
   # Local machine pe public key dekhne ke liye:
   cat ~/.ssh/id_rsa.pub
   ```
6. **Create & Buy** → Public IP note karo (e.g. `65.21.xxx.xxx`)

### Step 4.2 — Private network banao

1. Hetzner → **Networks** → **Create Network**
2. Name: `artivaa-private`
3. IP range: `10.0.0.0/24`
4. **Create**
5. Network → **Attach Server** → apna bot server select karo
6. Bot server ko private IP milega: `10.0.0.2`

### Step 4.3 — Server pe SSH karo aur setup karo

```bash
ssh root@65.21.xxx.xxx
```

```bash
# System update
apt-get update && apt-get upgrade -y

# Node.js 20 install
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

# Docker install
curl -fsSL https://get.docker.com | bash
systemctl enable docker
systemctl start docker

# Verify
node --version    # v20.x hona chahiye
docker --version  # Docker version 26.x hona chahiye
```

### Step 4.4 — Firewall lagao

```bash
apt-get install -y ufw

ufw default deny incoming
ufw default allow outgoing

# SSH allow karo (apna IP dalo)
# Apna IP jaanne ke liye: whatismyip.com
ufw allow from YOUR_HOME_IP to any port 22

# Bot port sirf Railway se
ufw allow from RAILWAY_OUTBOUND_IP to any port 8000

ufw enable
ufw status
```

> `YOUR_HOME_IP` = your laptop/WiFi IP
> `RAILWAY_OUTBOUND_IP` = Step 2.8 se

### Step 4.5 — Bot ka Dockerfile banao

`legacy-bot` repo mein `Dockerfile`:

```dockerfile
FROM node:20-bookworm-slim

RUN apt-get update && apt-get install -y \
  ffmpeg \
  python3 python3-pip \
  libnss3 libatk-bridge2.0-0 libdrm2 \
  libxkbcommon0 libgbm1 libgtk-3-0 libasound2 \
  ca-certificates fonts-liberation \
  && pip3 install openai-whisper --break-system-packages \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
RUN npx playwright install chromium
RUN npx playwright install-deps chromium
COPY . .

EXPOSE 8000
CMD ["node", "index.js"]
```

`.dockerignore`:
```
node_modules
.env
.git
*.log
```

### Step 4.6 — BullMQ worker bot mein add karo

Bot repo mein `src/worker.js` banao:

```js
import { Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { joinMeeting } from './bot.js'; // apna existing bot logic

const redis = new Redis(process.env.REDIS_URL, {
  maxRetriesPerRequest: null,
});

const worker = new Worker('meetings', async (job) => {
  const { meetingUrl, userId, recordingId } = job.data;
  console.log(`[Job ${job.id}] Starting: ${meetingUrl}`);
  await joinMeeting({ meetingUrl, userId, recordingId });
  console.log(`[Job ${job.id}] Done`);
}, {
  connection: redis,
  concurrency: 2,
});

worker.on('failed', (job, err) => {
  console.error(`[Job ${job.id}] Failed:`, err.message);
});
```

### Step 4.7 — Bot deploy karo

**Local machine pe:**
```bash
cd legacy-bot
docker build -t artivaa-bot .
docker save artivaa-bot | gzip > artivaa-bot.tar.gz
scp artivaa-bot.tar.gz root@65.21.xxx.xxx:/opt/
```

**Server pe (SSH mein):**
```bash
cd /opt
docker load < artivaa-bot.tar.gz

# .env file banao
cat > /opt/bot.env << 'EOF'
BOT_PORT=8000
NODE_ENV=production
DATABASE_URL=postgresql://user:pass@ep-xxx.neon.tech/neondb?sslmode=require
REDIS_URL=redis://default:xxxx@roundhouse.proxy.rlwy.net:12345
GEMINI_API_KEY=AIzaSy_xxxxxxxxxxxxxxxxxxxx
OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxx
AUDIO_TEMP_DIR=/tmp/artivaa-audio
EOF

mkdir -p /tmp/artivaa-audio

# Container run karo (private IP pe bind karo only)
docker run -d \
  --name artivaa-bot \
  --restart always \
  --env-file /opt/bot.env \
  -p 10.0.0.2:8000:8000 \
  -v /tmp/artivaa-audio:/tmp/artivaa-audio \
  artivaa-bot

# Check karo
docker ps
docker logs artivaa-bot
```

### Step 4.8 — BOT_BASE_URL Railway mein update karo

Railway → API service → Variables:
```env
BOT_BASE_URL=http://10.0.0.2:8000
```

---

## PHASE 5 — Frontend: Vercel

### Step 5.1 — Sentry add karo

```bash
cd your-frontend-repo
npx @sentry/wizard@latest -i nextjs
# Wizard automatically sab configure kar dega
```

### Step 5.2 — Vercel pe deploy karo

1. vercel.com → **New Project** → Import GitHub repo
2. Framework: **Next.js** (auto detect)
3. **Deploy mat karo abhi** — pehle env vars set karo

### Step 5.3 — Environment variables set karo

Vercel import screen pe → **Environment Variables**:

```env
# App URLs (Railway ka free URL use karo)
NEXT_PUBLIC_APP_URL=https://artivaa.vercel.app
NEXT_PUBLIC_API_URL=https://artivaa-api.up.railway.app

# Clerk
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_xxxxxxxxxxxxxxxxxxxx
CLERK_SECRET_KEY=sk_test_xxxxxxxxxxxxxxxxxxxx
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/dashboard
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/dashboard

# Razorpay
NEXT_PUBLIC_RAZORPAY_KEY_ID=rzp_test_xxxxxxxxxxxx

# Database
DATABASE_URL=postgresql://user:pass@ep-xxx.neon.tech/neondb?sslmode=require

# Sentry
SENTRY_DSN=https://xxx@xxx.ingest.sentry.io/xxx
NEXT_PUBLIC_SENTRY_DSN=https://xxx@xxx.ingest.sentry.io/xxx
```

> ⚠️ `NEXT_PUBLIC_*` vars build time pe bake hote hain.
> Pehle set karo, THEN Deploy click karo.

### Step 5.4 — Deploy karo

**Deploy** click karo → 2-3 minutes mein live.

Vercel free URL milega: `https://artivaa.vercel.app`

### Step 5.5 — Test karo

1. `https://artivaa.vercel.app` open karo
2. Sign in karo
3. Dashboard load ho
4. Ek API call karo — network tab mein `artivaa-api.up.railway.app` se 200 response aana chahiye

---

## PHASE 6 — Monitoring

### Step 6.1 — Better Uptime

1. betteruptime.com → **New Monitor**
2. Monitor 1: `https://artivaa-api.up.railway.app/health`
3. Monitor 2: `https://artivaa.vercel.app`
4. Check interval: 1 minute
5. Alert: apna email + phone number dalo

### Step 6.2 — Docker log rotation (Hetzner pe)

```bash
cat > /etc/docker/daemon.json << 'EOF'
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  }
}
EOF
systemctl restart docker
```

---

## Bot ko Update Kaise Karo (Future)

```bash
# Local pe:
docker build -t artivaa-bot .
docker save artivaa-bot | gzip > artivaa-bot.tar.gz
scp artivaa-bot.tar.gz root@65.21.xxx.xxx:/opt/

# Server pe:
ssh root@65.21.xxx.xxx
docker load < /opt/artivaa-bot.tar.gz
docker stop artivaa-bot && docker rm artivaa-bot
docker run -d \
  --name artivaa-bot \
  --restart always \
  --env-file /opt/bot.env \
  -p 10.0.0.2:8000:8000 \
  -v /tmp/artivaa-audio:/tmp/artivaa-audio \
  artivaa-bot
docker logs artivaa-bot
```

---

## Domain Baad Mein Add Karna Hai Toh?

Sirf **4 cheezein** change karni hogi:

```
1. Cloudflare DNS setup (CNAME app → Vercel, CNAME api → Railway)
2. Vercel mein NEXT_PUBLIC_APP_URL + NEXT_PUBLIC_API_URL update karo
3. Railway mein ALLOWED_ORIGINS + FRONTEND_URL update karo
4. Clerk mein URLs update karo
```

Sab 30 minutes ka kaam hai. Baaki kuch nahi badlega.

---

## GO-LIVE CHECKLIST (Without Domain)

```
PHASE 0
[ ] Sab accounts bane
[ ] Sab API keys ek jagah note kiye

PHASE 1 — Neon DB
[ ] Project create hua
[ ] DATABASE_URL save kiya
[ ] Migrations successfully run hui
[ ] Tables Neon dashboard mein dikh rahi hain

PHASE 2 — Railway API
[ ] GitHub se deploy hua
[ ] Redis plugin add hua, REDIS_URL copy kiya
[ ] Dockerfile committed + pushed
[ ] BullMQ + worker code add hua
[ ] Sentry add hua
[ ] Sab env vars Railway mein set hain
[ ] curl https://artivaa-api.up.railway.app/health → {"status":"ok"}
[ ] Railway outbound IP note kiya

PHASE 3 — Clerk
[ ] Development instance configure hua
[ ] artivaa.vercel.app allowed URLs mein add hua
[ ] Webhook → artivaa-api.up.railway.app/webhooks/clerk set hua
[ ] Development keys Railway + Vercel mein ready hain

PHASE 4 — Hetzner Bot
[ ] CX32 server create hua (Nuremberg)
[ ] Private network 10.0.0.0/24 create hua
[ ] Server network se attach hua (IP: 10.0.0.2)
[ ] UFW firewall set hua
[ ] Docker install hua
[ ] Bot Dockerfile create hua
[ ] BullMQ worker add hua
[ ] Docker image build + deploy hua
[ ] docker logs artivaa-bot mein koi error nahi
[ ] BOT_BASE_URL=http://10.0.0.2:8000 Railway mein set hua

PHASE 5 — Vercel Frontend
[ ] Sentry wizard run hua
[ ] Sab NEXT_PUBLIC_* vars Vercel mein set hain (build se PEHLE)
[ ] Deploy hua → artivaa.vercel.app live
[ ] Sign in kaam kar raha hai
[ ] Dashboard load ho raha hai
[ ] API calls 200 return kar rahi hain

PHASE 6 — Monitoring
[ ] Better Uptime dono URLs monitor kar raha hai
[ ] Docker log rotation Hetzner pe set hua

FINAL TEST
[ ] Full meeting flow end-to-end test hua
[ ] Sentry mein koi unexpected errors nahi
```

---

## Monthly Cost (Without Domain)

| Service | Cost |
|---------|------|
| Vercel (Hobby) | Free |
| Railway (API + Redis) | ~$10–15/mo |
| Neon (Free tier) | Free |
| Hetzner CX32 | €12.49/mo (~₹1,100) |
| Clerk (up to 10k users) | Free |
| Sentry (free tier) | Free |
| Better Uptime (free) | Free |
| **Total** | **~₹2,300–2,700/mo** |

---

## Common Errors aur Fix

| Error | Reason | Fix |
|-------|--------|-----|
| API 502 Bad Gateway | Missing env var ya DB connect nahi hua | Railway logs dekho |
| Sign-in kaam nahi | Clerk mein URL mismatch | Clerk → Domains → exact URL match check karo |
| Bot job process nahi ho raha | REDIS_URL galat hai | `docker logs artivaa-bot` dekho |
| Frontend API nahi reach kar pa raha | CORS issue | Railway → ALLOWED_ORIGINS = exact Vercel URL |
| Build failed on Vercel | Missing NEXT_PUBLIC_ var | Vercel → Settings → Env vars check karo |
