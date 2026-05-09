# Implementation Tasks

## Tasks

- [x] 1. Run DB migration — rename user_id → reporter_id, add assignee_id
  - [x] 1.1 Create `backend/express-api/src/db/migrations/migration_reporter_assignee.sql` with idempotent SQL (DO $$ IF EXISTS rename, ADD COLUMN IF NOT EXISTS, UPDATE WHERE NULL)
  - [x] 1.2 Run the migration against the local database
  - [x] 1.3 Verify schema: `reporter_id` exists, `user_id` gone, `assignee_id` exists and seeded

- [x] 2. Update Drizzle schema
  - [x] 2.1 In `backend/express-api/src/db/schema/action-items.ts` rename `userId` → `reporterId` (column `reporter_id`) and add `assigneeId` (column `assignee_id`, nullable FK to users, ON DELETE SET NULL)

- [x] 3. Update POST /api/action-items — use reporter_id
  - [x] 3.1 Replace `user_id` with `reporter_id` in the INSERT query; strip any client-supplied `reporter_id` from body
  - [x] 3.2 Accept optional `assignee_id` in body; default to `reporter_id` if not provided

- [x] 4. Update POST /api/action-items/bulk-save — use reporter_id
  - [x] 4.1 Replace `user_id` with `reporter_id` in INSERT; never overwrite `reporter_id` on UPDATE
  - [x] 4.2 Accept optional `assignee_id` per item

- [x] 5. Update PATCH /api/action-items/:id — assignee_id authorization
  - [x] 5.1 Fetch `reporter_id` from the item row (was `user_id`)
  - [x] 5.2 Add `assigneeId: "assignee_id"` to `fieldMap`; remove `reporter_id` from all `allowedFields`
  - [x] 5.3 Enforce: only Admin or Reporter can update `assignee_id`; return 403 otherwise
  - [x] 5.4 If `assignee_id` is non-null, verify the target user exists in `users`; return 422 if not found

- [x] 6. Update GET /api/action-items — OR filter + dual JOIN
  - [x] 6.1 Replace `ai.user_id = $userId` with `(ai.reporter_id = $userId OR ai.assignee_id = $userId)` for personal and member modes
  - [x] 6.2 Replace `LEFT JOIN users u ON u.id = ai.user_id` with dual JOIN: `LEFT JOIN users assignee ON assignee.id = ai.assignee_id` and `LEFT JOIN users reporter ON reporter.id = ai.reporter_id`
  - [x] 6.3 Return `assignee_name`, `assignee_email` from `assignee` alias; return `reporter_name` from `reporter` alias; remove old `assignee_name`/`assignee_email` derived from `user_id`

- [x] 7. Update GET /api/action-items/by-user/:userId — OR filter + tab logic
  - [x] 7.1 Replace `ai.user_id = $targetUserId` with `(ai.reporter_id = $targetUserId OR ai.assignee_id = $targetUserId)` for personal and member modes
  - [x] 7.2 Add tab handling: `assigned_to_me` → `assignee_id = requesterId`; `created_by_me` → `reporter_id = requesterId`
  - [x] 7.3 Apply dual JOIN same as task 6.2

- [x] 8. Update GET /api/action-items/export — assignee_name from assignee_id JOIN
  - [x] 8.1 Add dual JOIN to export query; output `assignee_name` (from `assignee_id` JOIN, fallback to `owner`); exclude UUID columns from CSV

- [x] 9. Update GET /api/users/search endpoint
  - [x] 9.1 In `backend/express-api/src/routes/users.ts`: return 400 when `q` is absent or empty
  - [x] 9.2 Lower minimum query length to 1 character
  - [x] 9.3 Return `{ users: [{ id, full_name, email }] }` — no other fields
  - [x] 9.4 Increase result limit to 20
  - [x] 9.5 When `x-workspace-id` header is present, JOIN `workspace_members` to restrict results to active members of that workspace

- [x] 10. Update frontend ActionItemRow type
  - [x] 10.1 In `frontend/src/app/dashboard/action-items/page.tsx` replace `user_id` with `reporter_id`; add `assignee_id: string | null`, `reporter_name: string | null`
  - [x] 10.2 Update all references from `item.user_id` → `item.reporter_id`

- [x] 11. Add "Assigned to Me" and "Created by Me" tabs
  - [x] 11.1 Update `ActionItemTab` type to include `"assigned_to_me"` and `"created_by_me"`
  - [x] 11.2 Update `TABS` array with correct labels and `highlightFor` values
  - [x] 11.3 Update `loadItems` to pass `tab=assigned_to_me` / `tab=created_by_me` to the by-user route
  - [x] 11.4 Add empty state messages: "No items assigned to you" / "No items created by you"

- [x] 12. Build AssigneeCell component
  - [x] 12.1 Create `frontend/src/features/action-items/components/AssigneeCell.tsx`
  - [x] 12.2 Display priority: `assignee_name` → `owner` → "Unassigned"
  - [x] 12.3 Render clickable dropdown only when `role === 'admin'` OR `item.reporter_id === currentUserId`
  - [x] 12.4 Implement debounced (400ms) search calling `GET /api/users/search?q=<input>` (with workspace header when in workspace mode)
  - [x] 12.5 On user select: call `PATCH /api/action-items/:id { assignee_id }` with optimistic update; revert + error toast on failure

- [x] 13. Wire AssigneeCell into action items page
  - [x] 13.1 Replace the existing assignee column inline edit with `<AssigneeCell>` in `frontend/src/app/dashboard/action-items/page.tsx`
  - [x] 13.2 Pass `currentUserId` (from Clerk `useUser().user.id` resolved to DB ID via `/api/profile/me`) and `role` props
  - [x] 13.3 Handle `onUpdate` callback to update local items state

- [x] 14. Update action item creation (New Task modal + meeting bot save)
  - [x] 14.1 In `NewTaskModal`: send `assignee_id` (selected from user search) instead of free-text `owner` when a user is selected
  - [x] 14.2 In meeting bot / AI extraction save path: keep `owner` as AI-extracted text; leave `assignee_id` null (to be assigned later)

- [x] 15. Update PDF export
  - [x] 15.1 In `frontend/src/features/meetings/utils/generate-meeting-pdf.ts` update action items table to show `assignee_name` (fallback to `owner`) instead of `item.owner` directly

- [ ]* 16. Property-based tests
  - [ ]* 16.1 P3 — reporter_id always equals auth user on creation (fast-check, 100 runs)
  - [ ]* 16.2 P4 — reporter_id immutable under PATCH (fast-check, 100 runs)
  - [ ]* 16.3 P5 — authorized users can update assignee_id (fast-check, 100 runs)
  - [ ]* 16.4 P6 — unauthorized roles cannot update assignee_id (fast-check, 100 runs)
  - [ ]* 16.5 P7 — invalid assignee_id returns 422 (fast-check, 100 runs)
  - [ ]* 16.6 P8 — personal mode visibility invariant (fast-check, 100 runs)
  - [ ]* 16.7 P9 — workspace member visibility invariant (fast-check, 100 runs)
  - [ ]* 16.8 P10 — workspace admin/viewer sees all workspace items (fast-check, 100 runs)
  - [ ]* 16.9 P11 — non-member gets 403 (fast-check, 100 runs)
  - [ ]* 16.10 P12 — user search returns only matching users, max 20 (fast-check, 100 runs)
  - [ ]* 16.11 P13 — user search response contains only safe fields (fast-check, 100 runs)
  - [ ]* 16.12 P14 — workspace-scoped search restricts to workspace members (fast-check, 100 runs)
  - [ ]* 16.13 P15 — assignee display priority order (fast-check, 100 runs)
  - [ ]* 16.14 P16 — assignee dropdown not rendered for unauthorized roles (fast-check + RTL, 100 runs)
  - [ ]* 16.15 P17 — CSV export assignee column correctness (fast-check, 100 runs)
