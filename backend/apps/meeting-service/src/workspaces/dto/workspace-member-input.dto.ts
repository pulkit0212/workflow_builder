import { IsEnum, IsNotEmpty, IsString } from "class-validator";
import { WorkspaceRole } from "../workspace-role.enum";

export class WorkspaceMemberInputDto {
  @IsString()
  @IsNotEmpty()
  userId!: string;

  @IsEnum(WorkspaceRole)
  role!: WorkspaceRole;
}
