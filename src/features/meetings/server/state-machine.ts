export type CanonicalMeetingSessionStatus =
  | "scheduled"
  | "waiting_for_join"
  | "capturing"
  | "processing"
  | "completed"
  | "failed";

export function normalizeMeetingSessionStatus(status: string | null | undefined): CanonicalMeetingSessionStatus {
  if (status?.startsWith("waiting_for_")) {
    return "waiting_for_join";
  }

  switch (status) {
    case "waiting_for_join":
    case "joined":
    case "joining":
      return "waiting_for_join";
    case "capturing":
    case "recording":
    case "recorded":
      return "capturing";
    case "processing":
    case "processing_transcript":
    case "processing_summary":
    case "transcribed":
      return "processing";
    case "completed":
      return "completed";
    case "failed":
      return "failed";
    default:
      return "scheduled";
  }
}

export function canTransitionMeetingSessionStatus(
  from: CanonicalMeetingSessionStatus,
  to: CanonicalMeetingSessionStatus
) {
  if (from === to) {
    return true;
  }

  if (to === "failed") {
    return from !== "completed";
  }

  if (from === "scheduled" && to === "waiting_for_join") {
    return true;
  }

  if (from === "failed" && to === "waiting_for_join") {
    return true;
  }

  if (from === "waiting_for_join" && to === "capturing") {
    return true;
  }

  if (from === "capturing" && to === "processing") {
    return true;
  }

  if (from === "processing" && to === "completed") {
    return true;
  }

  return false;
}

export function logMeetingSessionTransitionAttempt(params: {
  from: CanonicalMeetingSessionStatus;
  to: CanonicalMeetingSessionStatus;
  sessionId: string;
}) {
  console.info("[state-machine] transition attempted", params);
}

export function logMeetingSessionTransitionApplied(params: {
  from: CanonicalMeetingSessionStatus;
  to: CanonicalMeetingSessionStatus;
  sessionId: string;
}) {
  console.info("[state-machine] transition applied", params);
}
