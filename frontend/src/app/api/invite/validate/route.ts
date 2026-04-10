import { eq } from "drizzle-orm";
import { apiError, apiSuccess } from "@/lib/api-responses";
import { ensureDatabaseReady } from "@/lib/db/bootstrap";
import { db } from "@/lib/db/client";
import { users, workspaceInvites, workspaces } from "@/db/schema";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token");

  if (!token) {
    return apiError("Token is required.", 400, { code: "token_not_found" });
  }

  try {
    await ensureDatabaseReady();
    const database = db!;

    const [invite] = await database
      .select({
        id: workspaceInvites.id,
        workspaceId: workspaceInvites.workspaceId,
        invitedEmail: workspaceInvites.invitedEmail,
        status: workspaceInvites.status,
        expiresAt: workspaceInvites.expiresAt,
        invitedBy: workspaceInvites.invitedBy
      })
      .from(workspaceInvites)
      .where(eq(workspaceInvites.token, token))
      .limit(1);

    if (!invite) {
      return apiError("Invite not found.", 404, { code: "token_not_found" });
    }

    // Check expiry before status (order: existence → expiry → status)
    if (invite.expiresAt < new Date()) {
      return apiError("This invite has expired.", 410, { code: "token_expired" });
    }

    if (invite.status === "accepted") {
      return apiError("This invite has already been used.", 410, { code: "token_already_used" });
    }

    if (invite.status === "revoked") {
      return apiError("This invite has been revoked.", 410, { code: "token_revoked" });
    }

    // Fetch workspace name and inviter name
    const [workspace] = await database
      .select({ name: workspaces.name })
      .from(workspaces)
      .where(eq(workspaces.id, invite.workspaceId))
      .limit(1);

    const [inviter] = await database
      .select({ fullName: users.fullName, email: users.email })
      .from(users)
      .where(eq(users.id, invite.invitedBy))
      .limit(1);

    return apiSuccess({
      workspaceId: invite.workspaceId,
      workspaceName: workspace?.name ?? "Unknown Workspace",
      invitedEmail: invite.invitedEmail,
      inviterName: inviter?.fullName ?? inviter?.email ?? "Someone"
    });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "Failed to validate invite.", 500);
  }
}
