import { auth } from "@clerk/nextjs/server";
import { requireCurrentClerkUser } from "@/lib/auth/current-user";

export async function requireAuth() {
  const session = await auth();
  await requireCurrentClerkUser(session.userId ?? undefined);

  return session;
}
