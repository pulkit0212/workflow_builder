# Artivaa Platform Fixes — Tasks

## Task List

- [x] 1. Bug 1: Fix Share to Workspace button not visible during loading state
  - [x] 1.1 Add `isLoading` state (initialized `true`) to `ShareToWorkspaceButton`; set to `false` after fetch resolves or rejects
  - [x] 1.2 Update early-return guard to distinguish loading (`isLoading=true`) from empty (`allWorkspaces.length === 0`); return `null` while loading, show button once workspaces load
  - [x] 1.3 Write unit test: render with `isOwner=true`, mock fetch with 200ms delay, assert button appears after fetch resolves

- [x] 2. Bug 2: Add Next.js proxy route for POST /api/meetings/share-calendar
  - [x] 2.1 Create `frontend/src/app/api/meetings/share-calendar/route.ts` with a `POST` handler that forwards the request body and auth headers to the Express backend
  - [x] 2.2 Write integration test: POST to `/api/meetings/share-calendar`, assert `Content-Type: application/json` in response

- [x] 3. Bug 3: Fix workspaces list extraction in share modal
  - [x] 3.1 Audit the fetch handler in `ShareToWorkspaceButton` — confirm the `{ success, workspaces }` extraction path is reached at runtime and `list` is never `undefined`
  - [x] 3.2 Write unit test: mock `/api/workspaces` returning `{ success: true, workspaces: [ws1, ws2] }`, assert dropdown has 2 options

- [x] 4. Bug 4: Strip recording_file_path from GET /api/meetings/:id response
  - [x] 4.1 Remove `recordingFilePath: session.recording_file_path ?? null` from the meeting response object in `backend/express-api/src/routes/meetings.ts` `GET /:id` handler
  - [x] 4.2 Verify `recordingUrl` is still present in the response
  - [x] 4.3 Write unit test: call `GET /api/meetings/:id` for a meeting with a recording, assert response has no `recordingFilePath` key and has `recordingUrl`

- [x] 5. Bug 5: Delete migrate-recordings.js
  - [x] 5.1 Delete `backend/express-api/migrate-recordings.js` from the repository

- [x] 6. Bug 9: Add unique constraint migration for workspace_move_requests
  - [x] 6.1 Create migration `frontend/drizzle/0004_workspace_move_requests_unique.sql` with `ALTER TABLE workspace_move_requests ADD CONSTRAINT workspace_move_requests_meeting_workspace_unique UNIQUE (meeting_id, workspace_id);`
  - [x] 6.2 Write test: attempt duplicate insert on `workspace_move_requests` with same `(meeting_id, workspace_id)`, assert `ON CONFLICT` resolves without error

- [x] 7. Bug 8: Recover processing/summarizing stuck sessions in bot
  - [x] 7.1 In `recoverStuckSessions` in `backend/python-services/ai-processing-service/legacy-bot/index.js`, extend the SQL query to include `'processing'` and `'summarizing'` in the status filter
  - [x] 7.2 For `processing`/`summarizing` sessions (no `ffmpeg_pid` to check), mark as failed unconditionally with `errorCode='server_restart'`
  - [x] 7.3 Write unit test: insert sessions with each of the four statuses, run `recoverStuckSessions`, assert `processing` and `summarizing` sessions are marked failed, `capturing`/`waiting_for_join` behavior unchanged

- [x] 8. Bug 7: Verify transcription retry wiring in bot
  - [x] 8.1 Audit all call sites of `transcribeAsync` in `index.js` — replace any direct calls with `transcribeQueued` (which wraps `transcribeWithRetry`)
  - [x] 8.2 Confirm `stopBot` uses `transcribeQueued` exclusively for transcription
  - [x] 8.3 Write unit test: mock `transcribeAsync` to fail twice then succeed, assert `transcribeWithRetry` returns the successful result on the third attempt

- [x] 9. Bug 6: Pre-recording audio level check in bot
  - [x] 9.1 Add `checkAudioLevel(audioSource)` function in `audioCapture.js` that runs a 2-second ffmpeg probe and parses RMS level from stderr
  - [x] 9.2 Call `checkAudioLevel` in `startRecording` before starting the main recording; if level is below threshold, return `{ success: false, error: 'silent_audio_source', errorCode: 'silent_audio_source' }`
  - [x] 9.3 Write unit test: mock ffmpeg probe output for silent source, assert `startRecording` returns failure; mock active audio, assert recording proceeds normally

- [x] 10. Bug 10: Add delete meeting button in UI
  - [x] 10.1 Add a delete button (visible only to `isOwner`) in `meeting-detail.tsx` with a confirmation dialog
  - [x] 10.2 On confirm, call `DELETE /api/meetings/:id` via `clientApiFetch`; on success, redirect to `/dashboard/meetings`
  - [x] 10.3 Write integration test: owner clicks delete, confirms, assert redirect to meetings list and meeting no longer appears

- [x] 11. Bug 11: Admin approval UI for workspace move requests
  - [x] 11.1 Create `frontend/src/features/workspaces/components/pending-move-requests.tsx` component that fetches pending requests and renders them with Approve/Reject buttons
  - [x] 11.2 Integrate `PendingMoveRequests` into the workspace dashboard page, visible only to admins
  - [x] 11.3 Wire Approve to `POST /api/workspaces/:id/move-requests/:requestId/approve` and Reject to the corresponding reject endpoint
  - [x] 11.4 Write integration test: admin views workspace page with a pending request, approves it, assert request disappears from list and meeting appears in workspace

- [x] 12. Bug 12: Surface auto-share failures to user
  - [x] 12.1 In `triggerAutoShare` in `meeting-sessions.ts`, catch per-integration errors and persist them to a new `auto_share_failures` JSONB column on `meeting_sessions`
  - [x] 12.2 Include `autoShareFailures` in the `GET /api/meetings/:id/status` polling response
  - [x] 12.3 In `meeting-detail.tsx`, display a toast/banner when `autoShareFailures` is non-empty, naming the failed integration(s)
  - [x] 12.4 Write unit test: mock a failing Slack webhook, assert `autoShareFailures` is populated and the UI renders the error banner

- [x] 13. Bug 13: Add pg_trgm index on summary column
  - [x] 13.1 Create migration `frontend/drizzle/0005_pg_trgm_summary_index.sql` with `CREATE EXTENSION IF NOT EXISTS pg_trgm;` and `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_meeting_sessions_summary_trgm ON meeting_sessions USING GIN (summary gin_trgm_ops);`
  - [x] 13.2 Verify existing reports queries still work after migration

- [x] 14. Bug 14: Add exponential backoff to useSessionPolling
  - [x] 14.1 Replace `setInterval` in `useSessionPolling` with a recursive `setTimeout`
  - [x] 14.2 Track `consecutiveErrors` ref; on error double the interval (cap at 30000ms); on success reset to 2000ms
  - [x] 14.3 Preserve existing terminal-state stop logic (stop when `isTerminal && insightsReady`)
  - [x] 14.4 Write unit test: simulate 4 consecutive errors, assert intervals are 2s → 4s → 8s → 16s; simulate success after backoff, assert interval resets to 2s
