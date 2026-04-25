export interface Config {
  port: number;
  databaseUrl: string;
  allowedOrigins: string[];
  clerkSecretKey: string;
  clerkWebhookSecret: string;
  recordingsDir: string;
  botBaseUrl: string;
  geminiApiKey: string;
  razorpayKeyId: string;
  razorpayKeySecret: string;
}

function loadConfig(): Config {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("[FATAL] DATABASE_URL environment variable is not set. Exiting.");
    process.exit(1);
  }

  const rawOrigins = process.env.ALLOWED_ORIGINS ?? "";
  const allowedOrigins = rawOrigins
    ? rawOrigins.split(",").map((o) => o.trim()).filter(Boolean)
    : [];

  return {
    port: parseInt(process.env.PORT ?? "3001", 10),
    databaseUrl,
    allowedOrigins,
    clerkSecretKey: process.env.CLERK_SECRET_KEY ?? "",
    clerkWebhookSecret: process.env.CLERK_WEBHOOK_SECRET ?? "",
    recordingsDir: process.env.RECORDINGS_DIR ?? "./private/recordings",
    botBaseUrl: process.env.BOT_BASE_URL ?? "",
    geminiApiKey: process.env.GEMINI_API_KEY ?? "",
    razorpayKeyId: process.env.RAZORPAY_KEY_ID ?? "",
    razorpayKeySecret: process.env.RAZORPAY_KEY_SECRET ?? "",
  };
}

export const config: Config = loadConfig();
