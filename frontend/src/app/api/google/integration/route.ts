import { auth } from "@clerk/nextjs/server";
import { apiError, apiSuccess } from "@/lib/api-responses";
import { ensureDatabaseReady } from "@/lib/db/bootstrap";
import { syncCurrentUserToDatabase } from "@/lib/auth/current-user";
import { getUserIntegration } from "@/lib/db/queries/user-integrations";
import { deleteUserIntegration } from "@/lib/db/mutations/user-integrations";
import { isMissingDatabaseRelationError } from "@/lib/db/errors";

const provider = "google";

export async function GET() {
  const { userId } = await auth();

  if (!userId) {
    return apiError("Unauthorized.", 401);
  }

  try {
    await ensureDatabaseReady();
    const user = await syncCurrentUserToDatabase(userId);
    const integration = await getUserIntegration(user.id, provider);

    return apiSuccess({
      success: true,
      integration: {
        provider,
        connected: Boolean(integration),
        expiry: integration?.expiry?.toISOString() ?? null
      }
    });
  } catch (error) {
    if (isMissingDatabaseRelationError(error)) {
      return apiError(
        "Your database tables are not set up yet. Run your database migrations, then try again.",
        503
      );
    }

    return apiError(error instanceof Error ? error.message : "Failed to load integration.", 500);
  }
}

export async function DELETE() {
  const { userId } = await auth();

  if (!userId) {
    return apiError("Unauthorized.", 401);
  }

  try {
    await ensureDatabaseReady();
    const user = await syncCurrentUserToDatabase(userId);
    await deleteUserIntegration(user.id, provider);

    return apiSuccess({
      success: true
    });
  } catch (error) {
    if (isMissingDatabaseRelationError(error)) {
      return apiError(
        "Your database tables are not set up yet. Run your database migrations, then try again.",
        503
      );
    }

    return apiError(error instanceof Error ? error.message : "Failed to disconnect Google.", 500);
  }
}
