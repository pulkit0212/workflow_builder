import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AuthenticatedRequest } from "../auth/request-user.interface";
import { MeetingsService } from "./meetings.service";
import {
  MEETING_ACCESS_PARAM,
} from "./meeting-access.decorator";
import { MeetingAccessService } from "./meeting-access.service";

@Injectable()
export class MeetingAccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly meetingsService: MeetingsService,
    private readonly meetingAccessService: MeetingAccessService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const userId = request.currentUser?.id;

    if (!userId) {
      throw new ForbiddenException("User context is missing");
    }

    const paramName =
      this.reflector.get<string>(
        MEETING_ACCESS_PARAM,
        context.getHandler(),
      ) ?? "id";
    const params = (request.params ?? {}) as Record<string, string>;
    const meetingId = params[paramName];
    const meeting = await this.meetingsService.getMeetingOrThrow(meetingId);
    const allowed = await this.meetingAccessService.canAccessMeeting(
      userId,
      meeting,
    );

    if (!allowed) {
      throw new ForbiddenException(
        `User ${userId} cannot access meeting ${meetingId}`,
      );
    }

    request.meeting = meeting;
    return true;
  }
}
