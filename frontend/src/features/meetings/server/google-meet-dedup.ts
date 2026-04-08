import { addUserToMeetingSessionShares } from "@/lib/db/mutations/meeting-sessions";
import { findActiveGoogleMeetSessionByNormalizedUrl } from "@/lib/db/queries/meeting-sessions";
import { normalizeMeetingUrl } from "@/lib/meeting-url";

export type GoogleMeetDedupResult =
  | { kind: "continue" }
  | {
      kind: "already_recording";
      session: NonNullable<Awaited<ReturnType<typeof findActiveGoogleMeetSessionByNormalizedUrl>>>;
    };

/**
 * If another session is already capturing the same Google Meet, attach this user and skip starting a second bot.
 */
export async function maybeResolveGoogleMeetDedup(params: {
  meetingUrl: string;
  userId: string;
  workspaceId: string;
  /** Session row id for this start request; skip dedup when it is the same active session. */
  currentSessionId: string | null;
}): Promise<GoogleMeetDedupResult> {
  const normalized = normalizeMeetingUrl(params.meetingUrl);
  if (!normalized) {
    return { kind: "continue" };
  }
  const active = await findActiveGoogleMeetSessionByNormalizedUrl(
    normalized,
    params.workspaceId
  );

  if (!active) {
    return { kind: "continue" };
  }

  if (params.currentSessionId && active.id === params.currentSessionId) {
    return { kind: "continue" };
  }

  const updated = await addUserToMeetingSessionShares(active.id, params.userId);

  return {
    kind: "already_recording",
    session: updated ?? active
  };
}
