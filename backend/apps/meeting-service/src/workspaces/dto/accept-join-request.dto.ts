import { IsEnum } from "class-validator";
import { WorkspaceRole } from "../workspace-role.enum";

export class AcceptJoinRequestDto {
  @IsEnum(WorkspaceRole)
  role!: WorkspaceRole;
}
