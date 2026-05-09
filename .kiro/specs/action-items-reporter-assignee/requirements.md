# Requirements Document

## Introduction

Refactor the action items system to separate the concept of "who recorded the meeting" (reporter) from "who is responsible for the task" (assignee), modelled after Jira's reporter/assignee pattern. Currently, `user_id` conflates both roles, causing the assignee column to always show the meeting recorder rather than the actual task owner. This feature introduces a proper `assignee_id` FK, updates all API filtering logic, and adds frontend UI for viewing and editing assignees.

## Glossary

- **Action_Item**: A task extracted from a meeting transcript or created manually, stored in the `action_items` table.
- **Reporter**: The Artivaa user who recorded the meeting and created the action item. Stored as `reporter_id` (renamed from `user_id`). Immutable after creation.
- **Assignee**: The Artivaa user responsible for completing the action item. Stored as `assignee_id` (nullable FK to `users`). Can be updated by authorised users.
- **Owner**: A free-text field containing the AI-extracted name from the meeting transcript (e.g. "Aarti", "Lead"). Used as a display fallback when no `assignee_id` is set.
- **Personal_Mode**: The context where a user views action items outside any workspace (`workspace_id IS NULL`).
- **Workspace_Mode**: The context where action items are scoped to a specific workspace via `workspace_id`.
- **Admin**: A workspace member with the `admin` role in `workspace_members`.
- **Member**: A workspace member with the `member` role in `workspace_members`.
- **Viewer**: A workspace member with the `viewer` role in `workspace_members`.
- **Migration**: The database migration script that renames `user_id` to `reporter_id` and adds `assignee_id`, seeding it from the existing `user_id` values.
- **User_Search_API**: The `GET /api/users/search` endpoint used to find Artivaa users by name or email for assignee autocomplete.
- **Assignee_Dropdown**: The frontend searchable dropdown component used to select an assignee from Artivaa users.

---

## Requirements

### Requirement 1: Database Schema Migration

**User Story:** As a developer, I want the `action_items` table to have distinct `reporter_id` and `assignee_id` columns, so that the system correctly tracks who created an item separately from who is responsible for it.

#### Acceptance Criteria

1. THE Migration SHALL rename the `user_id` column to `reporter_id` in the `action_items` table, preserving all existing data.
2. THE Migration SHALL add an `assignee_id` column of type `uuid`, nullable, with a foreign key constraint referencing `users(id)` with `ON DELETE SET NULL`.
3. THE Migration SHALL set `assignee_id = reporter_id` for all existing rows as the initial seed value.
4. THE Migration SHALL preserve the existing `owner` text column without modification.
5. THE Migration SHALL be idempotent — running it twice SHALL NOT produce an error or duplicate data.
6. WHEN the Migration runs, THE Migration SHALL complete without data loss on the `reporter_id`, `owner`, `due_date`, `priority`, `status`, `source`, `meeting_id`, `meeting_title`, and `workspace_id` columns.

---

### Requirement 2: Reporter Immutability

**User Story:** As a product owner, I want the reporter of an action item to be immutable after creation, so that audit trails remain accurate.

#### Acceptance Criteria

1. WHEN an action item is created, THE API SHALL set `reporter_id` to the authenticated user's ID and SHALL NOT accept `reporter_id` as a client-supplied field.
2. WHEN a PATCH request includes a `reporter_id` field, THE API SHALL ignore the field and SHALL NOT update `reporter_id`.
3. THE Action_Item SHALL retain its original `reporter_id` value regardless of subsequent PATCH operations.

---

### Requirement 3: Assignee Management via API

**User Story:** As a user, I want to assign action items to specific Artivaa users, so that responsibility is clearly tracked and visible to the team.

#### Acceptance Criteria

1. WHEN a PATCH request includes `assignee_id` and the requester is an Admin, THE API SHALL update `assignee_id` to any valid user ID within the workspace.
2. WHEN a PATCH request includes `assignee_id` and the requester is the item's Reporter, THE API SHALL allow updating `assignee_id` to any valid user ID.
3. WHEN a PATCH request includes `assignee_id` and the requester is a Member who is not the Reporter, THE API SHALL return HTTP 403.
4. WHEN a PATCH request includes `assignee_id` and the requester is a Viewer, THE API SHALL return HTTP 403.
5. WHEN a PATCH request sets `assignee_id` to `null`, THE API SHALL clear the assignee and retain the `owner` text field as the display fallback.
6. WHEN a PATCH request includes `assignee_id` referencing a user ID that does not exist in the `users` table, THE API SHALL return HTTP 422 with a descriptive error message.

---

### Requirement 4: Action Items Filtering by Reporter and Assignee

**User Story:** As a user, I want action item queries to include items where I am either the reporter or the assignee, so that I see all items relevant to me.

#### Acceptance Criteria

1. WHEN `GET /api/action-items/by-user/:userId` is called in Personal_Mode, THE API SHALL return only items where `(reporter_id = userId OR assignee_id = userId) AND workspace_id IS NULL`.
2. WHEN `GET /api/action-items/by-user/:userId` is called in Workspace_Mode and the requester is a Member, THE API SHALL return only items where `workspace_id = X AND (reporter_id = userId OR assignee_id = userId)`.
3. WHEN `GET /api/action-items/by-user/:userId` is called in Workspace_Mode and the requester is an Admin, THE API SHALL return all items where `workspace_id = X` regardless of `reporter_id` or `assignee_id`.
4. WHEN `GET /api/action-items/by-user/:userId` is called in Workspace_Mode and the requester is a Viewer, THE API SHALL return all items where `workspace_id = X` (read-only access).
5. WHEN `GET /api/action-items` is called in Personal_Mode, THE API SHALL return only items where `(reporter_id = me OR assignee_id = me) AND workspace_id IS NULL`.
6. WHEN `GET /api/action-items` is called in Workspace_Mode and the requester is a Member, THE API SHALL return only items where `workspace_id = X AND (reporter_id = me OR assignee_id = me)`.

---

### Requirement 5: Visibility Invariant — Personal Mode

**User Story:** As a user in personal mode, I want to be certain I never see action items that belong to other users, so that my personal view remains private.

#### Acceptance Criteria

1. FOR ALL action items returned by the API in Personal_Mode for a given user U, EACH returned item SHALL satisfy `reporter_id = U OR assignee_id = U`.
2. WHEN a personal-mode query returns zero items, THE API SHALL return an empty array with HTTP 200, not an error.

---

### Requirement 6: Visibility Invariant — Workspace Mode

**User Story:** As a workspace admin, I want to see all workspace action items, and as a member I want to see only items relevant to me, so that access is correctly scoped.

#### Acceptance Criteria

1. FOR ALL action items returned by the API in Workspace_Mode for an Admin, EACH returned item SHALL satisfy `workspace_id = X`.
2. FOR ALL action items returned by the API in Workspace_Mode for a Member, EACH returned item SHALL satisfy `workspace_id = X AND (reporter_id = member_id OR assignee_id = member_id)`.
3. FOR ALL action items returned by the API in Workspace_Mode for a Viewer, EACH returned item SHALL satisfy `workspace_id = X`.
4. WHEN a non-member requests workspace action items, THE API SHALL return HTTP 403.

---

### Requirement 7: User Search API for Assignee Autocomplete

**User Story:** As a user, I want to search for Artivaa users by name or email when assigning an action item, so that I can quickly find and select the right person.

#### Acceptance Criteria

1. THE User_Search_API SHALL accept a query parameter `q` containing a search string of at least 1 character.
2. WHEN `GET /api/users/search?q=<term>` is called, THE User_Search_API SHALL return users whose `full_name` or `email` contains the search term (case-insensitive).
3. THE User_Search_API SHALL return results as a JSON array with fields `id`, `full_name`, and `email` only — no password hashes or sensitive fields.
4. THE User_Search_API SHALL limit results to a maximum of 20 users per request.
5. WHEN `q` is absent or empty, THE User_Search_API SHALL return HTTP 400 with a descriptive error.
6. WHEN no users match the search term, THE User_Search_API SHALL return an empty array with HTTP 200.
7. WHERE a workspace context is provided via `x-workspace-id` header, THE User_Search_API SHALL restrict results to members of that workspace only.

---

### Requirement 8: Assignee Display in Frontend

**User Story:** As a user, I want the action items table to show the correct assignee name and avatar, so that I can see at a glance who is responsible for each task.

#### Acceptance Criteria

1. WHEN an action item has a non-null `assignee_id`, THE Assignee_Column SHALL display the assignee's `full_name` resolved via the `assignee_id` JOIN.
2. WHEN an action item has a null `assignee_id` and a non-empty `owner` text value, THE Assignee_Column SHALL display the `owner` text as a fallback.
3. WHEN an action item has both a null `assignee_id` and an empty `owner`, THE Assignee_Column SHALL display "Unassigned".
4. THE API response for action item list endpoints SHALL include `assignee_name` and `assignee_email` derived from the `assignee_id` JOIN (not the `reporter_id` JOIN).

---

### Requirement 9: Assignee Edit via Searchable Dropdown

**User Story:** As an admin or reporter, I want to reassign an action item using a searchable dropdown of Artivaa users, so that I can quickly update ownership without leaving the page.

#### Acceptance Criteria

1. WHEN an Admin or Reporter clicks the assignee cell of an action item, THE Assignee_Dropdown SHALL open.
2. WHEN the Assignee_Dropdown is open, THE Assignee_Dropdown SHALL call `GET /api/users/search?q=<input>` as the user types, with a debounce of no more than 400ms.
3. WHEN the user selects a result from the Assignee_Dropdown, THE Frontend SHALL call `PATCH /api/action-items/:id` with `{ assignee_id: <selected_user_id> }`.
4. WHEN the PATCH succeeds, THE Assignee_Column SHALL update optimistically to show the newly selected user's name without a full page reload.
5. WHEN the PATCH fails, THE Frontend SHALL revert the optimistic update and display an error toast.
6. WHEN the requester is a Member who is not the Reporter, THE Assignee_Dropdown SHALL NOT be rendered for that item.
7. WHEN the requester is a Viewer, THE Assignee_Dropdown SHALL NOT be rendered for any item.

---

### Requirement 10: "Assigned to Me" Tab

**User Story:** As a user, I want a dedicated tab showing only items assigned to me, so that I can focus on my own responsibilities.

#### Acceptance Criteria

1. WHEN the "Assigned to Me" tab is selected, THE Frontend SHALL request items filtered by `assignee_id = current_user_id`.
2. WHEN the "Assigned to Me" tab is selected in Workspace_Mode, THE Frontend SHALL include the `x-workspace-id` header so workspace scoping is applied.
3. WHEN the "Assigned to Me" tab returns zero items, THE Frontend SHALL display an empty state message: "No items assigned to you".

---

### Requirement 11: "Created by Me" Tab

**User Story:** As a user, I want a dedicated tab showing only items I reported, so that I can track tasks I originated.

#### Acceptance Criteria

1. WHEN the "Created by Me" tab is selected, THE Frontend SHALL request items filtered by `reporter_id = current_user_id`.
2. WHEN the "Created by Me" tab is selected in Workspace_Mode, THE Frontend SHALL include the `x-workspace-id` header so workspace scoping is applied.
3. WHEN the "Created by Me" tab returns zero items, THE Frontend SHALL display an empty state message: "No items created by you".

---

### Requirement 12: Assignee_ID Change Authorization Invariant

**User Story:** As a security-conscious developer, I want the system to enforce that only authorised users can change the assignee, so that tasks cannot be reassigned by unauthorised parties.

#### Acceptance Criteria

1. FOR ALL PATCH requests that include `assignee_id`, THE API SHALL permit the change ONLY IF the requester is an Admin OR the requester is the item's Reporter.
2. WHEN a Member who is not the Reporter attempts to change `assignee_id`, THE API SHALL return HTTP 403 regardless of the target `assignee_id` value.
3. WHEN a Viewer attempts to change `assignee_id`, THE API SHALL return HTTP 403.
4. WHEN an unauthenticated request attempts to change `assignee_id`, THE API SHALL return HTTP 401.

---

### Requirement 13: Bulk Save Compatibility

**User Story:** As a developer, I want the bulk-save endpoint to correctly use `reporter_id` after the migration, so that meeting-extracted action items are saved with the correct reporter.

#### Acceptance Criteria

1. WHEN `POST /api/action-items/bulk-save` is called, THE API SHALL set `reporter_id` to the authenticated user's ID for all newly inserted items.
2. WHEN `POST /api/action-items/bulk-save` includes an `assignee_id` field for an item, THE API SHALL set `assignee_id` to the provided value if the requester is authorised to assign.
3. WHEN `POST /api/action-items/bulk-save` updates an existing item, THE API SHALL NOT modify `reporter_id`.

---

### Requirement 14: Export CSV Compatibility

**User Story:** As a user, I want the CSV export to include the correct assignee information after the migration, so that exported data reflects the true task ownership.

#### Acceptance Criteria

1. WHEN `GET /api/action-items/export` is called, THE API SHALL include an `assignee_name` column derived from the `assignee_id` JOIN, falling back to the `owner` text field if `assignee_id` is null.
2. THE Export SHALL NOT include `reporter_id` or `assignee_id` UUID values in the CSV output — only human-readable names.
