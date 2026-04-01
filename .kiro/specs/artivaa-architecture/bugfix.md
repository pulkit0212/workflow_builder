# Bugfix Requirements Document

## Introduction

After a full codebase audit of Artivaa's bot orchestration, recording pipeline, session management, and storage layer, several critical architectural defects were identified. These bugs span race conditions in bot deduplication, synchronous blocking in the transcription pipeline, unsafe file-based session state, insecure recording storage, and missing idempotency guarantees. Left unaddressed, these issues will cause duplicate bots joining the same meeting, data loss on server restart, blocked API responses during long transcription jobs, and publicly accessible audio recordings. This document captures all defects, their expected correct behavior, and the existing behavior that must be preserved.

---

## Bug Analysis

### Current Behavior (Defect)

**Bug Group 1: Duplicate Bot Race Condition (No Atomic Locking)**

1.1 WHEN two users trigger "Start AI Notetaker" for the same meeting URL within milliseconds of each other THEN the system launches two separate bot processes because the dedup check (`findActiveGoogleMeetSessionByNormalizedUrl`) and the session status update (`updateMeetingSession`) are two separate non-atomic operations with no database-level lock between them.

1.2 WHEN a concurrent start request reads `normalizedMeetingUrl` before the first request has written `status = "waiting_for_join"` to the database THEN the system finds no active session and proceeds to spawn a second bot for the same meeting URL.

1.3 WHEN the dedup check runs for a non-Google-Meet URL (Zoom, Teams) THEN the system performs no deduplication at all and always spawns a new bot, regardless of whether one is already running.

**Bug Group 2: Synchronous Transcription Blocks the Node.js Process**

1.4 WHEN a meeting ends and `stopBot` is called THEN the system runs `execSync('python3 transcribe.py ...')` which blocks the entire Node.js event loop for up to 10 minutes (600,000 ms timeout), making the server unresponsive to all other requests during that window.

1.5 WHEN transcription is running synchronously and another user attempts to start or stop a bot THEN the system cannot process that request because the event loop is blocked.

**Bug Group 3: File-Based Session State is Not Crash-Safe**

1.6 WHEN the server (PM2 process) restarts while a bot is in `capturing` state THEN the system loses all in-memory `activeBrowsers` map entries and the `tmp/bot-sessions.json` file becomes the only record of the session, but the bot process (Playwright + ffmpeg) is also killed, leaving the session permanently stuck in `capturing` status in the database with no recovery path.

1.7 WHEN two concurrent requests write to `tmp/bot-sessions.json` simultaneously THEN the system can corrupt the JSON file because there is no file-level locking, causing all subsequent session reads to return `{}` and orphaning active bots.

1.8 WHEN the `tmp/bot-sessions.json` file is deleted or the `tmp/` directory is wiped THEN the system loses all active session state and cannot stop any running bots.

**Bug Group 4: Recordings Stored in `public/recordings/` Are Publicly Accessible**

1.9 WHEN a meeting recording is saved via `saveRecording()` THEN the system copies the audio file to `public/recordings/meeting-{id}.wav`, making it directly accessible to anyone with the URL `/recordings/meeting-{id}.wav` without any authentication check.

1.10 WHEN a meeting session ID is guessable or leaked THEN the system exposes the full audio recording of a private meeting to unauthenticated third parties.

**Bug Group 5: `startBot` is Fired with `void` — Errors Are Silently Swallowed**

1.11 WHEN `startBot(...)` throws an unhandled error after the API response has already been sent THEN the system logs the error to console but the meeting session status in the database is never updated to `failed`, leaving the UI polling indefinitely in `waiting_for_join` state.

1.12 WHEN the Playwright browser fails to launch (e.g., missing system dependency) after the API has returned `200 bot_starting` THEN the system silently drops the error and the user sees no failure feedback.

**Bug Group 6: `canTransitionMeetingSessionStatus` Does Not Prevent Re-entry from `capturing`**

1.13 WHEN a user clicks "Start AI Notetaker" on a meeting that is already in `capturing` state THEN the system returns a `409` error correctly, but WHEN the same meeting is in `waiting_for_join` state and a second concurrent request arrives THEN both requests pass the transition guard simultaneously (since neither has committed the status update yet) and both proceed to call `startBot`.

**Bug Group 7: Transcription Runs Inline in the Bot Process — No Queue**

1.14 WHEN multiple meetings end at the same time THEN the system runs multiple `execSync` Python transcription processes simultaneously, each consuming significant CPU and memory, with no concurrency limit or backpressure mechanism.

1.15 WHEN the transcription Python script crashes or times out THEN the system marks the session as `failed` but does not retry, permanently losing the transcript even though the audio file still exists.

**Bug Group 8: `normalizedMeetingUrl` Is Null for Non-Google-Meet URLs**

1.16 WHEN a Zoom or Teams meeting URL is used to start a bot THEN the system sets `normalizedMeetingUrl = null` in the database because `isGoogleMeetUrl()` returns false, making it impossible to deduplicate Zoom or Teams meetings by URL.

**Bug Group 9: `meetingsUsedThisMonth` Counter Is Incremented Before Bot Success**

1.17 WHEN `incrementMeetingUsage` is called before `startBot` completes THEN the system charges the user's monthly quota even if the bot immediately fails to join (e.g., unsupported platform, admission denied), consuming a meeting credit for a session that produced no value.

**Bug Group 10: Agent Audio Routes Are Empty Stubs**

1.18 WHEN the browser-based agent audio path is triggered (via `/api/agent/audio/start`, `/chunk`, `/stop`) THEN the system returns 404 because the route handler files do not exist, despite the schema and directory structure being in place.

---

### Expected Behavior (Correct)

**Bug Group 1: Duplicate Bot Race Condition**

2.1 WHEN two users trigger "Start AI Notetaker" for the same meeting URL concurrently THEN the system SHALL use a database-level advisory lock or an `INSERT ... ON CONFLICT DO NOTHING` + `SELECT FOR UPDATE` pattern to guarantee only one bot is spawned, and the second request SHALL receive an `already_recording` response.

2.2 WHEN a start request arrives for any meeting URL (Google Meet, Zoom, or Teams) THEN the system SHALL check for an active session by `normalizedMeetingUrl` before spawning a bot, and SHALL normalize all supported platform URLs.

2.3 WHEN the dedup check and session status update are performed THEN the system SHALL execute them as a single atomic operation (e.g., using a Redis distributed lock keyed on `normalizedMeetingUrl`, or a Postgres advisory lock) so no two concurrent requests can both pass the guard.

**Bug Group 2: Synchronous Transcription**

2.4 WHEN a meeting ends and transcription is needed THEN the system SHALL enqueue a transcription job (via BullMQ or equivalent) and return immediately, so the Node.js event loop is never blocked.

2.5 WHEN a transcription job is enqueued THEN the system SHALL process it in a separate worker process, keeping the API server responsive at all times.

**Bug Group 3: File-Based Session State**

2.6 WHEN a bot session is active THEN the system SHALL persist session state (ffmpeg PID, output path, status) in the database (the existing `meeting_sessions` table) rather than in a local JSON file, so state survives server restarts.

2.7 WHEN the server restarts THEN the system SHALL detect sessions stuck in `capturing` or `processing` state and SHALL mark them as `failed` with a `server_restart` error code so users receive clear feedback.

**Bug Group 4: Recording Storage Security**

2.8 WHEN a recording is saved THEN the system SHALL store it outside the `public/` directory (e.g., in `private/recordings/` or an object store) and SHALL serve it only through an authenticated API route that verifies the requesting user owns or is shared on the session.

**Bug Group 5: Silent `void startBot` Errors**

2.9 WHEN `startBot` throws after the API response has been sent THEN the system SHALL catch the error and SHALL update the meeting session status to `failed` with an appropriate `errorCode` and `failureReason` so the polling UI reflects the failure.

**Bug Group 6: Concurrent Start Guard**

2.10 WHEN a start request arrives for a session already in `waiting_for_join` or `capturing` state THEN the system SHALL return `already_recording` (not `409`) so the frontend can display the correct message without treating it as an error.

**Bug Group 7: Transcription Queue and Retry**

2.11 WHEN transcription fails due to a transient error THEN the system SHALL retry the job up to 3 times with exponential backoff before marking the session as `failed`.

2.12 WHEN multiple meetings end simultaneously THEN the system SHALL process transcription jobs with a configurable concurrency limit (default: 2) to prevent resource exhaustion.

**Bug Group 8: URL Normalization for All Platforms**

2.13 WHEN a Zoom or Teams meeting URL is used THEN the system SHALL normalize it to a canonical form and SHALL store it in `normalizedMeetingUrl` so deduplication works across all supported platforms.

**Bug Group 9: Usage Metering After Success**

2.14 WHEN a bot successfully joins a meeting (status transitions to `capturing`) THEN the system SHALL increment `meetingsUsedThisMonth`, not before, so failed join attempts do not consume quota.

**Bug Group 10: Agent Audio Routes**

2.15 WHEN the browser-based agent audio path is used THEN the system SHALL have implemented route handlers for `/api/agent/audio/start`, `/api/agent/audio/chunk`, and `/api/agent/audio/stop` that accept, buffer, and process audio chunks from the browser extension/tab capture API.

---

### Unchanged Behavior (Regression Prevention)

3.1 WHEN a single user starts a bot for a meeting that has no active session THEN the system SHALL CONTINUE TO create a new meeting session, spawn the bot, and return `bot_starting` as before.

3.2 WHEN a meeting ends normally and transcription succeeds THEN the system SHALL CONTINUE TO persist the transcript, summary, action items, key decisions, and all structured fields to the `meeting_sessions` table.

3.3 WHEN a meeting session completes THEN the system SHALL CONTINUE TO trigger all enabled integrations (Slack, Notion, Jira, Gmail) asynchronously without blocking the main pipeline.

3.4 WHEN a user polls `/api/meetings/{id}/status` THEN the system SHALL CONTINUE TO return the current canonical status, errorCode, failureReason, transcript, and summary fields.

3.5 WHEN a bot is kicked from a meeting or the meeting ends naturally THEN the system SHALL CONTINUE TO auto-stop the bot, finalize the recording, and transition the session through `processing → summarizing → completed`.

3.6 WHEN a user's plan does not include meeting bot access THEN the system SHALL CONTINUE TO return a `403 upgrade_required` error before spawning any bot.

3.7 WHEN a user has exhausted their monthly meeting quota THEN the system SHALL CONTINUE TO return a `403 limit_reached` error before spawning any bot.

3.8 WHEN a Google Meet URL is normalized THEN the system SHALL CONTINUE TO strip query parameters and extract only the meeting code (e.g., `meet.google.com/abc-defg-hij`) as the canonical key.

3.9 WHEN the state machine transition guard rejects an invalid transition THEN the system SHALL CONTINUE TO return a `409` error for genuinely invalid transitions (e.g., `completed → waiting_for_join`).

3.10 WHEN a bot session fails for any reason THEN the system SHALL CONTINUE TO persist `errorCode` and `failureReason` to the database so the UI can display a specific, actionable error message.
