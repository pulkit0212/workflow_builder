/** Topic names — RFC §10 */
export const Topics = {
  MEETING_AUDIO_CHUNKS: "meeting.audio.chunks",
  TRANSCRIPT_SEGMENTS: "transcript.segments",
  MENTIONS_RAW: "mentions.raw",
  MENTIONS_THRESHOLD: "mentions.threshold",
  AI_ACTIONS_QUEUE: "ai.actions.queue",
  CALLS_TRIGGER: "calls.trigger",
  CALLS_EVENTS: "calls.events",
  MEETING_ENDED: "meeting.ended",
  SUMMARIES_REQUEST: "summaries.request",
  SUMMARIES_READY: "summaries.ready",
  NOTIFICATIONS_OUTBOUND: "notifications.outbound",
} as const;
