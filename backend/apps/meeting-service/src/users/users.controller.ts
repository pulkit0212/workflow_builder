import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator";
import { RequestUser } from "../auth/request-user.interface";
import { UserContextGuard } from "../auth/user-context.guard";
import { UsersService } from "./users.service";

@UseGuards(UserContextGuard)
@Controller("users")
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get("search")
  searchUsers(
    @CurrentUser() user: RequestUser,
    @Query("q") query = "",
  ) {
    return this.usersService.searchUsers(query, [user.id]);
  }
}
