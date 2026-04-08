import { FastifyRequest } from "fastify";

export interface RequestUser {
  id: string;
}

export interface MeetingRecord {
  id: string;
  title: string;
  createdBy: string;
  workspaceId: string | null;
  status: string;
  platform: string;
  createdAt: Date;
}

export type AuthenticatedRequest = FastifyRequest & {
  currentUser?: RequestUser;
  meeting?: MeetingRecord;
};
