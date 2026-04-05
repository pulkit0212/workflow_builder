/**
 * User-safe AI error handler.
 * Never exposes provider names, API keys, or internal error details to users.
 */

function isQuotaError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const msg = error.message.toLowerCase();
  return msg.includes("quota") || msg.includes("rate limit") || msg.includes("429");
}

/**
 * Converts any AI error into a user-safe message.
 * Call this in catch blocks around callAI() invocations.
 */
export function handleUserSafeAIError(error: unknown): never {
  if (isQuotaError(error)) {
    throw new Error("AI service is temporarily unavailable. Please try again in a moment.");
  }
  throw new Error("Something went wrong. Please try again.");
}
