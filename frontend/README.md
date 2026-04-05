# Frontend (Next.js)

Config, `public/`, `drizzle/`, `scripts/`, and `package.json` for the Next.js app live here. The `src/` tree is moved from the repository root by the one-time restructure script (or stays at the root until you run it).

## One-time setup

From the **repository root** (parent of this folder):

```bash
npm run restructure
```

Then install and run:

```bash
cd frontend
npm install
npm run dev
```

The script moves the app out of the root, updates `src/lib/bot.ts` paths, fixes `setup:bot-profile`, relocates `RFC_AI_Meeting_Assistant_Platform.md` into `backend/docs/`, removes `.next`, `tmp`, and other cruft, and writes a minimal root `README.md` / `package.json`.
