import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { MeetingRecord } from "../auth/request-user.interface";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class MeetingAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async canAccessMeeting(
    userId: string,
    meeting: MeetingRecord,
  ): Promise<boolean> {
    if (!meeting.workspaceId) {
      return meeting.createdBy === userId;
    }

    const membership = await this.prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId: meeting.workspaceId,
          userId,
        },
      },
    });

    return Boolean(membership);
  }

  async assertCanAccessMeeting(userId: string, meetingId: string) {
    const meeting = await this.prisma.meeting.findUnique({
      where: { id: meetingId },
    });

    if (!meeting) {
      throw new NotFoundException(`Meeting ${meetingId} not found`);
    }

    const allowed = await this.canAccessMeeting(userId, meeting);

    if (!allowed) {
      throw new ForbiddenException(
        `User ${userId} cannot access meeting ${meetingId}`,
      );
    }

    return meeting;
  }
}
