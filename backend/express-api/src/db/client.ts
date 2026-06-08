import { drizzle, NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { config } from "../config";
import * as schema from "./schema";

export const pool = new Pool({
  connectionString: config.databaseUrl,
  // Neon + Render: keep pool small; idle connections get dropped by the host
  min: 0,
  max: 5,
  idleTimeoutMillis: 20_000,
  connectionTimeoutMillis: 10_000,
  ssl: config.databaseUrl.includes("neon.tech")
    ? { rejectUnauthorized: false }
    : undefined,
});

// Without this, idle Neon disconnects can crash Node (unhandled 'error' on pool)
pool.on("error", (err) => {
  console.error("[db] Idle pool client error:", err.message);
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const db: NodePgDatabase<any> = drizzle(pool, { schema });
