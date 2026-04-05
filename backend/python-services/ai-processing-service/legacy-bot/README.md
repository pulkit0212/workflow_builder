# Legacy meeting bot (Playwright + ffmpeg + Whisper)

This directory was moved from the project root `bot/` as part of the RFC backend layout.  
It remains **CommonJS JavaScript** consumed by the Next.js app via `src/lib/bot.ts` until the **integration-service** NestJS worker replaces this process.

## First-time setup

From the **repository root** (where `package.json` and `tmp/` live):

```bash
npm run setup:bot-profile
```

Paths such as `tmp/bot-profile`, `tmp/audio` are resolved from `process.cwd()` (project root), not from this folder.

## See also

- `RFC_AI_Meeting_Assistant_Platform.md` — target **Integration Service** + **Python AI Processing Service**
- `PHASED_IMPLEMENTATION_PLAN.md` — Phase 1–3 migration steps
