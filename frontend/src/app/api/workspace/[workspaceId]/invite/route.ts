import { auth } from "@clerk/nextjs/server";
import { and, eq, gt } from "drizzle-orm";
import { z } from "zod";
import { apiError, apiSuccess } from "@/lib/api-responses";
import { ensureDatabaseReady } from "@/lib/db/bootstrap";
import { syncCurrentUserToDatabase } from "@/lib/auth/current-user";
import { db } from "@/lib/db/client";
import { workspaceInvites, workspaceMembers, workspaces } from "@/db/schema";
import { generateInviteToken, getInviteExpiresAt } from "@/lib/invites/token";
import { sendInviteEmail } from "@/lib/invites/email";

const inviteBodySchema = z.object({
  email: z.string().email({ message: "invalid_email" })
});

async function getCallerMembership(database: NonNullable<typeof db>, workspaceId: string, userId: string) {
  const [membership] = await database
    .select()
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.userId, userId),
        eq(workspaceMembers.status, "active")
      )
    )
    .limit(1);
  return membership ?? null;
}

// GET /api/workspace/[workspaceId]/invite — list pending invites
export async function GET(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  const { userId } = await auth();
  if (!userId) return apiError("Unauthorized.", 401);

  const { workspaceId } = await params;

  try {
    await ensureDatabaseReady();
    const database = db!;
    const user = await syncCurrentUserToDatabase(userId);

    const membership = await getCallerMembership(database, workspaceId, user.id);
    if (!membership || !["owner", "admin"].includes(membership.role)) {
      return apiError("Forbidden.", 403);
    }

    const now = new Date();
    const invites = await database
      .select({
        id: workspaceInvites.id,
        invitedEmail: workspaceInvites.invitedEmail,
        createdAt: workspaceInvites.createdAt,
        expiresAt: workspaceInvites.expiresAt
      })
      .from(workspaceInvites)
      .where(
        and(
          eq(workspaceInvites.workspaceId, workspaceId),
          eq(workspaceInvites.status, "pending"),
          gt(workspaceInvites.expiresAt, now)
        )
      );

    return apiSuccess({
      invites: invites.map((inv) => ({
        ...inv,
        createdAt: inv.createdAt.toISOString(),
        expiresAt: inv.expiresAt.toISOString()
      }))
    });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "Failed to list invites.", 500);
  }
}

// POST /api/workspace/[workspaceId]/invite — send invite
export async function POST(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  const { userId } = await auth();
  if (!userId) return apiError("Unauthorized.", 401);

  const { workspaceId } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("Request body must be valid JSON.", 400);
  }

  const parsed = inviteBodySchema.safeParse(body);
  if (!parsed.success) {
    return apiError("invalid_email", 400, { code: "invalid_email" });
  }

  const { email } = parsed.data;

  try {
    await ensureDatabaseReady();
    const database = db!;
    const user = await syncCurrentUserToDatabase(userId);

    const membership = await getCallerMembership(database, workspaceId, user.id);
    if (!membership || membership.role !== "admin") {
      return apiError("Forbidden.", 403);
    }

    // Check duplicate pending invite
    const [existingInvite] = await database
      .select({ id: workspaceInvites.id })
      .from(workspaceInvites)
      .where(
        and(
          eq(workspaceInvites.workspaceId, workspaceId),
          eq(workspaceInvites.invitedEmail, email),
          eq(workspaceInvites.status, "pending")
        )
      )
      .limit(1);

    if (existingInvite) {
      return apiError("An invite is already pending for this email.", 409, { code: "invite_already_pending" });
    }

    // Check already a member
    const { users: usersTable } = await import("@/db/schema");
    const [existingMember] = await database
      .select({ id: workspaceMembers.id })
      .from(workspaceMembers)
      .innerJoin(usersTable, eq(usersTable.id, workspaceMembers.userId))
      .where(
        and(
          eq(workspaceMembers.workspaceId, workspaceId),
          eq(usersTable.email, email),
          eq(workspaceMembers.status, "active")
        )
      )
      .limit(1);

    if (existingMember) {
      return apiError("This user is already a member of the workspace.", 409, { code: "already_a_member" });
    }

    // Get workspace name and inviter name for email
    const [workspace] = await database
      .select({ name: workspaces.name })
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1);

    if (!workspace) {
      return apiError("Workspace not found.", 404);
    }

    const token = generateInviteToken();
    const now = new Date();
    const expiresAt = getInviteExpiresAt(now);

    const [invite] = await database
      .insert(workspaceInvites)
      .values({
        workspaceId,
        invitedEmail: email,
        invitedBy: user.id,
        token,
        status: "pending",
        expiresAt
      })
      .returning({ id: workspaceInvites.id, expiresAt: workspaceInvites.expiresAt });

    if (!invite) {
      return apiError("Failed to create invite.", 500);
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
    const acceptLink = `${appUrl}/invite/${token}`;

    try {
      await sendInviteEmail({
        to: email,
        workspaceName: workspace.name,
        inviterName: user.fullName ?? user.email,
        acceptLink
      });
    } catch {
      // Rollback: delete the invite row
      await database.delete(workspaceInvites).where(eq(workspaceInvites.id, invite.id));
      return apiError("Failed to send invite email.", 502, { code: "email_send_failed" });
    }

    return apiSuccess({ id: invite.id, expiresAt: invite.expiresAt.toISOString() }, 201);
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "Failed to send invite.", 500);
  }
}
