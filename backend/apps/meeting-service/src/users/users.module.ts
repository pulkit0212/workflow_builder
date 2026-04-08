import { Module } from "@nestjs/common";
import { UserContextGuard } from "../auth/user-context.guard";
import { UsersController } from "./users.controller";
import { UsersService } from "./users.service";

@Module({
  controllers: [UsersController],
  providers: [UsersService, UserContextGuard],
  exports: [UsersService],
})
export class UsersModule {}
