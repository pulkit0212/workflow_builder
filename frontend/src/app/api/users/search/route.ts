import { auth } from "@clerk/nextjs/server";
import { apiError, apiSuccess } from "@/lib/api-responses";
import { ensureDatabaseReady } from "@/lib/db/bootstrap";
import { syncCurrentUserToDatabase } from "@/lib/auth/current-user";
import { searchUsers } from "@/lib/db/queries/users";

export async function GET(request: Request) {
  const { userId } = await auth();

  if (!userId) {
    return apiError("Unauthorized.", 401);
  }

  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim() ?? "";

  if (query.length < 2) {
    return apiSuccess({
      success: true,
      users: []
    });
  }

  try {
    await ensureDatabaseReady();
    const user = await syncCurrentUserToDatabase(userId);
    const users = await searchUsers(query, {
      excludeUserIds: [user.id]
    });

    return apiSuccess({
      success: true,
      users
    });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "Failed to search users.", 500);
  }
}
