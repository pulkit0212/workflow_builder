import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { WorkspacesService } from "../workspaces/workspaces.service";
import { CreateMeetingDto } from "./dto/create-meeting.dto";
import { MoveMeetingToWorkspaceDto } from "./dto/move-meeting-to-workspace.dto";

@Injectable()
export class MeetingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspacesService: WorkspacesService,
  ) {}

  async createPersonalMeeting(userId: string, dto: CreateMeetingDto) {
    return this.prisma.meeting.create({
      data: {
        title: dto.title,
        createdBy: userId,
        workspaceId: null,
        status: dto.status ?? "scheduled",
        platform: dto.platform ?? "manual",
      },
    });
  }

  async createWorkspaceMeeting(
    userId: string,
    workspaceId: string,
    dto: CreateMeetingDto,
  ) {
    await this.workspacesService.ensureMember(userId, workspaceId);

    return this.prisma.meeting.create({
      data: {
        title: dto.title,
        createdBy: userId,
        workspaceId,
        status: dto.status ?? "scheduled",
        platform: dto.platform ?? "manual",
      },
    });
  }

  async listAccessibleMeetings(userId: string) {
    return this.prisma.meeting.findMany({
      where: {
        OR: [
          {
            createdBy: userId,
            workspaceId: null,
          },
          {
            workspace: {
              members: {
                some: {
                  userId,
                },
              },
            },
          },
        ],
      },
      include: {
        workspace: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });
  }

  async movePersonalMeetingToWorkspace(
    userId: string,
    meetingId: string,
    dto: MoveMeetingToWorkspaceDto,
  ) {
    const meeting = await this.getMeetingOrThrow(meetingId);

    if (meeting.workspaceId) {
      throw new BadRequestException(
        `Meeting ${meetingId} already belongs to a workspace`,
      );
    }

    if (meeting.createdBy !== userId) {
      throw new BadRequestException(
        `Only the creator can move meeting ${meetingId} into a workspace`,
      );
    }

    await this.workspacesService.ensureMember(userId, dto.workspaceId);

    return this.prisma.meeting.update({
      where: { id: meetingId },
      data: {
        workspaceId: dto.workspaceId,
      },
    });
  }

  async getMeetingOrThrow(meetingId: string) {
    const meeting = await this.prisma.meeting.findUnique({
      where: { id: meetingId },
    });

    if (!meeting) {
      throw new NotFoundException(`Meeting ${meetingId} not found`);
    }

    return meeting;
  }
}
