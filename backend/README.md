# Artivaa — Backend (RFC v2)

NestJS **microservices** + **Python** AI processing. **TypeScript only** in `apps/` and `packages/`.

## Prerequisites

- Node.js 22 LTS  
- pnpm 9.x  
- Python 3.11+ (for `python-services/ai-processing-service`)

## Install

```bash
cd backend
pnpm install
pnpm build
```

## Apps (default ports)

`npm run dev:gateway` sets **PORT=3001** so it does not clash with **Next.js** on port 3000. Override with `PORT=3000` if nothing else is using 3000.

| App | Port |
|-----|------|
| api-gateway | 3000 (or 3001 when started via `dev:gateway`) |
| auth-service | 3001 |
| meeting-service | 3002 |
| transcript-service | 3003 |
| ai-orchestrator | 3004 |
| notification-service | 3005 |
| telephony-service | 3006 |
| realtime-service | 3007 |
| integration-service | 3008 |

## Packages

- `@artivaa/shared-dto` — API contracts  
- `@artivaa/shared-config` — config helpers  
- `@artivaa/shared-kafka` — topic names + future clients  
- `@artivaa/shared-utils` — correlation IDs, etc.

## Legacy bot

Meeting bot (Playwright + Whisper + Gemini) runs from:

`python-services/ai-processing-service/legacy-bot/`

The Next.js app loads it via `src/lib/bot.ts` (project root `process.cwd()` for `tmp/`).

## Python service

```bash
cd python-services/ai-processing-service
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8090
```

## References

- `RFC_AI_Meeting_Assistant_Platform.md`  
- `PHASED_IMPLEMENTATION_PLAN.md`
