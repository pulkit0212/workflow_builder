import fs from "node:fs";
import path from "node:path";

const RECORDINGS_DIR = path.join(process.cwd(), "public", "recordings");

export function ensureRecordingsDir() {
  if (!fs.existsSync(RECORDINGS_DIR)) {
    fs.mkdirSync(RECORDINGS_DIR, { recursive: true });
  }
}

export function saveRecording(meetingId: string, sourcePath: string): string {
  ensureRecordingsDir();

  const fileName = `meeting-${meetingId}.wav`;
  const destinationPath = path.join(RECORDINGS_DIR, fileName);

  fs.copyFileSync(sourcePath, destinationPath);
  console.log("[Storage] Recording saved:", destinationPath);

  return `/recordings/${fileName}`;
}

export function getRecordingUrl(meetingId: string): string | null {
  const fileName = `meeting-${meetingId}.wav`;
  const filePath = path.join(RECORDINGS_DIR, fileName);

  if (fs.existsSync(filePath)) {
    return `/recordings/${fileName}`;
  }

  return null;
}

export function deleteRecording(meetingId: string) {
  const fileName = `meeting-${meetingId}.wav`;
  const filePath = path.join(RECORDINGS_DIR, fileName);

  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    console.log("[Storage] Recording deleted:", filePath);
  }
}

export function getRecordingSize(meetingId: string): number {
  const fileName = `meeting-${meetingId}.wav`;
  const filePath = path.join(RECORDINGS_DIR, fileName);

  if (fs.existsSync(filePath)) {
    return fs.statSync(filePath).size;
  }

  return 0;
}
