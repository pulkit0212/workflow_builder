import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AddWorkspaceMemberDto } from "./dto/add-workspace-member.dto";
import { AcceptJoinRequestDto } from "./dto/accept-join-request.dto";
import { CreateWorkspaceDto } from "./dto/create-workspace.dto";
import { UpdateWorkspaceMemberDto } from "./dto/update-workspace-member.dto";
import { WorkspaceJoinRequestStatus } from "./workspace-join-request-status.enum";
import { WorkspaceMemberStatus } from "./workspace-member-status.enum";
import { WorkspaceRole } from "./workspace-role.enum";

type SearchableWorkspace = {
  id: string;
  name: string;
  ownerId: string;
  createdAt: Date;
  memberCount: bigint | number;
  hasPendingRequest: boolean;
};

type WorkspaceMembershipSummary = {
  role: WorkspaceRole;
  workspace: {
    id: string;
    name: string;
    ownerId: string;
    createdAt: Date;
    _count: {
      members: number;
      meetings: number;
    };
  };
};

type WorkspaceMemberRecord = {
  id: string;
  workspaceId: string;
  userId: string;
  role: WorkspaceRole;
  status: WorkspaceMemberStatus;
  createdAt: Date;
};

@Injectable()
export class WorkspacesService {
  constructor(private readonly prisma: PrismaService) {}

  async createWorkspace(ownerId: string, dto: CreateWorkspaceDto) {
    const uniqueMembers = this.normalizeMembers(dto.members ?? [], ownerId);

    return this.prisma.workspace.create({
      data: {
        name: dto.name,
        ownerId,
        members: {
          create: [
            {
              userId: ownerId,
              role: WorkspaceRole.OWNER,
              status: WorkspaceMemberStatus.ACTIVE,
            },
            ...uniqueMembers.map((member) => ({
              userId: member.userId,
              role: member.role,
              status: WorkspaceMemberStatus.ACTIVE,
            })),
          ],
        },
      },
      include: {
        members: {
          orderBy: {
            createdAt: "asc",
          },
        },
      },
    });
  }

  async listUserWorkspaces(userId: string) {
    const memberships = await this.prisma.workspaceMember.findMany({
      where: {
        userId,
        status: WorkspaceMemberStatus.ACTIVE,
      },
      include: {
        workspace: {
          include: {
            _count: {
              select: {
                members: {
                  where: {
                    status: WorkspaceMemberStatus.ACTIVE,
                  },
                },
                meetings: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    return (memberships as WorkspaceMembershipSummary[]).map((membership) => ({
      id: membership.workspace.id,
      name: membership.workspace.name,
      ownerId: membership.workspace.ownerId,
      createdAt: membership.workspace.createdAt,
      role: membership.role,
      memberCount: membership.workspace._count.members,
      meetingCount: membership.workspace._count.meetings,
    }));
  }

  async getWorkspaceDetails(userId: string, workspaceId: string) {
    const actorMembership = await this.ensureMember(userId, workspaceId);
    const canReviewJoinRequests = this.canManageWorkspace(actorMembership.role);

    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      include: {
        members: {
          where: {
            status: {
              in: [WorkspaceMemberStatus.ACTIVE, WorkspaceMemberStatus.PENDING],
            },
          },
          orderBy: {
            createdAt: "asc",
          },
        },
        meetings: {
          orderBy: {
            createdAt: "desc",
          },
        },
        joinRequests: canReviewJoinRequests
          ? {
              where: {
                status: WorkspaceJoinRequestStatus.PENDING,
              },
              orderBy: {
                createdAt: "asc",
              },
            }
          : false,
      },
    });

    if (!workspace) {
      throw new NotFoundException(`Workspace ${workspaceId} not found`);
    }

    return {
      ...workspace,
      joinRequests: Array.isArray(workspace.joinRequests)
        ? workspace.joinRequests
        : [],
    };
  }

  async addMember(
    actorUserId: string,
    workspaceId: string,
    dto: AddWorkspaceMemberDto,
  ) {
    this.assertManageableRole(dto.role);
    const actorMembership = await this.ensureAdmin(actorUserId, workspaceId);

    if (dto.userId === actorUserId) {
      throw new BadRequestException("You are already part of this workspace");
    }

    const existingMembership = await this.prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId,
          userId: dto.userId,
        },
      },
    });

    if (
      existingMembership &&
      existingMembership.status !== WorkspaceMemberStatus.REMOVED
    ) {
      throw new ConflictException("User is already a workspace member");
    }

    if (
      actorMembership.role === WorkspaceRole.ADMIN &&
      dto.role === WorkspaceRole.ADMIN
    ) {
      throw new ForbiddenException("Admins cannot promote other admins");
    }

    const member = existingMembership
      ? await this.prisma.workspaceMember.update({
          where: { id: existingMembership.id },
          data: {
            role: dto.role,
            status: WorkspaceMemberStatus.ACTIVE,
          },
        })
      : await this.prisma.workspaceMember.create({
          data: {
            workspaceId,
            userId: dto.userId,
            role: dto.role,
            status: WorkspaceMemberStatus.ACTIVE,
          },
        });

    await this.prisma.workspaceJoinRequest.updateMany({
      where: {
        workspaceId,
        userId: dto.userId,
        status: WorkspaceJoinRequestStatus.PENDING,
      },
      data: {
        status: WorkspaceJoinRequestStatus.ACCEPTED,
      },
    });

    return member;
  }

  async listMembers(userId: string, workspaceId: string) {
    await this.ensureMember(userId, workspaceId);

    return this.prisma.workspaceMember.findMany({
      where: {
        workspaceId,
        status: {
          in: [WorkspaceMemberStatus.ACTIVE, WorkspaceMemberStatus.PENDING],
        },
      },
      orderBy: {
        createdAt: "asc",
      },
    });
  }

  async updateMember(
    actorUserId: string,
    workspaceId: string,
    memberId: string,
    dto: UpdateWorkspaceMemberDto,
  ) {
    this.assertManageableRole(dto.role);
    const actorMembership = await this.ensureAdmin(actorUserId, workspaceId);
    const member = await this.getWorkspaceMemberOrThrow(workspaceId, memberId);

    this.ensureManageableMember(actorMembership, member);

    if (
      actorMembership.role === WorkspaceRole.ADMIN &&
      dto.role === WorkspaceRole.ADMIN
    ) {
      throw new ForbiddenException("Admins cannot promote other admins");
    }

    return this.prisma.workspaceMember.update({
      where: { id: memberId },
      data: {
        role: dto.role,
      },
    });
  }

  async removeMember(actorUserId: string, workspaceId: string, memberId: string) {
    const actorMembership = await this.ensureAdmin(actorUserId, workspaceId);
    const member = await this.getWorkspaceMemberOrThrow(workspaceId, memberId);

    if (member.userId === actorUserId) {
      throw new BadRequestException("You cannot remove yourself from the workspace");
    }

    this.ensureManageableMember(actorMembership, member);

    return this.prisma.workspaceMember.update({
      where: { id: memberId },
      data: {
        status: WorkspaceMemberStatus.REMOVED,
      },
    });
  }

  async searchJoinableWorkspaces(userId: string, query: string) {
    const normalizedQuery = query.trim();

    if (!normalizedQuery) {
      return [];
    }

    const pattern = `%${normalizedQuery}%`;

    const results = (await this.prisma.$queryRawUnsafe(
      `
        SELECT
          w.id::text AS id,
          w.name,
          w.owner_id AS "ownerId",
          w.created_at AS "createdAt",
          COUNT(DISTINCT wm.id) FILTER (WHERE wm.status = 'active') AS "memberCount",
          EXISTS (
            SELECT 1
            FROM workspace_join_requests wjr
            WHERE wjr.workspace_id = w.id
              AND wjr.user_id = $2
              AND wjr.status = 'pending'
          ) AS "hasPendingRequest"
        FROM workspace w
        LEFT JOIN workspace_members wm
          ON wm.workspace_id = w.id
        WHERE w.name ILIKE $1
          AND NOT EXISTS (
            SELECT 1
            FROM workspace_members existing_member
            WHERE existing_member.workspace_id = w.id
              AND existing_member.user_id = $2
              AND existing_member.status = 'active'
          )
        GROUP BY w.id
        ORDER BY w.name ASC
        LIMIT 10
      `,
      pattern,
      userId,
    )) as SearchableWorkspace[];

    return results.map((workspace: SearchableWorkspace) => ({
      ...workspace,
      memberCount: Number(workspace.memberCount),
    }));
  }

  async requestJoin(userId: string, workspaceId: string) {
    await this.getWorkspaceOrThrow(workspaceId);

    const activeMembership = await this.prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId,
          userId,
        },
      },
    });

    if (activeMembership?.status === WorkspaceMemberStatus.ACTIVE) {
      throw new ConflictException("You are already a member of this workspace");
    }

    const pendingRequest = await this.prisma.workspaceJoinRequest.findFirst({
      where: {
        workspaceId,
        userId,
        status: WorkspaceJoinRequestStatus.PENDING,
      },
    });

    if (pendingRequest) {
      return pendingRequest;
    }

    return this.prisma.workspaceJoinRequest.create({
      data: {
        workspaceId,
        userId,
        status: WorkspaceJoinRequestStatus.PENDING,
      },
    });
  }

  async listJoinRequests(userId: string, workspaceId: string) {
    await this.ensureAdmin(userId, workspaceId);

    return this.prisma.workspaceJoinRequest.findMany({
      where: {
        workspaceId,
        status: WorkspaceJoinRequestStatus.PENDING,
      },
      orderBy: {
        createdAt: "asc",
      },
    });
  }

  async acceptJoinRequest(
    actorUserId: string,
    workspaceId: string,
    requestId: string,
    dto: AcceptJoinRequestDto,
  ) {
    this.assertManageableRole(dto.role);
    const actorMembership = await this.ensureAdmin(actorUserId, workspaceId);
    const joinRequest = await this.getJoinRequestOrThrow(workspaceId, requestId);

    if (
      actorMembership.role === WorkspaceRole.ADMIN &&
      dto.role === WorkspaceRole.ADMIN
    ) {
      throw new ForbiddenException("Admins cannot grant admin access");
    }

    return this.prisma.$transaction(async (tx: PrismaService) => {
      const existingMembership = await tx.workspaceMember.findUnique({
        where: {
          workspaceId_userId: {
            workspaceId,
            userId: joinRequest.userId,
          },
        },
      });

      if (existingMembership) {
        await tx.workspaceMember.update({
          where: { id: existingMembership.id },
          data: {
            role: dto.role,
            status: WorkspaceMemberStatus.ACTIVE,
          },
        });
      } else {
        await tx.workspaceMember.create({
          data: {
            workspaceId,
            userId: joinRequest.userId,
            role: dto.role,
            status: WorkspaceMemberStatus.ACTIVE,
          },
        });
      }

      return tx.workspaceJoinRequest.update({
        where: { id: requestId },
        data: {
          status: WorkspaceJoinRequestStatus.ACCEPTED,
        },
      });
    });
  }

  async rejectJoinRequest(actorUserId: string, workspaceId: string, requestId: string) {
    await this.ensureAdmin(actorUserId, workspaceId);
    await this.getJoinRequestOrThrow(workspaceId, requestId);

    return this.prisma.workspaceJoinRequest.update({
      where: { id: requestId },
      data: {
        status: WorkspaceJoinRequestStatus.REJECTED,
      },
    });
  }

  async ensureMember(userId: string, workspaceId: string) {
    await this.getWorkspaceOrThrow(workspaceId);

    const membership = await this.prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId,
          userId,
        },
      },
    });

    if (!membership || membership.status !== WorkspaceMemberStatus.ACTIVE) {
      throw new ForbiddenException(
        `User ${userId} does not have access to workspace ${workspaceId}`,
      );
    }

    return membership;
  }

  async ensureAdmin(userId: string, workspaceId: string) {
    const membership = await this.ensureMember(userId, workspaceId);

    if (!this.canManageWorkspace(membership.role)) {
      throw new ForbiddenException(
        `User ${userId} cannot manage workspace ${workspaceId}`,
      );
    }

    return membership;
  }

  private normalizeMembers(
    members: Array<{ userId: string; role: WorkspaceRole }>,
    ownerId: string,
  ) {
    const seen = new Set<string>();

    return members.map((member) => {
      this.assertManageableRole(member.role);

      if (member.userId === ownerId) {
        throw new BadRequestException("Workspace owner should not be re-added");
      }

      if (seen.has(member.userId)) {
        throw new BadRequestException("Duplicate workspace members are not allowed");
      }

      seen.add(member.userId);
      return member;
    });
  }

  private assertManageableRole(role: WorkspaceRole) {
    if (role === WorkspaceRole.OWNER) {
      throw new BadRequestException(
        "Owner role can only be assigned to the workspace creator",
      );
    }
  }

  private canManageWorkspace(role: WorkspaceRole) {
    return role === WorkspaceRole.OWNER || role === WorkspaceRole.ADMIN;
  }

  private ensureManageableMember(
    actorMembership: WorkspaceMemberRecord,
    targetMembership: WorkspaceMemberRecord,
  ) {
    if (targetMembership.status !== WorkspaceMemberStatus.ACTIVE) {
      throw new BadRequestException("Only active members can be managed");
    }

    if (targetMembership.role === WorkspaceRole.OWNER) {
      throw new ForbiddenException("Workspace owner cannot be modified");
    }

    if (
      actorMembership.role === WorkspaceRole.ADMIN &&
      [WorkspaceRole.ADMIN, WorkspaceRole.OWNER].includes(targetMembership.role)
    ) {
      throw new ForbiddenException("Admins can only manage members and viewers");
    }
  }

  private async getWorkspaceOrThrow(workspaceId: string) {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { id: true },
    });

    if (!workspace) {
      throw new NotFoundException(`Workspace ${workspaceId} not found`);
    }

    return workspace;
  }

  private async getWorkspaceMemberOrThrow(workspaceId: string, memberId: string) {
    const member = await this.prisma.workspaceMember.findFirst({
      where: {
        id: memberId,
        workspaceId,
      },
    });

    if (!member) {
      throw new NotFoundException(`Workspace member ${memberId} not found`);
    }

    return member;
  }

  private async getJoinRequestOrThrow(workspaceId: string, requestId: string) {
    const request = await this.prisma.workspaceJoinRequest.findFirst({
      where: {
        id: requestId,
        workspaceId,
      },
    });

    if (!request) {
      throw new NotFoundException(`Join request ${requestId} not found`);
    }

    if (request.status !== WorkspaceJoinRequestStatus.PENDING) {
      throw new BadRequestException("Join request is already resolved");
    }

    return request;
  }
}
