export const hasClerkPublishableKey = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
export const hasClerkSecretKey = Boolean(process.env.CLERK_SECRET_KEY);
export const isClerkConfigured = hasClerkPublishableKey && hasClerkSecretKey;

export function warnIfClerkMissing(context: string) {
  if (process.env.NODE_ENV === "development" && !isClerkConfigured) {
    console.warn(
      `[clerk] Clerk is not configured for ${context}. Set NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY and CLERK_SECRET_KEY to enable authentication.`
    );
  }
}
