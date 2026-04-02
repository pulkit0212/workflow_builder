# Artivaaa Architecture Bugfix Design

## Overview

This document covers five critical production bugs identified in Artivaaa's bot orchestration, recording pipeline, session management, and storage layer. The fixes address: (1) a race condition in bot deduplication that allows duplicate bots to join the same meeting, (2) synchronous transcription blocking the Node.js event loop, (3) file-based session state that is lost on server restart, (4) recordings stored in the public directory without authentication, and (5) silent `startBot` errors that leave sessions stuck in `waiting_for_join` indefinitely.

Each fix is minimal and targeted. The transcription pipeline (Whisper), summary pipeline (Gemini), integration triggers (Slack/Notion/Jira/Gmail), billing logic, and UI components are explicitly out of scope and must not be changed.

---

## Glossary

- **Bug_Condition (C)**: The set of inputs or system states that trigger a defect
- **Property (P)**: The desired correct behavior when the bug condition holds
- **Preservation**: Existing correct behaviors that must remain unchanged after the fix
- **normalizedMeetingUrl**: The canonical URL key used for deduplication — strips query params, extracts meeting code
- **pg_advisory_xact_lock**: A Postgres transaction-scoped advisory lock that serializes concurrent operations on the same key
- **isBugCondition(input)**: Pseudocode predicate returning true when the input triggers the defect
- **startBotSafely**: The replacement wrapper for `void startBot(...)` that catches errors and writes them to the DB
- **recoverStuckSessions**: Startup function that marks orphaned `capturing`/`waiting_for_join` sessions as `failed`
- **transcribeAsync / transcribeWithRetry**: Async replacements for `execSync('python3 transcribe.py ...')`

---

## Bug Details

### Fix 1 — Atomic Bot Deduplication (Bug Groups 1, 6, 8, 9)

**Files**: `src/app/api/meetings/[id]/start/route.ts`, `src/features/meetings/server/google-meet-dedup.ts`

The dedup check (`findActiveGoogleMeetSessionByNormalizedUrl`) and the session insert are two separate non-atomic operations. A concurrent request can read "no active session" before the first request commits its insert, causing two bots to join the same meeting. Additionally, Zoom and Teams URLs are never normalized, so `normalizedMeetingUrl` is null for those platforms and deduplication never fires. Usage quota is incremented before the bot confirms it joined, charging users for failed sessions.

**Formal Specification:**
```
FUNCTION isBugCondition_dedup(input)
  INPUT: input = { meetingUrl: string, userId: string, concurrentRequest: boolean }
  OUTPUT: boolean

  normalizedUrl := normalizeMeetingUrl(input.meetingUrl)
  RETURN (input.concurrentRequest = true
          AND normalizedUrl IS NOT NULL
          AND no pg_advisory_xact_lock held on hash(normalizedUrl))
         OR (input.meetingUrl matches Zoom/Teams pattern
             AND normalizedMeetingUrl stored in DB IS NULL)
         OR (usageIncrementedBeforeCapturing = true)
END FUNCTION
```

**Examples:**
- Two users click "Start AI Notetaker" for `meet.google.com/abc-defg-hij` within 50ms → two bots join → **bug**
- User starts bot for `zoom.us/j/123456789` → `normalizedMeetingUrl = null` → second request spawns another bot → **bug**
- Bot fails to join after quota incremented → user loses a meeting credit → **bug**
- Single user starts bot for a meeting with no active session → one bot spawns → **correct**

---

### Fix 2 — Async Transcription (Bug Groups 2, 7)

**File**: `bot/index.js`

`execSync('python3 transcribe.py ...')` blocks the entire Node.js event loop for up to 10 minutes. Multiple concurrent meeting endings run multiple blocking Python processes with no concurrency cap or retry logic.

**Formal Specification:**
```
FUNCTION isBugCondition_transcription(input)
  INPUT: input = { transcriptionCall: string, concurrentJobs: number }
      OUTPUT: boolean

  RETURN input.transcriptionCall = 'execSync'
         OR input.concurrentJobs > 2
         OR (transcriptionFailed AND retryCount = 0)
END FUNCTION
```

**Examples:**
- `stopBot` called → `execSync('python3 transcribe.py ...')` blocks event loop for 8 minutes → all other API requests time out → **bug**
- 5 meetings end simultaneously → 5 blocking Python processes → server OOM → **bug**
- Transcription script crashes on first attempt → session marked `failed`, audio file intact but transcript lost forever → **bug**
- Single meeting ends, transcription runs async → event loop free, other requests served normally → **correct**

---

### Fix 3 — Database Session State (Bug Group 3)

**File**: `bot/index.js`

Session state is stored in `tmp/bot-sessions.json`. On server restart, the file may be stale, corrupted by concurrent writes, or deleted entirely. Sessions get stuck in `capturing` with no recovery path.

**Formal Specification:**
```
FUNCTION isBugCondition_sessionState(input)
  INPUT: input = { storageBackend: string, serverRestarted: boolean, concurrentWrites: boolean }
  OUTPUT: boolean

  RETURN input.storageBackend = 'file'
         OR (input.serverRestarted = true AND stuckSessionsExist = true)
         OR input.concurrentWrites = true
END FUNCTION
```

**Examples:**
- PM2 restarts bot process → `activeBrowsers` map cleared, `bot-sessions.json` stale → sessions stuck in `capturing` forever → **bug**
- Two concurrent `writeSession` calls → JSON file corrupted → all subsequent reads return `{}` → **bug**
- `tmp/` directory wiped by ops → all active session state lost → **bug**
- Server restarts → `recoverStuckSessions()` runs → orphaned sessions marked `failed` with `server_restart` → **correct**

---

### Fix 4 — Secure Recording Storage (Bug Group 4)

**Files**: `src/lib/storage.ts`, new `src/app/api/recordings/[meetingId]/route.ts`

Recordings are saved to `public/recordings/meeting-{id}.wav`, making them directly accessible to anyone who knows or guesses the URL. No authentication is required.

**Formal Specification:**
```
FUNCTION isBugCondition_storage(input)
  INPUT: input = { recordingPath: string, requestUserId: string, sessionOwnerId: string }
  OUTPUT: boolean

  RETURN input.recordingPath STARTS WITH 'public/'
         OR (fileAccessible WITHOUT authentication check)
         OR (input.requestUserId != input.sessionOwnerId
             AND input.requestUserId NOT IN sharedWithUserIds
             AND fileServed = true)
END FUNCTION
```

**Examples:**
- Recording saved to `public/recordings/meeting-abc123.wav` → anyone with URL downloads it → **bug**
- Unauthenticated GET `/recordings/meeting-abc123.wav` → 200 OK with audio → **bug**
- Authenticated user who is not owner or shared → should get 403 → **bug** (currently gets 200)
- Owner requests `/api/recordings/meeting-abc123` → authenticated route verifies ownership → 200 → **correct**

---

### Fix 5 — Silent startBot Errors (Bug Group 5)

**File**: `src/app/api/meetings/[id]/start/route.ts`

`void startBot(...).catch(console.error)` fires and forgets. If `startBot` throws after the API has returned `200 bot_starting`, the session status is never updated to `failed`. The UI polls indefinitely in `waiting_for_join`.

**Formal Specification:**
```
FUNCTION isBugCondition_silentError(input)
  INPUT: input = { startBotThrows: boolean, sessionStatusAfterThrow: string }
  OUTPUT: boolean

  RETURN input.startBotThrows = true
         AND input.sessionStatusAfterThrow != 'failed'
END FUNCTION
```

**Examples:**
- Playwright fails to launch (missing dependency) → `startBot` throws → session stays `waiting_for_join` → UI polls forever → **bug**
- Bot process crashes immediately after spawn → error logged to console only → no DB update → **bug**
- `startBot` throws → `startBotSafely` catches → DB updated to `failed` with `errorCode: 'bot_launch_failed'` → UI shows error → **correct**

---

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- A single user starting a bot for a meeting with no active session SHALL continue to create a new session, spawn the bot, and return `bot_starting`
- The full transcript, summary, action items, key decisions, and all structured fields SHALL continue to be persisted to `meeting_sessions` after a successful meeting
- All enabled integrations (Slack, Notion, Jira, Gmail) SHALL continue to be triggered asynchronously after meeting completion
- The `/api/meetings/{id}/status` polling endpoint SHALL continue to return `status`, `errorCode`, `failureReason`, `transcript`, and `summary`
- The state machine transition guard SHALL continue to return `409` for genuinely invalid transitions (e.g., `completed → waiting_for_join`)
- Plan and quota enforcement (`403 upgrade_required`, `403 limit_reached`) SHALL continue to fire before any bot is spawned
- Google Meet URL normalization (strip query params, extract meeting code) SHALL continue to work exactly as before
- Bot auto-stop on meeting end, and the `processing → summarizing → completed` pipeline, SHALL continue unchanged

**Scope:**
All inputs that do NOT involve the five bug conditions above are completely unaffected. This includes: the Whisper transcription pipeline internals, the Gemini summary pipeline, integration trigger logic, billing/subscription logic, UI components (only the recording URL format changes from a direct file path to `/api/recordings/{meetingId}`), and the Tools pages.

---

## Hypothesized Root Cause

### Fix 1 — Deduplication Race Condition
1. **Non-atomic read-then-write**: `findActiveGoogleMeetSessionByNormalizedUrl` and the subsequent `insert` are separate DB round-trips with no lock between them, allowing two concurrent requests to both read "no session" before either writes
2. **Platform-specific normalization**: `normalizeMeetingUrl` only handles Google Meet; Zoom and Teams URLs fall through with `null`, bypassing the dedup check entirely
3. **Premature quota increment**: `incrementMeetingUsage` is called before `startBot` confirms the bot joined, so failed launches still consume quota

### Fix 2 — Synchronous Transcription
1. **`execSync` usage**: `execSync` is a synchronous call that blocks the V8 event loop for the entire duration of the Python process — up to 10 minutes
2. **No concurrency control**: Multiple `execSync` calls can run simultaneously with no cap, exhausting CPU/memory
3. **No retry logic**: A single failure permanently loses the transcript even though the audio file is intact

### Fix 3 — File-Based Session State
1. **In-process state + file fallback**: `activeBrowsers` is an in-memory Map that is cleared on restart; `bot-sessions.json` is the only persistence but is not crash-safe
2. **No file locking**: Concurrent writes to `bot-sessions.json` can interleave and corrupt the JSON
3. **No startup recovery**: Nothing marks orphaned sessions as `failed` on restart

### Fix 4 — Public Recording Storage
1. **`public/` directory**: Next.js serves everything under `public/` as static assets with no auth — placing recordings there makes them world-readable
2. **No access control route**: There is no authenticated API route to gate recording access

### Fix 5 — Silent startBot Errors
1. **`void` + `.catch(console.error)`**: The `void` operator discards the Promise; `.catch` only logs to console without updating DB state
2. **No error handler writes to DB**: After the API response is sent, there is no code path that transitions the session to `failed` on error

---

## Correctness Properties

Property 1: Bug Condition — Atomic Deduplication Prevents Duplicate Bots

_For any_ pair of concurrent start requests where both carry the same `normalizedMeetingUrl` (Google Meet, Zoom, or Teams), the fixed `startMeetingSession` transaction SHALL guarantee that exactly one request inserts a new session and the other receives `already_recording`, with no two active sessions sharing the same `normalizedMeetingUrl` at any point in time.

**Validates: Requirements 2.1, 2.2, 2.3**

Property 2: Bug Condition — Async Transcription Never Blocks Event Loop

_For any_ call to `transcribeWithRetry(audioPath)`, the fixed implementation SHALL return a Promise immediately without blocking the Node.js event loop, SHALL retry up to 3 times with exponential backoff (2s, 4s, 8s) on failure, and SHALL enforce a maximum of 2 concurrent transcription jobs at any time.

**Validates: Requirements 2.4, 2.5, 2.11, 2.12**

Property 3: Bug Condition — Session State Survives Server Restart

_For any_ active session persisted via `saveSessionToDB(meetingId, data)`, the fixed implementation SHALL make that session retrievable via `getSessionFromDB(meetingId)` after a simulated server restart, and `recoverStuckSessions()` SHALL transition any session in `capturing` or `waiting_for_join` with a dead `ffmpegPid` to `failed` with `errorCode: 'server_restart'`.

**Validates: Requirements 2.6, 2.7**

Property 4: Bug Condition — Recordings Are Not Publicly Accessible

_For any_ recording saved via the fixed `saveRecording()`, the file path SHALL NOT start with `public/`, and _for any_ GET request to `/api/recordings/{meetingId}`, the fixed route SHALL return `403` unless the requesting user is the `primaryUserId` or is present in `sharedWithUserIds`.

**Validates: Requirements 2.8**

Property 5: Bug Condition — startBot Errors Update Session to Failed

_For any_ invocation of `startBotSafely(sessionId, meetingUrl, userId)` where `startBot` throws, the fixed implementation SHALL catch the error and SHALL update the `meeting_sessions` row to `status: 'failed'`, `errorCode: 'bot_launch_failed'`, and `failureReason: error.message` before the Promise resolves.

**Validates: Requirements 2.9**

Property 6: Bug Condition — Usage Quota Incremented Only After Capturing

_For any_ bot start attempt where the session never reaches `capturing` status (bot fails to join, platform unsupported, admission denied), the fixed implementation SHALL NOT increment `meetingsUsedThisMonth` for that session.

**Validates: Requirements 2.14**

Property 7: Preservation — Single-User Happy Path Unchanged

_For any_ start request where no active session exists for the given `normalizedMeetingUrl`, the fixed implementation SHALL produce the same result as the original: a new session is created, `startBotSafely` is called, and the response is `{ status: 'bot_starting' }`.

**Validates: Requirements 3.1, 3.6, 3.7**

Property 8: Preservation — Google Meet URL Normalization Unchanged

_For any_ Google Meet URL in any valid format (with or without query params, with or without trailing slash), the fixed `normalizeMeetingUrl` SHALL produce the same canonical `meet.google.com/{code}` output as the original `normalizeGoogleMeetUrl` function.

**Validates: Requirements 3.8**

---

## Fix Implementation

### Fix 1 — Atomic Bot Deduplication

**File**: `src/features/meetings/server/google-meet-dedup.ts`

**Changes:**
1. **Rename and generalize**: Rename `normalizeGoogleMeetUrl` → `normalizeMeetingUrl(url: string): string | null` that handles Google Meet, Zoom (`zoom.us/j/{id}`), and Teams (`teams.microsoft.com/l/meetup-join/...`) patterns
2. **Extract canonical key**: Return `null` for unrecognized URLs (no bot support); store result in `normalizedMeetingUrl` column for all platforms

**File**: `src/app/api/meetings/[id]/start/route.ts`

**Changes:**
1. **Wrap in DB transaction with advisory lock**:
   ```typescript
   const result = await db.transaction(async (tx) => {
     const normalizedUrl = normalizeMeetingUrl(meetingUrl);
     if (!normalizedUrl) throw new Error('unsupported_platform');
     const lockKey = hashString(normalizedUrl); // BigInt hash for pg advisory lock
     await tx.execute(sql`SELECT pg_advisory_xact_lock(${lockKey})`);
     const existing = await findActiveSessionByUrl(tx, normalizedUrl);
     if (existing) {
       await tx.update(meetingSessions)
         .set({ sharedWithUserIds: sql`array_append(shared_with_user_ids, ${userId})` })
         .where(eq(meetingSessions.id, existing.id));
       return { type: 'existing', session: existing };
     }
     const [newSession] = await tx.insert(meetingSessions).values({
       meetingId, userId, normalizedMeetingUrl: normalizedUrl, status: 'waiting_for_join'
     }).returning();
     return { type: 'new', session: newSession };
   });
   ```
2. **Move `incrementMeetingUsage` call**: Remove from before `startBot`; call it inside `persistBotCaptureStatusUpdate` when status transitions to `capturing`
3. **Replace `void startBot(...)` with `startBotSafely(...)`** (see Fix 5)

---

### Fix 2 — Async Transcription

**File**: `bot/index.js`

**Changes:**
1. **Add `transcribeAsync(audioPath)`**: Uses `child_process.spawn` instead of `execSync`, returns a Promise that resolves with the transcript path or rejects on non-zero exit
2. **Add `transcribeWithRetry(audioPath, maxRetries = 3)`**: Wraps `transcribeAsync` with exponential backoff — delays of 2s, 4s, 8s between attempts
3. **Add concurrency semaphore**: A simple counter-based semaphore (`activeTranscriptions`, max 2) that queues jobs when at capacity
4. **Remove `execSync` call**: Replace the single `execSync('python3 transcribe.py ...')` call with `await transcribeWithRetry(audioPath)`

```javascript
// Concurrency semaphore
let activeTranscriptions = 0;
const MAX_CONCURRENT = 2;
const transcriptionQueue = [];

async function transcribeAsync(audioPath) {
  return new Promise((resolve, reject) => {
    const proc = spawn('python3', ['transcribe.py', audioPath]);
    let stderr = '';
    proc.stderr.on('data', d => stderr += d);
    proc.on('close', code => code === 0 ? resolve() : reject(new Error(stderr)));
  });
}

async function transcribeWithRetry(audioPath, maxRetries = 3) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      await transcribeAsync(audioPath);
      return;
    } catch (err) {
      if (attempt === maxRetries - 1) throw err;
      await new Promise(r => setTimeout(r, 2000 * Math.pow(2, attempt)));
    }
  }
}
```

---

### Fix 3 — Database Session State

**File**: `src/db/schema/meeting-sessions.ts`

**Schema additions:**
```typescript
ffmpegPid: integer('ffmpeg_pid'),          // nullable — PID of the ffmpeg process
outputPath: text('output_path'),            // nullable — absolute path to recording file
failureReason: text('failure_reason'),      // nullable — if not already present
```

**File**: `bot/index.js`

**Changes:**
1. **Remove**: `SESSIONS_FILE` constant, `readSessions()`, `writeSession()`, `deleteSession()` functions
2. **Add `saveSessionToDB(meetingId, data)`**: Upserts `{ ffmpegPid, outputPath, status }` to `meeting_sessions` via the DB client
3. **Add `getSessionFromDB(meetingId)`**: Fetches the session row by `meetingId`
4. **Add `recoverStuckSessions()`**: Called at bot process startup — queries for sessions with `status IN ('capturing', 'waiting_for_join')`, checks if `ffmpegPid` is still a running process (`process.kill(pid, 0)`), and marks dead ones as `failed` with `errorCode: 'server_restart'`
5. **Replace all `writeSession` / `readSessions` / `deleteSession` calls** with `saveSessionToDB` / `getSessionFromDB`

---

### Fix 4 — Secure Recording Storage

**File**: `src/lib/storage.ts`

**Changes:**
1. **Change destination**: `public/recordings/` → `private/recordings/` (outside Next.js static serving)
2. **Change return value**: `saveRecording()` returns `/api/recordings/${meetingId}` instead of the file path

**New file**: `src/app/api/recordings/[meetingId]/route.ts`

```typescript
export async function GET(req: Request, { params }: { params: { meetingId: string } }) {
  const { userId } = await auth(); // Clerk auth
  if (!userId) return new Response(null, { status: 401 });

  const session = await db.query.meetingSessions.findFirst({
    where: eq(meetingSessions.meetingId, params.meetingId)
  });
  if (!session) return new Response(null, { status: 404 });

  const authorized = session.primaryUserId === userId
    || (session.sharedWithUserIds ?? []).includes(userId);
  if (!authorized) return new Response(null, { status: 403 });

  const filePath = path.join(process.cwd(), 'private', 'recordings', `meeting-${params.meetingId}.wav`);
  const file = await fs.readFile(filePath);
  return new Response(file, { headers: { 'Content-Type': 'audio/wav' } });
}
```

**File**: `.gitignore` — add `private/`

---

### Fix 5 — Silent startBot Errors

**File**: `src/app/api/meetings/[id]/start/route.ts`

**Changes:**
1. **Replace `void startBot(...).catch(console.error)`** with a call to `startBotSafely`
2. **Add `startBotSafely` function**:
   ```typescript
   async function startBotSafely(sessionId: string, meetingUrl: string, userId: string) {
     try {
       await startBot(sessionId, meetingUrl, persistBotCaptureStatusUpdate);
     } catch (error) {
       await db.update(meetingSessions).set({
         status: 'failed',
         errorCode: 'bot_launch_failed',
         failureReason: error instanceof Error ? error.message : String(error),
         updatedAt: new Date()
       }).where(eq(meetingSessions.id, sessionId));
     }
   }
   ```
3. **Call without `void`**: `startBotSafely(session.id, meetingUrl, userId)` — the Promise is not awaited (response already sent) but errors are handled internally

---

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate each bug on unfixed code to confirm root cause analysis; then verify the fix works correctly and preserves existing behavior. Property-based tests are used where the input space is large (concurrent requests, URL variants, retry counts). Unit tests cover deterministic cases. Integration tests cover the full bot lifecycle.

---

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate each bug BEFORE implementing the fix. Confirm or refute root cause analysis.

**Fix 1 — Deduplication Race:**
1. **Concurrent Start Test**: Fire two simultaneous POST requests to `/api/meetings/{id}/start` with the same Google Meet URL. Assert that two `meeting_sessions` rows are created with `status = 'waiting_for_join'` — this demonstrates the race condition on unfixed code.
2. **Zoom URL Test**: Start a bot with a Zoom URL. Assert `normalizedMeetingUrl IS NULL` in the DB — demonstrates platform gap.
3. **Quota Pre-increment Test**: Start a bot that immediately fails. Assert `meetingsUsedThisMonth` was incremented — demonstrates premature billing.

**Fix 2 — Sync Transcription:**
4. **Event Loop Block Test**: Call `stopBot` and immediately fire another API request. Assert the second request does not respond until transcription completes — demonstrates blocking on unfixed code.
5. **Concurrent Transcription Test**: End 3 meetings simultaneously. Assert 3 `execSync` calls run in parallel with no cap — demonstrates unbounded concurrency.

**Fix 3 — File Session State:**
6. **Restart Recovery Test**: Write a session to `bot-sessions.json` with `status: 'capturing'`, simulate restart (clear `activeBrowsers`), assert session is still `capturing` in DB with no recovery — demonstrates stuck session.
7. **Concurrent Write Test**: Simulate two concurrent `writeSession` calls, assert JSON file is corrupted — demonstrates race condition.

**Fix 4 — Public Storage:**
8. **Unauthenticated Access Test**: Save a recording, make an unauthenticated GET to `/recordings/meeting-{id}.wav`, assert 200 response — demonstrates public exposure.

**Fix 5 — Silent Errors:**
9. **Void Error Test**: Mock `startBot` to throw, call the start route, assert session status remains `waiting_for_join` after the throw — demonstrates silent failure.

**Expected Counterexamples:**
- Two sessions with identical `normalizedMeetingUrl` both in `waiting_for_join`
- `normalizedMeetingUrl = null` for Zoom/Teams URLs
- Event loop blocked for duration of Python process
- Sessions stuck in `capturing` after restart
- Unauthenticated 200 on recording URL
- Session status not updated after `startBot` throws

---

### Fix Checking

**Goal**: Verify that for all inputs where each bug condition holds, the fixed function produces the expected behavior.

**Fix 1:**
```
FOR ALL (request1, request2) WHERE
  request1.meetingUrl = request2.meetingUrl
  AND requests are concurrent
DO
  results := [startMeetingSession(request1), startMeetingSession(request2)]
  ASSERT count(results WHERE type = 'new') = 1
  ASSERT count(results WHERE type = 'existing') = 1
  ASSERT count(activeSessions WHERE normalizedMeetingUrl = normalize(request1.meetingUrl)) = 1
END FOR
```

**Fix 2:**
```
FOR ALL audioPath WHERE transcriptionNeeded(audioPath) DO
  startTime := now()
  promise := transcribeWithRetry(audioPath)
  ASSERT promise IS instanceof Promise  // returns immediately
  ASSERT activeTranscriptions <= 2      // concurrency cap
  await promise
  ASSERT transcriptExists(audioPath)
END FOR
```

**Fix 3:**
```
FOR ALL session WHERE session.status IN ['capturing', 'waiting_for_join'] DO
  simulateRestart()
  ASSERT getSessionFromDB(session.meetingId) IS NOT NULL
  IF ffmpegPid NOT running THEN
    ASSERT session.status = 'failed'
    ASSERT session.errorCode = 'server_restart'
  END IF
END FOR
```

**Fix 4:**
```
FOR ALL recording WHERE saveRecording(recording) DO
  ASSERT recording.filePath NOT STARTS WITH 'public/'
  ASSERT recording.url = '/api/recordings/' + recording.meetingId
  FOR ALL userId WHERE userId != session.primaryUserId
                   AND userId NOT IN session.sharedWithUserIds DO
    ASSERT GET('/api/recordings/' + recording.meetingId, userId) = 403
  END FOR
END FOR
```

**Fix 5:**
```
FOR ALL sessionId WHERE startBot(sessionId) THROWS DO
  ASSERT db.meetingSessions[sessionId].status = 'failed'
  ASSERT db.meetingSessions[sessionId].errorCode = 'bot_launch_failed'
  ASSERT db.meetingSessions[sessionId].failureReason IS NOT NULL
END FOR
```

---

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed functions produce the same result as the original.

```
FOR ALL request WHERE NOT isBugCondition_dedup(request) DO
  ASSERT startMeetingSession_original(request) = startMeetingSession_fixed(request)
END FOR

FOR ALL audioPath WHERE NOT isBugCondition_transcription(audioPath) DO
  ASSERT transcribeOriginal(audioPath) produces same transcript as transcribeFixed(audioPath)
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:
- It generates many URL variants automatically (Google Meet with/without params, different meeting codes)
- It catches edge cases in URL normalization that manual tests miss
- It provides strong guarantees that the happy path is unchanged across all non-buggy inputs

**Preservation Test Cases:**
1. **Single-user start preserved**: For any start request with no active session, assert response is `{ status: 'bot_starting' }` and exactly one session is created
2. **Google Meet normalization preserved**: For any Google Meet URL variant, assert `normalizeMeetingUrl` returns the same canonical form as the original `normalizeGoogleMeetUrl`
3. **State machine guard preserved**: For any invalid transition (e.g., `completed → waiting_for_join`), assert `409` is still returned
4. **Quota enforcement preserved**: For any request from a user over quota, assert `403 limit_reached` before any session is created
5. **Mouse/non-keyboard inputs preserved**: Recording URL format changes from file path to `/api/recordings/{id}` — assert UI components that consume this URL continue to work

---

### Unit Tests

- `normalizeMeetingUrl` handles Google Meet, Zoom, Teams, and unknown URLs correctly
- `startBotSafely` catches thrown errors and writes `failed` status to DB
- `recoverStuckSessions` marks sessions with dead `ffmpegPid` as `failed` and leaves live sessions untouched
- `transcribeWithRetry` retries exactly 3 times with correct backoff delays (2s, 4s, 8s)
- Recording API route returns 401 for unauthenticated, 403 for unauthorized, 200 for owner/shared user
- `saveSessionToDB` / `getSessionFromDB` round-trip preserves all fields including `ffmpegPid` and `outputPath`

### Property-Based Tests

- For any two concurrent start requests with the same `normalizedMeetingUrl`, exactly one session is created (tests Property 1)
- For any Google Meet URL in any valid format, `normalizeMeetingUrl` returns the same result as the original normalizer (tests Property 8)
- For any `transcribeWithRetry` call that fails N times (N < 3), the function retries and eventually succeeds (tests Property 2)
- For any session saved to DB, it is retrievable after simulated restart with all fields intact (tests Property 3)
- For any recording access request where `userId` is not owner or shared, the route returns 403 (tests Property 4)
- For any `startBot` throw, `startBotSafely` always writes `failed` status — no throw escapes unhandled (tests Property 5)

### Integration Tests

- Full bot lifecycle: start → `waiting_for_join` → `capturing` → `processing` → `summarizing` → `completed` with async transcription
- Concurrent start for same meeting: one bot joins, second caller gets `already_recording`, only one session in DB
- Server restart mid-capture: `recoverStuckSessions` fires, stuck session transitions to `failed`, UI shows error
- Recording access: owner downloads via `/api/recordings/{id}`, shared user downloads, unshared user gets 403, unauthenticated gets 401
- Quota metering: bot fails before `capturing` → quota not incremented; bot reaches `capturing` → quota incremented exactly once
- Zoom/Teams deduplication: two concurrent starts for same Zoom URL → one bot, one `already_recording`
