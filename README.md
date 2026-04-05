# Artivaa AI

- **frontend/** — Next.js dashboard (run `cd frontend && npm install && npm run dev` after the one-time restructure below).
- **backend/** — NestJS microservices + Python AI processing (see `backend/README.md`).

Architecture: `backend/docs/RFC_AI_Meeting_Assistant_Platform.md` (copied there when you run the restructure script) or `RFC_AI_Meeting_Assistant_Platform.md` at the repository root until then.

## One-time layout completion

From the repository root, move `src/`, `package-lock.json`, and the RFC into place (or run once):

```bash
node restructure-to-frontend.mjs
```

Then: `cd frontend && npm install` and `cd backend && pnpm install` as needed.
