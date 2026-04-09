import { auth } from "@clerk/nextjs/server";
import { apiError, apiSuccess } from "@/lib/api-responses";
import { ensureDatabaseReady } from "@/lib/db/bootstrap";
import { syncCurrentUserToDatabase } from "@/lib/auth/current-user";
import { listIntegrationsByUser } from "@/lib/db/queries/integrations";
import { upsertIntegration } from "@/lib/db/mutations/integrations";

const integrationTypes = ["slack", "gmail", "notion", "jira"] as const;

export const runtime = "nodejs";

export async function GET() {
  const { userId } = await auth();

  if (!userId) {
    return apiError("Unauthorized.", 401);
  }

  try {
    await ensureDatabaseReady();
    const user = await syncCurrentUserToDatabase(userId);
    const existingIntegrations = await listIntegrationsByUser(user.id);

    const integrations = integrationTypes.map((type) => {
      const existing = existingIntegrations.find((integration) => integration.type === type);
      return (
        existing || {
          id: null,
          userId: user.id,
          type,
          enabled: false,
          config: {}
        }
      );
    });

    return apiSuccess({ integrations });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "Failed to load integrations.", 500);
  }
}

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
      enabled?: boolean;
      config?: Record<string, unknown>;
    };

    if (!payload.type || !integrationTypes.includes(payload.type as (typeof integrationTypes)[number])) {
      return apiError("Invalid integration type.", 400);
    }

    const integration = await upsertIntegration({
      userId: user.id,
      type: payload.type,
      enabled: Boolean(payload.enabled),
      config: payload.config && typeof payload.config === "object" ? payload.config : {}
    });

    return apiSuccess({ success: true, integration });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "Failed to save integration.", 500);
  }
}
