import "dotenv/config";
import { createApp } from "./app";
import { config } from "./config";
import { pool } from "./db/client";

const app = createApp();

const server = app.listen(config.port, () => {
  console.log(`Server listening on port ${config.port}`);
});

async function shutdown(signal: string): Promise<void> {
  console.log(`Received ${signal}. Shutting down gracefully...`);
  server.close(async () => {
    try {
      await pool.end();
      console.log("Database pool closed. Exiting.");
      process.exit(0);
    } catch (err) {
      console.error("Error closing database pool:", err);
      process.exit(1);
    }
  });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
