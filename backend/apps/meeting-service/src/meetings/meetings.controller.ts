import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator";
import { RequestUser } from "../auth/request-user.interface";
import { UserContextGuard } from "../auth/user-context.guard";
import { CreateMeetingDto } from "./dto/create-meeting.dto";
import { MoveMeetingToWorkspaceDto } from "./dto/move-meeting-to-workspace.dto";
import { MeetingsService } from "./meetings.service";
import { UseMeetingAccess } from "./meeting-access.decorator";

@UseGuards(UserContextGuard)
@Controller()
export class MeetingsController {
  constructor(private readonly meetingsService: MeetingsService) {}

  @Post("meetings")
  createPersonalMeeting(
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateMeetingDto,
  ) {
    return this.meetingsService.createPersonalMeeting(user.id, dto);
  }

  @Post("workspaces/:workspaceId/meetings")
  async createWorkspaceMeeting(
    @CurrentUser() user: RequestUser,
    @Param("workspaceId", new ParseUUIDPipe()) workspaceId: string,
    @Body() dto: CreateMeetingDto,
  ) {
    return this.meetingsService.createWorkspaceMeeting(user.id, workspaceId, dto);
  }

  @Get("meetings")
  listMeetings(@CurrentUser() user: RequestUser) {
    return this.meetingsService.listAccessibleMeetings(user.id);
  }

  @Patch("meetings/:id/move-to-workspace")
  @UseMeetingAccess("id")
  moveMeetingToWorkspace(
    @CurrentUser() user: RequestUser,
    @Param("id", new ParseUUIDPipe()) meetingId: string,
    @Body() dto: MoveMeetingToWorkspaceDto,
  ) {
    return this.meetingsService.movePersonalMeetingToWorkspace(
      user.id,
      meetingId,
      dto,
    );
  }
}
