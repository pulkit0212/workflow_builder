# Implementation Plan: Backend API Migration

## Overview

Migrate all API logic from Next.js API routes to a standalone Express.js server at `backend/express-api/`. Tasks follow the incremental migration order so each phase is independently deployable and the Next.js routes remain live until the corresponding Express routes are verified.

## Tasks

- [x] 1. Phase 1 — Express server bootstrap + health endpoint
  - [x] 1.1 Scaffold `backend/express-api/` project structure
    - Create `package.json` with dependencies: `express`, `cors`, `helmet`, `express-rate-limit`, `drizzle-orm`, `pg`, `@clerk/backend`, `svix`, `zod`, `morgan`, `fast-check` (dev)
    - Create `tsconfig.json` targeting Node 18+
    - Create `backend/express-api/.env.example` with all required env vars (`PORT`, `DATABASE_URL`, `ALLOWED_ORIGINS`, `CLERK_SECRET_KEY`, `CLERK_WEBHOOK_SECRET`, `RECORDINGS_DIR`, `BOT_BASE_URL`)
    - _Requirements: 1.1, 1.2, 1.3_

  - [x] 1.2 Implement `src/config.ts` — typed env config with fatal exit on missing `DATABASE_URL`
    - Export a `Config` interface and a validated `config` singleton
    - Log fatal error and call `process.exit(1)` when `DATABASE_URL` is absent
    - _Requirements: 1.1, 1.2, 1.3_

  - [x] 1.3 Implement `src/db/client.ts` — Drizzle + pg Pool (min 2, max 10)
    - Import schema from `frontend/src/db/schema/` via relative path or shared package
    - Export `db` instance and `pool` for graceful shutdown
    - _Requirements: 1.2, 12.3_

  - [x] 1.4 Implement `src/lib/errors.ts` — typed error classes
    - `AppError`, `NotFoundError`, `ForbiddenError`, `UnauthorizedError`, `BadRequestError`
    - _Requirements: 13.1_

  - [x] 1.5 Implement `src/middleware/request-logger.ts` — structured JSON request logging
    - Log `method`, `path`, `statusCode`, `responseTimeMs` for every request
    - _Requirements: 1.7, 13.3_

  - [x] 1.6 Implement `src/middleware/error-handler.ts` — global Express error handler
    - Handle `AppError` subclasses, Drizzle/pg error codes (`42P01`, `42703`), and unhandled exceptions
    - Never expose stack traces in response body; log full stack internally
    - _Requirements: 13.1, 13.2, 13.4_

  - [x] 1.7 Implement `src/routes/health.ts` — `GET /health` returning `{ "status": "ok" }`
    - _Requirements: 1.4_

  - [x] 1.8 Implement `src/app.ts` — Express app factory with CORS, JSON body parsing (1MB limit), request logger, health router, and error handler
    - Apply `ALLOWED_ORIGINS` from config to CORS policy
    - Export `createApp()` for testing
    - _Requirements: 1.5, 1.6, 1.7_

  - [x] 1.9 Implement `src/index.ts` — entry point that calls `createApp()` and starts the server
    - _Requirements: 1.1_

  - [ ]* 1.10 Write unit tests for Phase 1
    - `GET /health` returns 200 `{ "status": "ok" }` within 100ms
    - Server exits with non-zero code when `DATABASE_URL` is missing
    - DB pool is configured with `min: 2, max: 10`
    - _Requirements: 1.3, 1.4, 12.3_

  - [ ]* 1.11 Write property test for CORS origin allowlist (Property 1)
    - **Property 1: CORS origin allowlist**
    - **Validates: Requirements 1.5**

  - [ ]* 1.12 Write property test for JSON body size enforcement (Property 2)
    - **Property 2: JSON body size enforcement**
    - **Validates: Requirements 1.6**

  - [ ]* 1.13 Write property test for request log fields (Property 22)
    - **Property 22: Request log entries include all required fields**
    - **Validates: Requirements 1.7, 13.3**

  - [ ]* 1.14 Write property test for error response shape (Property 20)
    - **Property 20: All error responses include an "error" string field**
    - **Validates: Requirements 13.1**

  - [ ]* 1.15 Write property test for unhandled exceptions → HTTP 500 (Property 21)
    - **Property 21: Unhandled exceptions return HTTP 500 with correct shape**
    - **Validates: Requirements 13.2**

- [x] 2. Phase 2 — Auth middleware + user sync cache
  - [x] 2.1 Implement `src/lib/user-sync-cache.ts` — in-memory TTL cache (60s)
    - `getCachedUser`, `setCachedUser`, `syncUser` functions
    - `syncUser` upserts to `users` table via Drizzle; returns cached entry on hit
    - _Requirements: 2.5, 2.6, 12.4_

  - [x] 2.2 Implement `src/middleware/clerk-auth.ts` — JWT extraction, verification, user-sync
    - Extract `Authorization: Bearer <token>`, call `@clerk/backend` `verifyToken()`
    - Return 401 `{ "error": "Unauthorized" }` on missing header or invalid/expired JWT
    - Attach `clerkUserId` and `appUser` to `req` after successful sync
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_

  - [x] 2.3 Implement `src/middleware/rate-limiter.ts` — 100 req/min per authenticated user
    - Use `express-rate-limit` with `keyGenerator: (req) => req.clerkUserId ?? req.ip`
    - Return 429 `{ "error": "Too many requests" }` when limit exceeded
    - _Requirements: 13.5_

  - [x] 2.4 Register `clerkAuth` and `rateLimiter` on all protected route prefixes in `src/app.ts`
    - _Requirements: 2.1, 13.5_

  - [ ]* 2.5 Write unit tests for auth middleware and rate limiter
    - Webhook returns 503 when `CLERK_WEBHOOK_SECRET` is not set
    - Rate limiter returns 429 after 100 requests in a minute
    - _Requirements: 6.3, 13.5_

  - [ ]* 2.6 Write property test for valid JWT attaches clerkUserId (Property 3)
    - **Property 3: Valid JWT attaches clerkUserId**
    - **Validates: Requirements 2.2**

  - [ ]* 2.7 Write property test for missing/invalid token returns 401 (Property 4)
    - **Property 4: Missing or invalid token returns 401**
    - **Validates: Requirements 2.3, 2.4**

  - [ ]* 2.8 Write property test for authenticated request upserts user (Property 5)
    - **Property 5: Authenticated request upserts user to DB**
    - **Validates: Requirements 2.5**

  - [ ]* 2.9 Write property test for user-sync cache prevents redundant DB writes (Property 6)
    - **Property 6: User-sync cache prevents redundant DB writes**
    - **Validates: Requirements 2.6, 12.4**

- [x] 3. Checkpoint — Ensure all Phase 1 and Phase 2 tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Phase 3 — Settings API
  - [x] 4.1 Implement `src/routes/settings.ts` with all settings endpoints
    - `GET /api/settings/account` — return account settings from DB
    - `PATCH /api/settings/account` — persist account update fields
    - `GET /api/settings/bot` — return `botDisplayName`, `audioSource` from `user_preferences`
    - `POST /api/settings/bot` — validate `botDisplayName` min length 1, upsert `user_preferences`
    - `GET /api/settings/preferences` — return UI preferences
    - `PATCH /api/settings/preferences` — persist preference fields
    - `GET /api/settings/usage` — return usage metrics and plan limits
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7_

  - [x] 4.2 Register `settingsRouter` in `src/app.ts`
    - _Requirements: 9.1_

  - [ ]* 4.3 Write unit tests for settings routes
    - Test `POST /api/settings/bot` rejects empty `botDisplayName`
    - _Requirements: 9.4_

- [x] 5. Phase 4 — Recordings API
  - [x] 5.1 Implement `src/routes/recordings.ts`
    - `GET /api/recordings/:meetingId` — verify ownership or `sharedWithUserIds`, stream WAV file
    - Set `Content-Type: audio/wav`, `Content-Disposition: inline; filename="recording.wav"`, `Cache-Control: private, max-age=3600`
    - Return 403 if user is not owner and not in `sharedWithUserIds`
    - Return 404 if meeting session does not exist in DB
    - Return 404 `{ "error": "Recording file not found" }` if file is absent on disk
    - Resolve file path from `RECORDINGS_DIR` env var (default `./private/recordings`)
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6_

  - [x] 5.2 Register `recordingsRouter` in `src/app.ts`
    - _Requirements: 10.1_

  - [ ]* 5.3 Write property test for recording response headers (Property 17)
    - **Property 17: Recording response sets required headers**
    - **Validates: Requirements 10.2**

  - [ ]* 5.4 Write property test for recording access control (Property 18)
    - **Property 18: Recording access control returns 403 for unauthorized users**
    - **Validates: Requirements 10.3**

- [x] 6. Phase 5 — Action Items API
  - [x] 6.1 Implement `src/routes/action-items.ts`
    - `GET /api/action-items` — paginated list filtered by authenticated user; support `page`, `limit`, `tab`, `source`, `firstName` query params; return `pagination` object
    - `POST /api/action-items` — create action item, return HTTP 201
    - `PATCH /api/action-items/:id` — partial update
    - `DELETE /api/action-items/:id` — delete, return HTTP 204
    - `POST /api/action-items/bulk-save` — upsert array in single DB transaction
    - `GET /api/action-items/export` — return CSV with `Content-Type: text/csv` and `Content-Disposition` headers
    - Gate all endpoints: return 403 `{ "error": "upgrade_required", "currentPlan": "<plan>" }` for restricted plans
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8_

  - [x] 6.2 Register `actionItemsRouter` in `src/app.ts`
    - _Requirements: 8.1_

  - [ ]* 6.3 Write property test for action items ownership (Property 13)
    - **Property 13: Action items list returns only the authenticated user's items**
    - **Validates: Requirements 8.1**

  - [ ]* 6.4 Write property test for bulk-save transactional correctness (Property 14)
    - **Property 14: Bulk-save persists all items transactionally**
    - **Validates: Requirements 8.5**

  - [ ]* 6.5 Write property test for plan gating (Property 15)
    - **Property 15: Plan gating returns 403 with upgrade_required for restricted plans**
    - **Validates: Requirements 8.7**

  - [ ]* 6.6 Write property test for pagination shape (Property 16)
    - **Property 16: Pagination response includes all required fields**
    - **Validates: Requirements 8.8**

- [x] 7. Checkpoint — Ensure all Phase 3–5 tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Phase 6 — Workspaces API
  - [x] 8.1 Implement `src/routes/workspaces.ts`
    - `GET /api/workspaces` — return all workspaces the user is a member of
    - `POST /api/workspaces` — validate `{ name, members }` with Zod, return HTTP 201
    - `GET /api/workspaces/:workspaceId` — return workspace if user is active member, else 403
    - `PATCH /api/workspaces/:workspaceId` — allow owner/admin to update name and settings
    - `DELETE /api/workspaces/:workspaceId` — allow only owner to delete
    - `POST /api/workspaces/join` — accept invite token, add user as member
    - `GET /api/workspace/:workspaceId/meetings` — return meetings scoped to workspace
    - `GET /api/workspace/:workspaceId/action-items` — return action items scoped to workspace filtered by user role
    - `GET /api/workspace/:workspaceId/dashboard` — return aggregated workspace statistics
    - Return 403 for non-members on all workspace-scoped endpoints
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 7.9, 7.10_

  - [x] 8.2 Register `workspacesRouter` on both `/api/workspaces` and `/api/workspace` in `src/app.ts`
    - _Requirements: 7.1, 7.8_

  - [ ]* 8.3 Write property test for workspace access control (Property 12)
    - **Property 12: Workspace access control returns 403 for non-members**
    - **Validates: Requirements 7.7**

- [x] 9. Phase 7 — Meetings API (including bot start/stop)
  - [x] 9.1 Implement `src/lib/bot-client.ts` — HTTP client for Python bot endpoints
    - `startBot(meetingId)` and `stopBot(meetingId)` functions that proxy to `BOT_BASE_URL`
    - Do not modify any files under `backend/python-services/`
    - _Requirements: 3.9, 3.10, 14.1, 14.3_

  - [x] 9.2 Implement `src/routes/meetings.ts`
    - `GET /api/meetings` — return non-draft sessions owned by user; filter by `workspaceId` query param when present
    - `POST /api/meetings` — validate body with Zod, return HTTP 201
    - `GET /api/meetings/today` — meetings for current calendar day in user's timezone
    - `GET /api/meetings/upcoming` — meetings after current time, ordered by start time asc
    - `GET /api/meetings/calendar-feed` — iCal-formatted feed (delegate to calendar logic)
    - `GET /api/meetings/:id` — return session if user is owner or active workspace member, else 404
    - `PATCH /api/meetings/:id` — partial update, return updated session
    - `DELETE /api/meetings/:id` — delete, return HTTP 204
    - `POST /api/meetings/:id/bot/start` — call `botClient.startBot()`, return HTTP 202
    - `POST /api/meetings/:id/bot/stop` — call `botClient.stopBot()`, return HTTP 202
    - `GET /api/meetings/:id/status` — return bot and processing status
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10, 3.11, 3.12_

  - [x] 9.3 Register `meetingsRouter` in `src/app.ts`
    - _Requirements: 3.1_

  - [ ]* 9.4 Write property test for meetings list ownership and non-draft filter (Property 7)
    - **Property 7: Meetings list returns only owner's non-draft sessions**
    - **Validates: Requirements 3.1**

  - [ ]* 9.5 Write property test for workspace scoping (Property 8)
    - **Property 8: Workspace scoping filters meetings by workspaceId**
    - **Validates: Requirements 3.12**

  - [ ]* 9.6 Write property test for meeting access control (Property 9)
    - **Property 9: Meeting access control enforces ownership and membership**
    - **Validates: Requirements 3.3, 3.6**

- [x] 10. Checkpoint — Ensure all Phase 6–7 tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 11. Phase 8 — Calendar API
  - [x] 11.1 Implement `src/routes/calendar.ts`
    - `GET /api/calendar/status` — return connection status per Calendar_Provider
    - `GET /api/calendar/connect/:provider` — initiate OAuth flow, return redirect URL; return 400 for unsupported providers
    - `GET /api/calendar/callback` — exchange auth code for tokens, store in DB
    - `POST /api/calendar/disconnect/:provider` — revoke tokens and remove connection
    - Transparently refresh expired access tokens when refresh token is available
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.7_

  - [x] 11.2 Register `calendarRouter` in `src/app.ts`
    - _Requirements: 4.1_

  - [ ]* 11.3 Write unit tests for calendar provider validation
    - `GET /api/calendar/connect/:provider` returns 400 for unsupported provider values
    - _Requirements: 4.5_

- [x] 12. Phase 9 — Integrations API
  - [x] 12.1 Implement `src/routes/integrations.ts`
    - `GET /api/integrations` — return integration status for all supported types
    - `POST /api/integrations` — validate `{ type, enabled, config }` with Zod; return 400 for unknown `type`
    - `POST /api/integrations/test` — run connectivity test for specified integration type
    - `POST /api/meetings/:id/share/integrations` — deliver meeting output to all enabled integrations (add sub-route to meetings router or integrations router)
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

  - [x] 12.2 Register `integrationsRouter` in `src/app.ts`
    - _Requirements: 5.1_

  - [ ]* 12.3 Write property test for integration type validation (Property 10)
    - **Property 10: Integration type validation rejects unknown types**
    - **Validates: Requirements 5.3**

- [x] 13. Phase 10 — Auth/User Sync + Webhook + Profile routes
  - [x] 13.1 Implement `src/routes/webhooks.ts` — `POST /api/webhooks/clerk`
    - Verify Svix signature using `CLERK_WEBHOOK_SECRET`; return 503 if secret not set, 400 if signature invalid
    - On `user.created` event: upsert user record and initialize default subscription
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

  - [x] 13.2 Implement `src/routes/profile.ts` — `GET /api/profile/me`
    - Return authenticated user's profile and subscription plan from DB
    - _Requirements: 6.5_

  - [x] 13.3 Register `webhooksRouter` (no `clerkAuth`) and `profileRouter` in `src/app.ts`
    - _Requirements: 6.1, 6.5_

  - [ ]* 13.4 Write property test for webhook signature validation (Property 11)
    - **Property 11: Webhook signature validation rejects tampered requests**
    - **Validates: Requirements 6.4**

- [x] 14. Checkpoint — Ensure all Phase 8–10 tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 15. Phase 11 — Frontend API client migration (`NEXT_PUBLIC_API_URL`)
  - [x] 15.1 Create `frontend/src/lib/api-client.ts` — `apiFetch` wrapper
    - Read `NEXT_PUBLIC_API_URL` at module load; throw configuration error if not set
    - Attach `Authorization: Bearer <token>` header using Clerk `getToken()` on every request
    - Accept optional `workspaceId` parameter and set `x-workspace-id` header
    - _Requirements: 11.1, 11.2, 11.4_

  - [x] 15.2 Update all existing `fetch` / `workspaceFetch` calls in `frontend/src/` to use `apiFetch`
    - Replace calls targeting `/api/*` Next.js routes with `apiFetch` calls targeting the Express server
    - Preserve all existing response shapes — no UI component changes required
    - _Requirements: 11.1, 11.2, 11.5_

  - [ ]* 15.3 Write property test for frontend Bearer token attachment (Property 19)
    - **Property 19: Frontend API client attaches Bearer token on every request**
    - **Validates: Requirements 11.2**

- [x] 16. Phase 12 — Cleanup (remove Next.js API routes)
  - [x] 16.1 Delete Next.js API route files from `frontend/src/app/api/` for all migrated domains
    - Remove route files only after corresponding Express routes are verified
    - Domains: meetings, calendar, integrations, webhooks, profile, workspaces, action-items, settings, recordings
    - _Requirements: 11.3_

  - [x] 16.2 Verify no remaining imports or references to deleted Next.js API route files in `frontend/src/`
    - Search for any remaining `fetch('/api/...')` calls not going through `apiFetch`
    - _Requirements: 11.3, 11.5_

- [x] 17. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation between phases
- Property tests use `fast-check` with a minimum of 100 iterations per property
- The Python bot under `backend/python-services/` must not be modified at any point
- Next.js API routes remain live until the corresponding Express route is verified (incremental migration safety)
