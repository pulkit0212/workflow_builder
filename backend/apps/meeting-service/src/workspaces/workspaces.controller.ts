import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator";
import { RequestUser } from "../auth/request-user.interface";
import { UserContextGuard } from "../auth/user-context.guard";
import { AddWorkspaceMemberDto } from "./dto/add-workspace-member.dto";
import { AcceptJoinRequestDto } from "./dto/accept-join-request.dto";
import { CreateWorkspaceDto } from "./dto/create-workspace.dto";
import { UpdateWorkspaceMemberDto } from "./dto/update-workspace-member.dto";
import { WorkspacesService } from "./workspaces.service";

@UseGuards(UserContextGuard)
@Controller("workspaces")
export class WorkspacesController {
  constructor(private readonly workspacesService: WorkspacesService) {}

  @Post()
  createWorkspace(
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateWorkspaceDto,
  ) {
    return this.workspacesService.createWorkspace(user.id, dto);
  }

  @Get()
  listWorkspaces(@CurrentUser() user: RequestUser) {
    return this.workspacesService.listUserWorkspaces(user.id);
  }

  @Get("search")
  searchWorkspaces(
    @CurrentUser() user: RequestUser,
    @Query("q") query = "",
  ) {
    return this.workspacesService.searchJoinableWorkspaces(user.id, query);
  }

  @Get(":id")
  getWorkspaceDetails(
    @CurrentUser() user: RequestUser,
    @Param("id", new ParseUUIDPipe()) workspaceId: string,
  ) {
    return this.workspacesService.getWorkspaceDetails(user.id, workspaceId);
  }

  @Post(":id/members")
  addMember(
    @CurrentUser() user: RequestUser,
    @Param("id", new ParseUUIDPipe()) workspaceId: string,
    @Body() dto: AddWorkspaceMemberDto,
  ) {
    return this.workspacesService.addMember(user.id, workspaceId, dto);
  }

  @Get(":id/members")
  listMembers(
    @CurrentUser() user: RequestUser,
    @Param("id", new ParseUUIDPipe()) workspaceId: string,
  ) {
    return this.workspacesService.listMembers(user.id, workspaceId);
  }

  @Patch(":id/members/:memberId")
  updateMember(
    @CurrentUser() user: RequestUser,
    @Param("id", new ParseUUIDPipe()) workspaceId: string,
    @Param("memberId", new ParseUUIDPipe()) memberId: string,
    @Body() dto: UpdateWorkspaceMemberDto,
  ) {
    return this.workspacesService.updateMember(
      user.id,
      workspaceId,
      memberId,
      dto,
    );
  }

  @Delete(":id/members/:memberId")
  removeMember(
    @CurrentUser() user: RequestUser,
    @Param("id", new ParseUUIDPipe()) workspaceId: string,
    @Param("memberId", new ParseUUIDPipe()) memberId: string,
  ) {
    return this.workspacesService.removeMember(user.id, workspaceId, memberId);
  }

  @Post(":id/request-join")
  requestJoin(
    @CurrentUser() user: RequestUser,
    @Param("id", new ParseUUIDPipe()) workspaceId: string,
  ) {
    return this.workspacesService.requestJoin(user.id, workspaceId);
  }

  @Get(":id/join-requests")
  listJoinRequests(
    @CurrentUser() user: RequestUser,
    @Param("id", new ParseUUIDPipe()) workspaceId: string,
  ) {
    return this.workspacesService.listJoinRequests(user.id, workspaceId);
  }

  @Post(":id/join-requests/:requestId/accept")
  acceptJoinRequest(
    @CurrentUser() user: RequestUser,
    @Param("id", new ParseUUIDPipe()) workspaceId: string,
    @Param("requestId", new ParseUUIDPipe()) requestId: string,
    @Body() dto: AcceptJoinRequestDto,
  ) {
    return this.workspacesService.acceptJoinRequest(
      user.id,
      workspaceId,
      requestId,
      dto,
    );
  }

  @Post(":id/join-requests/:requestId/reject")
  rejectJoinRequest(
    @CurrentUser() user: RequestUser,
    @Param("id", new ParseUUIDPipe()) workspaceId: string,
    @Param("requestId", new ParseUUIDPipe()) requestId: string,
  ) {
    return this.workspacesService.rejectJoinRequest(
      user.id,
      workspaceId,
      requestId,
    );
  }
}
