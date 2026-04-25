# Requirements Document

## Introduction

This feature adds a member invitation flow to the Artivaa workspace system. Workspace owners and admins can invite users by email from the Workspace Management page. The system sends a secure, token-based invite email. When the recipient clicks the link, they are automatically added to the workspace — either directly (if already an Artivaa user) or after completing signup (if new). The existing workspace system, personal mode, bot pipeline, billing, and authentication must not be modified.

## Glossary

- **System**: The Artivaa Next.js application (frontend + API routes).
- **Invite**: A row in the `workspace_invites` table representing a pending invitation to join a workspace.
- **Invite_Token**: A cryptographically secure, unique, URL-safe string stored on an Invite row and embedded in the invite link.
- **Inviter**: The authenticated Workspace_Member (with role `owner` or `admin`) who initiates an invitation.
- **Invitee**: The person whose email address is the target of an Invite.
- **Workspace_Member**: A row in `workspace_members` linking a user to a workspace with a role.
- **Email_Search_Service**: The backend service that queries the users table for email-prefix matches to power autocomplete suggestions.
- **Invite_Email**: The transactional email sent to the Invitee containing the workspace name, Inviter info, and an Accept Invite link.
- **Accept_Link**: The URL embedded in the Invite_Email, of the form `/invite/<Invite_Token>`.
- **Invite_Handler**: The page at `/invite/[token]` that processes an incoming Accept_Link click.
- **Registered_User**: A user who already has an account in Artivaa (exists in the users/Clerk table).
- **New_User**: A person who does not yet have an Artivaa account at the time the invite is accepted.
- **Workspace_Dashboard**: The dashboard page scoped to a specific workspace, reached via `/dashboard?workspace=<workspaceId>`.

---

## Requirements

### Requirement 1: Invite Data Model

**User Story:** As a developer, I want a dedicated invites table so that invite state, expiry, and usage can be tracked independently of workspace membership.

#### Acceptance Criteria

1. THE System SHALL create a `workspace_invites` table with columns: `id` (uuid, primary key), `workspaceId` (varchar, not null), `invitedEmail` (varchar, not null), `invitedBy` (varchar, not null, stores the Inviter's userId), `token` (varchar, not null, unique), `status` (varchar, not null, default `'pending'`), `expiresAt` (timestamp, not null), `acceptedAt` (timestamp, nullable), `createdAt` (timestamp, default now).
2. FOR ALL Invite rows, THE System SHALL ensure `status` is one of: `'pending'`, `'accepted'`, `'expired'`, `'revoked'`.
3. THE System SHALL create a unique index on `(workspaceId, invitedEmail)` WHERE `status = 'pending'` to prevent duplicate active invites for the same email and workspace combination.
4. THE System SHALL ensure `token` values are generated using a cryptographically secure random function producing at least 32 bytes of entropy, encoded as a URL-safe string.
5. THE System SHALL set `expiresAt` to exactly 7 days after `createdAt` for every newly created Invite.

### Requirement 2: Email Autocomplete Suggestions

**User Story:** As a workspace admin, I want email suggestions while typing in the invite input so that I can quickly find existing Artivaa users without needing to remember exact addresses.

#### Acceptance Criteria

1. THE System SHALL provide a `GET /api/workspace/[workspaceId]/invite/suggestions` API route that accepts a `q` query parameter containing a partial email string.
2. WHEN `GET /api/workspace/[workspaceId]/invite/suggestions` is called, THE System SHALL verify the authenticated user is an active Workspace_Member with role `owner` or `admin`; IF NOT, THE System SHALL return HTTP 403.
3. WHEN the `q` parameter is provided, THE Email_Search_Service SHALL return users whose email address contains the `q` string (case-insensitive prefix or substring match).
4. THE Email_Search_Service SHALL return only the `email` field for each matching user; it SHALL NOT return user names, IDs, or any other personal data in the suggestion list.
5. THE Email_Search_Service SHALL return a maximum of 5 suggestions per query.
6. THE System SHALL exclude from suggestions any email addresses that already have a `'pending'` Invite for the same workspace.
7. THE System SHALL exclude from suggestions any email addresses that already belong to an active Workspace_Member of the same workspace.
8. WHEN the `q` parameter is absent or fewer than 2 characters, THE System SHALL return an empty suggestions array without querying the database.
9. FOR ALL suggestion responses, THE System SHALL ensure no user name, userId, or non-email personal data is included.

### Requirement 3: Send Invite

**User Story:** As a workspace owner or admin, I want to send an invite to any valid email address so that I can add both existing and new users to my workspace.

#### Acceptance Criteria

1. THE System SHALL provide a `POST /api/workspace/[workspaceId]/invite` API route that accepts `{ email: string }` in the request body.
2. WHEN `POST /api/workspace/[workspaceId]/invite` is called, THE System SHALL verify the authenticated user is an active Workspace_Member with role `owner` or `admin`; IF NOT, THE System SHALL return HTTP 403.
3. WHEN `POST /api/workspace/[workspaceId]/invite` is called, THE System SHALL validate that `email` is a syntactically valid email address; IF NOT, THE System SHALL return HTTP 400 with error code `'invalid_email'`.
4. WHEN a `'pending'` Invite already exists for the same `workspaceId` and `invitedEmail`, THE System SHALL return HTTP 409 with error code `'invite_already_pending'` without creating a duplicate Invite row.
5. WHEN the `invitedEmail` already belongs to an active Workspace_Member of the workspace, THE System SHALL return HTTP 409 with error code `'already_a_member'`.
6. WHEN all validations pass, THE System SHALL create an Invite row with a unique Invite_Token, `status = 'pending'`, and `expiresAt` set to 7 days from creation time.
7. WHEN the Invite row is created, THE System SHALL send an Invite_Email to `invitedEmail` containing: the workspace name, the Inviter's display name, and the Accept_Link of the form `/invite/<Invite_Token>`.
8. WHEN the Invite_Email is sent successfully, THE System SHALL return HTTP 201 with the created invite's `id` and `expiresAt`.
9. IF the email sending service fails, THEN THE System SHALL delete the created Invite row and return HTTP 502 with error code `'email_send_failed'` so that no orphaned pending invites exist.
10. FOR ALL created Invite rows, THE System SHALL ensure `token` is unique across the entire `workspace_invites` table.

### Requirement 4: Invite Token Validation

**User Story:** As a developer, I want a token validation endpoint so that the accept flow can verify an invite before taking any action.

#### Acceptance Criteria

1. THE System SHALL provide a `GET /api/invite/validate?token=<Invite_Token>` API route.
2. WHEN `GET /api/invite/validate` is called with a token that does not exist in the `workspace_invites` table, THE System SHALL return HTTP 404 with error code `'token_not_found'`.
3. WHEN `GET /api/invite/validate` is called with a token whose `expiresAt` is in the past, THE System SHALL return HTTP 410 with error code `'token_expired'`.
4. WHEN `GET /api/invite/validate` is called with a token whose `status` is `'accepted'`, THE System SHALL return HTTP 410 with error code `'token_already_used'`.
5. WHEN `GET /api/invite/validate` is called with a token whose `status` is `'revoked'`, THE System SHALL return HTTP 410 with error code `'token_revoked'`.
6. WHEN `GET /api/invite/validate` is called with a valid token (`status = 'pending'` and `expiresAt` in the future), THE System SHALL return HTTP 200 with: `workspaceId`, `workspaceName`, `invitedEmail`, and `inviterName`.
7. FOR ALL token validation responses, THE System SHALL evaluate `status` and `expiresAt` checks in the order: existence → expiry → status; the first failing check determines the error returned.

### Requirement 5: Accept Invite — Registered User

**User Story:** As an existing Artivaa user, I want clicking the invite link to automatically add me to the workspace so that I don't have to take any manual steps after clicking.

#### Acceptance Criteria

1. THE System SHALL provide a `POST /api/invite/accept` API route that accepts `{ token: string }` in the request body.
2. WHEN `POST /api/invite/accept` is called without an authenticated session, THE System SHALL return HTTP 401; THE System SHALL NOT accept an invite or add any user to a workspace without a verified authenticated session.
3. THE System SHALL resolve the accepting user's identity exclusively from the authenticated Clerk session (userId and email); THE System SHALL NOT trust any email or userId value supplied by the frontend request body.
4. WHEN `POST /api/invite/accept` is called and the authenticated user's email does not match the Invite's `invitedEmail`, THE System SHALL return HTTP 403 with error code `'email_mismatch'`.
5. WHEN `POST /api/invite/accept` is called with a valid token and the authenticated user's email matches `invitedEmail`, THE System SHALL create a Workspace_Member row with role `'member'` for the authenticated user in the specified workspace.
6. WHEN the Workspace_Member row is created, THE System SHALL set the Invite's `status` to `'accepted'` and `acceptedAt` to the current timestamp atomically in the same database transaction.
7. WHEN `POST /api/invite/accept` succeeds, THE System SHALL return HTTP 200 with `{ workspaceId }` so the client can redirect to the Workspace_Dashboard.
8. IF the user is already an active Workspace_Member of the workspace at the time of acceptance, THEN THE System SHALL still mark the Invite as `'accepted'` and return HTTP 200 with `{ workspaceId }` without creating a duplicate Workspace_Member row.
9. FOR ALL successful accept operations, THE System SHALL ensure the Invite `status` equals `'accepted'` and `acceptedAt` is non-null after the operation completes.

### Requirement 6: Accept Invite — New User (Post-Signup)

**User Story:** As a new user who received an invite, I want to be automatically added to the workspace after completing signup so that I land directly in the right workspace without extra steps.

#### Acceptance Criteria

1. WHEN the Invite_Handler page loads with a valid token and the user is not authenticated and has no existing account, THE Invite_Handler SHALL redirect to `/sign-up?redirect=/invite/<token>`.
2. WHEN the signup page detects a `redirect` query parameter pointing to `/invite/<token>`, THE System SHALL display a contextual message indicating the user is signing up to join a specific workspace (using the workspace name fetched from `GET /api/invite/validate?token=<token>`).
3. WHEN a New_User completes signup, THE System SHALL redirect the user to the URL specified in the `redirect` query parameter (i.e., back to `/invite/<token>`).
4. WHEN the New_User lands on `/invite/<token>` after completing signup and is now authenticated, THE Invite_Handler SHALL automatically call `POST /api/invite/accept` using the same logic applied to all authenticated users.
5. WHEN the accept call succeeds, THE System SHALL redirect the New_User to the Workspace_Dashboard at `/dashboard?workspace=<workspaceId>`.
6. IF the accept call fails after signup (e.g., token expired during signup), THEN THE System SHALL display an error message on the `/invite/<token>` page explaining the invite could not be accepted, without blocking access to the account.
7. THE System SHALL NOT require a separate post-signup callback or any special invite handling outside of the `/invite/<token>` page; the `/invite/<token>` page is the single point of acceptance for all authenticated users regardless of whether they are New_Users or Registered_Users.
8. THE System SHALL NOT require the New_User to re-enter their email address at any point in the invite acceptance flow.

### Requirement 7: Invite Accept Handler Page

**User Story:** As an invitee, I want the invite link to handle all routing decisions automatically so that I always end up in the right place without confusion.

#### Acceptance Criteria

1. THE System SHALL provide a page at `/invite/[token]` that reads the token from the URL path parameter on load.
2. WHEN the `/invite/[token]` page loads, THE System SHALL call `GET /api/invite/validate?token=<token>` before taking any routing action.
3. WHEN the token is invalid or expired, THE Invite_Handler SHALL display a clear error message stating the reason (expired, already used, or not found) and provide a link to `/dashboard`.
4. WHEN the token is valid and the user is NOT authenticated, THE Invite_Handler SHALL determine whether the user has an existing account: IF the user has no account, THE Invite_Handler SHALL redirect to `/sign-up?redirect=/invite/<token>`; IF the user has an account but is not logged in, THE Invite_Handler SHALL redirect to `/sign-in?redirect=/invite/<token>`.
5. WHEN the user returns to `/invite/<token>` after completing sign-in or sign-up and is now authenticated, THE Invite_Handler SHALL automatically call `POST /api/invite/accept` and redirect to `/dashboard?workspace=<workspaceId>` on success.
6. WHEN the token is valid and the user is already authenticated, THE Invite_Handler SHALL automatically call `POST /api/invite/accept` and redirect to `/dashboard?workspace=<workspaceId>` on success.
7. WHEN `POST /api/invite/accept` returns HTTP 403 with `'email_mismatch'`, THE Invite_Handler SHALL display the message: "This invite was sent to [invitedEmail], but you are logged in as [currentEmail]." and offer the user options to switch account or continue with the current account.
8. THE Invite_Handler SHALL apply identical auto-accept logic for all authenticated users regardless of whether they arrived via sign-in or sign-up; there is no separate code path for New_Users after authentication.
9. THE Invite_Handler SHALL complete all routing decisions without requiring any manual input from the user beyond authentication.
10. THE System SHALL NEVER add a user to a workspace via the invite flow without a verified authenticated session; unauthenticated requests to `/invite/[token]` SHALL always result in a redirect to authentication before any acceptance action is taken.

### Requirement 8: Invite Management UI

**User Story:** As a workspace owner or admin, I want to send invites and see pending invites from the Workspace Management page so that I can track who has been invited.

#### Acceptance Criteria

1. THE System SHALL display an "Invite Members" section on the Workspace_Management_Page when the authenticated user has role `owner` or `admin`.
2. THE "Invite Members" section SHALL contain an email input field that shows autocomplete suggestions from `GET /api/workspace/[workspaceId]/invite/suggestions` as the user types.
3. THE autocomplete suggestions SHALL display only email addresses, not user names.
4. THE email input SHALL accept any syntactically valid email address, not only addresses returned by autocomplete.
5. WHEN the user submits the invite form, THE System SHALL call `POST /api/workspace/[workspaceId]/invite` and display a success message on HTTP 201.
6. WHEN `POST /api/workspace/[workspaceId]/invite` returns HTTP 409 with `'invite_already_pending'`, THE System SHALL display the message "An invite is already pending for this email."
7. WHEN `POST /api/workspace/[workspaceId]/invite` returns HTTP 409 with `'already_a_member'`, THE System SHALL display the message "This user is already a member of the workspace."
8. THE System SHALL display a list of pending invites showing: `invitedEmail`, `createdAt`, and `expiresAt` for each Invite with `status = 'pending'`.
9. WHEN the Inviter clicks "Revoke" on a pending invite, THE System SHALL call `DELETE /api/workspace/[workspaceId]/invite/[inviteId]` and remove the invite from the pending list on success.
10. THE System SHALL provide a `DELETE /api/workspace/[workspaceId]/invite/[inviteId]` API route that sets the Invite `status` to `'revoked'`; only the Inviter or a workspace `owner`/`admin` may revoke an invite.

### Requirement 9: Security and Token Integrity

**User Story:** As a developer, I want all invite operations to be secure and tamper-proof so that unauthorized users cannot join workspaces or exploit the invite system.

#### Acceptance Criteria

1. THE System SHALL generate Invite_Tokens using a cryptographically secure random number generator (e.g., `crypto.randomBytes`) producing at least 32 bytes, encoded as a hex or base64url string.
2. THE System SHALL NOT expose the Invite_Token in any API response other than the Invite_Email itself.
3. WHEN `POST /api/invite/accept` is called without an authenticated session, THE System SHALL return HTTP 401.
4. THE System SHALL enforce that only a user whose authenticated email matches `invitedEmail` can accept an Invite; no other user may accept on their behalf.
5. THE System SHALL run token existence, expiry, and status checks inside a database transaction when accepting an invite to prevent race conditions from double-acceptance.
6. THE System SHALL NOT allow a revoked or expired token to be reactivated; once `status` is `'revoked'` or `'expired'`, it is immutable.
7. FOR ALL Invite rows with `expiresAt` in the past and `status = 'pending'`, THE System SHALL treat them as expired during validation even if a background job has not yet updated their `status` column.

### Requirement 10: No Disruption to Existing Workspace System

**User Story:** As a developer, I want the invite feature to be additive so that no existing workspace functionality, personal mode, or other system is broken.

#### Acceptance Criteria

1. THE System SHALL NOT modify the `workspace_members`, `workspaces`, `meeting_sessions`, or `action_items` table schemas beyond adding the new `workspace_invites` table.
2. THE System SHALL NOT modify any existing API route outside of the new invite-specific routes.
3. THE System SHALL NOT require a `workspaceId` or invite token on any existing personal-mode API route.
4. THE System SHALL NOT modify the bot join flow, recording pipeline, transcription pipeline, Gemini summary generation, billing/Razorpay integration, or Clerk authentication flows.
5. WHEN a user accepts an invite and becomes a Workspace_Member, THE System SHALL use the same `workspace_members` row structure and role values (`'member'`, `'admin'`, `'owner'`) as the existing workspace system.
6. FOR ALL existing workspace pages and API routes, THE System SHALL ensure they continue to function identically before and after the invite feature is deployed.
