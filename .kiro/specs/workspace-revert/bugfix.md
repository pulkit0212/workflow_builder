# Bugfix Requirements Document

## Introduction

Implementation 1 introduced mandatory workspace gates across all personal API routes, making `workspaceId` a hard requirement for every operation. This breaks personal mode entirely: users without an active workspace (or without the `x-workspace-id` header) receive HTTP 400 `workspace_required` errors and cannot use meetings, reports, action items, recordings, or any other personal feature. The fix removes these gates from all personal routes while leaving Implementation 2's workspace-scoped routes (`/api/workspace/...`) untouched.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN a user calls `GET /api/meetings` without an `x-workspace-id` header THEN the system returns HTTP 400 `workspace_required` instead of the user's meetings

1.2 WHEN a user calls `POST /api/meetings` (create meeting) without an `x-workspace-id` header THEN the system returns HTTP 400 `workspace_required` instead of creating the meeting

1.3 WHEN a user calls `GET /api/meetings/joined` without an `x-workspace-id` header THEN the system returns HTTP 400 `workspace_required`

1.4 WHEN a user calls `GET /api/meetings/reports` without an `x-workspace-id` header THEN the system returns HTTP 400 `workspace_required` instead of the user's meeting history

1.5 WHEN a user calls `GET /api/meetings/[id]` without an `x-workspace-id` header THEN the system returns HTTP 400 `workspace_required` instead of the meeting detail

1.6 WHEN a user calls `POST /api/meetings/[id]` (start bot) without an `x-workspace-id` header THEN the system returns HTTP 400 `workspace_required` and the bot never starts

1.7 WHEN a user calls `PATCH /api/meetings/[id]` without an `x-workspace-id` header THEN the system returns HTTP 400 `workspace_required`

1.8 WHEN a user calls `POST /api/meetings/[id]/stop` without an `x-workspace-id` header THEN the system returns HTTP 400 `workspace_required` and the bot cannot be stopped

1.9 WHEN a user calls `POST /api/meeting-sessions` without an `x-workspace-id` header THEN the system returns HTTP 400 `workspace_required`

1.10 WHEN a user calls `GET /api/meeting-sessions/[id]` or `PATCH /api/meeting-sessions/[id]` without an `x-workspace-id` header THEN the system returns HTTP 400 `workspace_required`

1.11 WHEN a user calls `GET /api/action-items` without an `x-workspace-id` header THEN the system returns HTTP 400 `workspace_required` instead of the user's action items

1.12 WHEN a user calls `PATCH /api/action-items/[id]` without an `x-workspace-id` header THEN the system returns HTTP 400 `workspace_required`

1.13 WHEN a user calls `POST /api/action-items/bulk-save` without an `x-workspace-id` header THEN the system returns HTTP 400 `workspace_required`

1.14 WHEN a user calls `POST /api/action-items/export/slack` or `POST /api/action-items/export/jira` without an `x-workspace-id` header THEN the system returns HTTP 400 `workspace_required`

1.15 WHEN a user calls `GET /api/recordings/[meetingId]` without an `x-workspace-id` header THEN the system returns HTTP 400 `workspace_required`

1.16 WHEN a user calls `POST /api/meeting/followup` without an `x-workspace-id` header THEN the system returns HTTP 400 `workspace_required`

1.17 WHEN a user calls `POST /api/meeting/send-email` without an `x-workspace-id` header THEN the system returns HTTP 400 `workspace_required`

1.18 WHEN a user calls `GET /api/settings/usage` without an `x-workspace-id` header THEN the system returns HTTP 400 `workspace_required`

1.19 WHEN a user calls `GET /api/usage/stats` without an `x-workspace-id` header THEN the system returns HTTP 400 `workspace_required`

1.20 WHEN a user opens any personal dashboard page (meetings, reports, action items) without an active workspace context THEN the UI shows a "workspace_required" error state or "Create workspace to get started" blocking screen instead of the user's personal data

1.21 WHEN a user opens `/dashboard/meetings` without a workspace selected THEN the page shows an error or empty state due to `workspaceFetch` calls failing instead of loading calendar meetings

1.22 WHEN a user opens `/dashboard/reports` without a workspace selected THEN the page shows an error or empty state instead of the user's meeting history

1.23 WHEN a user opens `/dashboard/action-items` without a workspace selected THEN the page shows an error or empty state instead of the user's action items

1.24 WHEN a user opens `/dashboard/tools` or any tools page without a workspace selected THEN the page shows an error or empty state due to `workspaceFetch` calls

1.25 WHEN a user attempts to start the AI notetaker bot from the meetings UI without a workspace selected THEN the UI shows a workspace_required error or disables the button

### Expected Behavior (Correct)

2.1 WHEN a user calls `GET /api/meetings` without an `x-workspace-id` header THEN the system SHALL return the authenticated user's own meetings scoped by `userId` only

2.2 WHEN a user calls `POST /api/meetings` without an `x-workspace-id` header THEN the system SHALL create the meeting session with `workspaceId = null` (personal mode)

2.3 WHEN a user calls `GET /api/meetings/joined` without an `x-workspace-id` header THEN the system SHALL return the user's meetings scoped by `userId` only

2.4 WHEN a user calls `GET /api/meetings/reports` without an `x-workspace-id` header THEN the system SHALL return the user's meeting history scoped by `userId` only

2.5 WHEN a user calls `GET /api/meetings/[id]` without an `x-workspace-id` header THEN the system SHALL return the meeting if it belongs to the authenticated user

2.6 WHEN a user calls `POST /api/meetings/[id]` (start bot) without an `x-workspace-id` header THEN the system SHALL start the bot for the meeting without requiring a workspace

2.7 WHEN a user calls `PATCH /api/meetings/[id]` without an `x-workspace-id` header THEN the system SHALL update the meeting if it belongs to the authenticated user

2.8 WHEN a user calls `POST /api/meetings/[id]/stop` without an `x-workspace-id` header THEN the system SHALL stop the bot for the meeting without requiring a workspace

2.9 WHEN a user calls `POST /api/meeting-sessions` without an `x-workspace-id` header THEN the system SHALL create the session with `workspaceId = null`

2.10 WHEN a user calls `GET /api/meeting-sessions/[id]` or `PATCH /api/meeting-sessions/[id]` without an `x-workspace-id` header THEN the system SHALL serve the request scoped by `userId` only

2.11 WHEN a user calls `GET /api/action-items` without an `x-workspace-id` header THEN the system SHALL return the user's action items scoped by `userId` only

2.12 WHEN a user calls `PATCH /api/action-items/[id]` without an `x-workspace-id` header THEN the system SHALL update the action item if it belongs to the authenticated user

2.13 WHEN a user calls `POST /api/action-items/bulk-save` without an `x-workspace-id` header THEN the system SHALL save the action items with `workspaceId = null`

2.14 WHEN a user calls `POST /api/action-items/export/slack` or `POST /api/action-items/export/jira` without an `x-workspace-id` header THEN the system SHALL export the user's own action items

2.15 WHEN a user calls `GET /api/recordings/[meetingId]` without an `x-workspace-id` header THEN the system SHALL serve the recording if the user owns or is shared on the meeting

2.16 WHEN a user calls `POST /api/meeting/followup` without an `x-workspace-id` header THEN the system SHALL generate the follow-up email for the user's meeting

2.17 WHEN a user calls `POST /api/meeting/send-email` without an `x-workspace-id` header THEN the system SHALL send the email for the user's meeting

2.18 WHEN a user calls `GET /api/settings/usage` without an `x-workspace-id` header THEN the system SHALL return the user's usage stats scoped by `userId` only

2.19 WHEN a user calls `GET /api/usage/stats` without an `x-workspace-id` header THEN the system SHALL return the user's usage stats scoped by `userId` only

2.20 WHEN a user opens `/dashboard/meetings` without a workspace selected THEN the page SHALL load and display the user's calendar meetings using regular `fetch` (no workspace header required)

2.21 WHEN a user opens `/dashboard/reports` without a workspace selected THEN the page SHALL load and display the user's meeting history using regular `fetch`

2.22 WHEN a user opens `/dashboard/action-items` without a workspace selected THEN the page SHALL load and display the user's action items using regular `fetch`

2.23 WHEN a user opens `/dashboard/tools` or any tools page without a workspace selected THEN the page SHALL load normally using regular `fetch`

2.24 WHEN a user attempts to start the AI notetaker bot from the meetings UI without a workspace selected THEN the button SHALL be enabled and the bot SHALL start successfully

2.25 WHEN any personal dashboard page encounters a fetch error THEN the error SHALL NOT be "workspace_required" — it SHALL be a generic network/auth error only

### Unchanged Behavior (Regression Prevention)

3.1 WHEN a user calls `GET /api/workspace/[workspaceId]/meetings` with a valid workspace membership THEN the system SHALL CONTINUE TO return workspace-scoped meetings

3.2 WHEN a user calls `GET /api/workspace/[workspaceId]/action-items` with a valid workspace membership THEN the system SHALL CONTINUE TO return workspace-scoped action items

3.3 WHEN a user calls `GET /api/workspace/dashboard` with a valid `x-workspace-id` header THEN the system SHALL CONTINUE TO return workspace dashboard data

3.4 WHEN a user calls `PATCH /api/workspace/action-items/bulk-assign` with admin/owner role THEN the system SHALL CONTINUE TO bulk-assign action items within the workspace

3.5 WHEN a user calls `POST /api/meetings/[id]/move-to-workspace` THEN the system SHALL CONTINUE TO move the meeting to the specified workspace

3.6 WHEN a user calls `POST /api/meetings/[id]/request-move` THEN the system SHALL CONTINUE TO create a workspace move request

3.7 WHEN a user calls `PATCH /api/workspace/[id]/move-requests/[reqId]` THEN the system SHALL CONTINUE TO process the move request approval or rejection

3.8 WHEN a user accesses `/dashboard/workspace/[id]` THEN the system SHALL CONTINUE TO show the workspace dashboard UI

3.9 WHEN a user provides a valid `x-workspace-id` header on any personal route THEN the system SHALL CONTINUE TO scope queries to that workspace (optional workspace context still works)

3.10 WHEN `workspaceId` is nullable on `meeting_sessions` and `action_items` schema columns THEN the system SHALL CONTINUE TO allow null values (no schema changes required)

3.11 WHEN a user is on a workspace dashboard page (`/dashboard/workspace/[id]`) THEN the workspace-scoped UI components SHALL CONTINUE TO use workspace context for their data fetching

3.12 WHEN a user sees the workspace creation screen on first login THEN that screen SHALL CONTINUE TO be shown (this is NOT a blocking gate — it is onboarding)

3.13 WHEN a user has a workspace selected and visits personal pages THEN the optional workspace context SHALL CONTINUE TO be passed and queries scoped accordingly
