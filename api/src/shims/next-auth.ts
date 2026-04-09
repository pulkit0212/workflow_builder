// Shim for next-auth — prevents the real package (and its next/server ESM dep) from loading.
// The auth/[...nextauth] OAuth route is Next.js-only; the Express server returns 501 for it.

export type JWT = Record<string, unknown>;
export type Account = {
  provider?: string;
  scope?: string;
  access_token?: string;
  refresh_token?: string;
  expires_at?: number;
  [key: string]: unknown;
};
export type Profile = { email?: string; [key: string]: unknown };
export type Session = Record<string, unknown>;

type CallbacksConfig = {
  jwt?: (params: { token: JWT; account: Account | null }) => Promise<JWT> | JWT;
  session?: (params: { session: Session; token: JWT }) => Promise<Session> | Session;
  signIn?: (params: { account: Account | null; profile?: Profile }) => Promise<boolean | string> | boolean | string;
};

type NextAuthConfig = {
  secret?: string;
  trustHost?: boolean;
  session?: { strategy?: string };
  providers?: unknown[];
  callbacks?: CallbacksConfig;
};

const NextAuth = (_config: NextAuthConfig) => ({
  handlers: {
    GET: async () => new Response(JSON.stringify({ error: "Use the Next.js frontend for OAuth." }), { status: 501 }),
    POST: async () => new Response(JSON.stringify({ error: "Use the Next.js frontend for OAuth." }), { status: 501 }),
  },
  auth: async () => null,
  signIn: async () => {},
  signOut: async () => {},
});

export default NextAuth;
