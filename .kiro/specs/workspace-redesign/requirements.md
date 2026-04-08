# Requirements Document

## Introduction

The workspace redesign replaces the current architecture — where workspace features live on separate, dedicated pages — with a context-switching model. After login, users land in personal mode. A workspace switcher in the sidebar lets them switch to any workspace they belong to. When a workspace is active, every existing page (dashboard, reports, action items, meetings) shows workspace-filtered data instead of personal data. No new top-level pages are added for workspace-specific views of existing features. A single workspace management page handles membership, settings, and join requests. The sidebar has one state that adapts based on whether a workspace is active.

## Glossary

- **Workspace_Context**: The currently active context — either personal (no workspace selected) or a specific workspace identified by a `workspaceId`.
- **Workspace_Switcher**: The dropdown component in the sidebar that lets users switch between personal mode and any workspace they belong to.
- **Personal_Mode**: The state where no workspace is active; all pages show data owned by the authenticated user only.
- **Workspace_Mode**: The state where a specific workspace is active; all pages show data filtered to that workspace.
- **Active_Workspace_Id**: The `workspaceId` derived from the URL query parameter `workspace` (primary source of truth), with localStorage used as a secondary UX cache only. Represents the currently selected workspace.
- **Workspace_Context_Provider**: A React context that holds the `Active_Workspace_Id` and exposes it to all pages and components. The URL parameter is the authoritative source; localStorage is a fallback for UX continuity only.
- **Dashboard**: The `/dashboard` page showing meeting stats and recent reports.
- **Reports_Page**: The `/dashboard/reports` page showing meeting session records.
- **Action_Items_Page**: The `/dashboard/action-items` page showing extracted tasks.
- **Meetings_Page**: The `/dashboard/meetings` page showing meeting history.
- **Workspace_Management_Page**: A single page at `/dashboard/workspace` for managing workspace members, settings, and join requests.
- **API_Route**: A Next.js API route handler that reads an optional `workspaceId` query parameter or `x-workspace-id` header to scope its database query.
- **workspaceId**: An optional UUID that, when present, scopes a query to a specific workspace; when absent, scopes the query to the authenticated user's personal data.

## Requirements

### Requirement 1: Workspace Context System

**User Story:** As a user, I want the app to remember which workspace I have selected so that every page automatically shows the right data without me having to re-select it.

#### Acceptance Criteria

1. THE Workspace_Context_Provider SHALL expose the `Active_Workspace_Id` (a string UUID or `null`) to all descendant components.
2. WHEN the user selects a workspace in the Workspace_Switcher, THE Workspace_Context_Provider SHALL update the URL query parameter `workspace` to the selected workspace's UUID and update localStorage under the key `active-workspace-id` as a secondary UX cache.
3. WHEN the user selects personal mode in the Workspace_Switcher, THE Workspace_Context_Provider SHALL remove the `workspace` query parameter from the URL and set localStorage to `null`.
4. WHEN the app loads and the URL contains a `workspace` query parameter, THE Workspace_Context_Provider SHALL initialise the `Active_Workspace_Id` from that URL parameter as the authoritative source.
5. WHEN the app loads and the URL does not contain a `workspace` query parameter but localStorage contains a valid `active-workspace-id` value, THE Workspace_Context_Provider SHALL initialise the `Active_Workspace_Id` from localStorage and sync it to the URL.
6. WHEN the app loads and neither the URL nor localStorage contains a valid workspace identifier, THE Workspace_Context_Provider SHALL initialise the `Active_Workspace_Id` to `null` (personal mode).
7. THE Workspace_Context_Provider SHALL be mounted once in the dashboard layout so that all dashboard pages share the same context instance.
8. THE Workspace_Context_Provider SHALL keep the URL parameter and localStorage in sync on every workspace switch so that links are shareable and page refreshes restore the correct context.

### Requirement 2: Workspace Switcher Component

**User Story:** As a user, I want a dropdown in the sidebar to switch between personal mode and my workspaces so that I can change context without navigating away.

#### Acceptance Criteria

1. THE Workspace_Switcher SHALL display the name of the currently active workspace, or "Personal" when no workspace is active.
2. WHEN the Workspace_Switcher is opened, THE Workspace_Switcher SHALL list all workspaces the authenticated user is an active member of.
3. WHEN the Workspace_Switcher is opened, THE Workspace_Switcher SHALL include a "Personal" option at the top of the list.
4. WHEN the user selects a workspace from the Workspace_Switcher, THE Workspace_Switcher SHALL call the Workspace_Context_Provider to update the `Active_Workspace_Id`.
5. WHEN the user selects "Personal" from the Workspace_Switcher, THE Workspace_Switcher SHALL call the Workspace_Context_Provider to set the `Active_Workspace_Id` to `null`.
6. THE Workspace_Switcher SHALL include a "Create workspace" option that navigates to the Workspace_Management_Page.
7. WHEN the Workspace_Switcher fetches the workspace list and the request fails, THE Workspace_Switcher SHALL display an error message and remain functional.
8. THE Workspace_Switcher SHALL close when the user clicks outside of it.

### Requirement 3: Sidebar Dual-Mode Navigation

**User Story:** As a user, I want the sidebar to show relevant navigation items for my current context so that I can access the right features without confusion.

#### Acceptance Criteria

1. THE Dashboard_Sidebar SHALL render a single navigation list that adapts based on the `Active_Workspace_Id` from the Workspace_Context_Provider.
2. WHEN `workspace.type` equals `"personal"`, THE Dashboard_Sidebar SHALL show the "History", "Workspace", and "Tools" navigation items.
3. WHEN `workspace.type` does not equal `"personal"`, THE Dashboard_Sidebar SHALL hide the "History", "Workspace", and "Tools" navigation items.
4. THE Dashboard_Sidebar SHALL determine navigation mode exclusively from the `workspace.type` field; it SHALL NOT use workspace name checks or null checks to determine which items to display.
5. THE Dashboard_Sidebar SHALL include a link to the Workspace_Management_Page only when the `Active_Workspace_Id` is set.
6. THE Dashboard_Sidebar SHALL NOT render a separate workspace sub-navigation section that duplicates the primary navigation items.
7. THE Dashboard_Sidebar SHALL remove the existing `/dashboard/workspace/[workspaceId]` sub-navigation pattern.

### Requirement 4: Dashboard Page Dual Mode

**User Story:** As a user, I want the dashboard to show my personal stats in personal mode and workspace stats in workspace mode so that I always see relevant data.

#### Acceptance Criteria

1. WHILE the `Active_Workspace_Id` is `null`, THE Dashboard SHALL fetch and display stats and recent meetings scoped exclusively to the authenticated user's personal data (WHERE userId = currentUser).
2. WHILE the `Active_Workspace_Id` is set, THE Dashboard SHALL fetch and display stats and recent meetings scoped exclusively to the active workspace (WHERE workspaceId = currentWorkspace).
3. THE Dashboard SHALL never mix personal data and workspace data in the same view.
4. WHEN the `Active_Workspace_Id` changes, THE Dashboard SHALL re-fetch data and update the displayed stats without a full page reload.
5. WHILE the `Active_Workspace_Id` is set, THE Dashboard SHALL display the workspace name as a contextual label near the page heading.
6. THE Dashboard SHALL use a single page component at `/dashboard` for both personal and workspace modes.

### Requirement 5: Reports Page Dual Mode

**User Story:** As a user, I want the reports page to show my personal meeting reports in personal mode and workspace meeting reports in workspace mode.

#### Acceptance Criteria

1. WHILE the `Active_Workspace_Id` is `null`, THE Reports_Page SHALL display meeting session records owned exclusively by the authenticated user (WHERE userId = currentUser).
2. WHILE the `Active_Workspace_Id` is set, THE Reports_Page SHALL display meeting session records belonging exclusively to the active workspace (WHERE workspaceId = currentWorkspace).
3. THE Reports_Page SHALL never mix personal and workspace records in the same view.
4. WHEN the `Active_Workspace_Id` changes, THE Reports_Page SHALL re-fetch and re-render the reports list.
5. THE Reports_Page SHALL use a single page component at `/dashboard/reports` for both personal and workspace modes.

### Requirement 6: Action Items Page Dual Mode

**User Story:** As a user, I want the action items page to show my personal tasks in personal mode and workspace tasks in workspace mode.

#### Acceptance Criteria

1. WHILE the `Active_Workspace_Id` is `null`, THE Action_Items_Page SHALL display action items owned by the authenticated user, assigned to the authenticated user, or extracted from meetings the authenticated user participated in.
2. WHILE the `Active_Workspace_Id` is set, THE Action_Items_Page SHALL display action items belonging to the active workspace.
3. WHEN the `Active_Workspace_Id` changes, THE Action_Items_Page SHALL re-fetch and re-render the action items list.
4. THE Action_Items_Page SHALL use a single page component at `/dashboard/action-items` for both personal and workspace modes.

### Requirement 7: API Routes Dual Mode

**User Story:** As a developer, I want API routes to accept an optional `workspaceId` so that the same endpoint serves both personal and workspace data.

#### Acceptance Criteria

1. THE API_Route SHALL resolve the workspace context from the `x-workspace-id` request header first, then fall back to the server session; it SHALL NOT trust any client-supplied localStorage value directly.
2. WHEN the resolved `workspaceId` is present, THE API_Route SHALL scope its query exclusively to that workspace (WHERE workspaceId = resolvedWorkspaceId).
3. WHEN the resolved `workspaceId` is absent, THE API_Route SHALL scope its query exclusively to the authenticated user's personal records (WHERE userId = authenticatedUser); it SHALL NOT return all records across all users or workspaces.
4. WHEN the `workspaceId` is present, THE API_Route SHALL verify that the authenticated user is an active member of the specified workspace before returning data.
5. IF the authenticated user is not an active member of the specified workspace, THEN THE API_Route SHALL return a 403 Forbidden response.
6. THE API_Route for action items SHALL follow the workspace resolution rules described in criteria 1–5.
7. THE API_Route for dashboard stats SHALL follow the workspace resolution rules described in criteria 1–5.
8. THE API_Route for reports/meetings SHALL follow the workspace resolution rules described in criteria 1–5.
9. THE workspaceId parameter SHALL always be optional; no API_Route SHALL require it for personal-mode requests.

### Requirement 8: Workspace Management Page

**User Story:** As a workspace owner or admin, I want a single management page where I can view members, manage roles, review join requests, and update workspace settings.

#### Acceptance Criteria

1. THE Workspace_Management_Page SHALL be accessible at `/dashboard/workspace` when a workspace is active.
2. THE Workspace_Management_Page SHALL display the list of active members with their roles.
3. WHEN the authenticated user has the "owner" or "admin" role, THE Workspace_Management_Page SHALL allow the user to change member roles.
4. WHEN the authenticated user has the "owner" or "admin" role, THE Workspace_Management_Page SHALL allow the user to remove members.
5. WHEN the authenticated user has the "owner" or "admin" role, THE Workspace_Management_Page SHALL display pending join requests.
6. WHEN the authenticated user has the "owner" or "admin" role, THE Workspace_Management_Page SHALL allow the user to accept or reject join requests.
7. THE Workspace_Management_Page SHALL allow the workspace owner to update the workspace name.
8. THE Workspace_Management_Page SHALL allow the workspace owner to delete the workspace.
9. THE Workspace_Management_Page SHALL allow a non-owner member to leave the workspace.
10. THE Workspace_Management_Page SHALL allow the workspace owner to transfer ownership to another active member.
11. IF the `Active_Workspace_Id` is `null` when the user navigates to `/dashboard/workspace`, THEN THE Workspace_Management_Page SHALL redirect the user to `/dashboard`.
12. THE Workspace_Management_Page SHALL replace the existing `/dashboard/workspaces` and `/dashboard/workspace/[workspaceId]` pages for management tasks.

### Requirement 9: Remove Duplicate Workspace Pages

**User Story:** As a developer, I want to remove all duplicate workspace-specific pages so that the codebase has a single source of truth for each feature.

#### Acceptance Criteria

1. THE System SHALL verify that the Meetings_Page dual-mode implementation handles workspace context before removing the `/dashboard/workspace/meetings` page.
2. THE System SHALL verify that the Reports_Page dual-mode implementation handles workspace context before removing any workspace-specific reports page.
3. THE System SHALL verify that the Action_Items_Page dual-mode implementation handles workspace context before removing the `/dashboard/workspace/action-items` page.
4. THE System SHALL remove the `/dashboard/workspace/overview` page only after its functionality is merged into the Dashboard dual-mode implementation.
5. THE System SHALL remove the `/dashboard/workspace/meetings` page only after criterion 1 is satisfied.
6. THE System SHALL remove the `/dashboard/workspace/action-items` page only after criterion 3 is satisfied.
7. THE System SHALL remove the `/dashboard/workspace/[workspaceId]` page after its functionality is merged into the Workspace_Management_Page.
8. THE System SHALL remove the `/app/workspaces` top-level route (currently a redirect) after the Workspace_Management_Page is in place.
9. WHEN any removed page URL is accessed, THE System SHALL redirect the user to the equivalent unified page.

### Requirement 10: Meeting Detail Page Workspace Controls

**User Story:** As a workspace member, I want to see workspace context on a meeting detail page and be able to request moving a personal meeting to a workspace.

#### Acceptance Criteria

1. WHILE the `Active_Workspace_Id` is set and the meeting belongs to that workspace, THE Meeting_Detail_Page SHALL display a workspace badge showing the workspace name.
2. WHILE the `Active_Workspace_Id` is set and the meeting is a personal meeting, THE Meeting_Detail_Page SHALL display a "Move to workspace" button.
3. WHEN the user clicks "Move to workspace", THE Meeting_Detail_Page SHALL submit a move request to the active workspace.
4. IF the move request submission fails, THEN THE Meeting_Detail_Page SHALL display an error message without navigating away.
5. WHILE the `Active_Workspace_Id` is `null`, THE Meeting_Detail_Page SHALL not display any workspace controls.
