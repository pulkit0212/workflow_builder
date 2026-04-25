import { drizzle, NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { config } from "../config";
import * as schema from "./schema";

export const pool = new Pool({
  connectionString: config.databaseUrl,
  min: 2,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const db: NodePgDatabase<any> = drizzle(pool, { schema });
