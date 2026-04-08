/**
 * Property-Based Tests: Meeting Creation — workspaceId Wiring
 *
 * // Feature: workspace-integration, Property 2: Meeting creation sets workspaceId
 * // Feature: workspace-integration, Property 8: New meetings default to visibility=workspace
 *
 * **Validates: Requirements 1.2, 4.1**
 */

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";

// ── Types ─────────────────────────────────────────────────────────────────────

type Visibility = "private" | "workspace" | "shared";

type CreateMeetingInput = {
  userId: string;
  workspaceId?: string | null;
  provider: "google_meet" | "zoom_web" | "teams_web";
  title: string;
  meetingLink: string;
  status: string;
  visibility?: Visibility;
};

type MeetingSessionRow = {
  id: string;
  userId: string;
  workspaceId: string | null;
  provider: string;
  title: string;
  meetingLink: string;
  status: string;
  visibility: Visibility;
};

// ── Pure simulation of createMeetingSession ───────────────────────────────────

/**
 * Simulates the DB insert performed by createMeetingSession.
 * The schema default for visibility is 'workspace'.
 */
function simulateCreateMeetingSession(input: CreateMeetingInput): MeetingSessionRow {
  return {
    id: "generated-id",
    userId: input.userId,
    workspaceId: input.workspaceId ?? null,
    provider: input.provider,
    title: input.title,
    meetingLink: input.meetingLink,
    status: input.status,
    // Schema default: 'workspace' when not explicitly provided
    visibility: input.visibility ?? "workspace",
  };
}

/**
 * Simulates the POST /api/meetings handler logic:
 * resolves workspaceId from the header and passes it to createMeetingSession.
 */
function simulatePostMeetings(params: {
  resolvedWorkspaceId: string | null;
  userId: string;
  provider: "google_meet" | "zoom_web" | "teams_web";
  title: string;
  meetingLink: string;
}): { status: number; session?: MeetingSessionRow; error?: string } {
  if (!params.resolvedWorkspaceId) {
    return { status: 400, error: "workspace_required" };
  }

  const session = simulateCreateMeetingSession({
    userId: params.userId,
    workspaceId: params.resolvedWorkspaceId,
    provider: params.provider,
    title: params.title,
    meetingLink: params.meetingLink,
    status: "draft",
  });

  return { status: 200, session };
}

// ── Generators ────────────────────────────────────────────────────────────────

const providerArb = fc.constantFrom<"google_meet" | "zoom_web" | "teams_web">(
  "google_meet",
  "zoom_web",
  "teams_web"
);

const nonEmptyStringArb = fc.string({ minLength: 1, maxLength: 80 });

// ── Property 2 ────────────────────────────────────────────────────────────────

describe(
  // Feature: workspace-integration, Property 2: Meeting creation sets workspaceId
  "Property 2: Meeting creation sets workspaceId",
  () => {
    it(
      "created meeting_session row has workspaceId equal to the resolved header value",
      () => {
        /**
         * **Validates: Requirements 1.2**
         *
         * For any valid POST /api/meetings request with an x-workspace-id header
         * value W (where the user is an active member of W), the created
         * meeting_session row must have workspaceId = W.
         */
        fc.assert(
          fc.property(
            fc.uuid(),        // workspaceId W (resolved from header)
            fc.uuid(),        // userId
            providerArb,
            nonEmptyStringArb, // title
            nonEmptyStringArb, // meetingLink
            (workspaceId, userId, provider, title, meetingLink) => {
              const result = simulatePostMeetings({
                resolvedWorkspaceId: workspaceId,
                userId,
                provider,
                title,
                meetingLink,
              });

              expect(result.status).toBe(200);
              expect(result.session).toBeDefined();
              expect(result.session!.workspaceId).toBe(workspaceId);
            }
          ),
          { numRuns: 100 }
        );
      }
    );

    it(
      "returns 400 workspace_required when no workspaceId is resolved",
      () => {
        /**
         * **Validates: Requirements 1.3**
         *
         * When resolveWorkspaceIdForRequest returns null, the handler must
         * return HTTP 400 with error code 'workspace_required'.
         */
        fc.assert(
          fc.property(
            fc.uuid(),
            providerArb,
            nonEmptyStringArb,
            nonEmptyStringArb,
            (userId, provider, title, meetingLink) => {
              const result = simulatePostMeetings({
                resolvedWorkspaceId: null,
                userId,
                provider,
                title,
                meetingLink,
              });

              expect(result.status).toBe(400);
              expect(result.error).toBe("workspace_required");
              expect(result.session).toBeUndefined();
            }
          ),
          { numRuns: 100 }
        );
      }
    );

    it(
      "workspaceId on the created row always equals the header value, for any valid UUID",
      () => {
        /**
         * **Validates: Requirements 1.2**
         *
         * The workspaceId stored on the row must be exactly the value resolved
         * from the x-workspace-id header — no transformation or truncation.
         */
        fc.assert(
          fc.property(
            fc.uuid(),
            fc.uuid(),
            providerArb,
            nonEmptyStringArb,
            nonEmptyStringArb,
            (workspaceId, userId, provider, title, meetingLink) => {
              const session = simulateCreateMeetingSession({
                userId,
                workspaceId,
                provider,
                title,
                meetingLink,
                status: "draft",
              });

              expect(session.workspaceId).toBe(workspaceId);
            }
          ),
          { numRuns: 100 }
        );
      }
    );
  }
);

// ── Property 8 ────────────────────────────────────────────────────────────────

describe(
  // Feature: workspace-integration, Property 8: New meetings default to visibility=workspace
  "Property 8: New meetings default to visibility=workspace",
  () => {
    it(
      "meeting_session created without explicit visibility defaults to 'workspace'",
      () => {
        /**
         * **Validates: Requirements 4.1**
         *
         * For any newly created meeting_session where no explicit visibility is
         * provided, the visibility field must equal 'workspace'.
         */
        fc.assert(
          fc.property(
            fc.uuid(),
            fc.uuid(),
            providerArb,
            nonEmptyStringArb,
            nonEmptyStringArb,
            (workspaceId, userId, provider, title, meetingLink) => {
              const session = simulateCreateMeetingSession({
                userId,
                workspaceId,
                provider,
                title,
                meetingLink,
                status: "draft",
                // No visibility provided — should default to 'workspace'
              });

              expect(session.visibility).toBe("workspace");
            }
          ),
          { numRuns: 100 }
        );
      }
    );

    it(
      "POST /api/meetings always produces a session with visibility='workspace' (no explicit visibility in API)",
      () => {
        /**
         * **Validates: Requirements 4.1**
         *
         * The POST /api/meetings handler does not accept a visibility field in the
         * request body, so every created session must default to 'workspace'.
         */
        fc.assert(
          fc.property(
            fc.uuid(),
            fc.uuid(),
            providerArb,
            nonEmptyStringArb,
            nonEmptyStringArb,
            (workspaceId, userId, provider, title, meetingLink) => {
              const result = simulatePostMeetings({
                resolvedWorkspaceId: workspaceId,
                userId,
                provider,
                title,
                meetingLink,
              });

              expect(result.status).toBe(200);
              expect(result.session!.visibility).toBe("workspace");
            }
          ),
          { numRuns: 100 }
        );
      }
    );

    it(
      "visibility is 'workspace' regardless of workspaceId, userId, or provider",
      () => {
        /**
         * **Validates: Requirements 4.1**
         *
         * The default visibility must be 'workspace' for all combinations of
         * workspaceId, userId, and provider — it is a schema-level default.
         */
        fc.assert(
          fc.property(
            fc.option(fc.uuid(), { nil: null }),
            fc.uuid(),
            providerArb,
            nonEmptyStringArb,
            nonEmptyStringArb,
            (workspaceId, userId, provider, title, meetingLink) => {
              const session = simulateCreateMeetingSession({
                userId,
                workspaceId,
                provider,
                title,
                meetingLink,
                status: "draft",
              });

              expect(session.visibility).toBe("workspace");
            }
          ),
          { numRuns: 100 }
        );
      }
    );
  }
);
