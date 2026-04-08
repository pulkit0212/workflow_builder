import { Module } from "@nestjs/common";
import { UserContextGuard } from "../auth/user-context.guard";
import { MeetingsController } from "./meetings.controller";
import { MeetingAccessGuard } from "./meeting-access.guard";
import { MeetingAccessService } from "./meeting-access.service";
import { MeetingsService } from "./meetings.service";
import { WorkspacesModule } from "../workspaces/workspaces.module";

@Module({
  imports: [WorkspacesModule],
  controllers: [MeetingsController],
  providers: [
    MeetingsService,
    MeetingAccessService,
    MeetingAccessGuard,
    UserContextGuard,
  ],
  exports: [MeetingsService, MeetingAccessService],
})
export class MeetingsModule {}
