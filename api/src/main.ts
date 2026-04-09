import "dotenv/config";
import express from "express";
import type { Request as ExpressRequest, Response as ExpressResponse } from "express";
import cors from "cors";

// Polyfill NextResponse so route files that import it still work
// next/server is available via the "next" package installed as a dependency
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { NextResponse } = require("next/server") as { NextResponse: unknown };
(global as Record<string, unknown>).NextResponse = NextResponse;

import { requestStorage } from "./shims/clerk-nextjs-server";

// ── Route imports ──────────────────────────────────────────────────────────────
import * as actionItemsRoute from "./action-items/route";
import * as actionItemByIdRoute from "./action-items/[id]/route";
import * as actionItemsBulkSaveRoute from "./action-items/bulk-save/route";
import * as actionItemsExportJiraRoute from "./action-items/export/jira/route";
import * as actionItemsExportSlackRoute from "./action-items/export/slack/route";

import * as aiRunsRoute from "./ai-runs/route";
import * as aiRunByIdRoute from "./ai-runs/[id]/route";

import * as authNextAuthRoute from "./auth/[...nextauth]/route";

import * as botProfileStatusRoute from "./bot/profile-status/route";

import * as debugMvpCheckRoute from "./debug/mvp-check/route";
import * as debugRunTestsRoute from "./debug/run-tests/route";

import * as googleCalendarRoute from "./google/calendar/route";
import * as googleIntegrationRoute from "./google/integration/route";

import * as integrationsRoute from "./integrations/route";
import * as integrationsTestRoute from "./integrations/test/route";

import * as meetingFollowupRoute from "./meeting/followup/route";
import * as meetingSendEmailRoute from "./meeting/send-email/route";

import * as meetingSessionsRoute from "./meeting-sessions/route";
import * as meetingSessionByIdRoute from "./meeting-sessions/[id]/route";

import * as meetingsRoute from "./meetings/route";
import * as meetingByIdRoute from "./meetings/[id]/route";
import * as meetingStartRoute from "./meetings/[id]/start/route";
import * as meetingStopRoute from "./meetings/[id]/stop/route";
import * as meetingStatusRoute from "./meetings/[id]/status/route";
import * as meetingsJoinedRoute from "./meetings/joined/route";
import * as meetingsReportsRoute from "./meetings/reports/route";
import * as meetingsTodayRoute from "./meetings/today/route";
import * as meetingsUpcomingRoute from "./meetings/upcoming/route";

import * as paymentCreateOrderRoute from "./payment/create-order/route";
import * as paymentVerifyRoute from "./payment/verify/route";

import * as profileMeRoute from "./profile/me/route";

import * as recordingsByMeetingIdRoute from "./recordings/[meetingId]/route";

import * as settingsAccountRoute from "./settings/account/route";
import * as settingsBotRoute from "./settings/bot/route";
import * as settingsPaymentsRoute from "./settings/payments/route";
import * as settingsPreferencesRoute from "./settings/preferences/route";
import * as settingsUsageRoute from "./settings/usage/route";

import * as subscriptionRoute from "./subscription/route";

import * as toolsDocumentAnalyzerRoute from "./tools/document-analyzer/route";
import * as toolsEmailGeneratorRoute from "./tools/email-generator/route";
import * as toolsMeetingSummarizerRunRoute from "./tools/meeting-summarizer/run/route";
import * as toolsMeetingSummarizerTranscribeRoute from "./tools/meeting-summarizer/transcribe/route";
import * as toolsTaskGeneratorRoute from "./tools/task-generator/route";
import * as toolsBySlugRunRoute from "./tools/[toolSlug]/run/route";

import * as usageDataRoute from "./usage/data/route";
import * as usageStatsRoute from "./usage/stats/route";

import * as webhooksClerkRoute from "./webhooks/clerk/route";

// ── Adapter: Next.js Web API handler → Express handler ────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyHandler = (...args: any[]) => Promise<Response>;

function adapt(handler: AnyHandler, paramKeys: string[] = []) {
  return async (req: ExpressRequest, res: ExpressResponse) => {
    try {
      const params: Record<string, string> = {};
      for (const key of paramKeys) {
        const val = req.params[key];
        if (val !== undefined) params[key] = Array.isArray(val) ? val[0] : val;
      }

      const protocol = req.protocol;
      const host = req.get("host") ?? "localhost";
      const url = `${protocol}://${host}${req.originalUrl}`;

      const headers = new Headers();
      for (const [k, v] of Object.entries(req.headers)) {
        if (v) headers.set(k, Array.isArray(v) ? v.join(", ") : (v as string));
      }

      let body: BodyInit | null = null;
      const ct = (req.headers["content-type"] ?? "") as string;
      if (ct.includes("multipart/form-data")) {
        // raw buffer for multipart — the route will call request.formData()
        body = req.body as string;
      } else if (req.body && typeof req.body === "object" && Object.keys(req.body as object).length > 0) {
        body = JSON.stringify(req.body);
      }

      const webReq = new Request(url, {
        method: req.method,
        headers,
        body: ["GET", "HEAD"].includes(req.method) ? null : body,
      });

      const ctx = paramKeys.length > 0 ? { params: Promise.resolve(params) } : undefined;
      const webRes: Response = await requestStorage.run(webReq, () => handler(webReq, ctx));

      res.status(webRes.status);
      webRes.headers.forEach((value, key) => {
        res.setHeader(key, value);
      });

      const responseBody = await webRes.text();
      res.send(responseBody);
    } catch (err) {
      // redirect() from next/navigation shim throws when user is unauthenticated
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.startsWith("redirect(")) {
        res.status(401).json({ success: false, message: "Unauthorized." });
        return;
      }
      console.error("[adapter] unhandled error", err);
      res.status(500).json({ success: false, message: "Internal server error." });
    }
  };
}

// Helper to safely get a handler from a route module
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function h(mod: Record<string, any>, method: string): AnyHandler | undefined {
  return typeof mod[method] === "function" ? (mod[method] as AnyHandler) : undefined;
}

// ── App setup ─────────────────────────────────────────────────────────────────
const app = express();

app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true }));

// ── Route registration ────────────────────────────────────────────────────────

// action-items
const _aiGET = h(actionItemsRoute, "GET"); if (_aiGET) app.get("/api/action-items", adapt(_aiGET));
const _aiPOST = h(actionItemsRoute, "POST"); if (_aiPOST) app.post("/api/action-items", adapt(_aiPOST));
const _aiBulk = h(actionItemsBulkSaveRoute, "POST"); if (_aiBulk) app.post("/api/action-items/bulk-save", adapt(_aiBulk));
const _aiJira = h(actionItemsExportJiraRoute, "POST"); if (_aiJira) app.post("/api/action-items/export/jira", adapt(_aiJira));
const _aiSlack = h(actionItemsExportSlackRoute, "POST"); if (_aiSlack) app.post("/api/action-items/export/slack", adapt(_aiSlack));
const _aiIdGET = h(actionItemByIdRoute, "GET"); if (_aiIdGET) app.get("/api/action-items/:id", adapt(_aiIdGET, ["id"]));
const _aiIdPATCH = h(actionItemByIdRoute, "PATCH"); if (_aiIdPATCH) app.patch("/api/action-items/:id", adapt(_aiIdPATCH, ["id"]));
const _aiIdDEL = h(actionItemByIdRoute, "DELETE"); if (_aiIdDEL) app.delete("/api/action-items/:id", adapt(_aiIdDEL, ["id"]));

// ai-runs
const _arGET = h(aiRunsRoute, "GET"); if (_arGET) app.get("/api/ai-runs", adapt(_arGET));
const _arPOST = h(aiRunsRoute, "POST"); if (_arPOST) app.post("/api/ai-runs", adapt(_arPOST));
const _arIdGET = h(aiRunByIdRoute, "GET"); if (_arIdGET) app.get("/api/ai-runs/:id", adapt(_arIdGET, ["id"]));
const _arIdDEL = h(aiRunByIdRoute, "DELETE"); if (_arIdDEL) app.delete("/api/ai-runs/:id", adapt(_arIdDEL, ["id"]));

// auth — handled by Next.js frontend, not the Express API server

// bot
const _botGET = h(botProfileStatusRoute, "GET"); if (_botGET) app.get("/api/bot/profile-status", adapt(_botGET));

// debug
const _dbgMvp = h(debugMvpCheckRoute, "GET"); if (_dbgMvp) app.get("/api/debug/mvp-check", adapt(_dbgMvp));
const _dbgTests = h(debugRunTestsRoute, "POST"); if (_dbgTests) app.post("/api/debug/run-tests", adapt(_dbgTests));

// google
const _gcalGET = h(googleCalendarRoute, "GET"); if (_gcalGET) app.get("/api/google/calendar", adapt(_gcalGET));
const _gintGET = h(googleIntegrationRoute, "GET"); if (_gintGET) app.get("/api/google/integration", adapt(_gintGET));
const _gintPOST = h(googleIntegrationRoute, "POST"); if (_gintPOST) app.post("/api/google/integration", adapt(_gintPOST));
const _gintDEL = h(googleIntegrationRoute, "DELETE"); if (_gintDEL) app.delete("/api/google/integration", adapt(_gintDEL));

// integrations
const _intGET = h(integrationsRoute, "GET"); if (_intGET) app.get("/api/integrations", adapt(_intGET));
const _intPOST = h(integrationsRoute, "POST"); if (_intPOST) app.post("/api/integrations", adapt(_intPOST));
const _intDEL = h(integrationsRoute, "DELETE"); if (_intDEL) app.delete("/api/integrations", adapt(_intDEL));
const _intTest = h(integrationsTestRoute, "POST"); if (_intTest) app.post("/api/integrations/test", adapt(_intTest));

// meeting (followup / send-email)
const _mfPOST = h(meetingFollowupRoute, "POST"); if (_mfPOST) app.post("/api/meeting/followup", adapt(_mfPOST));
const _msePOST = h(meetingSendEmailRoute, "POST"); if (_msePOST) app.post("/api/meeting/send-email", adapt(_msePOST));

// meeting-sessions
const _msGET = h(meetingSessionsRoute, "GET"); if (_msGET) app.get("/api/meeting-sessions", adapt(_msGET));
const _msPOST = h(meetingSessionsRoute, "POST"); if (_msPOST) app.post("/api/meeting-sessions", adapt(_msPOST));
const _msIdGET = h(meetingSessionByIdRoute, "GET"); if (_msIdGET) app.get("/api/meeting-sessions/:id", adapt(_msIdGET, ["id"]));
const _msIdPATCH = h(meetingSessionByIdRoute, "PATCH"); if (_msIdPATCH) app.patch("/api/meeting-sessions/:id", adapt(_msIdPATCH, ["id"]));
const _msIdDEL = h(meetingSessionByIdRoute, "DELETE"); if (_msIdDEL) app.delete("/api/meeting-sessions/:id", adapt(_msIdDEL, ["id"]));

// meetings — specific sub-routes BEFORE parameterised :id routes
const _mjGET = h(meetingsJoinedRoute, "GET"); if (_mjGET) app.get("/api/meetings/joined", adapt(_mjGET));
const _mrGET = h(meetingsReportsRoute, "GET"); if (_mrGET) app.get("/api/meetings/reports", adapt(_mrGET));
const _mtGET = h(meetingsTodayRoute, "GET"); if (_mtGET) app.get("/api/meetings/today", adapt(_mtGET));
const _muGET = h(meetingsUpcomingRoute, "GET"); if (_muGET) app.get("/api/meetings/upcoming", adapt(_muGET));

const _mGET = h(meetingsRoute, "GET"); if (_mGET) app.get("/api/meetings", adapt(_mGET));
const _mPOST = h(meetingsRoute, "POST"); if (_mPOST) app.post("/api/meetings", adapt(_mPOST));

const _mStartPOST = h(meetingStartRoute, "POST"); if (_mStartPOST) app.post("/api/meetings/:id/start", adapt(_mStartPOST, ["id"]));
const _mStopPOST = h(meetingStopRoute, "POST"); if (_mStopPOST) app.post("/api/meetings/:id/stop", adapt(_mStopPOST, ["id"]));
const _mStatusGET = h(meetingStatusRoute, "GET"); if (_mStatusGET) app.get("/api/meetings/:id/status", adapt(_mStatusGET, ["id"]));

const _mIdGET = h(meetingByIdRoute, "GET"); if (_mIdGET) app.get("/api/meetings/:id", adapt(_mIdGET, ["id"]));
const _mIdPOST = h(meetingByIdRoute, "POST"); if (_mIdPOST) app.post("/api/meetings/:id", adapt(_mIdPOST, ["id"]));
const _mIdPATCH = h(meetingByIdRoute, "PATCH"); if (_mIdPATCH) app.patch("/api/meetings/:id", adapt(_mIdPATCH, ["id"]));
const _mIdDEL = h(meetingByIdRoute, "DELETE"); if (_mIdDEL) app.delete("/api/meetings/:id", adapt(_mIdDEL, ["id"]));

// payment
const _pcoGET = h(paymentCreateOrderRoute, "POST"); if (_pcoGET) app.post("/api/payment/create-order", adapt(_pcoGET));
const _pvPOST = h(paymentVerifyRoute, "POST"); if (_pvPOST) app.post("/api/payment/verify", adapt(_pvPOST));

// profile
const _profGET = h(profileMeRoute, "GET"); if (_profGET) app.get("/api/profile/me", adapt(_profGET));

// recordings
const _recGET = h(recordingsByMeetingIdRoute, "GET"); if (_recGET) app.get("/api/recordings/:meetingId", adapt(_recGET, ["meetingId"]));

// settings
const _saGET = h(settingsAccountRoute, "GET"); if (_saGET) app.get("/api/settings/account", adapt(_saGET));
const _saPATCH = h(settingsAccountRoute, "PATCH"); if (_saPATCH) app.patch("/api/settings/account", adapt(_saPATCH));
const _sbGET = h(settingsBotRoute, "GET"); if (_sbGET) app.get("/api/settings/bot", adapt(_sbGET));
const _sbPATCH = h(settingsBotRoute, "PATCH"); if (_sbPATCH) app.patch("/api/settings/bot", adapt(_sbPATCH));
const _spGET = h(settingsPaymentsRoute, "GET"); if (_spGET) app.get("/api/settings/payments", adapt(_spGET));
const _sprGET = h(settingsPreferencesRoute, "GET"); if (_sprGET) app.get("/api/settings/preferences", adapt(_sprGET));
const _sprPATCH = h(settingsPreferencesRoute, "PATCH"); if (_sprPATCH) app.patch("/api/settings/preferences", adapt(_sprPATCH));
const _suGET = h(settingsUsageRoute, "GET"); if (_suGET) app.get("/api/settings/usage", adapt(_suGET));

// subscription
const _subGET = h(subscriptionRoute, "GET"); if (_subGET) app.get("/api/subscription", adapt(_subGET));

// tools
const _tdaPOST = h(toolsDocumentAnalyzerRoute, "POST"); if (_tdaPOST) app.post("/api/tools/document-analyzer", adapt(_tdaPOST));
const _tegPOST = h(toolsEmailGeneratorRoute, "POST"); if (_tegPOST) app.post("/api/tools/email-generator", adapt(_tegPOST));
const _tmsrPOST = h(toolsMeetingSummarizerRunRoute, "POST"); if (_tmsrPOST) app.post("/api/tools/meeting-summarizer/run", adapt(_tmsrPOST));
const _tmstPOST = h(toolsMeetingSummarizerTranscribeRoute, "POST"); if (_tmstPOST) app.post("/api/tools/meeting-summarizer/transcribe", adapt(_tmstPOST));
const _ttgPOST = h(toolsTaskGeneratorRoute, "POST"); if (_ttgPOST) app.post("/api/tools/task-generator", adapt(_ttgPOST));
const _tSlugPOST = h(toolsBySlugRunRoute, "POST"); if (_tSlugPOST) app.post("/api/tools/:toolSlug/run", adapt(_tSlugPOST, ["toolSlug"]));

// usage
const _udGET = h(usageDataRoute, "GET"); if (_udGET) app.get("/api/usage/data", adapt(_udGET));
const _usGET = h(usageStatsRoute, "GET"); if (_usGET) app.get("/api/usage/stats", adapt(_usGET));

// webhooks
const _wckPOST = h(webhooksClerkRoute, "POST"); if (_wckPOST) app.post("/api/webhooks/clerk", adapt(_wckPOST));

// ── Health check ──────────────────────────────────────────────────────────────
app.get("/health", (_req: import("express").Request, res: import("express").Response) => {
  res.json({ status: "ok" });
});

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT ?? 4000;
app.listen(PORT, () => {
  console.log(`API server running on http://localhost:${PORT}`);
});

export default app;
