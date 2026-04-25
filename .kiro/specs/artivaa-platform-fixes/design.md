# Artivaa Platform Fixes — Bugfix Design

## Overview

This document covers the design for 14 bugs across the Artivaa platform. The fixes span:
- Frontend rendering issues (Bugs 1, 3, 10, 11, 12, 14)
- API routing / security issues (Bugs 2, 4, 5)
- Bot reliability issues (Bugs 6, 7, 8)
- Database integrity issues (Bug 9, 13)

Each bug is analyzed using the bug condition methodology: C(X) identifies the triggering input, P(result) defines the expected correct behavior, and ¬C(X) defines the inputs that must be preserved unchanged.

---

## Glossary

- **Bug_Condition (C)**: The condition that triggers the defective behavior for a given bug
- **Property (P)**: The desired correct behavior when the bug condition holds
- **Preservation**: Existing behavior that must remain unchanged after the fix
- **isBugCondition(input)**: Pseudocode function returning true when the bug is triggered
- **expectedBehavior(result)**: Pseudocode function returning true when the result is correct
- **ShareToWorkspaceButton**: React component in `frontend/src/features/meetings/components/share-to-workspace-button.tsx`
- **allWorkspaces**: State variable in `ShareToWorkspaceButton` holding the fetched workspace list (null = loading, [] = empty, array = loaded)
- **meetingsRouter**: Express router in `backend/express-api/src/routes/meetings.ts`
- **recoverStuckSessions**: Bot startup function in `backend/python-services/ai-processing-service/legacy-bot/index.js` that marks orphaned sessions as failed
- **useSessionPolling**: React hook in `frontend/src/hooks/useSessionPolling.ts` that polls meeting status at a fixed interval
- **workspace_move_requests**: PostgreSQL table storing pending workspace share requests from non-admin members

---

## Bug Details

### Bug 1 — Share to Workspace Button Not Visible

The bug manifests when a user views a meeting detail page in personal mode (`activeWorkspaceId === null`) and is the meeting owner and belongs to at least one workspace. The `ShareToWorkspaceButton` component returns `null` prematurely because `allWorkspaces` is `null` (loading state) during the initial render, before the `/api/workspaces` fetch resolves.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input = { isOwner, allWorkspaces, moveStatus }
  OUTPUT: boolean

  RETURN input.isOwner = true
         AND input.allWorkspaces = null   -- still loading
         AND input.moveStatus NOT IN ('pending', 'approved')
END FUNCTION
```

**Examples:**
- Owner views meeting, workspaces fetch in-flight → button invisible (bug)
- Owner views meeting, workspaces loaded with 2 entries → button visible (correct)
- Non-owner views meeting → button correctly hidden (not a bug)

---

### Bug 2 — share-calendar API Returns HTML

The bug manifests when the frontend POSTs to `/api/meetings/share-calendar`. Next.js returns a 404 HTML page because no route exists at `frontend/src/app/api/meetings/share-calendar/route.ts`. The Express backend has the handler but is not directly reachable from the browser.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input = { method, path }
  OUTPUT: boolean

  RETURN input.method = 'POST'
         AND input.path = '/api/meetings/share-calendar'
         AND nextjsRouteExists('/api/meetings/share-calendar') = false
END FUNCTION
```

**Examples:**
- POST `/api/meetings/share-calendar` → 404 HTML (bug)
- POST `/api/meetings/[id]/move-to-workspace` → JSON response (not affected)

---

### Bug 3 — Workspaces List Empty in Share Modal

The bug manifests when `ShareToWorkspaceButton` fetches `/api/workspaces`. The Express route returns `{ success: true, workspaces: [...] }` but the component's `.then` handler only handles the plain-array shape, so `list` resolves to `undefined` and `setAllWorkspaces([])` is called, leaving the dropdown empty.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input = API response from GET /api/workspaces
  OUTPUT: boolean

  RETURN typeof input = 'object'
         AND input.success = true
         AND Array.isArray(input.workspaces) = true
         AND callerExtractsArray(input) = false  -- caller treats it as plain array
END FUNCTION
```

**Examples:**
- `/api/workspaces` returns `{ success: true, workspaces: [ws1, ws2] }` → dropdown shows 0 items (bug)
- After fix, same response → dropdown shows ws1, ws2 (correct)

---

### Bug 4 — recording_file_path Exposed in API Response

The bug manifests when `GET /api/meetings/:id` is called. The response includes `recordingFilePath` (an absolute server filesystem path like `/home/ubuntu/tmp/audio/meeting-abc.wav`), leaking internal server path information.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input = meeting row from meeting_sessions
  OUTPUT: boolean

  RETURN input.recording_file_path IS NOT NULL
         AND response includes 'recordingFilePath' key
END FUNCTION
```

**Examples:**
- Meeting with recording → response contains `recordingFilePath: "/home/ubuntu/tmp/audio/..."` (bug)
- After fix → response omits `recordingFilePath`, still includes `recordingUrl` (correct)

---

### Bug 5 — migrate-recordings.js Present in express-api Root

The bug manifests when `backend/express-api` is deployed. The file `migrate-recordings.js` exists at the root of the service, creating a security and maintenance risk (loose migration script with direct DB access).

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input = filesystem state of backend/express-api/
  OUTPUT: boolean

  RETURN fileExists('backend/express-api/migrate-recordings.js') = true
END FUNCTION
```

---

### Bug 6 — Transcription Hallucination from Silent Audio Source

The bug manifests when the bot starts recording via the monitor audio source but Google Meet audio is not routed through that source. The bot records silence, and Whisper produces hallucinated repeated tokens instead of real transcript content.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input = { audioSource, recordingOutputPath }
  OUTPUT: boolean

  RETURN audioLevelCheck(input.audioSource) < MIN_AUDIO_LEVEL_THRESHOLD
         AND recordingStarted = true
END FUNCTION
```

**Examples:**
- Monitor source has no audio routed → Whisper outputs "111" repeated 177 times (bug)
- Monitor source has active audio → normal transcription (not affected)

---

### Bug 7 — No Retry on Transcription Failure

The bug manifests when the Whisper transcription call fails with a transient error. The bot immediately marks the meeting as failed without retrying, permanently losing the transcript.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input = { transcriptionAttempt, error }
  OUTPUT: boolean

  RETURN input.transcriptionAttempt = 1
         AND isTransientError(input.error) = true
         AND retryAttempted = false
END FUNCTION
```

**Note:** `transcribeWithRetry` already exists in the codebase but may not be wired into the main processing path. The fix verifies it is used everywhere transcription is called.

---

### Bug 8 — Sessions Stuck in processing/summarizing Not Recovered

The bug manifests when the bot crashes while a session is in `processing` or `summarizing` status. `recoverStuckSessions()` only queries for `status IN ('capturing', 'waiting_for_join')`, so these sessions are never recovered.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input = { sessionStatus }
  OUTPUT: boolean

  RETURN input.sessionStatus IN ('processing', 'summarizing')
         AND botProcessRunning = false
         AND recoverStuckSessionsQueryIncludes(input.sessionStatus) = false
END FUNCTION
```

**Examples:**
- Bot crashes mid-summarization → session stuck at `summarizing` forever (bug)
- Bot crashes mid-capture → session correctly marked failed (not affected)

---

### Bug 9 — workspace_move_requests Unique Constraint Missing

The bug manifests when `INSERT INTO workspace_move_requests ... ON CONFLICT (meeting_id, workspace_id) DO UPDATE` is executed. The migration in `0003_safe_ronan.sql` creates the table but does not add a unique constraint on `(meeting_id, workspace_id)`, so the `ON CONFLICT` clause may throw a PostgreSQL error.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input = { meetingId, workspaceId }
  OUTPUT: boolean

  RETURN uniqueConstraintExists('workspace_move_requests', ['meeting_id', 'workspace_id']) = false
         AND insertWithOnConflict(input.meetingId, input.workspaceId) attempted
END FUNCTION
```

---

### Bug 10 — No Delete Meeting Button in UI

The bug manifests when a meeting owner views the meeting detail page. There is no delete button, even though `DELETE /api/meetings/:id` exists on the backend.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input = { isOwner, meetingDetailPage }
  OUTPUT: boolean

  RETURN input.isOwner = true
         AND deleteButtonRendered(input.meetingDetailPage) = false
END FUNCTION
```

---

### Bug 11 — No Admin Approval UI for Workspace Move Requests

The bug manifests when a workspace admin views the workspace management page. There is no UI to view, approve, or reject pending `workspace_move_requests`.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input = { userRole, workspacePage }
  OUTPUT: boolean

  RETURN input.userRole = 'admin'
         AND pendingRequestsUIRendered(input.workspacePage) = false
END FUNCTION
```

---

### Bug 12 — Auto-Share Failures Are Silent

The bug manifests when `triggerAutoShare` in `meeting-sessions.ts` catches an error for a specific integration (Slack, Notion, Jira, Gmail). The error is only logged to the server console; no feedback reaches the user.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input = { autoShareTarget, integrationCallResult }
  OUTPUT: boolean

  RETURN isError(input.integrationCallResult) = true
         AND userNotified = false
END FUNCTION
```

---

### Bug 13 — Unindexed ILIKE on summary Column

The bug manifests when the `/reports` endpoint performs `ILIKE '%term%'` on the `summary` column. No `pg_trgm` GIN index exists on `summary`, causing a full sequential scan.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input = { searchTerm, tableSize }
  OUTPUT: boolean

  RETURN input.searchTerm IS NOT NULL
         AND pgTrgmIndexExists('meeting_sessions', 'summary') = false
         AND queryPlan = 'Seq Scan'
END FUNCTION
```

---

### Bug 14 — useSessionPolling Has No Exponential Backoff

The bug manifests when `useSessionPolling` encounters consecutive server errors. The hook continues polling at a fixed 2-second interval regardless of failures, amplifying server pressure.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input = { consecutiveErrors, currentInterval }
  OUTPUT: boolean

  RETURN input.consecutiveErrors > 0
         AND input.currentInterval = BASE_INTERVAL  -- no backoff applied
END FUNCTION
```

---

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- Workspace-mode meeting detail page continues to show workspace badge / move button (3.1)
- All existing Next.js API routes continue to work (3.2)
- Callers of `/api/workspaces` that already handle `{ success, workspaces }` are unaffected (3.3)
- `recordingUrl` continues to be returned in `GET /api/meetings/:id` (3.4)
- Express API continues to function after `migrate-recordings.js` is removed (3.5)
- Bot records normally when audio source is properly routed (3.6)
- Transcription succeeds on first attempt without added latency (3.7)
- `recoverStuckSessions` continues to recover `capturing`/`waiting_for_join` sessions (3.8)
- Admin instant-share bypasses `workspace_move_requests` (3.9)
- Existing meeting detail actions (edit, back, share) remain alongside delete button (3.10)
- Existing workspace admin UI (members, settings) remains alongside pending requests (3.11)
- Successful auto-shares complete silently (3.12)
- Existing queries on `meeting_sessions` continue to work after index addition (3.13)
- Polling stops at terminal state with insights; resets to base interval on success (3.14)

---

## Hypothesized Root Causes

**Bug 1**: The component's early-return guard `if (!isOwner || !allWorkspaces || allWorkspaces.length === 0) return Toast ?? null` treats `null` (loading) the same as `[]` (empty). Fix: distinguish loading state from empty state.

**Bug 2**: No Next.js proxy route exists at `frontend/src/app/api/meetings/share-calendar/route.ts`. The Express handler exists but is only reachable server-side. Fix: add the proxy route.

**Bug 3**: The fetch handler in `ShareToWorkspaceButton` has a conditional that handles both array and `{ success, workspaces }` shapes, but the condition `Array.isArray(data)` falls through to `data.workspaces ?? []` — this should work, but the `WorkspaceRecord[]` type cast on `data` may cause TypeScript to short-circuit. Verify the runtime path and ensure the extraction is correct.

**Bug 4**: The `toCamel` helper blindly converts all DB columns including `recording_file_path`. The explicit meeting object construction in `GET /:id` includes `recordingFilePath` directly. Fix: remove that key from the response object.

**Bug 5**: `migrate-recordings.js` was a one-off migration script left in the repo. Fix: delete it.

**Bug 6**: `startRecording` in `audioCapture.js` uses `process.env.MEETING_AUDIO_SOURCE || "default"` without verifying that audio is actually flowing through that source before committing to record. Fix: add a short pre-recording audio level probe using `ffmpeg -t 2` and check the output file size.

**Bug 7**: `transcribeWithRetry` exists and is called via `transcribeQueued`, but the call site in `stopBot` may use `transcribeAsync` directly in some code paths. Verify all transcription call sites use `transcribeQueued`/`transcribeWithRetry`.

**Bug 8**: `recoverStuckSessions` SQL query is `WHERE status IN ('capturing', 'waiting_for_join')`. Fix: extend to include `'processing'` and `'summarizing'`.

**Bug 9**: Migration `0003_safe_ronan.sql` creates the table without a `UNIQUE (meeting_id, workspace_id)` constraint. Fix: add a new migration with `ALTER TABLE workspace_move_requests ADD CONSTRAINT ...`.

**Bug 10**: No delete button component exists in `meeting-detail.tsx`. Fix: add a delete button with confirmation dialog that calls `DELETE /api/meetings/:id` and redirects.

**Bug 11**: No pending requests section exists in the workspace dashboard. Fix: add a `PendingMoveRequests` component that fetches and renders pending requests with approve/reject actions.

**Bug 12**: `triggerAutoShare` catches per-integration errors and logs them but does not persist the failure or notify the user. Fix: store failures in a `auto_share_failures` column or separate table, and surface them via the meeting status polling response.

**Bug 13**: No `pg_trgm` extension or GIN index on `summary`. Fix: add a migration enabling `pg_trgm` and creating the index.

**Bug 14**: `useSessionPolling` uses `setInterval` at a fixed 2000ms. Fix: replace with a recursive `setTimeout` that doubles the interval on consecutive errors up to 30s, resetting on success.

---

## Correctness Properties

Property 1: Bug Condition — Share Button Visible During Loading

_For any_ render where `isOwner` is true and `allWorkspaces` is `null` (loading), the component SHALL render a loading placeholder (or nothing) rather than permanently hiding the button, and SHALL render the Share button once `allWorkspaces` resolves to a non-empty array.

**Validates: Requirements 2.1**

Property 2: Preservation — Non-Owner and Workspace-Mode Rendering

_For any_ render where `isOwner` is false, or where the meeting is already in `pending`/`approved` move status, the component SHALL produce exactly the same output as before the fix.

**Validates: Requirements 3.1**

Property 3: Bug Condition — share-calendar Returns JSON

_For any_ POST to `/api/meetings/share-calendar` from the browser, the system SHALL return a JSON response (not HTML), proxied through the Next.js API route to the Express backend.

**Validates: Requirements 2.2**

Property 4: Preservation — Other API Routes Unaffected

_For any_ request to any Next.js API route other than `/api/meetings/share-calendar`, the system SHALL continue to handle those routes correctly without disruption.

**Validates: Requirements 3.2**

Property 5: Bug Condition — Workspaces Correctly Extracted

_For any_ response from `GET /api/workspaces` with shape `{ success: true, workspaces: [...] }`, the share modal SHALL populate the dropdown with all workspaces in the array.

**Validates: Requirements 2.3**

Property 6: Bug Condition — recording_file_path Omitted

_For any_ call to `GET /api/meetings/:id`, the response SHALL NOT contain the key `recordingFilePath`, while still containing `recordingUrl` when a recording exists.

**Validates: Requirements 2.4, 3.4**

Property 7: Bug Condition — recoverStuckSessions Covers processing/summarizing

_For any_ session with status `processing` or `summarizing` and no live associated process at bot startup, `recoverStuckSessions` SHALL mark it as `failed` with `errorCode = 'server_restart'`.

**Validates: Requirements 2.8**

Property 8: Preservation — recoverStuckSessions Still Handles capturing/waiting_for_join

_For any_ session with status `capturing` or `waiting_for_join` and no live process, `recoverStuckSessions` SHALL continue to mark it as failed exactly as before.

**Validates: Requirements 3.8**

Property 9: Bug Condition — useSessionPolling Applies Backoff on Errors

_For any_ sequence of consecutive polling errors, `useSessionPolling` SHALL double the polling interval (up to 30s) rather than continuing at the fixed 2s interval.

**Validates: Requirements 2.14**

Property 10: Preservation — useSessionPolling Resets on Success

_For any_ successful polling response after a backoff period, `useSessionPolling` SHALL reset the interval to the base 2s and SHALL continue to stop polling at terminal state with insights.

**Validates: Requirements 3.14**

---

## Fix Implementation

### Bug 1 — Share Button Visibility

**File**: `frontend/src/features/meetings/components/share-to-workspace-button.tsx`

**Changes**:
1. Add a separate `isLoading` state initialized to `true`, set to `false` after the fetch resolves or rejects.
2. Change the early-return guard: if `isLoading`, return `null` (or a skeleton). If `!isOwner || allWorkspaces === null || allWorkspaces.length === 0`, return `Toast ?? null` only when not loading.
3. Alternatively: initialize `allWorkspaces` to `undefined` (not `null`) to distinguish "not yet fetched" from "fetched empty", and guard on `allWorkspaces === undefined`.

### Bug 2 — share-calendar Proxy Route

**File**: `frontend/src/app/api/meetings/share-calendar/route.ts` (new file)

**Changes**:
1. Create a Next.js Route Handler that accepts `POST`.
2. Forward the request body and auth headers to the Express backend at `BACKEND_URL/api/meetings/share-calendar`.
3. Return the Express response as JSON.

### Bug 3 — Workspaces Extraction

**File**: `frontend/src/features/meetings/components/share-to-workspace-button.tsx`

**Changes**:
1. Verify the fetch handler correctly extracts `workspaces` from `{ success, workspaces }` shape.
2. The existing code already has `(data as { success: boolean; workspaces: WorkspaceRecord[] }).workspaces ?? []` — confirm this path is actually reached at runtime (the `Array.isArray(data)` branch may be masking it).

### Bug 4 — Strip recording_file_path

**File**: `backend/express-api/src/routes/meetings.ts`

**Changes**:
1. Remove `recordingFilePath: session.recording_file_path ?? null` from the meeting response object in `GET /:id`.
2. Keep `recordingUrl` as-is.

### Bug 5 — Delete migrate-recordings.js

**File**: `backend/express-api/migrate-recordings.js`

**Changes**:
1. Delete the file from the repository.

### Bug 6 — Pre-recording Audio Level Check

**File**: `backend/python-services/ai-processing-service/legacy-bot/audioCapture.js`

**Changes**:
1. Add a `checkAudioLevel(audioSource)` function that runs `ffmpeg -f pulse -i <source> -t 2 -af astats -f null -` and parses the RMS level from stderr.
2. In `startRecording`, call `checkAudioLevel` before starting the main recording.
3. If the level is below `MIN_AUDIO_LEVEL_DB` (e.g., -60 dBFS), log a warning and return `{ success: false, error: 'silent_audio_source', ... }`.

### Bug 7 — Transcription Retry Wiring

**File**: `backend/python-services/ai-processing-service/legacy-bot/index.js`

**Changes**:
1. Audit all call sites of `transcribeAsync` — replace any direct calls with `transcribeQueued` (which already wraps `transcribeWithRetry`).
2. Confirm `transcribeWithRetry` is the only path used in `stopBot`.

### Bug 8 — Recover processing/summarizing Sessions

**File**: `backend/python-services/ai-processing-service/legacy-bot/index.js`

**Changes**:
1. In `recoverStuckSessions`, change the SQL query from `status IN ('capturing', 'waiting_for_join')` to `status IN ('capturing', 'waiting_for_join', 'processing', 'summarizing')`.
2. For `processing`/`summarizing` sessions, there is no `ffmpeg_pid` to check — mark them as failed unconditionally (no live process can be verified).

### Bug 9 — Unique Constraint Migration

**File**: `frontend/drizzle/0004_workspace_move_requests_unique.sql` (new migration)

**Changes**:
1. `ALTER TABLE workspace_move_requests ADD CONSTRAINT workspace_move_requests_meeting_workspace_unique UNIQUE (meeting_id, workspace_id);`

### Bug 10 — Delete Meeting Button

**File**: `frontend/src/features/meetings/components/meeting-detail.tsx`

**Changes**:
1. Add a delete button (with confirmation dialog) visible only to `isOwner`.
2. On confirm, call `DELETE /api/meetings/:id` via `clientApiFetch`.
3. On success, `router.push('/dashboard/meetings')`.

### Bug 11 — Admin Approval UI

**Files**:
- `frontend/src/features/workspaces/components/pending-move-requests.tsx` (new component)
- Workspace dashboard page (integrate the component)

**Changes**:
1. Create `PendingMoveRequests` component that fetches `GET /api/workspaces/:id/move-requests` (pending only).
2. Render each request with meeting title, requester name, and Approve/Reject buttons.
3. Approve calls `POST /api/workspaces/:id/move-requests/:requestId/approve`.
4. Reject calls `POST /api/workspaces/:id/move-requests/:requestId/reject`.

### Bug 12 — Surface Auto-Share Failures

**Files**:
- `backend/express-api/src/routes/meeting-sessions.ts`
- `frontend/src/features/meetings/types.ts`
- `frontend/src/features/meetings/components/meeting-detail.tsx`

**Changes**:
1. In `triggerAutoShare`, catch per-integration errors and store them in a new `auto_share_failures` JSONB column on `meeting_sessions` (or a separate table).
2. Include `autoShareFailures` in the `GET /api/meetings/:id/status` response.
3. In `meeting-detail.tsx`, display a toast/banner when `autoShareFailures` is non-empty.

### Bug 13 — pg_trgm Index on summary

**File**: `frontend/drizzle/0005_pg_trgm_summary_index.sql` (new migration)

**Changes**:
1. `CREATE EXTENSION IF NOT EXISTS pg_trgm;`
2. `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_meeting_sessions_summary_trgm ON meeting_sessions USING GIN (summary gin_trgm_ops);`

### Bug 14 — Exponential Backoff in useSessionPolling

**File**: `frontend/src/hooks/useSessionPolling.ts`

**Changes**:
1. Replace `setInterval` with a recursive `setTimeout`.
2. Track `consecutiveErrors` ref. On error, double the interval (cap at 30s). On success, reset to 2s.
3. Preserve existing terminal-state stop logic.

---

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate each bug on unfixed code, then verify the fix works correctly and preserves existing behavior.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate each bug BEFORE implementing the fix.

**Test Cases**:
1. **Bug 1 — Loading state**: Render `ShareToWorkspaceButton` with `isOwner=true` and mock the fetch to delay 500ms. Assert button is not visible during loading, then visible after fetch resolves. (fails on unfixed code — button never appears)
2. **Bug 2 — share-calendar route**: Send `POST /api/meetings/share-calendar` from a test client. Assert response `Content-Type` is `application/json`. (fails on unfixed code — returns HTML)
3. **Bug 3 — workspace extraction**: Mock `/api/workspaces` to return `{ success: true, workspaces: [ws1] }`. Assert dropdown has 1 option. (fails on unfixed code — 0 options)
4. **Bug 4 — recordingFilePath**: Call `GET /api/meetings/:id` for a meeting with a recording. Assert response does not contain `recordingFilePath`. (fails on unfixed code)
5. **Bug 8 — stuck sessions**: Insert a session with `status='summarizing'` and no live PID. Run `recoverStuckSessions`. Assert session is marked `failed`. (fails on unfixed code)
6. **Bug 14 — backoff**: Simulate 5 consecutive polling errors. Assert interval doubles each time. (fails on unfixed code — interval stays at 2s)

**Expected Counterexamples**:
- Bug 1: Button never renders even after workspaces are available
- Bug 2: Response body starts with `<!DOCTYPE html>`
- Bug 3: Dropdown is empty despite workspaces existing
- Bug 8: Session remains in `summarizing` after `recoverStuckSessions` runs

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed code produces the expected behavior.

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) DO
  result := fixedFunction(input)
  ASSERT expectedBehavior(result)
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed code produces the same result as the original.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT originalFunction(input) = fixedFunction(input)
END FOR
```

**Testing Approach**: Property-based testing is recommended for Bugs 1, 8, and 14 because they involve state machines with many possible input combinations.

### Unit Tests

- Bug 1: Test `ShareToWorkspaceButton` with `allWorkspaces=null`, `allWorkspaces=[]`, `allWorkspaces=[ws1]`
- Bug 4: Test `GET /api/meetings/:id` response shape — assert no `recordingFilePath` key
- Bug 8: Test `recoverStuckSessions` with sessions in each status — assert correct recovery behavior
- Bug 9: Test `INSERT ... ON CONFLICT` on `workspace_move_requests` — assert no error
- Bug 14: Test `useSessionPolling` interval progression on consecutive errors

### Property-Based Tests

- Bug 1: Generate random `allWorkspaces` values (null, [], [n items]) and assert button visibility follows the correct rule
- Bug 8: Generate random session status values and assert `recoverStuckSessions` marks the correct ones as failed
- Bug 14: Generate random sequences of success/error responses and assert interval stays within [2s, 30s] bounds

### Integration Tests

- Bug 2: Full round-trip test of `POST /api/meetings/share-calendar` through Next.js proxy to Express
- Bug 10: Full flow — owner clicks delete, confirms, meeting is deleted, redirected to list
- Bug 11: Admin views workspace page, sees pending request, approves it, meeting appears in workspace
- Bug 12: Trigger auto-share with a failing Slack webhook, assert failure toast appears in UI
