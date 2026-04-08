import { IsEnum } from "class-validator";
import { WorkspaceRole } from "../workspace-role.enum";

export class UpdateWorkspaceMemberDto {
  @IsEnum(WorkspaceRole)
  role!: WorkspaceRole;
}
