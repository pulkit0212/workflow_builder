# Workflow Automation MVP

This app now supports the hardened Google Meet bot flow based on:

- a persistent Playwright profile in `tmp/bot-profile`
- a one-time manual Google login via `npm run setup:bot-profile`
- a separate browser session for the bot
- automatic recording, transcription, summary, and action-item persistence

## Current MVP Scope

The hardened MVP focuses on these areas:

- audio capture reliability with recording-file validation before transcription
- persisted failed-state diagnostics for the meeting detail UX
- structured summary output with `summary`, `key_points`, and typed `action_items`
- clearer dashboard signals for upcoming meetings, completed captures, and open follow-ups

## Setup

1. Install dependencies.
2. Configure `.env.local`.
3. Install the bot runtime dependencies:

```bash
npm run setup:bot
```

4. Run the one-time Google login flow for the persistent Playwright profile:

```bash
npm run setup:bot-profile
```

This opens the persistent bot browser profile. Complete Google sign-in once, then close the window.

## Audio Prerequisites

The bot records system audio, not microphone input from the web app UI.

### Linux

- The recorder uses PulseAudio through `ffmpeg`.
- Set `MEETING_AUDIO_SOURCE` when `default` is not the correct monitor/source.
- Example values are commonly `default`, a sink monitor, or a loopback source.

Example:

```bash
MEETING_AUDIO_SOURCE=default npm run dev
```

If a recording fails with a very small file size, verify that Google Meet audio is actually routed into the selected PulseAudio source.

### macOS

- The recorder uses `BlackHole 2ch`.
- Route system output through BlackHole before starting the bot.

## Database Update

The hardened meeting flow adds persisted recording metadata and failure diagnostics to `meeting_sessions`.

Apply the schema update before testing:

```bash
npm run db:push
```

## Meet Bot Flow

1. Open a meeting from `/dashboard/meetings`.
2. Start `AI Notetaker`.
3. Let the bot join in its own browser.
4. Stop recording from the meeting detail page.
5. Review transcript, summary, key points, and action items in the saved meeting record.

## Failure Handling

When a run fails, the meeting record now keeps:

- `failureReason`
- `recordingFilePath`
- `recordingStartedAt`
- `recordingEndedAt`

This is intended to make retries actionable instead of opaque.

## Common Recovery Steps

- Re-run `npm run setup:bot-profile` if Google Meet rejects the bot.
- Check `MEETING_AUDIO_SOURCE` if the recording file is tiny or transcription is empty.
- Confirm `ffmpeg`, Playwright Chromium, and Python Whisper dependencies are installed.
