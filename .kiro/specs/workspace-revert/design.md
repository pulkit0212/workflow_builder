# Workspace Revert Bugfix Design

## Overview

Implementation 1 introduced mandatory workspace gates across all personal API routes by calling `resolveWorkspaceIdForRequest` and returning HTTP 400 `workspace_required` when no workspace is found. This breaks personal mode entirely: users without an active workspace receive 400 errors on every personal route and cannot use meetings, reports, action items, recordings, or any other personal feature.

The fix removes the hard gate (`if (!workspaceId) return 400`) from all personal routes while leaving the workspace-scoped routes (`/api/workspace/...`) untouched. Personal queries are restored to scope by `userId` only (with `workspaceId` as an optional filter when provided). The `workspace-fetch.ts` utility itself is correct and stays — it is only used by workspace dashboard pages, not personal pages.

## Glossary

- **Bug_Condition (C)**: A request to a personal API route that lacks an `x-workspace-id` header AND the user has no active workspace membership, causing `resolveWorkspaceIdForRequest` to return `null` and the route to return HTTP 400 `workspace_required`
- **Property (P)**: The desired behavior — personal routes SHALL return the authenticated user's own data scoped by `userId` only, regardless of whether a workspace ID is present
- **Preservation**: All `/api/workspace/...` routes, workspace dashboard UI, `workspaceFetch` usage in workspace pages, and the move-to-workspace feature must remain completely unchanged
- **resolveWorkspaceIdForRequest**: Function in `frontend/src/lib/workspaces/server.ts` that reads `x-workspace-id` from request headers, validates membership, and falls back to the user's first active workspace — returns `null` when neither is available
- **workspaceId (optional context)**: When a valid `x-workspace-id` header IS provided on a personal route, queries MAY still scope to that workspace — this optional path must be preserved (Requirement 3.9)
- **Personal route**: Any route outside `/api/workspace/...` that serves user-owned data (meetings, action items, recordings, etc.)
- **Workspace-scoped route**: Any route under `/api/workspace/...` that requires active workspace membership

## Bug Details

### Bug Condition

The bug manifests when any authenticated user calls a personal API route without an `x-workspace-id` header and has no active workspace membership. The `resolveWorkspaceIdForRequest` function returns `null`, and every personal route handler treats `null` as a hard error instead of falling back to userId-only scoping.

**Formal Specification:**
```
FUNCTION isBugCondition(request, userId)
  INPUT: request of type HTTP Request, userId of type string
  OUTPUT: boolean

  workspaceId := resolveWorkspaceIdForRequest(request, userId)
  isPersonalRoute := request.path NOT IN ['/api/workspace/*']

  RETURN isPersonalRoute
         AND workspaceId IS NULL
         AND routeReturns400WorkspaceRequired(request, userId)
END FUNCTION
```

### Examples

- `GET /api/meetings` with no `x-workspace-id` header, user has no workspace → returns 400 `workspace_required` (expected: 200 with user's meetings)
- `POST /api/meetings` with no `x-workspace-id` header → returns 400 `workspace_required` (expected: 201 with new session, `workspaceId = null`)
- `GET /api/action-items` with no `x-workspace-id` header → returns 400 `workspace_required` (expected: 200 with user's action items)
- `GET /api/meetings/reports` with no `x-workspace-id` header → returns 400 `workspace_required` (expected: 200 with paginated reports)
- `POST /api/meetings/[id]/stop` with no `x-workspace-id` header → returns 400 `workspace_required` (expected: 200, bot stopped)
- `GET /api/settings/usage` with no `x-workspace-id` header → returns 400 `workspace_required` (expected: 200 with usage stats)
- `GET /api/workspace/[id]/meetings` with valid workspace membership → returns 200 (unchanged — this is NOT a bug condition)

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- All `/api/workspace/...` routes must continue to require and validate workspace membership
- `workspaceFetch` in workspace dashboard pages (`/dashboard/workspace/...`) must continue to attach `x-workspace-id` and work correctly
- When a valid `x-workspace-id` header IS provided on a personal route, queries must still scope to that workspace (optional workspace context)
- The move-to-workspace feature (`/api/meetings/[id]/move-to-workspace`, `/api/meetings/[id]/request-move`) must remain unchanged
- `workspaceId` nullable columns on `meeting_sessions` and `action_items` must remain nullable — no schema changes
- First-login workspace creation onboarding screen must remain unchanged
- Workspace dashboard UI at `/dashboard/workspace/[id]` must remain unchanged

**Scope:**
All requests that DO NOT match the bug condition (i.e., requests to `/api/workspace/...` routes, or personal route requests that already include a valid `x-workspace-id` header) must be completely unaffected by this fix.

## Hypothesized Root Cause

Based on code inspection, the root cause is confirmed (not just hypothesized):

1. **Hard null-check gate in every personal route handler**: After calling `resolveWorkspaceIdForRequest`, every personal route has:
   ```typescript
   if (!workspaceId) {
     return apiError("Workspace is required.", 400, { error: "workspace_required" });
   }
   ```
   This was added as part of Implementation 1 to enforce workspace context. The fix is to remove this gate from personal routes.

2. **Query functions require workspaceId parameter**: Functions like `listMeetingSessionsByUser`, `listMeetingSessionsByUserPaginated`, `getLatestMeetingSessionByLinkForUser`, etc. in `frontend/src/lib/db/queries/meeting-sessions.ts` include `eq(meetingSessions.workspaceId, workspaceId)` in their WHERE clauses. When `workspaceId` is null, these queries would either fail or return no results. The fix makes `workspaceId` optional in these functions — when null, the WHERE clause omits the workspace filter.

3. **resolveWorkspaceIdForRequest returns null for workspaceless users**: The function correctly returns `null` when no header is present and the user has no active workspace. This behavior is correct — the bug is in how callers handle the `null` return value.

4. **Frontend pages already use regular fetch**: Inspection confirms that personal dashboard pages (`/dashboard/meetings`, `/dashboard/reports`, `/dashboard/action-items`) already use regular `fetch()`, not `workspaceFetch`. The `workspaceFetch` utility is only used in workspace dashboard pages. So no frontend fetch changes are needed — fixing the API layer is sufficient.

## Correctness Properties

Property 1: Bug Condition - Personal Routes Serve Data Without Workspace

_For any_ authenticated HTTP request to a personal API route where `isBugCondition` holds (no `x-workspace-id` header, user has no active workspace), the fixed route handler SHALL return HTTP 200 with the authenticated user's own data scoped by `userId` only, and SHALL NOT return HTTP 400 `workspace_required`.

**Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 2.10, 2.11, 2.12, 2.13, 2.14, 2.15, 2.16, 2.17, 2.18, 2.19**

Property 2: Preservation - Workspace-Scoped Routes Unchanged

_For any_ authenticated HTTP request to a `/api/workspace/...` route where `isBugCondition` does NOT hold (workspace routes are outside the bug condition scope), the fixed code SHALL produce exactly the same response as the original code, preserving all workspace membership validation, role checks, and workspace-scoped data filtering.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.8, 3.11**

## Fix Implementation

### Changes Required

#### File: `frontend/src/app/api/meetings/route.ts`
**Function**: `GET`, `POST`
**Change**: Remove the `if (!workspaceId) return apiError(...)` block. Pass `workspaceId` (which may be `null`) to query functions. For `POST`, create session with `workspaceId: workspaceId ?? null`.

#### File: `frontend/src/app/api/meetings/joined/route.ts`
**Change**: Remove workspace_required gate. Scope query by `userId` only when `workspaceId` is null.

#### File: `frontend/src/app/api/meetings/reports/route.ts`
**Change**: Remove workspace_required gate. Pass nullable `workspaceId` to paginated query.

#### File: `frontend/src/app/api/meetings/[id]/route.ts`
**Functions**: `GET`, `PATCH`, `POST` (start bot)
**Change**: Remove workspace_required gates. Scope by `userId` when `workspaceId` is null.

#### File: `frontend/src/app/api/meetings/[id]/stop/route.ts`
**Change**: Remove workspace_required gate.

#### File: `frontend/src/app/api/meeting-sessions/route.ts`
**Change**: Remove workspace_required gate. Create session with `workspaceId: workspaceId ?? null`.

#### File: `frontend/src/app/api/meeting-sessions/[id]/route.ts`
**Functions**: `GET`, `PATCH`
**Change**: Remove workspace_required gates. When `workspaceId` is null, fall back to userId-only access check.

#### File: `frontend/src/app/api/action-items/route.ts`
**Change**: Remove workspace_required gate. Change WHERE clause from `eq(actionItems.workspaceId, workspaceId)` to omit workspaceId filter when null.

#### File: `frontend/src/app/api/action-items/[id]/route.ts`
**Change**: Remove workspace_required gate. Scope by `userId` only when `workspaceId` is null.

#### File: `frontend/src/app/api/action-items/bulk-save/route.ts`
**Change**: Remove workspace_required gate. Save with `workspaceId: workspaceId ?? null`.

#### File: `frontend/src/app/api/action-items/export/slack/route.ts`
**Change**: Remove workspace_required gate.

#### File: `frontend/src/app/api/action-items/export/jira/route.ts`
**Change**: Remove workspace_required gate.

#### File: `frontend/src/app/api/recordings/[meetingId]/route.ts`
**Change**: Remove workspace_required gate. Scope by `userId` when `workspaceId` is null.

#### File: `frontend/src/app/api/meeting/followup/route.ts`
**Change**: Remove workspace_required gate.

#### File: `frontend/src/app/api/meeting/send-email/route.ts`
**Change**: Remove workspace_required gate.

#### File: `frontend/src/app/api/settings/usage/route.ts`
**Change**: Remove workspace_required gate. Scope usage query by `userId` only when `workspaceId` is null.

#### File: `frontend/src/app/api/usage/stats/route.ts`
**Change**: Remove workspace_required gate. Scope stats query by `userId` only when `workspaceId` is null.

#### File: `frontend/src/lib/db/queries/meeting-sessions.ts`
**Functions**: `listMeetingSessionsByUser`, `listMeetingSessionsByUserPaginated`, `listMeetingSessionsByStatusesForUser`, `getLatestMeetingSessionByLinkForUser`, `getLatestMeetingSessionByCalendarEventIdForUser`, `getMeetingSessionByIdForUser`, `findActiveGoogleMeetSessionByNormalizedUrl`
**Change**: Make `workspaceId` parameter optional (`workspaceId?: string | null`). When null/undefined, omit `eq(meetingSessions.workspaceId, workspaceId)` from WHERE clauses. When provided, keep the workspace filter (preserves Requirement 3.9).

**Pattern for optional workspace filter:**
```typescript
// Before (always filters by workspaceId):
and(eq(meetingSessions.workspaceId, workspaceId), eq(meetingSessions.userId, userId))

// After (workspaceId is optional):
workspaceId
  ? and(eq(meetingSessions.workspaceId, workspaceId), eq(meetingSessions.userId, userId))
  : eq(meetingSessions.userId, userId)
```

### What NOT to Change
- `/api/workspace/...` routes — these correctly require workspace membership
- `workspace-fetch.ts` — the utility is correct; it already passes through when no workspace ID is stored
- Workspace dashboard pages — they correctly use `workspaceFetch` for workspace-scoped data
- Database schema — `workspaceId` is already nullable; no migrations needed
- Move-to-workspace routes and `workspace_move_requests` table

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the bug on unfixed code, then verify the fix works correctly and preserves existing behavior.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bug BEFORE implementing the fix. Confirm the root cause analysis. The existing `frontend/src/__tests__/bug-condition-exploration.test.ts` file is the starting point.

**Test Plan**: Write tests that call personal API route handlers directly (or via mock HTTP requests) without an `x-workspace-id` header and with a user who has no active workspace. Assert that the response is 400 `workspace_required`. Run these tests on the UNFIXED code to observe failures and confirm root cause.

**Test Cases**:
1. **GET /api/meetings without workspace**: Call handler with no header, no workspace membership → expect 400 `workspace_required` (confirms bug on unfixed code)
2. **GET /api/action-items without workspace**: Same pattern → expect 400 `workspace_required`
3. **GET /api/meetings/reports without workspace**: Same pattern → expect 400 `workspace_required`
4. **POST /api/meetings without workspace**: Create meeting with no header → expect 400 `workspace_required`
5. **GET /api/settings/usage without workspace**: Same pattern → expect 400 `workspace_required`

**Expected Counterexamples**:
- All personal routes return 400 `workspace_required` when called without workspace context
- Root cause confirmed: hard null-check gate after `resolveWorkspaceIdForRequest` returns null

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed route handlers return the user's data with HTTP 200.

**Pseudocode:**
```
FOR ALL request WHERE isBugCondition(request, userId) DO
  response := fixedRouteHandler(request)
  ASSERT response.status = 200
  ASSERT response.body.success = true
  ASSERT response.body DOES NOT CONTAIN { error: "workspace_required" }
  ASSERT all returned records belong to userId
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold (workspace routes, or personal routes with valid workspace header), the fixed code produces the same result as the original code.

**Pseudocode:**
```
FOR ALL request WHERE NOT isBugCondition(request, userId) DO
  ASSERT originalHandler(request) = fixedHandler(request)
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:
- It generates many workspace ID and userId combinations automatically
- It catches edge cases like empty workspace IDs, whitespace-only values, and invalid UUIDs
- It provides strong guarantees that workspace-scoped routes are unaffected across all inputs

**Test Plan**: Observe behavior of workspace routes on UNFIXED code first, then write property-based tests capturing that behavior.

**Test Cases**:
1. **Workspace route preservation**: Verify `GET /api/workspace/[id]/meetings` with valid membership still returns 200 after fix
2. **Optional workspace context on personal routes**: Verify that when `x-workspace-id` IS provided on a personal route, queries still scope to that workspace (Requirement 3.9)
3. **workspaceFetch utility preservation**: Verify `workspaceFetch` still attaches `x-workspace-id` header when workspace ID is in localStorage
4. **Workspace dashboard UI preservation**: Verify workspace dashboard pages still load correctly with workspace context

### Unit Tests

- Test each personal route handler returns 200 with userId-scoped data when no workspace header is present
- Test each personal route handler still scopes by workspaceId when a valid `x-workspace-id` header is provided
- Test `listMeetingSessionsByUser` with `workspaceId = null` returns all sessions for the user
- Test `listMeetingSessionsByUser` with a valid `workspaceId` still filters by workspace
- Test edge cases: user with no meetings, user with meetings in multiple workspaces

### Property-Based Tests

- Generate random userId values and verify personal routes always return only that user's data (no cross-user data leakage)
- Generate random workspace IDs and verify workspace routes still require valid membership after fix
- Generate random combinations of (userId, workspaceId present/absent) and verify personal routes always return 200 for authenticated users
- Verify that the set of records returned by a personal route is always a subset of records owned by the requesting userId

### Integration Tests

- Full flow: user with no workspace creates a meeting, starts bot, stops bot, views report — all without workspace context
- Full flow: user with workspace uses personal routes with `x-workspace-id` header — workspace scoping still applies
- Workspace dashboard: user with workspace views `/dashboard/workspace/[id]` — workspace UI unaffected
- Cross-contamination check: user A's personal data is never returned to user B, regardless of workspace context
