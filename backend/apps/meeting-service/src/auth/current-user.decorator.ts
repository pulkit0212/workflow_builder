import {
  UnauthorizedException,
  createParamDecorator,
  ExecutionContext,
} from "@nestjs/common";
import {
  AuthenticatedRequest,
  RequestUser,
} from "./request-user.interface";

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): RequestUser => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    if (!request.currentUser) {
      throw new UnauthorizedException("User context is missing");
    }

    return request.currentUser;
  },
);
