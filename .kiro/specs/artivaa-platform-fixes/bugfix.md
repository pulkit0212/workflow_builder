# Bugfix Requirements Document

## Introduction

This document covers 14 bugs and improvements across the Artivaa platform, spanning critical UI/API issues, security vulnerabilities, bot reliability problems, data integrity gaps, UX gaps, and performance regressions. The fixes are grouped by severity and concern area. Each bug has a clearly identified condition, defective behavior, and expected correct behavior, along with regression-prevention clauses for unaffected paths.

---

## Bug Analysis

### Current Behavior (Defect)

**Bug 1 — "Share to Workspace" button not visible in personal mode**

1.1 WHEN a user views a meeting detail page in personal mode (`activeWorkspaceId === null`) AND `meeting.isOwner` is `true` AND the user belongs to at least one workspace THEN the system renders the `ShareToWorkspaceButton` but the button remains invisible because `allWorkspaces` is `null` during the initial render before the fetch resolves, causing the component to return `null` prematurely.

**Bug 2 — `POST /api/meetings/share-calendar` returns HTML instead of JSON**

1.2 WHEN the frontend calls `POST /api/meetings/share-calendar` THEN the system returns an HTML error page (Next.js 404) because no Next.js API route exists at `frontend/src/app/api/meetings/share-calendar/route.ts`; the endpoint only exists on the Express backend at `meetingsRouter.post("/share-calendar", ...)` which is not directly reachable from the browser.

**Bug 3 — Workspaces list incomplete in share modal**

1.3 WHEN the share modal fetches `/api/workspaces` THEN the system returns `{ success: true, workspaces: [...] }` but callers that still expect a plain array receive `undefined` for the workspace list, causing the modal to show an empty dropdown.

**Bug 4 — `recording_file_path` exposed in meeting detail API response**

1.4 WHEN a client calls `GET /api/meetings/:id` THEN the system includes `recordingFilePath` (an absolute server filesystem path) in the JSON response, leaking internal server path information to the client.

**Bug 5 — `migrate-recordings.js` present in express-api root**

1.5 WHEN the `backend/express-api` directory is deployed or reviewed THEN the system exposes `migrate-recordings.js` as a loose script in the root of the express-api service, creating a security and maintenance risk.

**Bug 6 — Transcription hallucination from silent monitor source**

1.6 WHEN the bot starts recording via the monitor audio source AND Google Meet audio is not routed through that source THEN the system records silence or system noise, causing Whisper to produce hallucinated repeated tokens (e.g., "111" or "177" repeated 111–177 times) instead of real transcript content.

**Bug 7 — No retry on transcription failure**

1.7 WHEN the OpenAI/Whisper transcription API call fails with a transient error (network timeout, rate limit, 5xx) THEN the system marks the entire meeting as failed without attempting any retry, permanently losing the meeting transcript.

**Bug 8 — Meetings stuck in `processing`/`summarizing` after bot crash not recovered**

1.8 WHEN the bot crashes while a session is in `processing` or `summarizing` status THEN the system leaves those sessions permanently stuck because `recoverStuckSessions()` only queries for sessions with status `IN ('capturing', 'waiting_for_join')` and never recovers `processing` or `summarizing` sessions.

**Bug 9 — `workspace_move_requests` unique constraint may not exist**

1.9 WHEN `INSERT INTO workspace_move_requests ... ON CONFLICT (meeting_id, workspace_id) DO UPDATE` is executed THEN the system may throw a PostgreSQL error because the unique constraint `ON CONFLICT (meeting_id, workspace_id)` was added in application code but the corresponding database constraint may not have been applied via migration.

**Bug 10 — No way to delete a meeting from the UI**

1.10 WHEN a user wants to delete a meeting THEN the system provides no delete button or affordance in the meeting detail UI, even though `DELETE /api/meetings/:id` exists on the backend.

**Bug 11 — No admin approval UI for workspace move requests**

1.11 WHEN a workspace member submits a "Share to Workspace" request that requires admin approval THEN the system stores the request in `workspace_move_requests` but workspace admins have no page or UI component to view, approve, or reject pending requests.

**Bug 12 — Auto-share failures are silent**

1.12 WHEN an automatic post-meeting share to Slack, Notion, or Jira fails THEN the system does not surface any error feedback to the user, leaving them unaware that the integration action did not complete.

**Bug 13 — Reports query uses unindexed `ILIKE` on `summary`**

1.13 WHEN a user searches or filters reports and the query performs a text search against the `summary` column using `ILIKE '%term%'` THEN the system performs a full sequential scan on the `meeting_sessions` table, causing slow response times as the dataset grows.

**Bug 14 — `useSessionPolling` has no exponential backoff**

1.14 WHEN `useSessionPolling` is active and the server is slow or returning errors THEN the system continues polling at a fixed 2-second interval regardless of server load or consecutive failures, amplifying server pressure during degraded conditions.

---

### Expected Behavior (Correct)

**Bug 1**

2.1 WHEN a user views a meeting detail page in personal mode AND `meeting.isOwner` is `true` AND the user belongs to at least one workspace THEN the system SHALL display the "Share to Workspace" button immediately once the workspace list has loaded, and SHALL show a loading skeleton or nothing (not a broken state) while the fetch is in progress.

**Bug 2**

2.2 WHEN the frontend calls `POST /api/meetings/share-calendar` THEN the system SHALL route the request through a Next.js API route at `frontend/src/app/api/meetings/share-calendar/route.ts` that proxies the request to the Express backend, returning a valid JSON response.

**Bug 3**

2.3 WHEN the share modal fetches `/api/workspaces` THEN the system SHALL correctly extract the `workspaces` array from the `{ success, workspaces }` response shape and populate the workspace dropdown with all workspaces the user belongs to.

**Bug 4**

2.4 WHEN a client calls `GET /api/meetings/:id` THEN the system SHALL omit `recordingFilePath` from the JSON response, while still deriving and returning `recordingUrl` (the safe public URL) when a recording exists.

**Bug 5**

2.5 WHEN the `backend/express-api` directory is deployed THEN the system SHALL NOT contain `migrate-recordings.js`; the file SHALL be deleted from the repository.

**Bug 6**

2.6 WHEN the bot is about to start recording THEN the system SHALL perform a pre-recording audio level check on the selected monitor source, and if the measured audio level is below a minimum threshold (indicating silence or no audio routing), the system SHALL log a warning and attempt to fall back to a default audio input or abort with a descriptive error rather than recording silence.

**Bug 7**

2.7 WHEN the OpenAI/Whisper transcription API call fails with a transient error THEN the system SHALL retry the transcription up to 3 times with exponential backoff before marking the meeting as failed, preserving the audio file for manual reprocessing if all retries are exhausted.

**Bug 8**

2.8 WHEN `recoverStuckSessions()` runs on bot startup THEN the system SHALL also query for sessions with status `IN ('processing', 'summarizing')` that have no active associated process, and SHALL mark them as `failed` with `errorCode = 'server_restart'` so they can be retried or surfaced to the user.

**Bug 9**

2.9 WHEN the application performs an `INSERT ... ON CONFLICT (meeting_id, workspace_id)` on `workspace_move_requests` THEN the system SHALL succeed because a unique constraint on `(meeting_id, workspace_id)` SHALL exist in the database, enforced by a migration.

**Bug 10**

2.10 WHEN a meeting owner views the meeting detail page THEN the system SHALL display a delete button that, upon confirmation, calls `DELETE /api/meetings/:id` and redirects the user to the meetings list.

**Bug 11**

2.11 WHEN a workspace admin views the workspace management page THEN the system SHALL display a list of pending workspace move requests with approve and reject actions that call the appropriate backend endpoints.

**Bug 12**

2.12 WHEN an automatic post-meeting share to Slack, Notion, or Jira fails THEN the system SHALL surface a visible error notification to the user (e.g., a toast or banner) indicating which integration failed and why, so the user can take corrective action.

**Bug 13**

2.13 WHEN a text search is performed against the `summary` column in the reports query THEN the system SHALL use a `pg_trgm` GIN index on `summary` so that `ILIKE` or similarity queries execute efficiently without a full sequential scan.

**Bug 14**

2.14 WHEN `useSessionPolling` encounters consecutive server errors or slow responses THEN the system SHALL apply exponential backoff (e.g., doubling the interval up to a maximum of 30 seconds) to reduce server load during degraded conditions, and SHALL reset to the base interval once a successful response is received.

---

### Unchanged Behavior (Regression Prevention)

3.1 WHEN a user views a meeting detail page in workspace mode (`activeWorkspaceId !== null`) THEN the system SHALL CONTINUE TO show the workspace badge or move-to-workspace button as appropriate, without rendering the personal-mode share button.

3.2 WHEN the frontend calls any existing Next.js API route other than `/api/meetings/share-calendar` THEN the system SHALL CONTINUE TO handle those routes correctly without disruption.

3.3 WHEN callers of `/api/workspaces` already handle the `{ success, workspaces }` response shape THEN the system SHALL CONTINUE TO return that same shape without regression.

3.4 WHEN a client calls `GET /api/meetings/:id` THEN the system SHALL CONTINUE TO return `recordingUrl` (the safe public URL) when a recording exists, so the recording player is unaffected.

3.5 WHEN the Express API serves other routes THEN the system SHALL CONTINUE TO function normally after `migrate-recordings.js` is removed.

3.6 WHEN the bot records a meeting with a properly routed audio source that passes the audio level check THEN the system SHALL CONTINUE TO record and transcribe normally without any change in behavior.

3.7 WHEN the OpenAI/Whisper transcription API call succeeds on the first attempt THEN the system SHALL CONTINUE TO process the transcript immediately without any added latency from retry logic.

3.8 WHEN `recoverStuckSessions()` finds sessions in `capturing` or `waiting_for_join` with no live process THEN the system SHALL CONTINUE TO mark them as failed as before.

3.9 WHEN a workspace admin instantly approves a share (direct `workspace_id` assignment) THEN the system SHALL CONTINUE TO bypass `workspace_move_requests` and share immediately.

3.10 WHEN a meeting owner views the meeting detail page THEN the system SHALL CONTINUE TO show all existing actions (edit, back navigation, share to workspace) alongside the new delete button.

3.11 WHEN a workspace admin views the workspace management page THEN the system SHALL CONTINUE TO show existing member management and settings alongside the new pending requests section.

3.12 WHEN a post-meeting auto-share to all configured integrations succeeds THEN the system SHALL CONTINUE TO complete silently without showing unnecessary notifications.

3.13 WHEN the `pg_trgm` index is added to `summary` THEN the system SHALL CONTINUE TO support all existing query patterns on `meeting_sessions` without breaking other queries.

3.14 WHEN `useSessionPolling` receives a successful response THEN the system SHALL CONTINUE TO poll at the base 2-second interval (resetting backoff) and SHALL CONTINUE TO stop polling when the session reaches a terminal state with insights available.
