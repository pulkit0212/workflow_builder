import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { getCurrentClerkUser } from "@/lib/auth/current-user";
import { persistGoogleIntegrationForClerkUser } from "@/lib/google/integration";
import { getGoogleAuthEnv } from "@/lib/google/env";

const authJsLogPrefix = "[auth.js]";

export const { handlers } = NextAuth(() => {
  const googleAuthEnv = getGoogleAuthEnv();

  return {
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
      async jwt({ token, account }) {
        if (account) {
          return {
            ...token,
            accessToken: account.access_token,
            refreshToken: account.refresh_token,
            accessTokenExpires: typeof account.expires_at === "number" ? account.expires_at * 1000 : undefined
          };
        }

        if (typeof token.accessTokenExpires === "number" && Date.now() < token.accessTokenExpires) {
          return token;
        }

        if (!token.refreshToken) {
          return { ...token, error: "RefreshAccessTokenError" };
        }

        try {
          const response = await fetch("https://oauth2.googleapis.com/token", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              client_id: googleAuthEnv.googleClientId ?? "",
              client_secret: googleAuthEnv.googleClientSecret ?? "",
              grant_type: "refresh_token",
              refresh_token: token.refreshToken as string
            })
          });

          const refreshed = (await response.json()) as {
            access_token?: string;
            expires_in?: number;
            refresh_token?: string;
          };

          if (!response.ok || !refreshed.access_token || !refreshed.expires_in) {
            throw refreshed;
          }

          return {
            ...token,
            accessToken: refreshed.access_token,
            accessTokenExpires: Date.now() + refreshed.expires_in * 1000,
            refreshToken: refreshed.refresh_token ?? token.refreshToken
          };
        } catch (error) {
          console.error("[Auth] Token refresh error:", error);
          return { ...token, error: "RefreshAccessTokenError" };
        }
      },
      async session({ session, token }) {
        return {
          ...session,
          accessToken: token.accessToken as string | undefined,
          error: token.error as string | undefined
        };
      },
      async signIn({ account, profile }) {
        if (account?.provider !== "google") return false;

        const grantedScopes = typeof account.scope === "string" ? account.scope.split(" ") : [];
        const hasCalendarReadonlyScope = grantedScopes.includes(
          "https://www.googleapis.com/auth/calendar.readonly"
        );

        if (grantedScopes.length > 0 && !hasCalendarReadonlyScope) {
          console.error(`${authJsLogPrefix} Google callback missing calendar.readonly scope`, { grantedScopes });
          return false;
        }

        try {
          const clerkUser = await getCurrentClerkUser();

          if (!clerkUser) {
            // Clerk session may not be available in the OAuth callback context —
            // allow the sign-in to succeed so the user lands back on the page.
            // Token persistence will be retried on next page load via the status check.
            console.warn(`${authJsLogPrefix} Clerk session unavailable during Google callback — skipping token persistence`);
            return true;
          }

          await persistGoogleIntegrationForClerkUser({
            clerkUserId: clerkUser.clerkUserId,
            appUserId: null,
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
          // Don't block sign-in for persistence failures
        }

        return true;
      }
    },
    pages: {
      signIn: "/dashboard/integrations",
      error: "/dashboard/integrations"
    }
  };
});
