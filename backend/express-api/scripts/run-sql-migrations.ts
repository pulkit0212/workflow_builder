/**
 * Applies SQL files from src/db/migrations in order, tracking applied files in schema_sql_migrations.
 *
 * Usage (from backend/express-api):
 *   npm run migrate:sql
 *
 * Requires DATABASE_URL in .env (loaded via dotenv).
 */
import "dotenv/config";
import fs from "fs";
import path from "path";
import { Client } from "pg";

const MIGRATIONS_DIR = path.join(__dirname, "..", "src", "db", "migrations");

function sortMigrationFiles(names: string[]): string[] {
  return [...names].sort((a, b) => {
    const ma = a.match(/^(\d+)_/);
    const mb = b.match(/^(\d+)_/);
    if (ma && mb) return parseInt(ma[1], 10) - parseInt(mb[1], 10);
    if (ma) return -1;
    if (mb) return 1;
    return a.localeCompare(b);
  });
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("[migrate:sql] DATABASE_URL is not set.");
    process.exit(1);
  }

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .filter((f) => !f.startsWith("."));

  if (files.length === 0) {
    console.log("[migrate:sql] No .sql files in migrations directory.");
    return;
  }

  const ordered = sortMigrationFiles(files);
  console.log("[migrate:sql] Order:", ordered.join(", "));

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_sql_migrations (
        filename TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    const { rows: appliedRows } = await client.query<{ filename: string }>(
      `SELECT filename FROM schema_sql_migrations`
    );
    const applied = new Set(appliedRows.map((r) => r.filename));

    for (const name of ordered) {
      if (applied.has(name)) {
        console.log(`[migrate:sql] skip (already applied): ${name}`);
        continue;
      }

      const fullPath = path.join(MIGRATIONS_DIR, name);
      const sql = fs.readFileSync(fullPath, "utf8");
      console.log(`[migrate:sql] applying: ${name}`);

      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query(`INSERT INTO schema_sql_migrations (filename) VALUES ($1)`, [name]);
        await client.query("COMMIT");
        console.log(`[migrate:sql] ok: ${name}`);
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      }
    }
  } finally {
    await client.end();
  }

  console.log("[migrate:sql] done.");
}

main().catch((err) => {
  console.error("[migrate:sql] failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
