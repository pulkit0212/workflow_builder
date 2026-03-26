import { headers } from "next/headers";
import { Webhook } from "svix";
import { apiError, apiSuccess } from "@/lib/api-responses";
import { ensureDatabaseReady } from "@/lib/db/bootstrap";
import { getUserSubscription } from "@/lib/subscription.server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const payload = await req.text();
  const headerStore = await headers();
  const svix_id = headerStore.get("svix-id");
  const svix_timestamp = headerStore.get("svix-timestamp");
  const svix_signature = headerStore.get("svix-signature");

  if (!process.env.CLERK_WEBHOOK_SECRET) {
    return apiError("Webhook secret is not configured.", 503);
  }

  if (!svix_id || !svix_timestamp || !svix_signature) {
    return apiError("Missing webhook headers.", 400);
  }

  let event: { type?: string; data?: { id?: string } };

  try {
    event = new Webhook(process.env.CLERK_WEBHOOK_SECRET).verify(payload, {
      "svix-id": svix_id,
      "svix-timestamp": svix_timestamp,
      "svix-signature": svix_signature
    }) as { type?: string; data?: { id?: string } };
  } catch {
    return apiError("Invalid webhook signature.", 400);
  }

  if (event.type === "user.created" && event.data?.id) {
    await ensureDatabaseReady();
    await getUserSubscription(event.data.id);
  }

  return apiSuccess({ success: true });
}
