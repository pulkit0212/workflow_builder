# Artivaa Bot — Oracle Cloud Always Free (₹0 / 24×7)

> Bot **Oracle VM** pe chalega. Mac on rakhne ki zaroorat nahi.  
> API **Render** pe rahega → `BOT_BASE_URL=http://YOUR_ORACLE_PUBLIC_IP:8000`

---

## Architecture

```
Vercel (frontend)
    ↓
Render artivaa-api
    ↓ BOT_BASE_URL → http://129.x.x.x:8000
Oracle Always Free VM (ARM, 2 OCPU, 4GB)
    ↓ Docker → legacy-bot :8000
Neon PostgreSQL
```

---

## Part 1 — Oracle VM banao (Console)

### 1.1 Login

1. [cloud.oracle.com](https://cloud.oracle.com) → sign in  
2. Top-left **Menu (☰)** → **Compute** → **Instances** → **Create instance**

### 1.2 Instance settings

| Field | Value |
|-------|--------|
| Name | `artivaa-bot` |
| Compartment | (default / root) |
| **Image** | **Ubuntu 22.04** (Canonical) — **AArch64** |
| **Shape** | **Ampere** → **VM.Standard.A1.Flex** |
| OCPU | **2** |
| Memory (GB) | **4** (free tier: max 4 OCPU + 24 GB total account-wide) |
| **Networking** | Create new VCN (default OK) — **Public IPv4 address: ON** |
| **SSH keys** | **Generate a key pair** → **Download private key** (`.key` file safe rakho) |

> Agar **Out of capacity** aaye: dusra **Availability Domain** try karo, ya region change (e.g. `ap-mumbai-1`, `uk-london-1`, `us-phoenix-1`).

### 1.3 Create

**Create** dabao. 2–5 min wait. **Public IP address** note karo (e.g. `129.146.xx.xx`).

### 1.4 Firewall — port 8000 + 22 kholo

**Menu** → **Networking** → **Virtual cloud networks** → apna VCN → **Security Lists** → **Default Security List**

**Add Ingress Rules:**

| Source CIDR | Protocol | Dest Port | Notes |
|-------------|----------|-----------|--------|
| `0.0.0.0/0` | TCP | **22** | SSH (baad mein sirf apna IP restrict kar sakte ho) |
| `0.0.0.0/0` | TCP | **8000** | Bot API (test ke liye; baad mein tighten karo) |

**Add Ingress Rules** save karo.

---

## Part 2 — Mac se SSH

Private key permissions:

```bash
chmod 400 ~/Downloads/ssh-key-*.key
```

Connect (Oracle user = **`ubuntu`** on Canonical images):

```bash
ssh -i ~/Downloads/ssh-key-YYYY-MM-DD.key ubuntu@YOUR_PUBLIC_IP
```

Pehli baar `yes` for fingerprint.

---

## Part 3 — Server setup (Oracle VM pe)

Copy-paste blocks **ek-ek karke** SSH session mein:

### 3.1 System update + Docker

```bash
sudo apt-get update && sudo apt-get upgrade -y
sudo apt-get install -y git curl ca-certificates

curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker ubuntu
```

Logout + login (group apply):

```bash
exit
```

Phir dubara SSH karo, phir:

```bash
docker --version
```

### 3.2 Repo clone

```bash
cd ~
git clone https://github.com/pulkit0212/artivaa-backend.git
cd artivaa-backend
```

> Agar repo private hai: GitHub deploy key ya `git clone git@github.com:...` with SSH key on VM.

### 3.3 Bot env file

```bash
nano ~/artivaa-backend/artivaa-bot.env
```

Paste (apni values):

```env
NODE_ENV=production
BOT_PORT=8000
BOT_HOST=0.0.0.0
BOT_HEADLESS=true
BOT_NAME=Artivaa Notetaker
MEETING_AUDIO_SOURCE=default

DATABASE_URL=postgresql://USER:PASS@ep-xxx.neon.tech/neondb?sslmode=require
GEMINI_API_KEY=your_gemini_key
OPENAI_API_KEY=your_openai_key_optional
```

Save: `Ctrl+O`, Enter, `Ctrl+X`

```bash
chmod 600 ~/artivaa-backend/artivaa-bot.env
```

### 3.4 Docker image build (15–25 min, ARM pe slow)

```bash
cd ~/artivaa-backend
docker build -f Dockerfile.bot -t artivaa-bot:latest .
```

> Agar `Dockerfile.bot` missing ho (purana push): monorepo se latest `artivaa-backend` push karo pehle.

### 3.5 Bot run (background, auto-restart)

```bash
docker rm -f artivaa-bot 2>/dev/null || true

docker run -d \
  --name artivaa-bot \
  --restart unless-stopped \
  -p 8000:8000 \
  --env-file ~/artivaa-backend/artivaa-bot.env \
  artivaa-bot:latest
```

### 3.6 Health check

```bash
curl -s http://localhost:8000/health
```

Expected: `{"status":"ok","service":"artivaa-bot"}`

Logs:

```bash
docker logs -f artivaa-bot
```

`[Bot] HTTP server listening on 0.0.0.0:8000` dikhna chahiye.

---

## Part 4 — Render API connect

1. [render.com](https://render.com) → **artivaa-api** → **Environment**
2. Set / update:

```env
BOT_BASE_URL=http://YOUR_ORACLE_PUBLIC_IP:8000
```

Example: `BOT_BASE_URL=http://129.146.12.34:8000`

3. **Save** → **Manual Deploy** (API redeploy)

> Render **Private Network bot URL** (`artivaa-bot:8000`) ab use **mat** karo — bot Oracle pe hai.

---

## Part 5 — End-to-end test

1. https://artivaa-frontend.vercel.app → Sign in  
2. Meetings → Google Meet link → **Start bot**  
3. Oracle pe logs dekho:

```bash
ssh -i ~/Downloads/ssh-key-....key ubuntu@YOUR_PUBLIC_IP
docker logs -f artivaa-bot
```

Join attempt / platform detect dikhna chahiye.

4. **Stop bot** → transcript/summary Neon DB mein check karo (app UI)

---

## Useful commands (Oracle VM)

```bash
# Status
docker ps

# Restart bot
docker restart artivaa-bot

# Rebuild after git pull
cd ~/artivaa-backend && git pull
docker build -f Dockerfile.bot -t artivaa-bot:latest .
docker rm -f artivaa-bot
docker run -d --name artivaa-bot --restart unless-stopped \
  -p 8000:8000 --env-file ~/artivaa-backend/artivaa-bot.env artivaa-bot:latest

# Disk space
df -h
docker system prune -f   # careful — removes unused images
```

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| SSH timeout | Security List mein port 22 open? Public IP sahi? |
| `curl localhost:8000` fail | `docker logs artivaa-bot` — build crash / env missing |
| API 503 Bot unavailable | Render `BOT_BASE_URL` = `http://PUBLIC_IP:8000` (no trailing slash) |
| Render se Oracle reach nahi | OCI Ingress port **8000** open? VM running? |
| A1 out of capacity | Dusra AD / region try karo |
| OOM / killed | Shape memory 4GB → 6GB try (free tier limit ke andar) |
| Whisper slow first run | Normal — pehli meeting pe model download |
| Google Meet join fail | Headless cloud — guest join / profile setup alag issue; logs dekho |

---

## Security (baad mein)

- SSH (22): source `YOUR_HOME_IP/32` only  
- Port 8000: ideally sirf Render outbound IPs (Render docs — region specific; free tier pe kabhi-kabhi IP change)  
- Future: bot pe shared secret header (`BOT_API_SECRET`) add karna  

---

## Cost

| Item | Cost |
|------|------|
| Oracle A1 Always Free (2 OCPU, 4GB) | **₹0 / $0** (always, sirf 12 month nahi) |
| Render API free | ₹0 |
| Vercel + Neon + Clerk free | ₹0 |

**Mac on rakhne ki zaroorat nahi** — bot 24×7 Oracle pe.

---

## Quick checklist

```
[ ] Oracle VM created (A1 Flex, 2 OCPU, 4GB, public IP)
[ ] Security List: 22 + 8000 ingress
[ ] SSH works
[ ] Docker installed
[ ] artivaa-backend cloned, Dockerfile.bot build OK
[ ] artivaa-bot.env filled (DATABASE_URL, GEMINI_API_KEY)
[ ] curl localhost:8000/health → ok
[ ] Render BOT_BASE_URL = http://PUBLIC_IP:8000
[ ] API redeployed
[ ] App se Start bot test
```

---

*May 2026 · Artivaa AI · Oracle Always Free bot path*
