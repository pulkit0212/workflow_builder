# Requirements Document

## Introduction

This feature adds a workspace sharing layer on top of the existing personal meeting system. Meetings always originate from a user's personal calendar — the workspace is a sharing mechanism, not a meeting creator. A meeting session can exist without any workspace (personal mode) or be shared to a workspace by the owner or via an admin-approved member request.

The bot join flow, recording pipeline, transcription, Gemini summary, billing/Razorpay, Clerk auth, and all passing tests must not be changed. The `workspaceId` field on `meeting_sessions` and `action_items` is optional and must never be required for personal use.

## Glossary

- **System**: The Artivaa Next.js frontend application (`frontend/`).
- **Meeting_Session**: A row in the `meeting_sessions` table representing one recorded or in-progress meeting.
- **Action_Item**: A row in the `action_items` table representing a task extracted from a meeting.
- **Workspace**: A row in the `workspaces` table; a shared context for a team.
- **Workspace_Member**: A row in `workspace_members`; links a user to a workspace with a role.
- **Owner**: The user whose `userId` matches `meeting_sessions.userId` — the person who recorded the meeting.
- **ADMIN**: A Workspace_Member with role = `'admin'` or `'owner'`.
- **MEMBER**: A Workspace_Member with role = `'member'`.
- **VIEWER**: A Workspace_Member with role = `'viewer'`.
- **Move_Request**: A row in `workspace_move_requests`; a pending request to share a meeting to a workspace.
- **Personal_Mode**: A Meeting_Session with `workspaceId = null`; fully functional without any workspace.
- **Workspace_Move_Status**: The `workspace_move_status` column on `meeting_sessions`; values: `null`, `'pending_approval'`, `'approved'`, `'rejected'`.
- **Bot**: The recording bot (`bot/meetingBot.js` + `bot/transcribe.py`) that joins meetings and produces transcripts.

---

## Requirements

### Requirement 1: Database Schema — Meeting Sessions Workspace Fields

**User Story:** As a developer, I want the meeting_sessions table to carry workspace sharing metadata, so that the system can track whether a meeting has been shared to a workspace and by whom.

#### Acceptance Criteria

1. THE System SHALL add a `workspace_move_status` column (`varchar(50)`, nullable) to `meeting_sessions` with allowed values: `null` (not shared), `'pending_approval'`, `'approved'`, `'rejected'`.
2. THE System SHALL add a `workspace_moved_by` column (`varchar(255)`, nullable) to `meeting_sessions` storing the `userId` of the user who initiated the move.
3. THE System SHALL add a `workspace_moved_at` column (`timestamp`, nullable) to `meeting_sessions` storing when the move was executed.
4. THE System SHALL ensure the existing `workspaceId` column on `meeting_sessions` remains nullable so that Personal_Mode meetings (workspaceId = null) continue to function without modification.
5. FOR ALL Meeting_Session rows where `workspace_move_status` is `null`, THE System SHALL ensure `workspaceId` is also `null`.
6. FOR ALL Meeting_Session rows where `workspace_move_status` is `'approved'`, THE System SHALL ensure `workspaceId` is non-null.

### Requirement 2: Database Schema — Action Items Workspace Field

**User Story:** As a developer, I want action items to optionally belong to a workspace, so that when a meeting is shared to a workspace its action items follow automatically.

#### Acceptance Criteria

1. THE System SHALL ensure the existing `workspaceId` column on `action_items` remains nullable so that personal action items (workspaceId = null) continue to function.
2. WHEN a Meeting_Session is moved to a workspace (status set to `'approved'`), THE System SHALL update the `workspaceId` on all Action_Item rows whose `meetingId` matches that Meeting_Session's id.
3. FOR ALL Action_Item rows, THE System SHALL ensure that if the associated Meeting_Session has `workspace_move_status = 'approved'`, the Action_Item's `workspaceId` equals the Meeting_Session's `workspaceId`.

### Requirement 3: Database Schema — Workspace Move Requests Table

**User Story:** As a developer, I want a dedicated table for workspace move requests, so that member requests can be tracked, reviewed, and audited independently of the meeting record.

#### Acceptance Criteria

1. THE System SHALL create a `workspace_move_requests` table with columns: `id` (uuid, primary key), `meetingId` (varchar, not null), `workspaceId` (varchar, not null), `requestedBy` (varchar, not null), `status` (varchar, default `'pending'`), `adminNote` (text, nullable), `reviewedBy` (varchar, nullable), `reviewedAt` (timestamp, nullable), `createdAt` (timestamp, default now).
2. THE System SHALL run `npm run db:push` (or equivalent Drizzle migration) after schema changes to apply them to the database.
3. FOR ALL Move_Request rows, THE System SHALL ensure `status` is one of: `'pending'`, `'approved'`, `'rejected'`.

### Requirement 4: Owner Moves Meeting to Workspace

**User Story:** As a meeting owner, I want to directly share my meeting to a workspace I belong to, so that my team can see the recording and action items without requiring admin approval.

#### Acceptance Criteria

1. THE System SHALL provide a `POST /api/meetings/[id]/move-to-workspace` API route that accepts `{ workspaceId: string }` in the request body.
2. WHEN `POST /api/meetings/[id]/move-to-workspace` is called, THE System SHALL verify the authenticated user is the Owner of the Meeting_Session; IF NOT, THE System SHALL return HTTP 403.
3. WHEN `POST /api/meetings/[id]/move-to-workspace` is called, THE System SHALL verify the authenticated user is an active Workspace_Member of the target workspace; IF NOT, THE System SHALL return HTTP 403.
4. WHEN `POST /api/meetings/[id]/move-to-workspace` is called and authorization passes, THE System SHALL set `workspaceId`, `workspace_move_status = 'approved'`, `workspace_moved_by`, and `workspace_moved_at` on the Meeting_Session.
5. WHEN `POST /api/meetings/[id]/move-to-workspace` succeeds, THE System SHALL update the `workspaceId` on all Action_Item rows associated with that Meeting_Session.
6. WHEN `POST /api/meetings/[id]/move-to-workspace` is called on a Meeting_Session that already has `workspace_move_status = 'approved'`, THE System SHALL return HTTP 409 with error code `'already_in_workspace'`.
7. FOR ALL successful owner-move operations, THE System SHALL ensure the Meeting_Session's `workspaceId` equals the requested `workspaceId` and `workspace_move_status` equals `'approved'`.

### Requirement 5: Share to Workspace UI (Owner)

**User Story:** As a meeting owner, I want a "Share to Workspace" button on the meeting detail page, so that I can share my meeting to a workspace with a single action.

#### Acceptance Criteria

1. THE System SHALL display a "Share to Workspace" button on the meeting detail page WHEN the authenticated user is the Owner AND the Meeting_Session has `workspace_move_status = null`.
2. WHEN the "Share to Workspace" button is clicked, THE System SHALL display a modal with a workspace selector listing all workspaces the user is an active member of.
3. WHEN the owner confirms the workspace selection, THE System SHALL call `POST /api/meetings/[id]/move-to-workspace` with the selected `workspaceId`.
4. WHEN the move succeeds, THE System SHALL display a success toast notification and replace the "Share to Workspace" button with a "Shared to: {workspace name} ✓" indicator.
5. WHEN the Meeting_Session already has `workspace_move_status = 'approved'`, THE System SHALL display "Shared to: {workspace name} ✓" instead of the "Share to Workspace" button.

### Requirement 6: Member Requests Meeting Move (Requires Admin Approval)

**User Story:** As a workspace member who is not the meeting owner, I want to request that a meeting be shared to our workspace, so that the admin can review and approve the request.

#### Acceptance Criteria

1. THE System SHALL provide a `POST /api/meetings/[id]/request-move` API route that accepts `{ workspaceId: string }` in the request body.
2. WHEN `POST /api/meetings/[id]/request-move` is called, THE System SHALL verify the authenticated user is an active Workspace_Member of the target workspace; IF NOT, THE System SHALL return HTTP 403.
3. WHEN `POST /api/meetings/[id]/request-move` is called and a Move_Request already exists for the same `meetingId` and `workspaceId` with `status = 'pending'`, THE System SHALL return HTTP 409 with error code `'request_already_pending'`.
4. WHEN `POST /api/meetings/[id]/request-move` passes all checks, THE System SHALL create a Move_Request row with `status = 'pending'` and `requestedBy` set to the authenticated user's id.
5. FOR ALL Move_Request rows created via this endpoint, THE System SHALL ensure `status = 'pending'` at creation time.

### Requirement 7: Admin Reviews Move Requests

**User Story:** As a workspace admin, I want to approve or reject member move requests, so that I control which meetings appear in the workspace.

#### Acceptance Criteria

1. THE System SHALL provide a `PATCH /api/workspace/[workspaceId]/move-requests/[requestId]` API route that accepts `{ action: 'approve' | 'reject', adminNote?: string }`.
2. WHEN `PATCH /api/workspace/[workspaceId]/move-requests/[requestId]` is called, THE System SHALL verify the authenticated user is an ADMIN of the workspace; IF NOT, THE System SHALL return HTTP 403.
3. WHEN `action = 'approve'`, THE System SHALL set the Meeting_Session's `workspaceId`, `workspace_move_status = 'approved'`, `workspace_moved_by`, and `workspace_moved_at`, and update all associated Action_Item rows' `workspaceId`.
4. WHEN `action = 'approve'`, THE System SHALL set the Move_Request `status = 'approved'`, `reviewedBy`, and `reviewedAt`.
5. WHEN `action = 'reject'`, THE System SHALL set the Move_Request `status = 'rejected'`, `reviewedBy`, `reviewedAt`, and optionally `adminNote`.
6. WHEN `action = 'reject'`, THE System SHALL NOT modify the Meeting_Session's `workspaceId` or `workspace_move_status`.
7. FOR ALL approved Move_Requests, THE System SHALL ensure the associated Meeting_Session has `workspace_move_status = 'approved'` and a non-null `workspaceId`.

### Requirement 8: Workspace Meetings Page

**User Story:** As a workspace member, I want to see all meetings that have been shared to my workspace, so that I can review team recordings and reports.

#### Acceptance Criteria

1. THE System SHALL provide a workspace meetings page at `/dashboard/workspace/[workspaceId]/meetings`.
2. THE System SHALL provide a `GET /api/workspace/[workspaceId]/meetings` API route.
3. WHEN `GET /api/workspace/[workspaceId]/meetings` is called, THE System SHALL verify the authenticated user is an active Workspace_Member; IF NOT, THE System SHALL return HTTP 403.
4. THE System SHALL return only Meeting_Session rows where `workspaceId` matches AND `workspace_move_status = 'approved'`.
5. FOR ALL responses from `GET /api/workspace/[workspaceId]/meetings`, THE System SHALL ensure zero Meeting_Session rows with `workspace_move_status != 'approved'` are included.
6. THE System SHALL display meeting cards on the workspace meetings page showing: title, recorded-by user, status badge (Not Started / Recording / Processing / Ready), date, and a "View Report" button.

### Requirement 9: Meeting Detail Page for Workspace Members

**User Story:** As a workspace member, I want to view a meeting's full report with permissions appropriate to my role, so that I can access the information I need without overstepping my access level.

#### Acceptance Criteria

1. THE System SHALL provide a workspace meeting detail view accessible from the workspace meetings page.
2. WHEN the Meeting_Session status is not started, THE System SHALL display a waiting screen showing the scheduled time.
3. WHEN the Meeting_Session status is recording/in-progress, THE System SHALL display a live status screen; THE System SHALL NOT display a "Stop Recording" button to MEMBER or VIEWER roles.
4. WHEN the Meeting_Session status is completed, THE System SHALL display the full meeting report.
5. WHEN the authenticated user has ADMIN role, THE System SHALL display: full report, assign action items controls, delete from workspace option, and download option.
6. WHEN the authenticated user has MEMBER role, THE System SHALL display: full report, status update controls for action items assigned to that user, download option, and request-move option.
7. WHEN the authenticated user has VIEWER role, THE System SHALL display: full report only (read-only, no download, no action item updates).

### Requirement 10: Admin Assigns Action Items to Members

**User Story:** As a workspace admin, I want to assign action items to specific workspace members, so that responsibilities are clearly tracked within the team.

#### Acceptance Criteria

1. THE System SHALL provide a `PATCH /api/workspace/[workspaceId]/action-items/[itemId]/assign` API route that accepts `{ memberId: string, memberName: string }`.
2. WHEN `PATCH /api/workspace/[workspaceId]/action-items/[itemId]/assign` is called, THE System SHALL verify the authenticated user is an ADMIN; IF NOT, THE System SHALL return HTTP 403.
3. WHEN authorization passes, THE System SHALL update the Action_Item's `owner` field to `memberName`.
4. THE System SHALL display an "Assign to" dropdown per action item on the workspace meeting detail page, visible only to ADMIN users.
5. FOR ALL action item assignment operations, THE System SHALL ensure the `owner` field on the Action_Item equals the `memberName` provided in the request after a successful update.

### Requirement 11: Member Updates Own Task Status

**User Story:** As a workspace member, I want to update the status of action items assigned to me, so that the team can track task progress.

#### Acceptance Criteria

1. THE System SHALL provide a `PATCH /api/workspace/[workspaceId]/action-items/[itemId]/status` API route that accepts `{ status: 'pending' | 'in_progress' | 'done' | 'hold' }`.
2. WHEN `PATCH /api/workspace/[workspaceId]/action-items/[itemId]/status` is called, THE System SHALL verify the authenticated user is either the assigned member (owner matches user's name) or an ADMIN; IF NEITHER, THE System SHALL return HTTP 403.
3. WHEN `status = 'done'`, THE System SHALL set `completedAt` to the current timestamp on the Action_Item.
4. FOR ALL Action_Item rows where `status = 'done'`, THE System SHALL ensure `completedAt` is non-null.
5. FOR ALL Action_Item rows where `status != 'done'`, THE System SHALL ensure `completedAt` is null (or unchanged from a prior completion).

### Requirement 12: Admin Move Request Review UI

**User Story:** As a workspace admin, I want a dedicated page to review pending move requests, so that I can efficiently approve or reject them.

#### Acceptance Criteria

1. THE System SHALL provide a move request review page at `/dashboard/workspace/[workspaceId]/requests`.
2. THE System SHALL provide a `GET /api/workspace/[workspaceId]/move-requests` API route that returns Move_Request rows for the workspace.
3. WHEN `GET /api/workspace/[workspaceId]/move-requests` is called, THE System SHALL verify the authenticated user is an active Workspace_Member; IF NOT, THE System SHALL return HTTP 403.
4. THE System SHALL display each pending request as a card showing: meeting title, requested-by user, request date, and Approve/Reject buttons.
5. THE System SHALL display a badge count of pending requests in the workspace sidebar navigation.

### Requirement 13: Workspace Dashboard

**User Story:** As a workspace member, I want a workspace overview dashboard with team stats and recent activity, so that I can quickly understand team productivity.

#### Acceptance Criteria

1. THE System SHALL provide a workspace dashboard page at `/dashboard/workspace/[workspaceId]`.
2. THE System SHALL provide a `GET /api/workspace/[workspaceId]/dashboard` API route returning: total approved meetings count, approved meetings count for the current calendar month, total action items count, pending action items count, 5 most recent approved meetings, action items summary grouped by assignee, members list, and pending move requests count (for ADMIN).
3. WHEN `GET /api/workspace/[workspaceId]/dashboard` is called, THE System SHALL verify the authenticated user is an active Workspace_Member; IF NOT, THE System SHALL return HTTP 403.
4. FOR ALL stats returned by `GET /api/workspace/[workspaceId]/dashboard`, THE System SHALL ensure the total meetings count equals the number of Meeting_Session rows with that `workspaceId` and `workspace_move_status = 'approved'`.
5. THE System SHALL display stats, recent meetings, action items summary, members list, and (for ADMIN) pending move requests on the workspace dashboard page.

### Requirement 14: Workspace Navigation in Sidebar

**User Story:** As a user, I want workspace-aware navigation in the sidebar, so that I can easily switch between personal and workspace contexts.

#### Acceptance Criteria

1. THE System SHALL display a PERSONAL section in the sidebar with unchanged links: Dashboard, Meetings, Reports, Action Items, History, Tools, Settings, Billing.
2. THE System SHALL display a WORKSPACES section in the sidebar listing all workspaces the user is an active member of, each linking to `/dashboard/workspace/[id]`.
3. THE System SHALL display a "+ Create workspace" link in the WORKSPACES section.
4. WHEN the user is inside a workspace context (`/dashboard/workspace/[workspaceId]/*`), THE System SHALL display workspace sub-navigation: Overview, Meetings, Action Items, Members, Requests, Settings.
5. THE System SHALL ensure the PERSONAL section navigation and all personal pages remain fully functional regardless of workspace context.

### Requirement 15: Personal Mode Preservation

**User Story:** As a user without a workspace, I want all personal meeting features to continue working exactly as before, so that the workspace feature does not break my existing workflow.

#### Acceptance Criteria

1. THE System SHALL ensure Meeting_Session rows with `workspaceId = null` are fully functional: bot join, recording, transcription, summary generation, and report viewing must all work without a workspace.
2. THE System SHALL ensure Action_Item rows with `workspaceId = null` are fully functional: creation, listing, status updates, and deletion must all work without a workspace.
3. THE System SHALL NOT require a `workspaceId` on any existing personal API route (`/api/meetings`, `/api/action-items`, `/api/meeting-sessions`, etc.).
4. FOR ALL personal Meeting_Session rows (workspaceId = null), THE System SHALL ensure they do not appear in any workspace-scoped API response.
5. THE System SHALL NOT modify the bot join flow, recording pipeline, transcription pipeline, Gemini summary generation, billing/Razorpay integration, or Clerk authentication.
