import fs from "node:fs";
import path from "node:path";

declare const __non_webpack_require__: NodeRequire;

type BotStatus =
  | "waiting_for_join"
  | "waiting_for_admission"
  | "capturing"
  | "processing"
  | "summarizing"
  | "completed"
  | "failed";

type BotStartResult = {
  success: boolean;
  outputPath?: string;
  error?: string;
};

type BotStopResult = {
  success: boolean;
  transcript?: string;
  meetingDurationSeconds?: number;
  outputPath?: string;
  summary?: {
    summary?: string;
    key_decisions?: string[];
    action_items?: Array<{
      task: string;
      owner: string;
      due_date: string;
      priority: "High" | "Medium" | "Low";
    }>;
    risks_and_blockers?: string[];
    key_topics?: string[];
    meeting_sentiment?: string;
    follow_up_meeting_needed?: boolean;
  };
  error?: string;
  errorCode?: string;
};

type BotStatusPayload = {
  errorCode?: string | null;
  failureReason?: string | null;
  recordingFilePath?: string | null;
  recordingStartedAt?: string | null;
  recordingEndedAt?: string | null;
  transcript?: string | null;
  summary?: BotStopResult["summary"] | null;
  meetingDurationSeconds?: number | null;
  outputPath?: string | null;
};

/**
 * Next bundles API routes under `.next/server/...`, so a relative `../../../backend/...` from
 * `src/lib/bot.ts` no longer resolves at runtime. Resolve from `process.cwd()` (usually `frontend/`
 * or monorepo root) or `LEGACY_BOT_PATH`.
 */
function resolveLegacyBotRoot(): string {
  const env = process.env.LEGACY_BOT_PATH?.trim();
  if (env) {
    return path.resolve(env);
  }

  const cwd = process.cwd();
  const fromFrontend = path.join(
    cwd,
    "..",
    "backend",
    "python-services",
    "ai-processing-service",
    "legacy-bot"
  );
  const fromRepoRoot = path.join(
    cwd,
    "backend",
    "python-services",
    "ai-processing-service",
    "legacy-bot"
  );

  if (fs.existsSync(path.join(fromFrontend, "index.js"))) {
    return fromFrontend;
  }
  if (fs.existsSync(path.join(fromRepoRoot, "index.js"))) {
    return fromRepoRoot;
  }

  return fromFrontend;
}

type LegacyBotModule = {
  startBot: (
    meetingId: string,
    meetingUrl: string,
    onStatusUpdate: (meetingId: string, status: BotStatus, payload?: BotStatusPayload) => Promise<void>
  ) => Promise<BotStartResult>;
  stopBot: (
    meetingId: string,
    onStatusUpdate: (meetingId: string, status: BotStatus, payload?: BotStatusPayload) => Promise<void>
  ) => Promise<BotStopResult>;
};

let botModule: LegacyBotModule | null = null;

function getBotModule(): LegacyBotModule {
  if (!botModule) {
    const root = resolveLegacyBotRoot();
    // __non_webpack_require__ bypasses webpack bundling and uses Node's native require at runtime
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nativeRequire = (typeof __non_webpack_require__ !== "undefined" ? __non_webpack_require__ : require) as NodeRequire;
    botModule = nativeRequire(root) as LegacyBotModule;
  }
  return botModule;
}

/** Legacy bot (RFC: migrates to integration-service + ai-processing-service). */
export function startBot(
  meetingId: string,
  meetingUrl: string,
  onStatusUpdate: (meetingId: string, status: BotStatus, payload?: BotStatusPayload) => Promise<void>
): Promise<BotStartResult> {
  return getBotModule().startBot(meetingId, meetingUrl, onStatusUpdate);
}

export function stopBot(
  meetingId: string,
  onStatusUpdate: (meetingId: string, status: BotStatus, payload?: BotStatusPayload) => Promise<void>
): Promise<BotStopResult> {
  return getBotModule().stopBot(meetingId, onStatusUpdate);
}
