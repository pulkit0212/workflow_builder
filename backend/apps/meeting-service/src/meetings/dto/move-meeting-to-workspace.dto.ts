import { IsUUID } from "class-validator";

export class MoveMeetingToWorkspaceDto {
  @IsUUID()
  workspaceId!: string;
}
