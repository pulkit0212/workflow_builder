import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { getCurrentClerkUser } from "@/lib/auth/current-user";
import { ensureDatabaseReady } from "@/lib/db/bootstrap";
import { upsertUserByClerkIdentity } from "@/lib/db/queries/users";
import { persistGoogleIntegrationForClerkUser } from "@/lib/google/integration";
import { getGoogleAuthEnv } from "@/lib/google/env";

const authJsLogPrefix = "[auth.js]";
const googleAuthEnv = getGoogleAuthEnv();

export const { handlers } = NextAuth({
  secret: googleAuthEnv.authSecret ?? undefined,
  trustHost: true,
  session: {
    strategy: "jwt"
  },
  providers: [
    Google({
      clientId: googleAuthEnv.googleClientId ?? "",
      clientSecret: googleAuthEnv.googleClientSecret ?? "",
      authorization: {
        params: {
          scope: "openid email profile https://www.googleapis.com/auth/calendar.readonly",
          access_type: "offline",
          prompt: "consent"
        }
      }
    })
  ],
  callbacks: {
    async signIn({ account, profile }) {
      if (account?.provider !== "google") {
        return false;
      }

      const successRedirect = "/dashboard/meetings?google=connected";
      const failedRedirect = "/dashboard/meetings?google=connect_failed";
      const grantedScopes = typeof account.scope === "string" ? account.scope.split(" ") : [];
      const hasCalendarReadonlyScope = grantedScopes.includes(
        "https://www.googleapis.com/auth/calendar.readonly"
      );

      try {
        await ensureDatabaseReady();

        const clerkUser = await getCurrentClerkUser();

        if (!clerkUser) {
          console.error(`${authJsLogPrefix} missing Clerk session during Google callback`);
          return failedRedirect;
        }

        const appUser = await upsertUserByClerkIdentity(clerkUser);

        console.info(`${authJsLogPrefix} persisting Google account for authenticated user`, {
          clerkUserId: clerkUser.clerkUserId,
          appUserId: appUser.id,
          provider: account.provider,
          grantedScopes,
          hasCalendarReadonlyScope,
          hasAccessToken: Boolean(account.access_token),
          hasRefreshToken: Boolean(account.refresh_token)
        });

        if (grantedScopes.length > 0 && !hasCalendarReadonlyScope) {
          console.error(`${authJsLogPrefix} Google callback missing calendar.readonly scope`, {
            grantedScopes
          });
          return failedRedirect;
        }

        await persistGoogleIntegrationForClerkUser({
          clerkUserId: clerkUser.clerkUserId,
          appUserId: appUser.id,
          email: typeof profile?.email === "string" ? profile.email : clerkUser.email,
          scopes: typeof account.scope === "string" ? account.scope : null,
          accessToken: account.access_token ?? null,
          refreshToken: account.refresh_token ?? null,
          expiresAt: typeof account.expires_at === "number" ? account.expires_at : null
        });
      } catch (error) {
        console.error(`${authJsLogPrefix} Google callback persistence failed`, {
          message: error instanceof Error ? error.message : "Unknown error"
        });
        return failedRedirect;
      }

      return successRedirect;
    }
  }
});
