import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import type { Route } from "next";

export async function requireAuth() {
  const session = await auth();
  if (!session.userId) redirect("/sign-in" as Route);
  return session;
}
