# Implementation Plan

- [x] 1. Write bug condition exploration test
  - **Property 1: Bug Condition** - Personal Routes Return 400 Without Workspace
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior - it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate the bug exists across all personal routes
  - **Scoped PBT Approach**: Scope the property to concrete failing cases: authenticated user with no workspace membership, no `x-workspace-id` header, calling any personal route
  - Use or extend `frontend/src/__tests__/bug-condition-exploration.test.ts` as the starting point
  - Test cases to cover (call each handler directly with no workspace header, user has no active workspace):
    - `GET /api/meetings` → assert response is 400 `workspace_required`
    - `POST /api/meetings` → assert response is 400 `workspace_required`
    - `GET /api/action-items` → assert response is 400 `workspace_required`
    - `GET /api/meetings/reports` → assert response is 400 `workspace_required`
    - `GET /api/settings/usage` → assert response is 400 `workspace_required`
  - The test assertions match the Expected Behavior Properties from design (HTTP 200, no `workspace_required` error)
  - Run test on UNFIXED code
  - **EXPECTED OUTCOME**: Tests FAIL (this is correct - it proves the bug exists)
  - Document counterexamples found (e.g., `GET /api/meetings` with no header returns 400 `workspace_required` instead of 200)
  - Mark task complete when tests are written, run, and failures are documented
  - _Requirements: 1.1, 1.2, 1.4, 1.11, 1.18_

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Workspace-Scoped Routes Unchanged
  - **IMPORTANT**: Follow observation-first methodology
  - Observe behavior on UNFIXED code for requests that do NOT match the bug condition:
    - `GET /api/workspace/[id]/meetings` with valid membership → observe 200 response
    - `GET /api/workspace/[id]/action-items` with valid membership → observe 200 response
    - `GET /api/workspace/dashboard` with valid `x-workspace-id` header → observe 200 response
    - Personal route with valid `x-workspace-id` header → observe workspace-scoped 200 response
  - Write property-based tests capturing observed behavior patterns from Preservation Requirements:
    - For all valid workspace route requests: response status is 200 and data is workspace-scoped
    - For all personal route requests WITH a valid `x-workspace-id` header: response is 200 and data is workspace-scoped (Requirement 3.9)
    - For all workspace routes: membership validation still rejects unauthorized users with 403/401
  - Property-based testing generates many workspace ID and userId combinations for stronger guarantees
  - Run tests on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (this confirms baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.9, 3.11_

- [x] 3. Fix workspace-required gates across all personal routes

  - [x] 3.1 Fix query layer: make `workspaceId` optional in `meeting-sessions.ts`
    - File: `frontend/src/lib/db/queries/meeting-sessions.ts`
    - Make `workspaceId` parameter optional (`workspaceId?: string | null`) in: `listMeetingSessionsByUser`, `listMeetingSessionsByUserPaginated`, `listMeetingSessionsByStatusesForUser`, `getLatestMeetingSessionByLinkForUser`, `getLatestMeetingSessionByCalendarEventIdForUser`, `getMeetingSessionByIdForUser`, `findActiveGoogleMeetSessionByNormalizedUrl`
    - Apply the optional workspace filter pattern: when `workspaceId` is null/undefined, omit `eq(meetingSessions.workspaceId, workspaceId)` from WHERE clauses; when provided, keep the workspace filter
    - Pattern: `workspaceId ? and(eq(meetingSessions.workspaceId, workspaceId), eq(meetingSessions.userId, userId)) : eq(meetingSessions.userId, userId)`
    - _Bug_Condition: isBugCondition(request, userId) where workspaceId IS NULL and route is personal_
    - _Expected_Behavior: queries return userId-scoped data when workspaceId is null_
    - _Preservation: when workspaceId is provided, workspace filter is still applied (Requirement 3.9)_
    - _Requirements: 2.1, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.10, 3.9_

  - [x] 3.2 Fix `frontend/src/app/api/meetings/route.ts`
    - Remove `if (!workspaceId) return apiError(...)` block from `GET` and `POST` handlers
    - Pass `workspaceId` (which may be `null`) to query functions
    - For `POST`, create session with `workspaceId: workspaceId ?? null`
    - _Bug_Condition: isBugCondition(request, userId) — no x-workspace-id header, no active workspace_
    - _Expected_Behavior: GET returns 200 with userId-scoped meetings; POST returns 201 with workspaceId=null_
    - _Preservation: when workspaceId is non-null, workspace filter still applied_
    - _Requirements: 2.1, 2.2, 3.9_

  - [x] 3.3 Fix `frontend/src/app/api/meetings/joined/route.ts`
    - Remove workspace_required gate
    - Scope query by `userId` only when `workspaceId` is null
    - _Requirements: 2.3, 3.9_

  - [x] 3.4 Fix `frontend/src/app/api/meetings/reports/route.ts`
    - Remove workspace_required gate
    - Pass nullable `workspaceId` to paginated query
    - _Requirements: 2.4, 3.9_

  - [x] 3.5 Fix `frontend/src/app/api/meetings/[id]/route.ts`
    - Remove workspace_required gates from `GET`, `PATCH`, and `POST` (start bot) handlers
    - Scope by `userId` when `workspaceId` is null
    - _Requirements: 2.5, 2.6, 2.7, 3.9_

  - [x] 3.6 Fix `frontend/src/app/api/meetings/[id]/stop/route.ts`
    - Remove workspace_required gate
    - _Requirements: 2.8_

  - [x] 3.7 Fix `frontend/src/app/api/meeting-sessions/route.ts`
    - Remove workspace_required gate
    - Create session with `workspaceId: workspaceId ?? null`
    - _Requirements: 2.9_

  - [x] 3.8 Fix `frontend/src/app/api/meeting-sessions/[id]/route.ts`
    - Remove workspace_required gates from `GET` and `PATCH` handlers
    - When `workspaceId` is null, fall back to userId-only access check
    - _Requirements: 2.10, 3.9_

  - [x] 3.9 Fix `frontend/src/app/api/action-items/route.ts`
    - Remove workspace_required gate
    - Change WHERE clause to omit workspaceId filter when null (do not use `eq(actionItems.workspaceId, workspaceId)` when workspaceId is null)
    - _Requirements: 2.11, 3.9_

  - [x] 3.10 Fix `frontend/src/app/api/action-items/[id]/route.ts`
    - Remove workspace_required gate
    - Scope by `userId` only when `workspaceId` is null
    - _Requirements: 2.12, 3.9_

  - [x] 3.11 Fix `frontend/src/app/api/action-items/bulk-save/route.ts`
    - Remove workspace_required gate
    - Save with `workspaceId: workspaceId ?? null`
    - _Requirements: 2.13_

  - [x] 3.12 Fix `frontend/src/app/api/action-items/export/slack/route.ts`
    - Remove workspace_required gate
    - _Requirements: 2.14_

  - [x] 3.13 Fix `frontend/src/app/api/action-items/export/jira/route.ts`
    - Remove workspace_required gate
    - _Requirements: 2.14_

  - [x] 3.14 Fix `frontend/src/app/api/recordings/[meetingId]/route.ts`
    - Remove workspace_required gate
    - Scope by `userId` when `workspaceId` is null
    - _Requirements: 2.15, 3.9_

  - [x] 3.15 Fix `frontend/src/app/api/meeting/followup/route.ts`
    - Remove workspace_required gate
    - _Requirements: 2.16_

  - [x] 3.16 Fix `frontend/src/app/api/meeting/send-email/route.ts`
    - Remove workspace_required gate
    - _Requirements: 2.17_

  - [x] 3.17 Fix `frontend/src/app/api/settings/usage/route.ts`
    - Remove workspace_required gate
    - Scope usage query by `userId` only when `workspaceId` is null
    - _Requirements: 2.18, 3.9_

  - [x] 3.18 Fix `frontend/src/app/api/usage/stats/route.ts`
    - Remove workspace_required gate
    - Scope stats query by `userId` only when `workspaceId` is null
    - _Requirements: 2.19, 3.9_

  - [x] 3.19 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - Personal Routes Serve Data Without Workspace
    - **IMPORTANT**: Re-run the SAME test from task 1 - do NOT write a new test
    - The test from task 1 encodes the expected behavior (HTTP 200, no `workspace_required`)
    - When this test passes, it confirms the expected behavior is satisfied
    - Run bug condition exploration test from step 1
    - **EXPECTED OUTCOME**: Tests PASS (confirms bug is fixed)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 2.10, 2.11, 2.12, 2.13, 2.14, 2.15, 2.16, 2.17, 2.18, 2.19_

  - [x] 3.20 Verify preservation tests still pass
    - **Property 2: Preservation** - Workspace-Scoped Routes Unchanged
    - **IMPORTANT**: Re-run the SAME tests from task 2 - do NOT write new tests
    - Run preservation property tests from step 2
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions)
    - Confirm workspace routes still require membership, workspace-scoped data is still filtered by workspace, and optional workspace context on personal routes still works
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.9, 3.11_

- [x] 4. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.
  - Confirm no `/api/workspace/...` routes were modified
  - Confirm `workspace-fetch.ts` was not modified
  - Confirm no database schema changes were made
  - Confirm move-to-workspace routes (`/api/meetings/[id]/move-to-workspace`, `/api/meetings/[id]/request-move`) were not modified
