# Implementation Plan: Workspace Invite Flow

## Overview

Implement a token-based email invitation system for workspaces. Tasks are ordered by dependency: DB schema first, then utilities, then API routes, then frontend. Each task builds on the previous.

## Tasks

- [x] 1. Database schema — `workspace_invites` table
  - Add `workspaceInvites` Drizzle table definition to the existing schema file (alongside `workspaces` and `workspace_members`)
  - Include all columns: `id`, `workspaceId`, `invitedEmail`, `invitedBy`, `token`, `status`, `expiresAt`, `acceptedAt`, `createdAt`
  - Add the three indexes: unique token index, partial unique index on `(workspaceId, invitedEmail)` WHERE `status = 'pending'`, and workspace lookup index
  - Generate and apply the Drizzle migration (`drizzle-kit generate` + `drizzle-kit migrate`)
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 10.1_

- [x] 2. Token generation utility
  - [x] 2.1 Create `frontend/src/lib/invites/token.ts`
    - Implement `generateInviteToken()` using `crypto.randomBytes(32).toString("hex")`
    - Implement `getInviteExpiresAt(createdAt: Date): Date` returning `createdAt + 7 days`
    - _Requirements: 1.4, 1.5, 9.1_

  - [x]* 2.2 Write property tests for token utility
    - **Property 1: Token uniqueness and entropy** — generate N tokens, assert all unique and each ≥ 64 chars of valid hex
    - **Property 2: Expiry invariant** — for any `createdAt` date, assert `expiresAt - createdAt === 604800000 ms`
    - Test file: `frontend/src/tests/workspace-integration/invite-token.property.test.ts`
    - **Validates: Requirements 1.4, 1.5, 9.1**

- [x] 3. Email sending utility
  - [x] 3.1 Create `frontend/src/lib/invites/email.ts`
    - Implement `sendInviteEmail({ to, workspaceName, inviterName, acceptLink })` using Nodemailer with env vars `INVITE_EMAIL_FROM`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` (or `RESEND_API_KEY`)
    - Build the HTML email template inline: include workspace name, inviter display name, and the accept link button
    - Export a typed `InviteEmailParams` interface
    - _Requirements: 3.7, 9.2_

  - [ ]* 3.2 Write unit tests for email template
    - Assert rendered template contains workspace name, inviter name, and `/invite/<token>` URL
    - Test file: `frontend/src/tests/workspace-integration/invite-email.test.ts`
    - **Validates: Requirements 3.7**

- [x] 4. Checkpoint — utilities ready
  - Ensure token generation and email utility compile without errors; run `vitest --run` on the two test files above.

- [x] 5. API route — suggestions
  - [x] 5.1 Create `frontend/src/app/api/workspace/[workspaceId]/invite/suggestions/route.ts`
    - Auth check: verify Clerk session + `owner`/`admin` role → 403 if not
    - Return `{ suggestions: [] }` when `q` is absent or `q.length < 2` (no DB query)
    - Query `users` table for emails containing `q` (case-insensitive), exclude emails with a `pending` invite for this workspace, exclude existing active members, limit 5
    - Return `{ suggestions: string[] }` — email strings only, no other fields
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9_

  - [ ]* 5.2 Write property tests for suggestions endpoint
    - **Property 4: Suggestions return only email addresses** — assert every item in `suggestions` is a plain string
    - **Property 5: Suggestions count bound** — assert `suggestions.length <= 5` for any dataset
    - **Property 6: Suggestions exclusions** — assert no pending-invite or existing-member email appears in results
    - **Property 7: Short query returns empty** — assert empty array for `q` with `length < 2`
    - Test file: `frontend/src/tests/workspace-integration/invite-suggestions.property.test.ts`
    - **Validates: Requirements 2.4, 2.5, 2.6, 2.7, 2.8, 2.9**

  - [ ]* 5.3 Write unit tests for suggestions route
    - Test 403 for non-admin caller
    - Test empty array for short `q`
    - Test correct exclusions (pending invite, existing member)
    - Test file: `frontend/src/tests/workspace-integration/invite-suggestions.test.ts`
    - **Validates: Requirements 2.2, 2.6, 2.7, 2.8**

- [x] 6. API route — list pending invites
  - Create `frontend/src/app/api/workspace/[workspaceId]/invite/route.ts` (GET handler)
  - Auth check: `owner`/`admin` role → 403 if not
  - Query `workspace_invites` WHERE `workspaceId = ?` AND `status = 'pending'` AND `expiresAt > NOW()`
  - Return `{ invites: { id, invitedEmail, createdAt, expiresAt }[] }`
  - _Requirements: 8.1, 8.8_

- [x] 7. API route — send invite (POST)
  - Add POST handler to `frontend/src/app/api/workspace/[workspaceId]/invite/route.ts`
  - Auth check: `owner`/`admin` role → 403
  - Validate email format → 400 `invalid_email`
  - Check for existing pending invite → 409 `invite_already_pending`
  - Check if already a member → 409 `already_a_member`
  - Generate token via `generateInviteToken()`, set `expiresAt` via `getInviteExpiresAt()`
  - Insert invite row; call `sendInviteEmail()`; on email failure delete the row and return 502 `email_send_failed`
  - Return 201 `{ id, expiresAt }` on success
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10, 9.2_

  - [ ]* 7.1 Write property tests for send invite
    - **Property 8: Send invite authorization** — assert 403 for any non-owner/admin caller
    - **Property 9: Invalid email rejected** — for any non-email string, assert 400 `invalid_email`
    - **Property 11: Token absent from API responses** — assert response body has no `token` field
    - Test file: `frontend/src/tests/workspace-integration/invite-send.property.test.ts`
    - **Validates: Requirements 3.2, 3.3, 9.2**

  - [ ]* 7.2 Write unit tests for send invite route
    - Test 409 duplicate invite, 409 already a member, 502 on email failure with rollback, 201 success
    - Test file: `frontend/src/tests/workspace-integration/invite-send.test.ts`
    - **Validates: Requirements 3.4, 3.5, 3.9**

- [x] 8. API route — revoke invite (DELETE)
  - Create `frontend/src/app/api/workspace/[workspaceId]/invite/[inviteId]/route.ts` (DELETE handler)
  - Auth check: `owner`/`admin` role → 403
  - Set `status = 'revoked'` for the given `inviteId` (only if currently `pending`)
  - Return 200 on success
  - _Requirements: 8.9, 8.10_

  - [ ]* 8.1 Write unit tests for revoke route
    - Test 403 for non-admin, 200 success, no-op if already revoked/accepted
    - **Property 21: Revoke authorization** — assert 403 for any non-owner/admin
    - Test file: `frontend/src/tests/workspace-integration/invite-revoke.test.ts`
    - **Validates: Requirements 8.10**

- [x] 9. API route — validate token (GET)
  - Create `frontend/src/app/api/invite/validate/route.ts`
  - No auth required (public route)
  - Check existence → 404 `token_not_found`
  - Check `expiresAt < NOW()` → 410 `token_expired` (evaluated at query time, no status column update needed)
  - Check `status = 'accepted'` → 410 `token_already_used`
  - Check `status = 'revoked'` → 410 `token_revoked`
  - Return 200 `{ workspaceId, workspaceName, invitedEmail, inviterName }` for valid tokens
  - Enforce check order: existence → expiry → status
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 9.7_

  - [ ]* 9.1 Write property tests for validate endpoint
    - **Property 12: Validate response contains required fields** — assert all four fields present for valid token
    - **Property 13: Validation check ordering** — for tokens failing multiple checks, assert first-failing-check error is returned
    - **Property 23: Logical expiry** — for any past `expiresAt` with `status = 'pending'`, assert 410 `token_expired`
    - Test file: `frontend/src/tests/workspace-integration/invite-validate.property.test.ts`
    - **Validates: Requirements 4.6, 4.7, 9.7**

  - [ ]* 9.2 Write unit tests for validate route
    - Test each error code: 404, 410 expired, 410 already_used, 410 revoked, 200 success
    - Test file: `frontend/src/tests/workspace-integration/invite-validate.test.ts`
    - **Validates: Requirements 4.2, 4.3, 4.4, 4.5, 4.6**

- [x] 10. API route — accept invite (POST)
  - Create `frontend/src/app/api/invite/accept/route.ts`
  - Require authenticated Clerk session → 401 if absent
  - Resolve user identity (userId + email) from session only — never from request body
  - Run same token checks as validate (existence, expiry, status)
  - Check email match → 403 `email_mismatch`
  - Open DB transaction: `SELECT ... FOR UPDATE` on invite row, `INSERT INTO workspace_members` (skip if already exists), `UPDATE invite SET status='accepted', acceptedAt=NOW()`, COMMIT
  - Return 200 `{ workspaceId }`
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 5.9, 9.3, 9.4, 9.5, 9.6_

  - [ ]* 10.1 Write property tests for accept endpoint
    - **Property 14: Email mismatch rejected** — for any two distinct emails, assert 403 `email_mismatch`
    - **Property 15: Successful accept creates workspace member** — assert member row exists with `role='member'`, `status='active'`
    - **Property 16: Accept atomicity** — assert both member row and `status='accepted'` are present after success
    - **Property 17: Accept idempotency** — for already-member user, assert 200 and no duplicate member row
    - **Property 18: Unauthenticated accept rejected** — assert 401 for any unauthenticated request
    - **Property 22: Terminal status immutability** — for `status='revoked'` or `'accepted'`, assert 410 and no new member row
    - **Property 24: Double-accept prevention** — simulate two concurrent accepts, assert only one member row created
    - Test file: `frontend/src/tests/workspace-integration/invite-accept.property.test.ts`
    - **Validates: Requirements 5.2, 5.3, 5.4, 5.5, 5.6, 5.8, 9.3, 9.4, 9.5, 9.6**

  - [ ]* 10.2 Write unit tests for accept route
    - Test 401 no session, 403 email mismatch, 200 success, 200 idempotent (already member), 410 revoked token
    - Test file: `frontend/src/tests/workspace-integration/invite-accept.test.ts`
    - **Validates: Requirements 5.2, 5.4, 5.7, 5.8**

- [x] 11. Checkpoint — all API routes complete
  - Ensure all routes compile; run `vitest --run` on all test files created so far.

- [x] 12. `/invite/[token]` page
  - Create `frontend/src/app/invite/[token]/page.tsx` as a client component
  - On mount: call `GET /api/invite/validate?token=<token>`
  - If invalid/expired: render error card with reason and link to `/dashboard`
  - If valid and unauthenticated: call `GET /api/users/exists?email=<invitedEmail>` to check for existing account; redirect to `/sign-up?redirect=/invite/<token>` or `/sign-in?redirect=/invite/<token>` accordingly
  - If valid and authenticated: call `POST /api/invite/accept`; on success redirect to `/dashboard?workspace=<workspaceId>`; on 403 `email_mismatch` render mismatch UI showing both emails with switch-account option; on other errors render error card
  - Show loading spinner during all async operations
  - No manual user input required beyond authentication
  - _Requirements: 6.1, 6.3, 6.4, 6.5, 6.6, 6.7, 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 7.9, 7.10_

  - [ ]* 12.1 Write property tests for invite handler routing
    - **Property 19: Invite handler routing for unauthenticated users** — for any valid token + unauthenticated visitor, assert redirect to correct sign-up or sign-in URL
    - **Property 20: Auto-accept for all authenticated users** — for any authenticated user with matching invite, assert accept is called and redirect to dashboard
    - Test file: `frontend/src/tests/workspace-integration/invite-page.property.test.ts`
    - **Validates: Requirements 7.4, 7.5, 7.6, 6.1, 6.4, 6.5**

  - [ ]* 12.2 Write unit tests for invite page
    - Test error state render for invalid token
    - Test mismatch UI render for 403 response
    - Test loading spinner shown during async ops
    - Test file: `frontend/src/tests/workspace-integration/invite-page.test.ts`
    - **Validates: Requirements 7.3, 7.7, 7.9**

- [x] 13. `InviteMembersCard` component
  - Create `frontend/src/components/workspace/InviteMembersCard.tsx`
  - Email input with debounced autocomplete (300 ms debounce, fires after 2+ chars) calling `GET /api/workspace/[workspaceId]/invite/suggestions`
  - Dropdown showing email-only suggestions; selecting one fills the input
  - Submit button calling `POST /api/workspace/[workspaceId]/invite`; show inline success message on 201
  - Show "An invite is already pending for this email." on 409 `invite_already_pending`
  - Show "This user is already a member of the workspace." on 409 `already_a_member`
  - Pending invites list: fetch from `GET /api/workspace/[workspaceId]/invite`; display `invitedEmail`, `createdAt`, `expiresAt`; Revoke button calls `DELETE /api/workspace/[workspaceId]/invite/[inviteId]` and removes item from list on success
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8, 8.9_

- [x] 14. Wire `InviteMembersCard` into workspace management view
  - Import and render `<InviteMembersCard workspaceId={...} />` inside the existing `WorkspaceManagementView` component, gated on `canManage` (role `owner` or `admin`)
  - No other changes to existing workspace pages or routes
  - _Requirements: 8.1, 10.2, 10.6_

- [ ] 15. Integration tests — full invite flow
  - [ ]* 15.1 Write integration test: full happy path
    - Create invite → validate token → accept → assert `workspace_members` row exists
    - Test file: `frontend/src/tests/workspace-integration/invite-flow.integration.test.ts`
    - **Validates: Requirements 5.5, 5.6, 5.9**

  - [ ]* 15.2 Write integration test: rollback on email failure
    - Create invite → mock email send to throw → assert invite row is deleted
    - **Validates: Requirements 3.9**

  - [ ]* 15.3 Write integration test: concurrent accept
    - Two simultaneous `POST /api/invite/accept` requests for the same token → assert exactly one `workspace_members` row and one `status='accepted'` invite
    - **Validates: Requirements 9.5**

- [ ] 16. Final checkpoint — all tests pass
  - Run `vitest --run` across all test files; ensure zero failures before marking feature complete.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- All property tests use fast-check with `{ numRuns: 100 }` and include a comment tag: `// Feature: workspace-invite-flow, Property N: <property_text>`
- Token is never returned in any API response — only delivered via email (Requirements 9.2)
- The accept transaction uses `SELECT ... FOR UPDATE` to serialize concurrent requests (Requirements 9.5)
- Expiry is evaluated at query time against `NOW()`; no background job needed (Requirements 9.7)
