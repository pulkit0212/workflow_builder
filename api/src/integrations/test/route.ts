import { auth } from "@clerk/nextjs/server";
import { apiError, apiSuccess } from "@/lib/api-responses";
import { ensureDatabaseReady } from "@/lib/db/bootstrap";
import { syncCurrentUserToDatabase } from "@/lib/auth/current-user";
import { getActiveGoogleIntegration } from "@/lib/google/integration";
import { testSlackWebhook } from "@/lib/integrations/slack";
import { testNotionConnection } from "@/lib/integrations/notion";
import { testJiraConnection } from "@/lib/integrations/jira";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const { userId } = await auth();

  if (!userId) {
    return apiError("Unauthorized.", 401);
  }

  try {
    await ensureDatabaseReady();
    const user = await syncCurrentUserToDatabase(userId);
    const payload = (await request.json()) as {
      type?: string;
      config?: Record<string, string>;
    };

    let success = false;

    switch (payload.type) {
      case "slack":
        success = await testSlackWebhook(payload.config?.webhookUrl || "");
        break;
      case "notion":
        success = await testNotionConnection(
          payload.config?.apiToken || "",
          payload.config?.databaseId || ""
        );
        break;
      case "jira":
        success = await testJiraConnection(
          payload.config?.domain || "",
          payload.config?.email || "",
          payload.config?.apiToken || ""
        );
        break;
      case "gmail":
        success = Boolean(await getActiveGoogleIntegration(user.id));
        break;
      default:
        return apiError("Invalid integration type.", 400);
    }

    return apiSuccess({
      success,
      message: success ? "Connection successful!" : "Connection failed"
    });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "Integration test failed.", 500);
  }
}
