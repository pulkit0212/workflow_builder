#!/usr/bin/env node
/**
 * One-shot: move Next.js app into frontend/, relocate RFC docs to backend/docs,
 * remove cruft. Run from repo root: node restructure-to-frontend.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = __dirname;
const frontend = path.join(root, "frontend");
const backendDocs = path.join(root, "backend", "docs");

function exists(p) {
  try {
    fs.accessSync(p);
    return true;
  } catch {
    return false;
  }
}

function moveToFrontend(name) {
  const from = path.join(root, name);
  const to = path.join(frontend, name);
  if (!exists(from)) {
    console.warn("skip (missing):", name);
    return;
  }
  if (exists(to)) {
    if (name === "src") {
      console.error(
        "Refusing to remove root/src: frontend/src already exists. Resolve manually."
      );
      process.exit(1);
    }
    fs.rmSync(from, { recursive: true, force: true });
    console.log("removed root duplicate dir (frontend already has):", name);
    return;
  }
  fs.renameSync(from, to);
  console.log("moved:", name);
}

function moveFileToFrontend(name) {
  const from = path.join(root, name);
  const to = path.join(frontend, name);
  if (!exists(from)) {
    console.warn("skip file (missing):", name);
    return;
  }
  if (exists(to)) {
    fs.unlinkSync(from);
    console.log("removed root duplicate file (frontend already has):", name);
    return;
  }
  fs.renameSync(from, to);
  console.log("moved file:", name);
}

function rmRecursive(p) {
  if (!exists(p)) return;
  fs.rmSync(p, { recursive: true, force: true });
  console.log("removed:", path.relative(root, p));
}

function mkdirIfNeeded(p) {
  fs.mkdirSync(p, { recursive: true });
}

console.log("Restructuring:", root);

mkdirIfNeeded(frontend);
mkdirIfNeeded(backendDocs);

for (const dir of ["src", "public", "drizzle", "scripts"]) {
  moveToFrontend(dir);
}

for (const f of [
  "package.json",
  "package-lock.json",
  "pnpm-lock.yaml",
  "next.config.ts",
  "tsconfig.json",
  "tailwind.config.ts",
  "postcss.config.mjs",
  "postcss.config.js",
  "components.json",
  "next-env.d.ts",
  "vitest.config.ts",
  "drizzle.config.ts",
  "middleware.ts",
  ".env.example",
  ".env.local.example",
]) {
  moveFileToFrontend(f);
}

// RFC docs → backend/docs (keep single source of truth near backend)
for (const doc of [
  "RFC_AI_Meeting_Assistant_Platform.md",
  "PHASED_IMPLEMENTATION_PLAN.md",
  "ai_meeting_assistant_architecture.md",
]) {
  const from = path.join(root, doc);
  const to = path.join(backendDocs, doc);
  if (exists(from) && !exists(to)) {
    fs.renameSync(from, to);
    console.log("moved doc to backend/docs:", doc);
  } else if (exists(from) && exists(to)) {
    fs.unlinkSync(from);
    console.log("removed duplicate at root (already in backend/docs):", doc);
  }
}

// Remove unnecessary root clutter
rmRecursive(path.join(root, ".kiro"));
rmRecursive(path.join(root, ".next"));
rmRecursive(path.join(root, "tmp"));
rmRecursive(path.join(root, "bot"));
rmRecursive(path.join(root, ".idea"));

for (const f of ["ANALYZE_REPORT.md", "ai_meeting_assistant_architecture.pdf", "README.md"]) {
  const p = path.join(root, f);
  if (exists(p)) {
    fs.unlinkSync(p);
    console.log("deleted:", f);
  }
}

// Update bot require path in frontend
const botTs = path.join(frontend, "src", "lib", "bot.ts");
if (exists(botTs)) {
  let s = fs.readFileSync(botTs, "utf8");
  const oldRequire =
    'require("../../backend/python-services/ai-processing-service/legacy-bot")';
  const newRequire =
    'require("../../../backend/python-services/ai-processing-service/legacy-bot")';
  if (s.includes(oldRequire)) {
    s = s.replace(oldRequire, newRequire);
    fs.writeFileSync(botTs, s);
    console.log("updated:", "frontend/src/lib/bot.ts require path");
  }
}

// Fix scripts in frontend/package.json (paths relative to frontend/)
const frontendPkgPath = path.join(frontend, "package.json");
if (exists(frontendPkgPath)) {
  const pkg = JSON.parse(fs.readFileSync(frontendPkgPath, "utf8"));
  if (pkg.scripts?.["setup:bot-profile"]) {
    pkg.scripts["setup:bot-profile"] =
      "node ../backend/python-services/ai-processing-service/legacy-bot/setupProfile.js";
  }
  fs.writeFileSync(frontendPkgPath, JSON.stringify(pkg, null, 2) + "\n");
  console.log("updated: frontend/package.json scripts (bot profile path)");
}

// Root package.json for workspace pointer (minimal)
const rootPkg = {
  name: "artivaa-ai",
  private: true,
  description: "Monorepo root — use /frontend and /backend",
  scripts: {
    restructure: "node restructure-to-frontend.mjs",
    "frontend:dev": "npm run dev --prefix frontend",
    "frontend:build": "npm run build --prefix frontend",
    "backend:install": "cd backend && pnpm install",
  },
};
fs.writeFileSync(path.join(root, "package.json"), JSON.stringify(rootPkg, null, 2) + "\n");
console.log("wrote root package.json (workspace helper)");

// Root README
const readme = `# Artivaa AI

- **frontend/** — Next.js dashboard (run \`cd frontend && npm install && npm run dev\`).
- **backend/** — NestJS microservices + Python AI processing (see \`backend/README.md\`).

Architecture: \`backend/docs/RFC_AI_Meeting_Assistant_Platform.md\` (after \`npm run restructure\`, or the RFC at the repo root until then).

One-time: \`npm run restructure\` from this directory finishes moving \`src/\`, lockfiles, and docs if needed.
`;
fs.writeFileSync(path.join(root, "README.md"), readme);
console.log("wrote root README.md");

// Root .gitignore merge essentials
const gitignore = `node_modules
.next
out
dist
.turbo
.env
.env.local
*.log
tmp
.DS_Store
frontend/node_modules
backend/node_modules
`;
fs.writeFileSync(path.join(root, ".gitignore"), gitignore);
console.log("wrote root .gitignore");

// docker-compose at root → move to frontend if exists
const dc = path.join(root, "docker-compose.yml");
if (exists(dc)) {
  fs.renameSync(dc, path.join(frontend, "docker-compose.yml"));
  console.log("moved docker-compose.yml → frontend/");
}

console.log("\nDone. Next: cd frontend && npm install && npm run dev");
