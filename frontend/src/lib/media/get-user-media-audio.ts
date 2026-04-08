/**
 * Audio-only getUserMedia with a clear error when `navigator.mediaDevices` is missing
 * (e.g. non-HTTPS outside localhost, unsupported browser, or restricted embed).
 */
export async function getUserMediaAudioStream(): Promise<MediaStream> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    throw new Error(
      "Microphone API is not available. Use a current desktop browser, open the app at http://localhost or HTTPS, and allow microphone access."
    );
  }
  return navigator.mediaDevices.getUserMedia({ audio: true });
}
