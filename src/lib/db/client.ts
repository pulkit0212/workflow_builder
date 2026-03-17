import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

export const databaseUrl = process.env.DATABASE_URL;
export const isDatabaseConfigured = Boolean(databaseUrl);

const pool = databaseUrl ? new Pool({ connectionString: databaseUrl }) : null;

export const db = pool ? drizzle(pool) : null;
