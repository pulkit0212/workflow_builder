import path from "path";
import fs from "fs";
import { config } from "../config";

/** Resolve WAV path on the API server (ignores remote/Mac absolute paths). */
export function resolveRecordingFilePath(
  meetingId: string,
  dbPath: string | null | undefined
): string | null {
  const candidates: string[] = [];

  if (dbPath && path.isAbsolute(dbPath) && fs.existsSync(dbPath)) {
    candidates.push(dbPath);
  }

  candidates.push(
    path.join(config.recordingsDir, `${meetingId}.wav`),
    path.join(config.recordingsDir, `meeting-${meetingId}.wav`)
  );

  if (dbPath && !path.isAbsolute(dbPath)) {
    candidates.unshift(path.join(config.recordingsDir, dbPath));
  }

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }

  return null;
}

export function recordingUrlForSession(
  session: { id: string; recording_url?: string | null; recording_file_path?: string | null }
): string | null {
  if (session.recording_url) return session.recording_url;
  if (session.recording_file_path) return `/api/recordings/${session.id}`;
  return null;
}
