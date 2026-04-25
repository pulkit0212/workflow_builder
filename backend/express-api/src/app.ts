import express, { Request, Response } from "express";
import helmet from "helmet";
import cors from "cors";
import { config } from "./config";
import { requestLogger } from "./middleware/request-logger";
import { errorHandler } from "./middleware/error-handler";
import { clerkAuth } from "./middleware/clerk-auth";
import { rateLimiter } from "./middleware/rate-limiter";
import { healthRouter } from "./routes/health";
import { settingsRouter } from "./routes/settings";
import { recordingsRouter } from "./routes/recordings";
import { actionItemsRouter } from "./routes/action-items";
import { workspacesRouter } from "./routes/workspaces";
import { meetingsRouter } from "./routes/meetings";
import { calendarRouter, calendarPublicRouter } from "./routes/calendar";
import { integrationsRouter } from "./routes/integrations";
import { webhooksRouter } from "./routes/webhooks";
import { profileRouter } from "./routes/profile";
import { searchRouter } from "./routes/search";
import { usersRouter } from "./routes/users";
import { subscriptionRouter } from "./routes/subscription";
import { usageRouter } from "./routes/usage";
import { aiRunsRouter } from "./routes/ai-runs";
import { meetingSessionsRouter } from "./routes/meeting-sessions";
import { inviteRouter } from "./routes/invite";
import { botRouter } from "./routes/bot";
import { googleRouter } from "./routes/google";
import { meetingExtrasRouter } from "./routes/meeting-extras";
import { paymentRouter } from "./routes/payment";
import { toolsRouter } from "./routes/tools";

export function createApp() {
  const app = express();

  // Security headers
  app.use(helmet());

  // CORS — allow only origins in config
  app.use(cors({ origin: config.allowedOrigins }));

  // JSON body parsing with 1MB limit
  app.use(express.json({ limit: "1mb" }));

  // Structured request logging
  app.use(requestLogger);

  // Routes
  app.use("/health", healthRouter);

  // Protected routes — require Clerk JWT + rate limiting
  app.use("/api/meetings", clerkAuth, rateLimiter, meetingsRouter);
  // Calendar — public routes (OAuth redirects, no auth) + protected routes
  app.use("/api/calendar", calendarPublicRouter);
  app.use("/api/calendar", clerkAuth, rateLimiter, calendarRouter);
  app.use("/api/integrations", clerkAuth, rateLimiter, integrationsRouter);
  app.use("/api/profile", clerkAuth, rateLimiter, profileRouter);
  app.use("/api/workspaces", clerkAuth, rateLimiter, workspacesRouter);
  app.use("/api/workspace", clerkAuth, rateLimiter, workspacesRouter);
  app.use("/api/action-items", clerkAuth, rateLimiter, actionItemsRouter);
  app.use("/api/settings", clerkAuth, rateLimiter, settingsRouter);
  app.use("/api/recordings", clerkAuth, rateLimiter, recordingsRouter);
  app.use("/api/search", clerkAuth, rateLimiter, searchRouter);
  app.use("/api/users", clerkAuth, rateLimiter, usersRouter);
  app.use("/api/subscription", clerkAuth, rateLimiter, subscriptionRouter);
  app.use("/api/usage", clerkAuth, rateLimiter, usageRouter);
  app.use("/api/ai-runs", clerkAuth, rateLimiter, aiRunsRouter);
  app.use("/api/meeting-sessions", clerkAuth, rateLimiter, meetingSessionsRouter);
  // /api/invite/validate is public; /api/invite/accept requires auth
  // We mount the whole router at /api/invite and handle auth per-route inside
  app.use("/api/invite", inviteRouter);
  app.use("/api/bot", clerkAuth, rateLimiter, botRouter);

  // Webhooks — no clerkAuth, uses Svix signature verification instead
  // Note: express.raw() body parsing is handled inside the route itself
  app.use("/api/webhooks", webhooksRouter);

  // New migrated routes
  app.use("/api/google", clerkAuth, rateLimiter, googleRouter);
  app.use("/api/meeting", clerkAuth, rateLimiter, meetingExtrasRouter);
  app.use("/api/payment", clerkAuth, rateLimiter, paymentRouter);
  app.use("/api/tools", clerkAuth, rateLimiter, toolsRouter);

  // 404 catch-all
  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: "Not found" });
  });

  // Global error handler (must be last)
  app.use(errorHandler);

  return app;
}
