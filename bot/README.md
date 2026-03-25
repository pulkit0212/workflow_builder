# Artiva Bot — Setup & Usage

## First Time Setup (Run Once)

The bot needs a logged-in Google account to join meetings.

Run this command:
  npm run setup:bot-profile

This will:
1. Open a real Chrome browser window
2. Navigate to accounts.google.com
3. Wait 120 seconds for you to log in manually
4. Save the session to tmp/bot-profile/
5. This profile is reused every time the bot runs

IMPORTANT: Use a dedicated Google account for the bot.
Do not use your personal account.
Recommended: create meetingbot@gmail.com or similar.

## How the Bot Works

When you click "Start AI Notetaker":
1. A SEPARATE browser window opens on your machine
2. That browser joins the Google Meet link as "AI Notetaker"
3. Meeting participants will see "AI Notetaker" in the participant list
4. Audio is recorded in the background via PulseAudio (Linux)
5. When you click Stop Recording:
   - Audio recording stops
   - Whisper transcribes the audio locally
   - Gemini generates summary + action items
   - Results appear on the meeting detail page

## Audio Source Setup (Linux)

Run this to find your audio devices:
  pactl list short sources

Find the .monitor source of your output device.
Example: alsa_output.pci-0000_00_1f.3.analog-stereo.monitor

Add to .env.local:
  MEETING_AUDIO_SOURCE=alsa_output.pci-0000_00_1f.3.analog-stereo.monitor

## Session Files

Bot sessions are stored in: tmp/bot-sessions.json
Audio files are stored in: tmp/audio/
Bot profile is stored in: tmp/bot-profile/

All of these are gitignored.

## Troubleshooting

| Error | Fix |
|---|---|
| "You can't join this video call" | Run npm run setup:bot-profile |
| Blank transcript | Check MEETING_AUDIO_SOURCE in .env.local |
| Bot not in participant list | Meeting may require host admission |
| Session not found on stop | Server was restarted — session lost from memory |
