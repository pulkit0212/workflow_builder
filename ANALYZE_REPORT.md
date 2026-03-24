# AI Meeting Assistant Bot Flow Analysis

This report documents the current meeting bot flow and likely failure points based on the extracted code. It does not include fixes or refactors.

## 1. Full Flow Explanation

### 1.1 Start API

The user starts the flow from the client through `startMeetingCapture(id, meetingUrl)` in:

- `src/features/meetings/api.ts`

That function sends:

```ts
POST /api/meetings/${id}/start
```

The actual route entrypoint is:

- `src/app/api/meetings/[id]/start/route.ts`

That file just re-exports `POST` from:

- `src/app/api/meetings/[id]/route.ts`

Inside `POST` in `src/app/api/meetings/[id]/route.ts`, the system:

1. Authenticates the current user with Clerk.
2. Ensures the database is ready.
3. Syncs the current authenticated user into the DB.
4. Resolves the route param `id`.
5. Handles two branches:
   - calendar-backed meeting ID
   - direct meeting session ID

For calendar-backed meetings:

1. It decodes the prefixed calendar ID using:
   - `src/features/meetings/ids.ts`
2. It loads the active Google integration using:
   - `src/lib/google/integration.ts`
3. It fetches the Google Calendar event and Meet link using:
   - `src/lib/google/calendar.ts`
4. It tries to find an existing linked meeting session by:
   - external calendar event ID
   - or meet link
5. It normalizes current status using:
   - `normalizeMeetingSessionStatus(...)`
   - from `src/features/meetings/server/state-machine.ts`
6. It checks whether transition to `waiting_for_join` is allowed using:
   - `canTransitionMeetingSessionStatus(...)`
7. It either:
   - creates a new meeting session
   - or updates an existing session
8. It persists:
   - `meetingLink`
   - timing fields
   - `status: "waiting_for_join"`
9. It calls `startBot(session.id, meetingUrl, onStatusUpdate)`
10. It immediately returns a success response with:
   - `status: "bot_starting"`
   - `message: "AI Notetaker is joining the meeting."`

For existing app sessions:

1. It loads the existing session from DB.
2. It normalizes current status.
3. It checks transition rules.
4. It updates the session to:
   - `status: "waiting_for_join"`
5. It launches `startBot(...)`
6. It returns success immediately.

Important behavior:

- The route does not wait for successful join.
- It returns success as soon as bot launch is dispatched.
- `startBot(...)` is fire-and-forget through `void ...catch(...)`.

### 1.2 Bot Launch

The server-side adapter is:

- `src/lib/bot.ts`

This file delegates to the Node bot package in `/bot`:

- `require("../../bot")`

The actual runtime lives in:

- `bot/index.js`

Inside `startBot(meetingId, meetingUrl, onStatusUpdate)`:

1. It emits `waiting_for_join` through the callback.
2. It calls:
   - `joinMeeting(meetingUrl, meetingId)`
   - from `bot/meetingBot.js`
3. It then immediately calls:
   - `startRecording(meetingId)`
   - from `bot/audioCapture.js`
4. It stores session runtime metadata in:
   - `tmp/bot-sessions.json`
5. It stores the Playwright browser in:
   - in-memory `activeBrowsers`
6. It emits:
   - `capturing`
7. It returns `{ success: true, outputPath }`

This means the bot runtime has three state surfaces:

1. database session state
2. `tmp/bot-sessions.json`
3. in-memory `activeBrowsers`

### 1.3 Meeting Join

The join implementation is in:

- `bot/meetingBot.js`

Inside `joinMeeting(meetingUrl, meetingId)`:

1. It launches headless Chromium using Playwright.
2. It sets browser args:
   - `--use-fake-ui-for-media-stream`
   - `--use-fake-device-for-media-stream`
   - `--disable-web-security`
   - `--no-sandbox`
   - `--disable-setuid-sandbox`
   - `--disable-dev-shm-usage`
3. It creates a browser context with permissions:
   - `microphone`
   - `camera`
4. It opens a new page.
5. It navigates to the meeting URL with:
   - `waitUntil: "networkidle"`
6. It waits 4 seconds.
7. It tries to fill:
   - `input[placeholder="Your name"]`
8. It tries a fixed list of join selectors:
   - `button:has-text("Join now")`
   - `button:has-text("Ask to join")`
   - `button:has-text("Join")`
   - `[data-promo-anchor-id="join-button"]`
9. If any click succeeds, it logs success.
10. If none succeed, it still continues.
11. It logs:
   - `Joined meeting`
12. It returns `{ browser, page }`

Critical observation:

- The function never verifies that the bot was admitted into the meeting.
- It never checks for post-join UI state.
- It can return success even if it never actually joined.

### 1.4 Audio Recording

The recording logic is in:

- `bot/audioCapture.js`

Inside `startRecording(meetingId)`:

1. It ensures `tmp/audio` exists.
2. It creates:
   - `tmp/audio/meeting-${meetingId}.wav`
3. It branches on OS:
   - macOS: `avfoundation` with `BlackHole 2ch`
   - Linux: `pulse` input `default`
4. It spawns:
   - `ffmpeg`
5. It logs ffmpeg errors if the process emits an `error` event.
6. It returns:
   - `{ ffmpeg, outputPath }`

In the launch flow, this recording begins immediately after `joinMeeting(...)` returns, not after confirmed meeting admission.

### 1.5 Stop Recording

The client stop call is:

- `stopMeetingCapture(id)` in `src/features/meetings/api.ts`

That sends:

```ts
POST /api/meetings/${id}/stop
```

Handled in:

- `src/app/api/meetings/[id]/stop/route.ts`

The route:

1. Authenticates user.
2. Resolves the meeting session.
3. Calls:
   - `stopBot(meeting.id, onStatusUpdate)`

Inside `stopBot(...)` in `bot/index.js`:

1. It loads runtime session data from:
   - `tmp/bot-sessions.json`
2. If missing, it fails with:
   - `"No active bot session found"`
3. It emits:
   - `processing`
4. It sends:
   - `SIGINT`
   - to the stored ffmpeg PID
5. It waits 2 seconds.
6. It closes the Playwright browser if it exists in memory.
7. It deletes the bot session entry from the JSON file.

### 1.6 Transcription Pipeline

Still inside `stopBot(...)`:

1. It runs:
   - `python3 bot/transcribe.py <outputPath>`
2. `bot/transcribe.py`:
   - validates the file exists
   - validates file size >= 1000 bytes
   - loads Whisper `base`
   - transcribes the WAV
   - returns JSON with transcript
3. If transcript fails or is empty:
   - bot emits `failed`
   - stop returns failure
4. If transcript succeeds:
   - `bot/summarize.js` is called
5. `bot/summarize.js`:
   - loads `.env.local`
   - checks `GEMINI_API_KEY`
   - runs Gemini summarization via shared provider code
6. Bot emits:
   - `completed`
7. Stop route persists:
   - transcript
   - summary
   - key points
   - action items
   - `status: "completed"`

## 2. Potential Failure Points

### 2.1 Bot not joining properly

**BUG LOCATION**  
FILE: `bot/meetingBot.js`  
FUNCTION: `joinMeeting`  
WHY IT MAY FAIL:

- The function only attempts a few hard-coded selectors.
- It does not verify successful meeting admission.
- It logs success even if no selector was clicked.
- It does not handle auth walls, lobby/waiting-room flows, or account-selection UI.
- It does not inspect final page state after the click attempt.

### 2.2 Meeting admission issues

**BUG LOCATION**  
FILE: `bot/meetingBot.js`  
FUNCTION: `joinMeeting`  
WHY IT MAY FAIL:

- Google Meet may place the bot in a waiting room.
- The current code treats clicking `Ask to join` the same as successful join.
- There is no follow-up waiting logic for admission by host.
- There is no timeout or branch for “admission pending forever”.

### 2.3 Playwright selectors breaking

**BUG LOCATION**  
FILE: `bot/meetingBot.js`  
FUNCTION: `joinMeeting`  
WHY IT MAY FAIL:

- All selectors are UI-text dependent.
- Localization or text changes break them.
- Google Meet pre-join DOM often changes.
- The placeholder selector for name input may not exist depending on auth state or UI version.

### 2.4 Recording starting before join

**BUG LOCATION**  
FILE: `bot/index.js`  
FUNCTION: `startBot`  
WHY IT MAY FAIL:

- Recording starts immediately after `joinMeeting(...)` returns.
- `joinMeeting(...)` returning does not mean the bot is actually in the call.
- This can produce silent or irrelevant audio recordings.
- The DB status becomes `capturing` before actual confirmation of meeting capture.

### 2.5 Incorrect audio device

**BUG LOCATION**  
FILE: `bot/audioCapture.js`  
FUNCTION: `startRecording`  
WHY IT MAY FAIL:

- macOS assumes BlackHole is installed and named exactly `BlackHole 2ch`.
- Linux assumes PulseAudio input `default` is the correct source.
- If system routing is wrong, recording may capture silence.
- There is no check that ffmpeg is capturing real meeting audio.

### 2.6 ffmpeg process failures

**BUG LOCATION**  
FILE: `bot/audioCapture.js`  
FUNCTION: `startRecording`  
WHY IT MAY FAIL:

- `spawn("ffmpeg", ffmpegArgs)` can fail if ffmpeg is missing.
- Errors are only logged; the flow does not validate recording startup.
- `startBot(...)` can still proceed if ffmpeg does not actually produce usable output.

### 2.7 Session state getting stuck

**BUG LOCATION**  
FILE: `src/hooks/useSessionPolling.ts`  
FUNCTION: `useSessionPolling`  
WHY IT MAY FAIL:

- Polling only stops on `completed` or `failed`.
- If DB status remains `waiting_for_join`, `capturing`, or `processing`, UI loops forever.
- There is no timeout or secondary recovery signal.

**BUG LOCATION**  
FILE: `src/app/api/meetings/[id]/status/route.ts`  
FUNCTION: `GET`  
WHY IT MAY FAIL:

- UI only sees DB state.
- If the bot runtime succeeds or fails without DB update callback completion, the UI remains stale.

### 2.8 Race conditions

**BUG LOCATION**  
FILE: `src/lib/db/mutations/meeting-sessions.ts`  
FUNCTION: `updateMeetingSession`  
WHY IT MAY FAIL:

- It blindly updates fields with no transition validation.
- Multiple async callbacks can overwrite status.
- Bot callback updates and stop-route persistence can interleave.

**BUG LOCATION**  
FILE: `src/app/api/meetings/[id]/route.ts`  
FUNCTION: `POST`  
WHY IT MAY FAIL:

- Route persists `waiting_for_join` before bot startup is confirmed.
- The API returns success before any real join is proven.
- If bot launch fails right after return, the UI may show a “started” state briefly or indefinitely depending on callback timing.

### 2.9 Stop recording not triggering pipeline

**BUG LOCATION**  
FILE: `bot/index.js`  
FUNCTION: `stopBot`  
WHY IT MAY FAIL:

- It depends on `tmp/bot-sessions.json` to find the ffmpeg PID and output path.
- If the JSON entry is missing or corrupted, stop cannot continue.
- Browser references live only in `activeBrowsers`, which is in-memory only.
- A process restart loses browser state completely.

### 2.10 Stop route completes but persisted output may diverge

**BUG LOCATION**  
FILE: `src/app/api/meetings/[id]/stop/route.ts`  
FUNCTION: `POST`  
WHY IT MAY FAIL:

- `stopBot(...)` emits `completed` before stop route persists transcript/summary/action items.
- If DB persistence fails after bot completion, runtime and DB state diverge.

### 2.11 Calendar resolution blocking start

**BUG LOCATION**  
FILE: `src/lib/google/integration.ts`  
FUNCTION: `getActiveGoogleIntegration`  
WHY IT MAY FAIL:

- Start flow depends on valid integration and scope.
- Stale or missing `calendar.readonly` scope returns `null`.
- That prevents resolving the Meet link for calendar-backed meetings.

**BUG LOCATION**  
FILE: `src/lib/google/calendar.ts`  
FUNCTION: `fetchGoogleCalendarMeetingById`  
WHY IT MAY FAIL:

- If the event has no Meet link or the event payload differs, the start route cannot proceed.

### 2.12 Transcription may fail after recording

**BUG LOCATION**  
FILE: `bot/transcribe.py`  
FUNCTION: `transcribe`  
WHY IT MAY FAIL:

- It hard-fails if audio file does not exist.
- It hard-fails if audio file is too small.
- Empty capture will produce a stop-flow failure even if upstream join “looked successful”.

### 2.13 Summary may degrade final result

**BUG LOCATION**  
FILE: `bot/summarize.js`  
FUNCTION: `summarizeMeeting`  
WHY IT MAY FAIL:

- Missing `GEMINI_API_KEY` yields synthetic fallback summary text.
- Summary errors do not necessarily fail the pipeline cleanly; they can become saved as output text.

## 3. Structured Bug Inventory

### Bug Candidate 1
BUG LOCATION  
FILE: `bot/meetingBot.js`  
FUNCTION: `joinMeeting`  
WHY IT MAY FAIL:

- Returns success without verifying actual meeting admission.

### Bug Candidate 2
BUG LOCATION  
FILE: `bot/meetingBot.js`  
FUNCTION: `joinMeeting`  
WHY IT MAY FAIL:

- Hard-coded selectors may fail on Google Meet UI variations.

### Bug Candidate 3
BUG LOCATION  
FILE: `bot/index.js`  
FUNCTION: `startBot`  
WHY IT MAY FAIL:

- Recording starts before confirmed successful join.

### Bug Candidate 4
BUG LOCATION  
FILE: `bot/audioCapture.js`  
FUNCTION: `startRecording`  
WHY IT MAY FAIL:

- System audio input assumptions may be wrong for the runtime environment.

### Bug Candidate 5
BUG LOCATION  
FILE: `bot/audioCapture.js`  
FUNCTION: `startRecording`  
WHY IT MAY FAIL:

- ffmpeg startup is not validated before proceeding.

### Bug Candidate 6
BUG LOCATION  
FILE: `bot/index.js`  
FUNCTION: `stopBot`  
WHY IT MAY FAIL:

- Stop flow depends on JSON session persistence and in-memory browser state.

### Bug Candidate 7
BUG LOCATION  
FILE: `src/lib/db/mutations/meeting-sessions.ts`  
FUNCTION: `updateMeetingSession`  
WHY IT MAY FAIL:

- Status writes are not guarded by state transition checks.

### Bug Candidate 8
BUG LOCATION  
FILE: `src/app/api/meetings/[id]/status/route.ts`  
FUNCTION: `GET`  
WHY IT MAY FAIL:

- UI can only observe DB state, not actual bot runtime state.

### Bug Candidate 9
BUG LOCATION  
FILE: `src/hooks/useSessionPolling.ts`  
FUNCTION: `useSessionPolling`  
WHY IT MAY FAIL:

- Sessions can appear stuck forever if DB state never reaches terminal values.

### Bug Candidate 10
BUG LOCATION  
FILE: `bot/transcribe.py`  
FUNCTION: `transcribe`  
WHY IT MAY FAIL:

- Small or silent audio causes pipeline failure after stop.

## 4. Top 5 Most Likely Root Causes

### 1. Join success is assumed but never verified

Most likely source:

- `bot/meetingBot.js`

Reason:

- The code logs “Joined meeting” even when it may only have clicked nothing or only requested admission.
- This is the most direct explanation for a bot that “starts” but never truly joins.

### 2. Playwright selectors are too brittle

Most likely source:

- `bot/meetingBot.js`

Reason:

- Google Meet UI changes frequently.
- Text selectors and placeholder selectors are unstable.
- Locale differences or pre-join state differences can break the flow immediately.

### 3. Recording starts before actual admission

Most likely source:

- `bot/index.js`
- `bot/meetingBot.js`

Reason:

- Even if the page opened, the bot may still be outside the meeting when ffmpeg begins.
- This can produce empty audio, tiny files, or useless transcripts.

### 4. Audio device configuration is incorrect for the environment

Most likely source:

- `bot/audioCapture.js`

Reason:

- Linux PulseAudio `default` may not map to meeting output.
- macOS BlackHole requirement may not exist or may be misnamed.
- ffmpeg can technically run while recording silence.

### 5. Runtime state is split across DB, JSON file, and process memory

Most likely source:

- `bot/index.js`

Reason:

- Browser handles are in memory only.
- ffmpeg/output metadata is in a JSON file.
- UI reads only the DB.
- A restart, crash, or callback failure can leave the system in inconsistent partial state.

## 5. Architecture Understanding Summary

The current architecture is optimistic and loosely coordinated:

1. API marks session as starting before bot success is proven.
2. Bot launch assumes join success based on shallow UI interaction.
3. Recording is triggered immediately after join function returns.
4. Stop pipeline depends on ad hoc runtime persistence:
   - DB
   - JSON file
   - in-memory browser map
5. UI polling depends solely on DB state.

This creates the highest risk around:

- false-positive join success
- silent or empty recordings
- stuck session states
- stop flow failures after restarts
- state divergence between runtime and DB

## 6. Files Most Relevant to Debugging First

If you debug in order of likely impact, the most relevant files are:

1. `bot/meetingBot.js`
2. `bot/index.js`
3. `bot/audioCapture.js`
4. `src/app/api/meetings/[id]/route.ts`
5. `src/app/api/meetings/[id]/stop/route.ts`
6. `src/features/meetings/server/state-machine.ts`
7. `src/lib/db/mutations/meeting-sessions.ts`
8. `src/app/api/meetings/[id]/status/route.ts`
9. `bot/transcribe.py`
10. `src/hooks/useSessionPolling.ts`
