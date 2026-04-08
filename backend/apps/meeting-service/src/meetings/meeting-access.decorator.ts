import { applyDecorators, SetMetadata, UseGuards } from "@nestjs/common";
import { MeetingAccessGuard } from "./meeting-access.guard";

export const MEETING_ACCESS_PARAM = "meeting-access-param";

export function UseMeetingAccess(paramName = "id") {
  return applyDecorators(
    SetMetadata(MEETING_ACCESS_PARAM, paramName),
    UseGuards(MeetingAccessGuard),
  );
}
