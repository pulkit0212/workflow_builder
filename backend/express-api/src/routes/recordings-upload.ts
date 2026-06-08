import { Router, Request, Response, NextFunction } from "express";
import path from "path";
import fs from "fs";
import multer from "multer";
import { pool } from "../db/client";
import { config } from "../config";
import { BadRequestError, NotFoundError, UnauthorizedError } from "../lib/errors";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 150 * 1024 * 1024 },
});

/** Bot-only upload — mounted before Clerk auth on /api/recordings */
export const recordingsUploadRouter = Router();

recordingsUploadRouter.post(
  "/:meetingId/upload",
  upload.single("recording"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const secret = req.header("x-bot-upload-secret");
      const expected = process.env.BOT_UPLOAD_SECRET;
      if (!expected || secret !== expected) {
        return next(new UnauthorizedError("Invalid upload secret"));
      }

      const { meetingId } = req.params;
      const file = req.file;
      if (!file?.buffer?.length) {
        return next(new BadRequestError("Missing recording file"));
      }

      const sessionResult = await pool.query(
        `SELECT id FROM meeting_sessions WHERE id = $1 LIMIT 1`,
        [meetingId]
      );
      if (!sessionResult.rows[0]) {
        return next(new NotFoundError("Meeting not found"));
      }

      fs.mkdirSync(config.recordingsDir, { recursive: true });
      const destPath = path.join(config.recordingsDir, `${meetingId}.wav`);
      fs.writeFileSync(destPath, file.buffer);

      const recordingUrl = `/api/recordings/${meetingId}`;
      await pool.query(
        `UPDATE meeting_sessions
         SET recording_file_path = $1, recording_url = $2, recording_size = $3, updated_at = NOW()
         WHERE id = $4`,
        [destPath, recordingUrl, file.buffer.length, meetingId]
      );

      res.json({ ok: true, recordingUrl, size: file.buffer.length });
    } catch (err) {
      next(err);
    }
  }
);
