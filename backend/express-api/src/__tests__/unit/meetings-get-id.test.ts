import { describe, it, expect, vi, beforeEach } from "vitest";
import express, { Request, Response, NextFunction } from "express";
import request from "supertest";
import { meetingsRouter } from "../../routes/meetings";

// Mock the DB pool
vi.mock("../../db/client", () => ({
  pool: {
    query: vi.fn(),
  },
}));

// Mock bot-client (not needed for GET /:id but imported by the module)
vi.mock("../../lib/bot-client", () => ({
  startBot: vi.fn(),
  stopBot: vi.fn(),
}));

import { pool } from "../../db/client";

const mockPool = pool as { query: ReturnType<typeof vi.fn> };

function createTestApp() {
  const app = express();
  app.use(express.json());

  // Inject a fake authenticated user
  app.use((req: Request, _res: Response, next: NextFunction) => {
    (req as Request & { appUser: { id: string } }).appUser = { id: "user-123" };
    next();
  });

  app.use("/api/meetings", meetingsRouter);
  return app;
}

const MEETING_ID = "550e8400-e29b-41d4-a716-446655440000";

const mockSessionRow = {
  id: MEETING_ID,
  user_id: "user-123",
  workspace_id: null,
  ai_run_id: null,
  provider: "google_meet",
  title: "Test Meeting",
  meeting_link: "https://meet.google.com/abc",
  notes: null,
  transcript: null,
  summary: null,
  key_points: null,
  key_decisions: null,
  action_items: null,
  risks_and_blockers: null,
  key_topics: null,
  meeting_sentiment: null,
  follow_up_needed: false,
  status: "completed",
  error_code: null,
  failure_reason: null,
  failed_at: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  scheduled_start_time: null,
  scheduled_end_time: null,
  external_calendar_event_id: null,
  // recording_file_path is set — this is the bug condition
  recording_file_path: "/home/ubuntu/tmp/audio/meeting-abc.wav",
  recording_url: "https://cdn.example.com/recordings/meeting-abc.mp4",
  recording_size: null,
  recording_duration: 3600,
  recording_started_at: null,
  recording_ended_at: null,
  meeting_duration: null,
  insights: null,
  chapters: null,
  participants: null,
  shared_with_user_ids: null,
  visibility: "workspace",
  follow_up_email: null,
  email_sent: false,
  email_sent_at: null,
  workspace_move_status: null,
};

describe("GET /api/meetings/:id", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does NOT include recordingFilePath in the response when meeting has a recording", async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [mockSessionRow] });

    const app = createTestApp();
    const res = await request(app).get(`/api/meetings/${MEETING_ID}`);

    expect(res.status).toBe(200);
    expect(res.body.meeting).toBeDefined();
    expect(res.body.meeting).not.toHaveProperty("recordingFilePath");
  });

  it("DOES include recordingUrl in the response when meeting has a recording", async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [mockSessionRow] });

    const app = createTestApp();
    const res = await request(app).get(`/api/meetings/${MEETING_ID}`);

    expect(res.status).toBe(200);
    expect(res.body.meeting).toBeDefined();
    expect(res.body.meeting).toHaveProperty("recordingUrl");
    expect(res.body.meeting.recordingUrl).toBe("https://cdn.example.com/recordings/meeting-abc.mp4");
  });

  it("returns recordingUrl derived from recording_file_path when recording_url is null", async () => {
    const sessionWithNoUrl = { ...mockSessionRow, recording_url: null };
    mockPool.query.mockResolvedValueOnce({ rows: [sessionWithNoUrl] });

    const app = createTestApp();
    const res = await request(app).get(`/api/meetings/${MEETING_ID}`);

    expect(res.status).toBe(200);
    expect(res.body.meeting).not.toHaveProperty("recordingFilePath");
    expect(res.body.meeting.recordingUrl).toBe(`/api/recordings/${MEETING_ID}`);
  });
});
