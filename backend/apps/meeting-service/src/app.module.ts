import { Module } from "@nestjs/common";
import { HealthController } from "./health/health.controller";
import { MeetingsModule } from "./meetings/meetings.module";
import { PrismaModule } from "./prisma/prisma.module";
import { UsersModule } from "./users/users.module";
import { WorkspacesModule } from "./workspaces/workspaces.module";

@Module({
  imports: [PrismaModule, UsersModule, WorkspacesModule, MeetingsModule],
  controllers: [HealthController],
})
export class AppModule {}
