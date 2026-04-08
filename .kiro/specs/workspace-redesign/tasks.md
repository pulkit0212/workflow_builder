# Implementation Plan: Workspace Redesign

## Overview

Migrate from URL-path-based workspace routing to a query-parameter + context-based model. Each task builds incrementally: backend fix first, then DB schema, then context layer, then UI components, then page updates, then cleanup.

## Tasks

- [x] 1. Fix `resolveWorkspaceIdForRequest` in `frontend/src/lib/workspaces/server.ts`
  - Remove the `"test-workspace"` hack when `request` is undefined — return `null` instead
  - Remove the `getFirstActiveWorkspaceIdForUser` fallback at the end of the function — absent header must return `null`, never auto-select
  - Keep the active-membership verification path unchanged
  - _Requirements: 7.3, 7.4, 7.5_

  - [x] 1.1 Write property tests for `resolveWorkspaceIdForRequest`
    - **Property 10: API resolver returns null without x-workspace-id header**
    - **Validates: Requirements 7.3**
    - **Property 11: API resolver enforces active membership**
    - **Validates: Requirements 7.4, 7.5**
    - Tag: `// Feature: workspace-redesign, Property 10` and `Property 11`

- [x] 2. Add `type` column to `workspaces` table and generate migration
  - Add `type: varchar("type", { length: 50 }).notNull().default("team")` to `frontend/src/db/schema/workspaces.ts`
  - Generate a Drizzle migration file for the new column
  - Write a one-time data migration script (SQL or Drizzle seed) that sets `type = 'personal'` for any workspace whose name matches the personal workspace convention
  - Update the `/api/workspaces` response to include `type` in each workspace object
  - _Requirements: 3.4_

- [x] 3. Create `WorkspaceContext` and `useWorkspaceFetch` hook
  - Create `frontend/src/contexts/workspace-context.tsx` with the `WorkspaceContextValue` interface and `WorkspaceProvider` component
  - On mount: read `?workspace` from `useSearchParams()` as primary source; fall back to `localStorage['active-workspace-id']`; otherwise `activeWorkspaceId = null`
  - `switchToWorkspace(id)`: call `router.replace` with `?workspace=id` and write to localStorage
  - `switchToPersonal()`: remove `?workspace` via `router.replace`, set localStorage to `null`
  - Fetch workspace list from `/api/workspaces` on mount; resolve `activeWorkspace` details from the list
  - If stored workspace ID is no longer in the fetched list, fall back to personal mode and clear localStorage
  - Create `frontend/src/hooks/useWorkspaceFetch.ts` — returns a `fetch` wrapper that appends `x-workspace-id` header when `activeWorkspaceId` is non-null
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8_

  - [x] 3.1 Write property tests for `WorkspaceContext` initialisation and switching
    - **Property 1: URL param is authoritative on initialisation**
    - **Validates: Requirements 1.4**
    - **Property 2: localStorage fallback when URL param absent**
    - **Validates: Requirements 1.5**
    - **Property 3: Empty context initialises to null**
    - **Validates: Requirements 1.6**
    - **Property 4: switchToWorkspace syncs URL and localStorage**
    - **Validates: Requirements 1.2, 1.8**
    - **Property 5: switchToPersonal clears URL and localStorage**
    - **Validates: Requirements 1.3, 1.8**
    - Tag: `// Feature: workspace-redesign, Property 1` through `Property 5`

- [x] 4. Wrap dashboard layout with `WorkspaceProvider`
  - Update `frontend/src/app/dashboard/layout.tsx` to import and render `WorkspaceProvider` around the sidebar and `{children}`
  - Pass the fetched workspace list (or leave it to the provider to fetch client-side) — provider must be a Client Component boundary
  - _Requirements: 1.7_

- [x] 5. Update `WorkspaceSwitcher` to read from and write to `WorkspaceContext`
  - Remove direct `localStorage` reads (`getActiveWorkspaceId`, `setActiveWorkspaceId`) and `workspaceFetch` import
  - Read `workspaces`, `activeWorkspace`, `switchToWorkspace`, `switchToPersonal` from `useWorkspaceContext()`
  - Add "Personal" as the first option in the dropdown; selecting it calls `switchToPersonal()`
  - Change "Create workspace" navigation target from `/dashboard/workspaces` to `/dashboard/workspace`
  - Remove `router.refresh()` call — URL update in context triggers re-render naturally
  - Display inline error state when workspace list fetch fails (handled in context; switcher shows error message)
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8_

  - [x] 5.1 Write property tests for `WorkspaceSwitcher` display
    - **Property 6: WorkspaceSwitcher displays correct active label**
    - **Validates: Requirements 2.1**
    - **Property 7: WorkspaceSwitcher lists exactly active memberships**
    - **Validates: Requirements 2.2**
    - Tag: `// Feature: workspace-redesign, Property 6` and `Property 7`

- [x] 6. Redesign `DashboardSidebar` — remove `WorkspaceSubNav`, add type-based visibility
  - Delete the `WorkspaceSubNav` component and its `workspaceSubNav` array from `frontend/src/components/layout/dashboard-sidebar.tsx`
  - Remove the `pathname.match(/^\/dashboard\/workspace\/([^/]+)/)` detection logic
  - Read `activeWorkspace` and `activeWorkspaceId` from `useWorkspaceContext()`
  - Hide "History", "Workspace", and "Tools" nav items when `activeWorkspace?.type !== 'personal'` (i.e. team mode)
  - Show those items when `activeWorkspace?.type === 'personal'` or `activeWorkspace === null`
  - Add a "Manage Workspace" link to `/dashboard/workspace` that renders only when `activeWorkspaceId` is non-null
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_

  - [x] 6.1 Write property tests for sidebar nav visibility
    - **Property 8: Sidebar item visibility determined by workspace.type**
    - **Validates: Requirements 3.2, 3.3**
    - **Property 9: Sidebar management link presence**
    - **Validates: Requirements 3.5**
    - Tag: `// Feature: workspace-redesign, Property 8` and `Property 9`

- [x] 7. Checkpoint — ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Update dashboard page for dual mode
  - Update `frontend/src/app/dashboard/page.tsx` to call `useWorkspaceFetch()` for all data fetches
  - When `activeWorkspaceId` is set, display the workspace name as a contextual label near the page heading
  - Re-fetch stats and recent meetings when `activeWorkspaceId` changes (add it as a `useEffect` dependency)
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_

  - [x] 8.1 Write property tests for dashboard data isolation
    - **Property 12: Personal mode API returns only user-owned records**
    - **Validates: Requirements 7.3, 4.1**
    - **Property 13: Workspace mode API returns only workspace-scoped records**
    - **Validates: Requirements 7.2, 4.2**
    - Tag: `// Feature: workspace-redesign, Property 12` and `Property 13`

- [x] 9. Update reports page for dual mode
  - Update `frontend/src/app/dashboard/reports/page.tsx` to use `useWorkspaceFetch()` for the meetings/reports list fetch
  - Re-fetch when `activeWorkspaceId` changes
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

- [x] 10. Update action items page and API for dual mode with expanded ownership
  - Update `frontend/src/app/api/action-items/route.ts`: replace the workspace-mode condition `[eq(actionItems.workspaceId, workspaceId), eq(actionItems.userId, user.id)]` with the expanded ownership query:
    - For members: `WHERE workspaceId = ? AND (userId = currentUser OR assignedTo = currentUser OR meetingId IN (SELECT meetingId FROM meeting_participants WHERE userId = currentUser))`
    - For admin/owner: `WHERE workspaceId = ?` (all items)
  - Update `frontend/src/app/dashboard/action-items/page.tsx` to use `useWorkspaceFetch()` and re-fetch on `activeWorkspaceId` change
  - _Requirements: 6.1, 6.2, 6.3, 6.4_

  - [x] 10.1 Write property tests for action items ownership
    - **Property 14: Personal action items ownership filter**
    - **Validates: Requirements 6.1**
    - Tag: `// Feature: workspace-redesign, Property 14`

- [x] 11. Update workspace management page — add leave, delete, and transfer ownership
  - Create or update `frontend/src/app/dashboard/workspace/page.tsx` as the single management page
  - Add redirect to `/dashboard` when `activeWorkspaceId` is null (use `useWorkspaceContext()` + `router.replace`)
  - Implement member list with roles; show role-change and remove-member actions for owner/admin only
  - Implement pending join requests section for owner/admin only
  - Implement "Leave workspace" button for non-owner members
  - Implement "Delete workspace" button for owner
  - Implement "Transfer ownership" action for owner (select another active member as new owner)
  - Implement "Update workspace name" form for owner
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8, 8.9, 8.10, 8.11, 8.12_

  - [x] 11.1 Write property tests for workspace management page
    - **Property 15: Workspace management page redirects when no active workspace**
    - **Validates: Requirements 8.11**
    - **Property 16: Workspace management admin actions gated by role**
    - **Validates: Requirements 8.3, 8.4, 8.5, 8.6**
    - **Property 17: Workspace CRUD operations are consistent**
    - **Validates: Requirements 8.7, 8.9, 8.10**
    - Tag: `// Feature: workspace-redesign, Property 15`, `Property 16`, `Property 17`

- [x] 12. Checkpoint — ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 13. Remove duplicate workspace pages and add redirects
  - Delete `frontend/src/app/dashboard/workspace/[workspaceId]/` directory (overview, meetings, action-items, members, requests, settings sub-pages)
  - Delete `frontend/src/app/dashboard/workspaces/` top-level route
  - Add Next.js redirects in `next.config.js` (or `next.config.ts`) for all removed paths:
    - `/dashboard/workspace/:workspaceId` → `/dashboard/workspace`
    - `/dashboard/workspace/:workspaceId/meetings` → `/dashboard/meetings`
    - `/dashboard/workspace/:workspaceId/action-items` → `/dashboard/action-items`
    - `/dashboard/workspace/:workspaceId/overview` → `/dashboard`
    - `/dashboard/workspace/action-items` → `/dashboard/action-items`
    - `/dashboard/workspaces` → `/dashboard/workspace`
  - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8, 9.9_

  - [x] 13.1 Write property tests for removed URL redirects
    - **Property 19: Removed page URLs redirect to unified pages**
    - **Validates: Requirements 9.9**
    - Tag: `// Feature: workspace-redesign, Property 19`

- [x] 14. Add meeting detail workspace controls
  - Update the meeting detail page component to read `activeWorkspaceId` and `activeWorkspace` from `useWorkspaceContext()`
  - When `activeWorkspaceId` is set and the meeting's `workspaceId` matches: render a workspace badge showing the workspace name; hide "Move to workspace" button
  - When `activeWorkspaceId` is set and the meeting is personal (no matching `workspaceId`): render "Move to workspace" button; hide workspace badge
  - When `activeWorkspaceId` is null: render neither control
  - On "Move to workspace" click: POST to the move-request API; show inline error on failure without navigating away
  - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_

  - [x] 14.1 Write property tests for meeting workspace controls
    - **Property 18: Meeting workspace controls visibility**
    - **Validates: Requirements 10.1, 10.2, 10.5**
    - Tag: `// Feature: workspace-redesign, Property 18`

- [x] 15. Final checkpoint — ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Do NOT modify: meetingBot.js, recording pipeline, transcribe.py, Gemini summary, billing/Razorpay, Clerk auth, or any currently passing tests
- Property tests use fast-check with a minimum of 100 iterations each
- Each property test file must include the tag comment: `// Feature: workspace-redesign, Property N: <property_text>`
