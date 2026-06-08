import { Router, Request, Response, NextFunction } from "express";
import fs from "fs";
import { pool } from "../db/client";
import { ForbiddenError, NotFoundError } from "../lib/errors";
import { resolveRecordingFilePath } from "../lib/recording-path";

export const recordingsRouter = Router();

// ─── GET /:meetingId ──────────────────────────────────────────────────────────

recordingsRouter.get("/:meetingId", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { meetingId } = req.params;
    const userId = req.appUser.id;

    // Query the meeting session
    const result = await pool.query(
      `SELECT id, user_id, shared_with_user_ids, recording_file_path
       FROM meeting_sessions
       WHERE id = $1
       LIMIT 1`,
      [meetingId]
    );

    const session = result.rows[0] ?? null;

    // 404 if session doesn't exist
    if (!session) {
      return next(new NotFoundError());
    }

    // Authorization: must be owner or in sharedWithUserIds
    const sharedWithUserIds: string[] = Array.isArray(session.shared_with_user_ids)
      ? session.shared_with_user_ids
      : [];

    const isOwner = session.user_id === userId;
    const isShared = sharedWithUserIds.includes(userId);

    if (!isOwner && !isShared) {
      return next(new ForbiddenError());
    }

    const filePath = resolveRecordingFilePath(meetingId, session.recording_file_path);

    if (!filePath) {
      return res.status(404).json({ error: "Recording file not found" });
    }

    // Stream the file with appropriate headers
    res.setHeader("Content-Type", "audio/wav");
    res.setHeader("Content-Disposition", 'inline; filename="recording.wav"');
    res.setHeader("Cache-Control", "private, max-age=3600");

    const fileStream = fs.createReadStream(filePath);
    fileStream.on("error", (err) => next(err));
    fileStream.pipe(res);
  } catch (err) {
    next(err);
  }
});
