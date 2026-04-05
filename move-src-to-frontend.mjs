#!/usr/bin/env node
/**
 * Move repo-root src/ → frontend/src/ (one-shot). Run from repo root:
 *   node move-src-to-frontend.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = __dirname;
const from = path.join(root, "src");
const to = path.join(root, "frontend", "src");

if (!fs.existsSync(from)) {
  console.log("Nothing to do: no src/ at repo root.");
  process.exit(0);
}
if (fs.existsSync(to)) {
  console.error("Refusing: frontend/src already exists. Remove or merge manually.");
  process.exit(1);
}
fs.renameSync(from, to);
console.log("Moved: src/ → frontend/src/");

const botTs = path.join(to, "lib", "bot.ts");
if (fs.existsSync(botTs)) {
  let s = fs.readFileSync(botTs, "utf8");
  const oldReq =
    'require("../../backend/python-services/ai-processing-service/legacy-bot")';
  const newReq =
    'require("../../../backend/python-services/ai-processing-service/legacy-bot")';
  if (s.includes(oldReq)) {
    s = s.replace(oldReq, newReq);
    fs.writeFileSync(botTs, s);
    console.log("Updated: frontend/src/lib/bot.ts legacy-bot require path");
  }
}
