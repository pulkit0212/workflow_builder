import { Module } from "@nestjs/common";
import { UserContextGuard } from "../auth/user-context.guard";
import { WorkspacesController } from "./workspaces.controller";
import { WorkspacesService } from "./workspaces.service";

@Module({
  controllers: [WorkspacesController],
  providers: [WorkspacesService, UserContextGuard],
  exports: [WorkspacesService],
})
export class WorkspacesModule {}
