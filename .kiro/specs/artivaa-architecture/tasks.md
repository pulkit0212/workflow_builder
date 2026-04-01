# Implementation Plan

- [x] 0. Write bug condition exploration tests (BEFORE any fixes)
  - **Property 1: Bug Condition** - Duplicate Bot Race Condition
  - **CRITICAL**: This test MUST FAIL on unfixed code — failure confirms the race condition exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **GOAL**: Surface counterexamples that demonstrate all five bugs exist before any fix is applied
  - **Scoped PBT Approach**: Scope each property to the concrete failing case(s) for reproducibility
  - Fire two simultaneous POST requests to `/api/meetings/{id}/start` with the same Google Meet URL; assert two `meeting_sessions` rows are created with `status = 'waiting_for_join'` — demonstrates the race condition
  - Start a bot with a Zoom URL (`zoom.us/j/123456789`); assert `normalizedMeetingUrl IS NULL` in the DB — demonstrates platform gap (Bug Groups 8, 1.3)
  - Start a bot that immediately fails; assert `meetingsUsedThisMonth` was incremented — demonstrates premature billing (Bug Group 9, 1.17)
  - Call `stopBot` and immediately fire another API request; assert the second request does not respond until transcription completes — demonstrates event loop blocking (Bug Group 2, 1.4)
  - Write a session to `bot-sessions.json` with `status: 'capturing'`, simulate restart (clear `activeBrowsers`), assert session is still `capturing` in DB with no recovery — demonstrates stuck session (Bug Group 3, 1.6)
  - Save a recording, make an unauthenticated GET to `/recordings/meeting-{id}.wav`, assert 200 response — demonstrates public exposure (Bug Group 4, 1.9)
  - Mock `startBot` to throw, call the start route, assert session status remains `waiting_for_join` after the throw — demonstrates silent failure (Bug Group 5, 1.11)
  - Run test on UNFIXED code
  - **EXPECTED OUTCOME**: Tests FAIL (this is correct — they prove the bugs exist)
  - Document counterexamples found (e.g., two sessions with identical `normalizedMeetingUrl`, `normalizedMeetingUrl = null` for Zoom, event loop blocked, session stuck in `capturing`, unauthenticated 200 on recording, session not updated after throw)
  - Mark task complete when tests are written, run, and failures are documented
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.6, 1.9, 1.11, 1.16, 1.17_

- [x] 1. Schema update + db:push
  - [x] 1.1 Add new nullable columns to `meeting-sessions` schema
    - Open `src/db/schema/meeting-sessions.ts`
    - Add `ffmpegPid: integer('ffmpeg_pid')` (nullable) if not already present
    - Add `outputPath: text('output_path')` (nullable) if not already present
    - Add `failureReason: text('failure_reason')` (nullable) if not already present
    - _Requirements: 2.6, 2.7, 2.9_
  - [x] 1.2 Push schema changes to the database
    - Run `npm run db:push` to apply the schema changes
    - Verify the new columns exist in the `meeting_sessions` table
    - _Requirements: 2.6_

- [x] 2. Fix 3: Database Session State (Bug Group 3)
  - **Property 2: Preservation** - Session State Survives Server Restart
  - **IMPORTANT**: Follow observation-first methodology — observe current file-based behavior before replacing it
  - Observe: `readSessions()` returns `{}` after `tmp/bot-sessions.json` is deleted on unfixed code
  - Observe: concurrent `writeSession` calls corrupt the JSON file on unfixed code
  - Write preservation property test: for all sessions saved via `saveSessionToDB`, the session is retrievable via `getSessionFromDB` after simulated restart with all fields intact
  - Verify preservation test passes on UNFIXED code for non-buggy inputs (single-writer, no restart)
  - **EXPECTED OUTCOME**: Preservation tests PASS on unfixed code (confirms baseline to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

  - [x] 2.1 Remove file-based session helpers from `bot/index.js`
    - Remove `SESSIONS_FILE` constant
    - Remove `readSessions()` function
    - Remove `writeSession()` function
    - Remove `deleteSession()` function
    - _Bug_Condition: isBugCondition_sessionState(input) where storageBackend = 'file'_
    - _Expected_Behavior: saveSessionToDB / getSessionFromDB round-trip preserves all fields including ffmpegPid and outputPath_
    - _Preservation: Single-user happy path, bot auto-stop, processing pipeline all unchanged_
    - _Requirements: 2.6, 3.1, 3.5_

  - [x] 2.2 Add `saveSessionToDB(meetingId, data)` to `bot/index.js`
    - Upserts `{ ffmpegPid, outputPath, status }` to `meeting_sessions` via the DB client
    - Replace all `writeSession` call sites with `saveSessionToDB`
    - _Requirements: 2.6_

  - [x] 2.3 Add `getSessionFromDB(meetingId)` to `bot/index.js`
    - Fetches the session row by `meetingId` from the DB
    - Replace all `readSessions` call sites with `getSessionFromDB`
    - _Requirements: 2.6_

  - [x] 2.4 Add `isProcessRunning(pid)` helper to `bot/index.js`
    - Uses `process.kill(pid, 0)` to check if a PID is still alive
    - Returns `false` if the signal throws (process dead or no permission)
    - _Requirements: 2.7_

  - [x] 2.5 Add `recoverStuckSessions()` to `bot/index.js` and call at startup
    - Queries for sessions with `status IN ('capturing', 'waiting_for_join')`
    - For each, checks if `ffmpegPid` is still running via `isProcessRunning(pid)`
    - Marks dead sessions as `failed` with `errorCode: 'server_restart'`
    - Call `recoverStuckSessions()` at bot process startup before accepting new work
    - _Bug_Condition: isBugCondition_sessionState(input) where serverRestarted = true AND stuckSessionsExist = true_
    - _Expected_Behavior: recoverStuckSessions() transitions orphaned sessions to failed with errorCode: 'server_restart'_
    - _Requirements: 2.7, 3.10_

  - [x] 2.6 Verify bug condition exploration test (session state) now passes
    - **Property 1: Expected Behavior** - Session State Survives Server Restart
    - **IMPORTANT**: Re-run the SAME session-state test from task 0 — do NOT write a new test
    - Simulate restart; assert `getSessionFromDB` returns the session; assert `recoverStuckSessions` marks dead sessions as `failed`
    - **EXPECTED OUTCOME**: Test PASSES (confirms Bug Group 3 is fixed)
    - _Requirements: 2.6, 2.7_

  - [x] 2.7 Verify preservation tests still pass
    - **Property 2: Preservation** - Session State Survives Server Restart
    - **IMPORTANT**: Re-run the SAME preservation tests from task 2 — do NOT write new tests
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions in session handling)

- [x] 3. Fix 1: Atomic Bot Deduplication (Bug Groups 1, 6, 8, 9)
  - [x] 3.1 Generalize URL normalizer in `src/features/meetings/server/google-meet-dedup.ts`
    - Rename `normalizeGoogleMeetUrl` → `normalizeMeetingUrl(url: string): string | null`
    - Add Zoom pattern: `zoom.us/j/{id}` → canonical `zoom.us/j/{id}`
    - Add Teams pattern: `teams.microsoft.com/l/meetup-join/...` → canonical form
    - Return `null` for unrecognized URLs (no bot support)
    - Preserve existing Google Meet normalization exactly: strip query params, extract meeting code as `meet.google.com/{code}`
    - _Bug_Condition: isBugCondition_dedup(input) where meetingUrl matches Zoom/Teams AND normalizedMeetingUrl stored in DB IS NULL_
    - _Expected_Behavior: normalizeMeetingUrl returns canonical form for all supported platforms_
    - _Preservation: Google Meet URL normalization (strip query params, extract meeting code) unchanged — Requirements 3.8_
    - _Requirements: 2.2, 2.13, 3.8_

  - [x] 3.2 Wrap dedup + insert in DB transaction with `pg_advisory_xact_lock` in `src/app/api/meetings/[id]/start/route.ts`
    - Compute `lockKey = hashString(normalizedUrl)` (BigInt hash for pg advisory lock)
    - Execute `SELECT pg_advisory_xact_lock(${lockKey})` inside the transaction
    - Query for existing active session by `normalizedMeetingUrl` inside the same transaction
    - If existing: append `userId` to `sharedWithUserIds`, return `{ type: 'existing' }`
    - If none: insert new session with `status: 'waiting_for_join'`, return `{ type: 'new' }`
    - Return `already_recording` (not 409) for existing sessions
    - _Bug_Condition: isBugCondition_dedup(input) where concurrentRequest = true AND no pg_advisory_xact_lock held_
    - _Expected_Behavior: exactly one session created, second request receives already_recording_
    - _Preservation: Single-user start with no active session still returns bot_starting — Requirements 3.1_
    - _Requirements: 2.1, 2.3, 2.10, 3.1_

  - [x] 3.3 Move `incrementMeetingUsage` to fire only on `capturing` transition
    - Remove `incrementMeetingUsage` call from before `startBot` in the start route
    - Add `incrementMeetingUsage` call inside `persistBotCaptureStatusUpdate` when status transitions to `capturing`
    - _Bug_Condition: isBugCondition_dedup(input) where usageIncrementedBeforeCapturing = true_
    - _Expected_Behavior: meetingsUsedThisMonth incremented only after bot successfully joins_
    - _Preservation: Quota enforcement (403 limit_reached / 403 upgrade_required) still fires before any session is created — Requirements 3.6, 3.7_
    - _Requirements: 2.14, 3.6, 3.7_

  - [x] 3.4 Verify bug condition exploration tests (deduplication) now pass
    - **Property 1: Expected Behavior** - Atomic Deduplication Prevents Duplicate Bots
    - **IMPORTANT**: Re-run the SAME dedup tests from task 0 — do NOT write new tests
    - Assert concurrent requests produce exactly one session; assert Zoom URL has non-null `normalizedMeetingUrl`; assert failed bot does not increment quota
    - **EXPECTED OUTCOME**: Tests PASS (confirms Bug Groups 1, 6, 8, 9 are fixed)
    - _Requirements: 2.1, 2.2, 2.3, 2.13, 2.14_

  - [x] 3.5 Verify preservation tests still pass
    - **Property 2: Preservation** - Single-User Happy Path and Google Meet Normalization Unchanged
    - **IMPORTANT**: Re-run the SAME preservation tests from task 0 — do NOT write new tests
    - Assert single-user start still returns `{ status: 'bot_starting' }`; assert Google Meet normalization output is identical to original
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions)
    - _Requirements: 3.1, 3.8_

- [x] 4. Fix 2: Async Transcription (Bug Groups 2, 7)
  - [x] 4.1 Add `transcribeAsync(audioPath)` to `bot/index.js`
    - Uses `child_process.spawn('python3', ['transcribe.py', audioPath])` instead of `execSync`
    - Returns a Promise that resolves on exit code 0, rejects with stderr on non-zero exit
    - _Bug_Condition: isBugCondition_transcription(input) where transcriptionCall = 'execSync'_
    - _Expected_Behavior: transcribeAsync returns a Promise immediately without blocking the event loop_
    - _Requirements: 2.4, 2.5_

  - [x] 4.2 Add `transcribeWithRetry(audioPath, maxRetries = 3)` to `bot/index.js`
    - Wraps `transcribeAsync` with exponential backoff: delays of 2s, 4s, 8s between attempts
    - Throws on final failure after `maxRetries` attempts
    - _Bug_Condition: isBugCondition_transcription(input) where transcriptionFailed AND retryCount = 0_
    - _Expected_Behavior: retries up to 3 times with exponential backoff before marking session failed_
    - _Requirements: 2.11_

  - [x] 4.3 Add concurrency semaphore (max 2 simultaneous transcription jobs) to `bot/index.js`
    - Add `activeTranscriptions` counter and `transcriptionQueue` array
    - Gate `transcribeAsync` calls so at most 2 run simultaneously; queue excess jobs
    - _Bug_Condition: isBugCondition_transcription(input) where concurrentJobs > 2_
    - _Expected_Behavior: activeTranscriptions <= 2 at all times_
    - _Requirements: 2.12_

  - [x] 4.4 Replace `execSync` call with `await transcribeWithRetry(audioPath)` in `bot/index.js`
    - Remove the single `execSync('python3 transcribe.py ...')` call
    - Replace with `await transcribeWithRetry(audioPath)`
    - _Requirements: 2.4, 2.5_

  - [x] 4.5 Verify bug condition exploration tests (transcription) now pass
    - **Property 1: Expected Behavior** - Async Transcription Never Blocks Event Loop
    - **IMPORTANT**: Re-run the SAME transcription tests from task 0 — do NOT write new tests
    - Assert `transcribeWithRetry` returns a Promise immediately; assert concurrent jobs capped at 2; assert retry fires on failure
    - **EXPECTED OUTCOME**: Tests PASS (confirms Bug Groups 2, 7 are fixed)
    - _Requirements: 2.4, 2.5, 2.11, 2.12_

  - [x] 4.6 Verify preservation tests still pass
    - **Property 2: Preservation** - Transcription Output Unchanged for Non-Buggy Inputs
    - **IMPORTANT**: Re-run the SAME preservation tests — do NOT write new tests
    - Assert that for a single meeting ending normally, the transcript is still persisted to `meeting_sessions`
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions in transcription pipeline)
    - _Requirements: 3.2, 3.5_

- [x] 5. Fix 4: Secure Recording Storage (Bug Group 4)
  - [x] 5.1 Change storage destination in `src/lib/storage.ts`
    - Change `public/recordings/` → `private/recordings/` (outside Next.js static serving)
    - Change `saveRecording()` return value from file path to `/api/recordings/${meetingId}`
    - _Bug_Condition: isBugCondition_storage(input) where recordingPath STARTS WITH 'public/'_
    - _Expected_Behavior: saveRecording() stores file in private/ and returns /api/recordings/{meetingId} URL_
    - _Requirements: 2.8_

  - [x] 5.2 Create authenticated recordings route `src/app/api/recordings/[meetingId]/route.ts`
    - Authenticate via Clerk `auth()` — return 401 if no session
    - Query `meeting_sessions` by `meetingId` — return 404 if not found
    - Authorize: allow only `primaryUserId` or users in `sharedWithUserIds` — return 403 otherwise
    - Read file from `private/recordings/meeting-{meetingId}.wav` and stream as `audio/wav`
    - _Bug_Condition: isBugCondition_storage(input) where fileAccessible WITHOUT authentication check_
    - _Expected_Behavior: 401 for unauthenticated, 403 for unauthorized, 200 with audio for owner/shared user_
    - _Requirements: 2.8, 3.4_

  - [x] 5.3 Add `private/` to `.gitignore`
    - Append `private/` to `.gitignore` to prevent recordings from being committed
    - _Requirements: 2.8_

  - [x] 5.4 Verify bug condition exploration test (storage) now passes
    - **Property 1: Expected Behavior** - Recordings Are Not Publicly Accessible
    - **IMPORTANT**: Re-run the SAME storage test from task 0 — do NOT write a new test
    - Assert unauthenticated GET to `/recordings/meeting-{id}.wav` returns 404 (file not in public/); assert unauthenticated GET to `/api/recordings/{id}` returns 401
    - **EXPECTED OUTCOME**: Test PASSES (confirms Bug Group 4 is fixed)
    - _Requirements: 2.8_

  - [x] 5.5 Verify preservation tests still pass
    - **Property 2: Preservation** - Recording Access for Authorized Users Unchanged
    - **IMPORTANT**: Re-run the SAME preservation tests — do NOT write new tests
    - Assert owner can still download recording via `/api/recordings/{id}`; assert shared user can download; assert unshared user gets 403
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions in recording access)
    - _Requirements: 3.4_

- [x] 6. Fix 5: Silent startBot Errors (Bug Group 5)
  - [x] 6.1 Add `startBotSafely` function to `src/app/api/meetings/[id]/start/route.ts`
    - Wraps `startBot(sessionId, meetingUrl, persistBotCaptureStatusUpdate)` in a try/catch
    - On catch: updates `meeting_sessions` row to `status: 'failed'`, `errorCode: 'bot_launch_failed'`, `failureReason: error.message`, `updatedAt: new Date()`
    - Does NOT re-throw — errors are fully handled internally
    - _Bug_Condition: isBugCondition_silentError(input) where startBotThrows = true AND sessionStatusAfterThrow != 'failed'_
    - _Expected_Behavior: startBotSafely catches all throws and writes failed status to DB before Promise resolves_
    - _Preservation: Single-user happy path where startBot succeeds is unchanged — Requirements 3.1_
    - _Requirements: 2.9, 3.1, 3.10_

  - [x] 6.2 Replace `void startBot(...).catch(console.error)` with `startBotSafely(...)` in the start route
    - Remove the `void startBot(...).catch(console.error)` call
    - Replace with `startBotSafely(session.id, meetingUrl, userId)` (not awaited — response already sent)
    - _Requirements: 2.9_

  - [x] 6.3 Verify bug condition exploration test (silent errors) now passes
    - **Property 1: Expected Behavior** - startBot Errors Update Session to Failed
    - **IMPORTANT**: Re-run the SAME silent-error test from task 0 — do NOT write a new test
    - Mock `startBot` to throw; assert session status transitions to `failed` with `errorCode: 'bot_launch_failed'`
    - **EXPECTED OUTCOME**: Test PASSES (confirms Bug Group 5 is fixed)
    - _Requirements: 2.9_

  - [x] 6.4 Verify preservation tests still pass
    - **Property 2: Preservation** - Successful startBot Path Unchanged
    - **IMPORTANT**: Re-run the SAME preservation tests — do NOT write new tests
    - Assert that when `startBot` succeeds, the session progresses normally through `waiting_for_join → capturing → ...`
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions in the happy path)
    - _Requirements: 3.1, 3.5_

- [x] 7. Checkpoint — Ensure all tests pass
  - Re-run the full test suite (unit + property-based + integration)
  - Verify all five bug condition exploration tests now PASS (bugs fixed)
  - Verify all preservation property tests still PASS (no regressions)
  - Verify integration test: full bot lifecycle with async transcription completes end-to-end
  - Verify integration test: concurrent start for same meeting → one bot, one `already_recording`, one session in DB
  - Verify integration test: server restart mid-capture → `recoverStuckSessions` fires, stuck session → `failed`
  - Verify integration test: recording access — owner 200, shared user 200, unshared 403, unauthenticated 401
  - Verify integration test: quota metering — failed bot before `capturing` does not increment counter
  - Ensure all tests pass; ask the user if questions arise
