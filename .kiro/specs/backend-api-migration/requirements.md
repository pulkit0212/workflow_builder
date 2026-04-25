# Requirements Document

## Introduction

This feature migrates all API logic from Next.js API routes (`frontend/src/app/api/`) to a standalone Express.js server in `backend/`. The frontend will become a pure UI layer that communicates with the Express backend over HTTP. The migration covers eight API domains: Meetings, Calendar, Integrations, Auth/User sync, Workspaces, Action Items, Settings, and Recordings. Auth remains Clerk-based; the database remains PostgreSQL with Drizzle ORM. The Python bot in `backend/python-services/` is out of scope and must not be modified. The target response time for all migrated endpoints is under 500ms (down from the current 3–4 seconds).

## Glossary

- **Express_Server**: The standalone Node.js/Express.js HTTP server running in `backend/express-api/`.
- **Frontend**: The Next.js application in `frontend/` that serves only UI code after migration.
- **Clerk**: The third-party authentication provider used for user identity and JWT issuance.
- **Drizzle_ORM**: The TypeScript ORM used to interact with the PostgreSQL database.
- **DB**: The PostgreSQL database shared between the Express_Server and the existing NestJS microservices.
- **Clerk_Middleware**: Express middleware that validates Clerk JWTs on incoming requests.
- **User_Sync**: The process of upserting a Clerk identity into the DB `users` table on first access.
- **Bot**: The Python-based AI processing service located in `backend/python-services/ai-processing-service/legacy-bot/`.
- **Calendar_Provider**: One of `google`, `microsoft_teams`, or `microsoft_outlook`.
- **Integration**: A third-party service connection (Slack, Gmail, Notion, or Jira) stored per user.
- **Workspace**: A shared collaboration space that groups users and meetings.
- **Action_Item**: A task extracted from a meeting, owned by a user and optionally scoped to a Workspace.
- **Recording**: An audio file (WAV) associated with a meeting session, stored on disk.
- **CORS_Policy**: The set of allowed origins, methods, and headers configured on the Express_Server.
- **Rate_Limiter**: Per-route or per-user request throttling enforced by the Express_Server.

---

## Requirements

### Requirement 1: Express Server Bootstrap

**User Story:** As a backend engineer, I want a standalone Express.js server, so that API logic runs independently of the Next.js runtime.

#### Acceptance Criteria

1. THE Express_Server SHALL start on a configurable port (default `3001`) read from the `PORT` environment variable.
2. THE Express_Server SHALL connect to the DB using the `DATABASE_URL` environment variable via Drizzle_ORM on startup.
3. IF `DATABASE_URL` is not set, THEN THE Express_Server SHALL log a fatal error and exit with a non-zero code.
4. THE Express_Server SHALL expose a `GET /health` endpoint that returns HTTP 200 with `{ "status": "ok" }` within 100ms.
5. THE Express_Server SHALL apply CORS_Policy allowing origins listed in the `ALLOWED_ORIGINS` environment variable.
6. THE Express_Server SHALL parse JSON request bodies up to 1MB in size.
7. THE Express_Server SHALL apply structured JSON request logging for every inbound HTTP request.

---

### Requirement 2: Authentication Middleware

**User Story:** As a backend engineer, I want Clerk JWT validation on all protected routes, so that only authenticated users can access API data.

#### Acceptance Criteria

1. THE Clerk_Middleware SHALL extract the Bearer token from the `Authorization` header on every protected request.
2. WHEN a request carries a valid Clerk JWT, THE Clerk_Middleware SHALL attach the decoded `clerkUserId` to the request context.
3. IF a request is missing the `Authorization` header, THEN THE Clerk_Middleware SHALL return HTTP 401 with `{ "error": "Unauthorized" }`.
4. IF a request carries an invalid or expired Clerk JWT, THEN THE Clerk_Middleware SHALL return HTTP 401 with `{ "error": "Unauthorized" }`.
5. WHEN a protected route is accessed, THE Express_Server SHALL perform User_Sync by upserting the Clerk identity into the DB `users` table before executing route logic.
6. THE Express_Server SHALL cache the result of User_Sync in memory per `clerkUserId` for 60 seconds to avoid redundant DB writes.

---

### Requirement 3: Meetings API

**User Story:** As a user, I want to create, read, update, and delete meeting sessions, so that I can manage my meetings through the application.

#### Acceptance Criteria

1. THE Express_Server SHALL expose `GET /api/meetings` returning all non-draft meeting sessions owned by the authenticated user.
2. THE Express_Server SHALL expose `POST /api/meetings` accepting a JSON body validated against the meeting creation schema and returning the created session with HTTP 201.
3. THE Express_Server SHALL expose `GET /api/meetings/:id` returning the meeting session with the given ID if the authenticated user owns it or is a workspace member with access.
4. THE Express_Server SHALL expose `PATCH /api/meetings/:id` accepting a partial update body and returning the updated session.
5. THE Express_Server SHALL expose `DELETE /api/meetings/:id` deleting the session and returning HTTP 204.
6. IF a meeting ID does not exist or the authenticated user lacks access, THEN THE Express_Server SHALL return HTTP 404.
7. THE Express_Server SHALL expose `GET /api/meetings/today` returning meetings scheduled for the current calendar day in the user's timezone.
8. THE Express_Server SHALL expose `GET /api/meetings/upcoming` returning meetings scheduled after the current time, ordered by start time ascending.
9. THE Express_Server SHALL expose `POST /api/meetings/:id/bot/start` to trigger bot join for a meeting, returning HTTP 202.
10. THE Express_Server SHALL expose `POST /api/meetings/:id/bot/stop` to trigger bot leave for a meeting, returning HTTP 202.
11. THE Express_Server SHALL expose `GET /api/meetings/:id/status` returning the current bot and processing status for a meeting.
12. WHEN a `GET /api/meetings` request includes a `workspaceId` query parameter, THE Express_Server SHALL return meetings scoped to that Workspace instead of personal meetings.

---

### Requirement 4: Calendar API

**User Story:** As a user, I want to connect and manage calendar integrations, so that my meetings are automatically synced from Google or Microsoft calendars.

#### Acceptance Criteria

1. THE Express_Server SHALL expose `GET /api/calendar/status` returning the connection status for each Calendar_Provider for the authenticated user.
2. THE Express_Server SHALL expose `GET /api/calendar/connect/:provider` initiating the OAuth flow for the specified Calendar_Provider and returning a redirect URL.
3. THE Express_Server SHALL expose `GET /api/calendar/callback` handling the OAuth callback, exchanging the authorization code for tokens, and storing them in the DB.
4. THE Express_Server SHALL expose `POST /api/calendar/disconnect/:provider` revoking tokens and removing the Calendar_Provider connection for the authenticated user.
5. IF an unsupported Calendar_Provider value is supplied, THEN THE Express_Server SHALL return HTTP 400 with a descriptive error message.
6. THE Express_Server SHALL expose `GET /api/meetings/calendar-feed` returning an iCal-formatted feed of the authenticated user's meetings.
7. WHEN calendar tokens are expired and a refresh token is available, THE Express_Server SHALL refresh the access token transparently before returning calendar data.

---

### Requirement 5: Integrations API

**User Story:** As a user, I want to enable and configure third-party integrations, so that meeting outputs can be sent to Slack, Gmail, Notion, or Jira.

#### Acceptance Criteria

1. THE Express_Server SHALL expose `GET /api/integrations` returning the integration status for all supported types (`slack`, `gmail`, `notion`, `jira`) for the authenticated user.
2. THE Express_Server SHALL expose `POST /api/integrations` accepting `{ type, enabled, config }` and upserting the Integration record in the DB.
3. IF the `type` field is not one of `slack`, `gmail`, `notion`, `jira`, THEN THE Express_Server SHALL return HTTP 400 with `{ "error": "Invalid integration type" }`.
4. THE Express_Server SHALL expose `POST /api/integrations/test` accepting `{ type }` and returning the result of a connectivity test for the specified Integration.
5. THE Express_Server SHALL expose `POST /api/meetings/:id/share/integrations` triggering delivery of meeting output to all enabled Integrations for the authenticated user.

---

### Requirement 6: Auth and User Sync API

**User Story:** As a system operator, I want Clerk webhook events to be processed by the Express server, so that user records are created in the DB when new users sign up.

#### Acceptance Criteria

1. THE Express_Server SHALL expose `POST /api/webhooks/clerk` accepting Svix-signed webhook payloads from Clerk.
2. WHEN a `user.created` event is received, THE Express_Server SHALL upsert the user record in the DB and initialize a default subscription.
3. IF the `CLERK_WEBHOOK_SECRET` environment variable is not set, THEN THE Express_Server SHALL return HTTP 503 for all webhook requests.
4. IF the Svix signature headers are missing or invalid, THEN THE Express_Server SHALL return HTTP 400 with `{ "error": "Invalid webhook signature" }`.
5. THE Express_Server SHALL expose `GET /api/profile/me` returning the authenticated user's profile and subscription plan from the DB.

---

### Requirement 7: Workspace API

**User Story:** As a user, I want to create and manage workspaces, so that I can collaborate with teammates on shared meetings and action items.

#### Acceptance Criteria

1. THE Express_Server SHALL expose `GET /api/workspaces` returning all Workspaces the authenticated user is a member of.
2. THE Express_Server SHALL expose `POST /api/workspaces` accepting `{ name, members }` validated by the workspace creation schema and returning the created Workspace with HTTP 201.
3. THE Express_Server SHALL expose `GET /api/workspaces/:workspaceId` returning the Workspace details if the authenticated user is a member.
4. THE Express_Server SHALL expose `PATCH /api/workspaces/:workspaceId` allowing workspace owners or admins to update workspace name and settings.
5. THE Express_Server SHALL expose `DELETE /api/workspaces/:workspaceId` allowing only the workspace owner to delete the Workspace.
6. THE Express_Server SHALL expose `POST /api/workspaces/join` accepting an invite token and adding the authenticated user as a member.
7. IF the authenticated user is not a member of the requested Workspace, THEN THE Express_Server SHALL return HTTP 403.
8. THE Express_Server SHALL expose `GET /api/workspace/:workspaceId/meetings` returning all meetings scoped to the specified Workspace.
9. THE Express_Server SHALL expose `GET /api/workspace/:workspaceId/action-items` returning all Action_Items scoped to the specified Workspace, filtered by the authenticated user's role.
10. THE Express_Server SHALL expose `GET /api/workspace/:workspaceId/dashboard` returning aggregated statistics for the specified Workspace.

---

### Requirement 8: Action Items API

**User Story:** As a user, I want to view, create, and manage action items from meetings, so that I can track tasks and follow-ups.

#### Acceptance Criteria

1. THE Express_Server SHALL expose `GET /api/action-items` returning a paginated list of Action_Items owned by or associated with the authenticated user, with support for `page`, `limit`, `tab`, `source`, and `firstName` query parameters.
2. THE Express_Server SHALL expose `POST /api/action-items` accepting an Action_Item body and returning the created item with HTTP 201.
3. THE Express_Server SHALL expose `PATCH /api/action-items/:id` accepting a partial update and returning the updated Action_Item.
4. THE Express_Server SHALL expose `DELETE /api/action-items/:id` deleting the Action_Item and returning HTTP 204.
5. THE Express_Server SHALL expose `POST /api/action-items/bulk-save` accepting an array of Action_Items and upserting all of them in a single DB transaction.
6. THE Express_Server SHALL expose `GET /api/action-items/export` returning Action_Items in CSV format with appropriate `Content-Type: text/csv` and `Content-Disposition` headers.
7. IF the authenticated user's subscription plan does not include action items, THEN THE Express_Server SHALL return HTTP 403 with `{ "error": "upgrade_required", "currentPlan": "<plan>" }`.
8. WHEN `page` and `limit` query parameters are provided, THE Express_Server SHALL return a `pagination` object containing `total`, `page`, `limit`, and `totalPages` fields.

---

### Requirement 9: Settings API

**User Story:** As a user, I want to update my account, bot, and preference settings, so that the application behaves according to my configuration.

#### Acceptance Criteria

1. THE Express_Server SHALL expose `GET /api/settings/account` returning the authenticated user's account settings from the DB.
2. THE Express_Server SHALL expose `PATCH /api/settings/account` accepting account update fields and persisting them to the DB.
3. THE Express_Server SHALL expose `GET /api/settings/bot` returning the authenticated user's bot configuration (`botDisplayName`, `audioSource`).
4. THE Express_Server SHALL expose `POST /api/settings/bot` accepting `{ botDisplayName, audioSource }` validated with a minimum length of 1 for `botDisplayName`, and persisting the values to the `user_preferences` table.
5. THE Express_Server SHALL expose `GET /api/settings/preferences` returning the authenticated user's UI preferences.
6. THE Express_Server SHALL expose `PATCH /api/settings/preferences` accepting preference fields and persisting them to the DB.
7. THE Express_Server SHALL expose `GET /api/settings/usage` returning the authenticated user's current usage metrics and plan limits.

---

### Requirement 10: Recordings API

**User Story:** As a user, I want to stream or download recordings of my meetings, so that I can review what was discussed.

#### Acceptance Criteria

1. THE Express_Server SHALL expose `GET /api/recordings/:meetingId` returning the WAV audio file for the specified meeting.
2. WHEN a recording is served, THE Express_Server SHALL set `Content-Type: audio/wav`, `Content-Disposition: inline; filename="recording.wav"`, and `Cache-Control: private, max-age=3600` response headers.
3. IF the authenticated user is not the owner of the meeting and is not listed in `sharedWithUserIds`, THEN THE Express_Server SHALL return HTTP 403.
4. IF no recording file exists on disk for the meeting, THEN THE Express_Server SHALL return HTTP 404 with `{ "error": "Recording file not found" }`.
5. IF the meeting session record does not exist in the DB, THEN THE Express_Server SHALL return HTTP 404.
6. THE Express_Server SHALL resolve recording file paths relative to a configurable `RECORDINGS_DIR` environment variable, defaulting to `./private/recordings`.

---

### Requirement 11: Frontend API Client Migration

**User Story:** As a frontend engineer, I want all frontend API calls to target the Express backend, so that the Next.js app contains only UI code.

#### Acceptance Criteria

1. THE Frontend SHALL read the Express_Server base URL from the `NEXT_PUBLIC_API_URL` environment variable.
2. THE Frontend SHALL attach the Clerk session JWT as a Bearer token in the `Authorization` header on every API request to the Express_Server.
3. THE Frontend SHALL remove all Next.js API route files from `frontend/src/app/api/` after the corresponding Express routes are verified.
4. IF `NEXT_PUBLIC_API_URL` is not set, THEN THE Frontend SHALL throw a configuration error at startup rather than silently sending requests to an undefined URL.
5. THE Frontend SHALL preserve all existing response shapes so that no UI component requires changes beyond the API base URL.

---

### Requirement 12: Performance

**User Story:** As a user, I want API responses to be fast, so that the application feels responsive.

#### Acceptance Criteria

1. WHEN the Express_Server handles a request that requires only a single DB query, THE Express_Server SHALL respond within 200ms under normal load.
2. THE Express_Server SHALL respond to all API endpoints within 500ms at the 95th percentile under a load of 50 concurrent requests.
3. THE Express_Server SHALL use DB connection pooling with a minimum pool size of 2 and a maximum pool size of 10 connections.
4. THE Express_Server SHALL apply the in-memory User_Sync cache (60-second TTL) to eliminate redundant Clerk API calls on repeated requests from the same user.

---

### Requirement 13: Error Handling and Observability

**User Story:** As a backend engineer, I want consistent error responses and structured logs, so that issues are easy to diagnose in production.

#### Acceptance Criteria

1. THE Express_Server SHALL return all error responses as JSON objects with at minimum an `"error"` string field.
2. WHEN an unhandled exception occurs in a route handler, THE Express_Server SHALL catch it, log the full stack trace, and return HTTP 500 with `{ "error": "Internal server error" }`.
3. THE Express_Server SHALL log each request with method, path, status code, and response time in milliseconds.
4. IF a DB query fails due to a missing table or column, THEN THE Express_Server SHALL return HTTP 503 with `{ "error": "Database migration required" }`.
5. THE Express_Server SHALL apply a Rate_Limiter of 100 requests per minute per authenticated user on all API routes, returning HTTP 429 when the limit is exceeded.

---

### Requirement 14: Python Bot Preservation

**User Story:** As a system operator, I want the Python bot to remain untouched, so that AI processing continues to work during and after the migration.

#### Acceptance Criteria

1. THE Express_Server SHALL communicate with the Bot via the existing internal HTTP or message-queue interface without modifying any files under `backend/python-services/`.
2. WHILE the migration is in progress, THE Frontend SHALL continue to serve existing Next.js API routes for any endpoint not yet migrated to the Express_Server.
3. THE Express_Server SHALL expose bot control endpoints (`/api/meetings/:id/bot/start`, `/api/meetings/:id/bot/stop`) that proxy or delegate to the Bot without altering the Bot's internal logic.
