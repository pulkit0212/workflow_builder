import { config } from "../config";

export class BotClientError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "BotClientError";
  }
}

export async function startBot(meetingId: string, meetingUrl?: string): Promise<void> {
  const body: { meetingId: string; meetingUrl?: string } = { meetingId };
  if (meetingUrl) body.meetingUrl = meetingUrl;

  const res = await fetch(`${config.botBaseUrl}/start`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // ngrok free tier: allow server-to-server calls from Render
      "ngrok-skip-browser-warning": "true",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new BotClientError(
      res.status,
      `Bot /start failed with status ${res.status}`,
    );
  }
}

export async function stopBot(meetingId: string): Promise<void> {
  const res = await fetch(`${config.botBaseUrl}/stop`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "ngrok-skip-browser-warning": "true",
    },
    body: JSON.stringify({ meetingId }),
  });

  if (!res.ok) {
    throw new BotClientError(
      res.status,
      `Bot /stop failed with status ${res.status}`,
    );
  }
}
