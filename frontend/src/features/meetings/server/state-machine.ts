export type CanonicalMeetingSessionStatus =
  | "scheduled"
  | "waiting_for_join"
  | "waiting_for_admission"
  | "capturing"
  | "processing"
  | "summarizing"
  | "completed"
  | "failed";

export function normalizeMeetingSessionStatus(status: string | null | undefined): CanonicalMeetingSessionStatus {
  switch (status) {
    case "waiting_for_join":
    case "joining":
      return "waiting_for_join";
    case "waiting_for_admission":
      return "waiting_for_admission";
    case "joined":
      return "capturing";
    case "capturing":
    case "recording":
    case "recorded":
      return "capturing";
    case "processing":
    case "processing_transcript":
    case "processing_summary":
    case "transcribed":
      return "processing";
    case "summarizing":
      return "summarizing";
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

  if (from === "waiting_for_join" && to === "waiting_for_admission") {
    return true;
  }

  if (from === "waiting_for_admission" && to === "capturing") {
    return true;
  }

  if (from === "capturing" && to === "processing") {
    return true;
  }

  if (from === "processing" && to === "summarizing") {
    return true;
  }

  if (from === "summarizing" && to === "completed") {
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
