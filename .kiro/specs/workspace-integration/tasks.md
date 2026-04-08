# Implementation Plan: Workspace Integration

## Overview

Add a workspace sharing layer on top of the existing personal meeting system. Meetings always originate from a user's personal calendar — the workspace is a sharing mechanism, not a meeting creator. `workspaceId` is optional on all existing tables; personal mode works without it.

**Do NOT change:** bot join flow, recording pipeline, transcription, Gemini summary, billing/Razorpay, Clerk auth, any passing tests, personal dashboard, personal meetings page, personal reports page.

## Tasks

- [x] 1. Schema updates — add workspace move columns and create move requests table
  - [x] 1.1 Add three new columns to `meeting_sessions` schema in `frontend/src/db/schema/meeting-sessions.ts`
    - Add `workspaceMoveStatus: varchar("workspace_move_status", { length: 50 })` (nullable)
    - Add `workspaceMovedBy: varchar("workspace_moved_by", { length: 255 })` (nullable)
    - Add `workspaceMovedAt: timestamp("workspace_moved_at", { withTimezone: true })` (nullable)
    - Ensure existing `workspaceId` column remains nullable and unchanged
    - _Requirements: 1.1, 1.2, 1.3, 1.4_

  - [x] 1.2 Create `workspace_move_requests` table in `frontend/src/db/schema/workspaces.ts`
    - Columns: `id` (uuid pk), `meetingId` (uuid fk → meeting_sessions, cascade delete), `workspaceId` (uuid fk → workspaces, cascade delete), `requestedBy` (uuid fk → users, cascade delete), `status` (varchar default `'pending'`), `adminNote` (text nullable), `reviewedBy` (uuid fk → users, set null), `reviewedAt` (timestamp nullable), `createdAt` (timestamp default now)
    - Export the new table from the schema index
    - _Requirements: 3.1_

  - [x] 1.3 Write property test for workspace_move_status / workspaceId consistency invariant
    - **Property 1: workspace_move_status / workspaceId consistency invariant**
    - **Validates: Requirements 1.5, 1.6**
    - File: `frontend/src/tests/workspace-integration/move-status-invariant.property.test.ts`
    - Use `fc.constantFrom(null, 'pending_approval', 'approved', 'rejected')` for status
    - Assert: if status=null then workspaceId must be null; if status='approved' then workspaceId must be non-null

  - [x] 1.4 Write property test for move request status invariant
    - **Property 7: Move request status invariant**
    - **Validates: Requirements 3.3**
    - File: `frontend/src/tests/workspace-integration/move-request-status.property.test.ts`
    - Use `fc.constantFrom('pending', 'approved', 'rejected')` for status
    - Assert: status is always one of the three allowed values

  - [x] 1.5 Run `npm run db:push` (or equivalent Drizzle migration) to apply schema changes
    - Verify columns appear in the database
    - _Requirements: 3.2_

- [x] 2. Owner move to workspace — API route and UI button
  - [x] 2.1 Implement `POST /api/meetings/[id]/move-to-workspace` route in `frontend/src/app/api/meetings/[id]/move-to-workspace/route.ts`
    - Parse and validate `{ workspaceId: string }` body with Zod
    - Verify authenticated user is the meeting owner (403 if not)
    - Verify authenticated user is an active workspace member of target workspace (403 if not)
    - Return 409 `already_in_workspace` if `workspace_move_status` is already `'approved'`
    - In a single Drizzle transaction: set `workspaceId`, `workspace_move_status='approved'`, `workspace_moved_by`, `workspace_moved_at` on meeting_sessions; set `workspaceId` on all action_items WHERE meetingId=id
    - Use `apiError()` from `src/lib/api-responses.ts` for all error responses
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7_

  - [x] 2.2 Write property test for owner-move authorization
    - **Property 4: Owner-move authorization**
    - **Validates: Requirements 4.2, 4.3**
    - File: `frontend/src/tests/workspace-integration/owner-move-auth.property.test.ts`
    - For any user who is not the meeting owner OR not an active workspace member, assert 403

  - [x] 2.3 Write property test for owner-move field correctness
    - **Property 5: Owner-move sets all required fields**
    - **Validates: Requirements 4.4, 4.7**
    - File: `frontend/src/tests/workspace-integration/owner-move-fields.property.test.ts`
    - Assert: after success, workspaceId equals requested id, workspace_move_status='approved', workspace_moved_by=userId, workspace_moved_at non-null

  - [x] 2.4 Write property test for action items cascade on approval
    - **Property 6: Action items cascade workspaceId from meeting on approval**
    - **Validates: Requirements 2.2, 2.3, 4.5**
    - File: `frontend/src/tests/workspace-integration/action-items-cascade.property.test.ts`
    - Assert: after owner-move succeeds, all action_items for that meetingId have workspaceId equal to the meeting's workspaceId

  - [x] 2.5 Write unit tests for `POST /api/meetings/[id]/move-to-workspace`
    - File: `frontend/src/tests/workspace-integration/move-to-workspace.unit.test.ts`
    - Test: owner check, membership check, 409 on duplicate, transaction atomicity (both tables updated or neither)
    - _Requirements: 4.2, 4.3, 4.6_

  - [x] 2.6 Add "Share to Workspace" button and modal to the personal meeting detail page
    - Show button only when: authenticated user is owner AND `workspace_move_status = null` AND user has at least one active workspace membership
    - On click: open modal with workspace selector (list user's active memberships)
    - On confirm: call `POST /api/meetings/[id]/move-to-workspace`
    - On success: show toast, replace button with "Shared to: {workspace name} ✓" badge
    - When `workspace_move_status = 'approved'`: show "Shared to: {workspace name} ✓" on page load
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

- [x] 3. Checkpoint — Ensure all tests pass, ask the user if questions arise.

- [x] 4. Workspace meetings page and API
  - [x] 4.1 Implement `GET /api/workspace/[workspaceId]/meetings` route in `frontend/src/app/api/workspace/[workspaceId]/meetings/route.ts`
    - Verify authenticated user is an active workspace member (403 if not)
    - Accept query params: `search`, `page`, `limit`
    - Return only rows WHERE `workspaceId=wid` AND `workspace_move_status='approved'`
    - Include: id, title, userId (owner), status, workspace_move_status, createdAt, scheduledStartTime, summary (truncated), participants
    - _Requirements: 8.2, 8.3, 8.4, 8.5_

  - [x] 4.2 Write property test for workspace meetings API returns only approved meetings
    - **Property 3: Workspace meetings API returns only approved meetings**
    - **Validates: Requirements 8.4, 8.5**
    - File: `frontend/src/tests/workspace-integration/workspace-meetings-approved.property.test.ts`
    - Assert: every row in response has workspace_move_status='approved' and workspaceId equals requested wid

  - [x] 4.3 Write property test for personal meetings excluded from workspace responses
    - **Property 2: Personal meetings excluded from workspace responses**
    - **Validates: Requirements 15.4**
    - File: `frontend/src/tests/workspace-integration/personal-exclusion.property.test.ts`
    - Assert: for any meeting with workspaceId=null, it never appears in any workspace meetings response

  - [x] 4.4 Write property test for workspace membership required for all workspace-scoped routes
    - **Property 15: Workspace membership required for all workspace-scoped routes**
    - **Validates: Requirements 8.3, 12.3, 13.3**
    - File: `frontend/src/tests/workspace-integration/workspace-membership-required.property.test.ts`
    - Assert: non-member gets 403 on all GET /api/workspace/[workspaceId]/* routes

  - [x] 4.5 Build workspace meetings page at `/dashboard/workspace/[workspaceId]/meetings`
    - Server component fetching from `GET /api/workspace/[workspaceId]/meetings`
    - Display meeting cards: title, recorded-by user, status badge (Not Started / Recording / Processing / Ready), date, "View Report" link
    - Include search input (client component) for filtering
    - _Requirements: 8.1, 8.6_

- [x] 5. Meeting detail for workspace members
  - [x] 5.1 Build workspace meeting detail page at `/dashboard/workspace/[workspaceId]/meetings/[meetingId]`
    - Server component; determine user's workspace role (ADMIN / MEMBER / VIEWER)
    - Not started: show waiting screen with scheduled time
    - Recording/in-progress: show live status; hide "Stop Recording" for MEMBER and VIEWER
    - Completed: show full meeting report for all roles
    - _Requirements: 9.1, 9.2, 9.3, 9.4_

  - [x] 5.2 Add role-gated controls to workspace meeting detail
    - ADMIN: full report + assign action items controls + delete from workspace + download
    - MEMBER: full report + status update controls for own action items + download + request-move button
    - VIEWER: full report, read-only (no download, no action item updates)
    - _Requirements: 9.5, 9.6, 9.7_

- [x] 6. Admin assign action items
  - [x] 6.1 Implement `PATCH /api/workspace/[workspaceId]/action-items/[itemId]/assign` route
    - File: `frontend/src/app/api/workspace/[workspaceId]/action-items/[itemId]/assign/route.ts`
    - Parse and validate `{ memberId: string, memberName: string }` body with Zod
    - Verify authenticated user is ADMIN or OWNER role in workspace (403 if not)
    - Update `action_items.owner = memberName` WHERE id=itemId AND workspaceId=wid
    - _Requirements: 10.1, 10.2, 10.3_

  - [x] 6.2 Write property test for action item assignment authorization and effect
    - **Property 12: Action item assignment authorization and effect**
    - **Validates: Requirements 10.2, 10.5**
    - File: `frontend/src/tests/workspace-integration/assignment-auth-effect.property.test.ts`
    - Assert: non-admin gets 403; on success, action_items.owner equals memberName from request body

  - [x] 6.3 Add "Assign to" dropdown per action item on workspace meeting detail page (ADMIN only)
    - Client component; lists active workspace members
    - On selection: calls `PATCH /api/workspace/[workspaceId]/action-items/[itemId]/assign`
    - Optimistic UI update; revert on error
    - _Requirements: 10.4, 10.5_

- [x] 7. Member update own task status
  - [x] 7.1 Implement `PATCH /api/workspace/[workspaceId]/action-items/[itemId]/status` route
    - File: `frontend/src/app/api/workspace/[workspaceId]/action-items/[itemId]/status/route.ts`
    - Parse and validate `{ status: 'pending' | 'in_progress' | 'done' | 'hold' }` body with Zod
    - Verify authenticated user is the assigned member (owner matches user name) OR ADMIN (403 if neither)
    - When status='done': set `completedAt = now()`
    - When status!='done': set `completedAt = null`
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5_

  - [x] 7.2 Write property test for completedAt invariant
    - **Property 13: completedAt invariant**
    - **Validates: Requirements 11.3, 11.4, 11.5**
    - File: `frontend/src/tests/workspace-integration/completed-at-invariant.property.test.ts`
    - Use `fc.constantFrom('pending', 'in_progress', 'done', 'hold')` for status
    - Assert: status='done' → completedAt non-null; status!='done' → completedAt null

  - [x] 7.3 Write unit tests for status update route
    - File: `frontend/src/tests/workspace-integration/admin-review.unit.test.ts` (extend or create separate)
    - Test: assigned member can update, non-assigned member gets 403, admin can update any, completedAt set/cleared correctly
    - _Requirements: 11.2, 11.3, 11.5_

- [x] 8. Checkpoint — Ensure all tests pass, ask the user if questions arise.

- [x] 9. Member request move and admin review API
  - [x] 9.1 Implement `POST /api/meetings/[id]/request-move` route in `frontend/src/app/api/meetings/[id]/request-move/route.ts`
    - Parse and validate `{ workspaceId: string }` body with Zod
    - Verify authenticated user is an active workspace member of target workspace (403 if not)
    - Return 409 `request_already_pending` if a pending request already exists for same meetingId+workspaceId
    - Insert `workspace_move_requests` row with `status='pending'`, `requestedBy=userId`
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

  - [x] 9.2 Write property test for member request creation
    - **Property 8: Member request creates pending row**
    - **Validates: Requirements 6.3, 6.4, 6.5**
    - File: `frontend/src/tests/workspace-integration/member-request-creation.property.test.ts`
    - Assert: created row has status='pending' and requestedBy equals authenticated user's id

  - [x] 9.3 Write property test for member request authorization
    - **Property 9: Member request authorization**
    - **Validates: Requirements 6.2**
    - File: `frontend/src/tests/workspace-integration/member-request-auth.property.test.ts`
    - Assert: non-member gets 403

  - [x] 9.4 Write unit tests for `POST /api/meetings/[id]/request-move`
    - File: `frontend/src/tests/workspace-integration/request-move.unit.test.ts`
    - Test: membership check, 409 on duplicate pending, row created with correct fields
    - _Requirements: 6.2, 6.3, 6.4_

  - [x] 9.5 Implement `PATCH /api/workspace/[workspaceId]/move-requests/[requestId]` route
    - File: `frontend/src/app/api/workspace/[workspaceId]/move-requests/[requestId]/route.ts`
    - Parse and validate `{ action: 'approve' | 'reject', adminNote?: string }` body with Zod
    - Verify authenticated user is ADMIN or OWNER role in workspace (403 if not)
    - On approve (transaction): update meeting_sessions (workspaceId, workspace_move_status='approved', workspace_moved_by, workspace_moved_at), update action_items workspaceId, update move_request (status='approved', reviewedBy, reviewedAt)
    - On reject: update move_request only (status='rejected', reviewedBy, reviewedAt, adminNote); do NOT touch meeting_sessions
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7_

  - [x] 9.6 Implement `GET /api/workspace/[workspaceId]/move-requests` route
    - File: `frontend/src/app/api/workspace/[workspaceId]/move-requests/route.ts`
    - Verify authenticated user is an active workspace member (403 if not)
    - Default filter: `status='pending'`; accept `?status=all` to return all
    - Join meeting title and requestedBy user name
    - _Requirements: 12.2, 12.3_

  - [x] 9.7 Write property test for admin review authorization
    - **Property 10: Admin review authorization**
    - **Validates: Requirements 7.2**
    - File: `frontend/src/tests/workspace-integration/admin-review-auth.property.test.ts`
    - Assert: non-admin/owner gets 403 on PATCH move-requests

  - [x] 9.8 Write property test for rejection does not modify meeting
    - **Property 11: Rejection does not modify meeting**
    - **Validates: Requirements 7.6**
    - File: `frontend/src/tests/workspace-integration/rejection-no-modify.property.test.ts`
    - Assert: after reject action, meeting_sessions.workspaceId and workspace_move_status are unchanged

- [x] 10. Admin move request review UI
  - [x] 10.1 Build move requests page at `/dashboard/workspace/[workspaceId]/requests`
    - Server component; admin-only (redirect non-admins)
    - Fetch from `GET /api/workspace/[workspaceId]/move-requests`
    - Display each pending request as a card: meeting title, requested-by user, request date, Approve/Reject buttons
    - Include optional admin note input on reject
    - On approve/reject: call `PATCH /api/workspace/[workspaceId]/move-requests/[requestId]`, refresh list
    - _Requirements: 12.1, 12.4_

  - [x] 10.2 Add pending requests badge count to workspace sidebar navigation
    - Fetch pending count from dashboard API or move-requests API
    - Display badge next to "Requests" nav item (admin only)
    - _Requirements: 12.5_

- [x] 11. Workspace dashboard
  - [x] 11.1 Implement `GET /api/workspace/[workspaceId]/dashboard` route
    - File: `frontend/src/app/api/workspace/[workspaceId]/dashboard/route.ts`
    - Verify authenticated user is an active workspace member (403 if not)
    - Return: totalMeetings, meetingsThisMonth, totalActionItems, pendingActionItems, recentMeetings (5, desc by workspace_moved_at), actionItemsByAssignee, members, pendingMoveRequestsCount (admin only)
    - _Requirements: 13.2, 13.3, 13.4_

  - [x] 11.2 Write property test for dashboard stats consistency
    - **Property 14: Dashboard stats consistency**
    - **Validates: Requirements 13.4**
    - File: `frontend/src/tests/workspace-integration/dashboard-stats.property.test.ts`
    - Assert: totalMeetings equals actual COUNT of approved meetings for that workspaceId; totalActionItems equals actual COUNT of action_items for that workspaceId

  - [x] 11.3 Build workspace dashboard page at `/dashboard/workspace/[workspaceId]`
    - Server component fetching from `GET /api/workspace/[workspaceId]/dashboard`
    - Display: stats cards (total meetings, this month, total action items, pending items), recent meetings list, action items by assignee, members list
    - For ADMIN: also show pending move requests count/link
    - _Requirements: 13.1, 13.5_

- [x] 12. Sidebar workspace navigation
  - [x] 12.1 Add WORKSPACES section to sidebar below existing PERSONAL section
    - Fetch user's active workspace memberships
    - List each workspace linking to `/dashboard/workspace/[id]`
    - Add "+ Create workspace" link
    - PERSONAL section must remain completely unchanged
    - _Requirements: 14.1, 14.2, 14.3, 14.5_

  - [x] 12.2 Add workspace sub-navigation when inside `/dashboard/workspace/[workspaceId]/*`
    - Show sub-nav: Overview, Meetings, Action Items, Members, Requests, Settings
    - "Requests" item shows pending badge count (admin only)
    - _Requirements: 14.4_

- [ ] 13. Final checkpoint — Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- `workspaceId` is ALWAYS optional — personal mode (workspaceId=null) must work at every step
- All write operations touching both `meeting_sessions` and `action_items` must use a single Drizzle transaction
- Use `apiError()` from `src/lib/api-responses.ts` for all error responses
- Property tests use `fast-check` (already in codebase); tag each test with `// Feature: workspace-integration, Property N: <text>`
- Do NOT modify: bot join flow, recording pipeline, transcription, Gemini summary, billing/Razorpay, Clerk auth, personal dashboard, personal meetings page, personal reports page
