const googleEnvLogPrefix = "[google-env]";

type GoogleAuthEnv = {
  authSecret: string | null;
  authUrl: string | null;
  googleClientId: string | null;
  googleClientSecret: string | null;
};

let hasLoggedGoogleEnv = false;

export function getGoogleAuthEnv(): GoogleAuthEnv {
  const googleClientSecret = process.env.AUTH_GOOGLE_SECRET ?? process.env.GOOGLE_CLIENT_SECRET ?? null;
  const env = {
    authSecret:
      process.env.AUTH_SECRET ??
      process.env.NEXTAUTH_SECRET ??
      process.env.CLERK_SECRET_KEY ??
      googleClientSecret,
    authUrl: process.env.AUTH_URL ?? process.env.NEXTAUTH_URL ?? null,
    googleClientId: process.env.AUTH_GOOGLE_ID ?? process.env.GOOGLE_CLIENT_ID ?? null,
    googleClientSecret
  };

  if (!hasLoggedGoogleEnv) {
    hasLoggedGoogleEnv = true;

    const recommendedMissingVars = [
      !process.env.AUTH_SECRET ? "AUTH_SECRET" : null,
      !process.env.AUTH_GOOGLE_ID ? "AUTH_GOOGLE_ID" : null,
      !process.env.AUTH_GOOGLE_SECRET ? "AUTH_GOOGLE_SECRET" : null,
      !process.env.AUTH_URL ? "AUTH_URL" : null
    ].filter(Boolean);
    const requiredMissingVars = [
      !env.authSecret ? "authSecret" : null,
      !env.googleClientId ? "googleClientId" : null,
      !env.googleClientSecret ? "googleClientSecret" : null,
      !env.authUrl ? "authUrl" : null
    ].filter(Boolean);

    if (requiredMissingVars.length > 0) {
      console.error(`${googleEnvLogPrefix} missing effective auth configuration`, {
        requiredMissingVars
      });
    } else {
      const expectedGoogleCallbackUrl = `${env.authUrl}/api/auth/callback/google`;
      console.info(`${googleEnvLogPrefix} auth configuration loaded`, {
        hasAuthSecret: true,
        hasGoogleClientId: true,
        hasGoogleClientSecret: true,
        authUrl: env.authUrl,
        expectedGoogleCallbackUrl
      });
    }

    if (recommendedMissingVars.length > 0) {
      console.warn(`${googleEnvLogPrefix} recommended AUTH_* env vars are missing`, {
        recommendedMissingVars
      });
    }

    if (!process.env.AUTH_GOOGLE_ID && process.env.GOOGLE_CLIENT_ID) {
      console.warn(`${googleEnvLogPrefix} using legacy GOOGLE_CLIENT_ID fallback`);
    }

    if (!process.env.AUTH_GOOGLE_SECRET && process.env.GOOGLE_CLIENT_SECRET) {
      console.warn(`${googleEnvLogPrefix} using legacy GOOGLE_CLIENT_SECRET fallback`);
    }

    if (!process.env.AUTH_URL && process.env.NEXTAUTH_URL) {
      console.warn(`${googleEnvLogPrefix} using legacy NEXTAUTH_URL fallback`);
    }

    if (!process.env.AUTH_SECRET && process.env.NEXTAUTH_SECRET) {
      console.warn(`${googleEnvLogPrefix} using legacy NEXTAUTH_SECRET fallback`);
    }

    if (!process.env.AUTH_SECRET && process.env.CLERK_SECRET_KEY) {
      console.warn(`${googleEnvLogPrefix} using CLERK_SECRET_KEY fallback for Auth.js secret`);
    }
  }

  return env;
}
