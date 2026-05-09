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
  /** Webhook signing secret from Razorpay Dashboard (not the API key secret). */
  razorpayWebhookSecret: string;
}

function resolveAllowedOrigins(): string[] {
  const raw = process.env.ALLOWED_ORIGINS ?? "";
  const fromEnv = raw
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  if (fromEnv.length > 0) return fromEnv;

  if (process.env.NODE_ENV === "production") {
    console.warn(
      "[config] ALLOWED_ORIGINS is empty — set comma-separated frontend URLs or browser requests will fail CORS."
    );
    return [];
  }

  const front = process.env.FRONTEND_URL?.trim().replace(/\/$/, "");
  if (front) return [front];

  return ["http://localhost:3000", "http://127.0.0.1:3000"];
}

function loadConfig(): Config {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("[FATAL] DATABASE_URL environment variable is not set. Exiting.");
    process.exit(1);
  }

  const allowedOrigins = resolveAllowedOrigins();

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
    razorpayWebhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET ?? "",
  };
}

export const config: Config = loadConfig();
