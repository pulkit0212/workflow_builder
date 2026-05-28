/**
 * Public app base URL for OAuth redirects (must be absolute https/http).
 */
export function getAppBaseUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "");
  if (fromEnv && /^https?:\/\//i.test(fromEnv)) {
    return fromEnv;
  }

  // Vercel provides this at runtime (no rebuild needed if only this is set)
  const vercelHost = process.env.VERCEL_URL?.trim().replace(/\/$/, "");
  if (vercelHost) {
    return `https://${vercelHost}`;
  }

  return "http://localhost:3000";
}
