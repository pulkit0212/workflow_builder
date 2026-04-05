# Phased Implementation Plan — AI Meeting Assistant Platform

**Reference:** [RFC_AI_Meeting_Assistant_Platform.md](../RFC_AI_Meeting_Assistant_Platform.md) (repository root; moved under `backend/docs/` when you run `restructure-to-frontend.mjs`)  
**Purpose:** Executable, phase-by-phase roadmap to **complete** the platform with clear exit criteria, service scope, and dependencies.

---

## How to Use This Document

- Each **phase** has a **goal**, **duration (indicative)**, **deliverables**, **services/topics touched**, and **exit criteria** (definition of done).
- Phases are **sequential** unless marked *parallelizable* with prior phase.
- **MVP** is achieved at end of **Phase 1** (narrow vertical slice); **production-ready multi-feature** target is **Phase 6**.

---

## Phase 0 — Foundation & Developer Experience

**Duration:** 2–3 weeks  
**Goal:** Monorepo, local stack, CI, and skeleton services so all subsequent work is incremental.

### Deliverables

| Item | Detail |
|------|--------|
| **Turborepo 2.x** | `pnpm` workspace, `turbo.json` pipelines: `lint`, `test`, `build`, `docker`. |
| **Shared packages** | `packages/shared-types`, `packages/kafka-client`, `packages/logger` (Pino). |
| **Docker Compose** | PostgreSQL, Redis, Kafka (or Redpanda for dev), MongoDB, MinIO (optional S3). |
| **Skeleton apps** | NestJS + Fastify bootstraps: `api-gateway`, `auth-service`, `meeting-service`, `transcript-service`, `ai-orchestrator`, `integration-service`, `telephony-service`, `notification-service`, `realtime-collaboration-service`; FastAPI `ai-processing-py`. |
| **Prisma** | Per-service `schema.prisma` stubs + migrations strategy (single DB for dev vs schema-per-service). |
| **Health** | `/health/live`, `/health/ready` on each Nest app. |
| **CI** | GitHub Actions: install, lint, test, build on PR. |
| **Docs** | README: how to run compose, env vars template `.env.example`. |

### Exit criteria

- [ ] `turbo run build` succeeds for all packages/apps.  
- [ ] `docker compose up` brings up data stores; one service connects to PG + Redis + Kafka.  
- [ ] CI green on default branch.  
- [ ] RFC naming conventions for apps/packages followed.

---

## Phase 1 — MVP Vertical Slice: Live Transcript

**Duration:** 4–6 weeks  
**Goal:** User can authenticate, create a meeting, start a bot (stub or one platform), stream audio → STT → **persisted transcript** + **live WebSocket** to dashboard.

### Scope (minimal)

- **Auth Service:** Register/login (if product needs it) or admin-seeded users; JWT RS256; refresh rotation in Redis; `GET /auth/me`.  
- **Meeting Service:** CRUD meeting, participants (basic fields); `POST .../bot/start` → emits `bot.command.requested` / internal command.  
- **Integration Service:** **One** platform first (recommend **Zoom** per RFC ecosystem): bot session lifecycle stub **or** file-based audio injector for dev that publishes `meeting.audio.chunks` to Kafka.  
- **Python AI Processing:** Deepgram streaming path; consume `meeting.audio.chunks` → produce `transcript.segments`.  
- **Transcript Service:** Consume `transcript.segments`, idempotent write to **MongoDB**; `GET /meetings/:id/transcript`.  
- **Realtime Collaboration:** Consume `transcript.segments`, push `transcript.chunk` to Socket.io room; Redis adapter.  
- **API Gateway:** Proxy `/v1/auth/*`, `/v1/meetings/*`, `/v1/transcripts/*`; JWT validation.  

### Kafka topics (Phase 1)

- `meeting.audio.chunks`  
- `transcript.segments`  

### Explicitly out of scope

- Mention detection, AI speak, Twilio, summaries, notifications (beyond basic health).

### Exit criteria

- [ ] End-to-end demo: **dashboard** (or curl + ws client) shows **live transcript** for a test meeting.  
- [ ] Transcript persisted and pageable via REST.  
- [ ] Structured logs + request correlation id end-to-end.  
- [ ] Load test not required; latency target informative only.

---

## Phase 2 — Mentions & Threshold Engine

**Duration:** 3–4 weeks  
**Goal:** Detect participant names in transcript segments, maintain counts in Redis, emit threshold events, surface **mention.detected** on WebSocket.

### Deliverables

| Area | Work |
|------|------|
| **Meeting Service** | Participant fields: `watch_mentions`, `mention_threshold`, `absence_reason`; `GET .../mentions` read API (aggregate from PG or via orchestrator — pick one source of truth). |
| **AI Orchestrator** | `MentionNerService` (spaCy/LLM/transformers in Python sidecar **or** lightweight NER in Node — RFC allows orchestrator ownership); `MentionTrackerService` Redis `mention:count:*`; producers `mentions.raw`, `mentions.threshold`. |
| **Realtime** | Subscribe to new topics; emit `mention.detected` to clients. |
| **Kafka** | Topics: `mentions.raw`, `mentions.threshold`. |

### Exit criteria

- [ ] Given scripted transcript segments mentioning a tracked name, **threshold** fires at configured count.  
- [ ] Dashboard receives **mention** events over WebSocket.  
- [ ] Idempotent consumer handling for duplicate segments.

---

## Phase 3 — AI Speak in Meeting (LLM + TTS + Playback)

**Duration:** 5–6 weeks  
**Goal:** On threshold, generate script (Claude 3.5 / GPT-4o), synthesize audio (ElevenLabs + OpenAI TTS fallback), store on S3, **Integration** plays into meeting path.

### Deliverables

| Area | Work |
|------|------|
| **AI Orchestrator** | `AgentDecisionService`, `ScriptGeneratorService`, `TtsOrchestrationService`; persist `AiAction`; produce `ai.actions.queue`. |
| **Integration Service** | Consumer `ai.actions.queue`; download from S3; **inject/play** audio in platform pipeline (Zoom SDK path — highest engineering risk). |
| **Kafka** | Topic: `ai.actions.queue`. |
| **S3** | Presigned URLs; bucket policies. |

### Exit criteria

- [ ] Full path: threshold → spoken absence message **audible** in test meeting (or validated injection in simulator).  
- [ ] `ai_actions` rows auditable with status `pending` → `completed` / `failed`.  
- [ ] Failure paths: TTS fallback exercised once in automated or manual test.

---

## Phase 4 — Telephony (Twilio) & User Response Loop

**Duration:** 5–6 weeks  
**Goal:** Outbound call when AI decides user is needed; IVR (DTMF/voice); relay answer back via `ai.actions.queue` for in-meeting playback.

### Deliverables

| Area | Work |
|------|------|
| **AI Orchestrator** | Policy to emit `calls.trigger`; consume `calls.events`; map user speech to `speak_user_answer`. |
| **Telephony Service** | Twilio Node SDK 5.x; webhooks with **signature validation**; `CallLog` in PostgreSQL; TwiML gather/record; STT of callee audio (Deepgram/Whisper) inside telephony or callback to Python. |
| **Kafka** | Topics: `calls.trigger`, `calls.events`. |
| **Realtime** | `call.initiated`, `call.response_received` events. |
| **Ingress** | Separate host `hooks.*` for Twilio; IP allowlist optional. |

### Exit criteria

- [ ] Happy path: trigger → ring → DTMF “provide message” → transcript of message → relayed TTS in meeting.  
- [ ] No-answer path recorded and visible in `call_logs`.  
- [ ] Security checklist: Twilio signature, no open webhooks.

---

## Phase 5 — Post-Meeting Summary & Notifications

**Duration:** 4–5 weeks  
**Goal:** Meeting end → assemble transcript → LLM structured summary → persist → email/SMS/push; clients get `summary.ready`.

### Deliverables

| Area | Work |
|------|------|
| **Meeting / Integration** | Reliable `meeting.ended` producer (duration, end time). |
| **Python or Orchestrator** | Summary job: fetch transcript from Transcript Service; Claude/GPT-4o JSON schema; write `MeetingSummary` via Meeting Service API or direct DB per RFC ownership. |
| **Kafka** | Topics: `summaries.request`, `summaries.ready`, `notifications.outbound`. |
| **Notification Service** | SendGrid/email, Twilio SMS, Firebase push; templates; idempotent delivery records. |
| **Meeting Service** | `GET .../summary` returns full object. |
| **Realtime** | `meeting.ended`, `summary.ready`. |

### Exit criteria

- [ ] End-to-end: end meeting → summary in DB within SLA (e.g. &lt; 5 min for 1h meeting).  
- [ ] At least **two** channels verified (e.g. email + in-app WS).  
- [ ] Escalation SMS/email stub or full per product decision.

---

## Phase 6 — Production Readiness & Scale

**Duration:** 6–8 weeks (ongoing hardening)  
**Goal:** Observability, security hardening, Kubernetes, GitOps, autoscaling, multi-platform expansion, compliance hooks.

### Deliverables

| Pillar | Work |
|--------|------|
| **Observability** | OpenTelemetry traces, Prometheus metrics, Grafana dashboards; alerts on Kafka lag, error rate, STT latency. |
| **Security** | mTLS optional; secret rotation; RBAC enforcement; audit log for transcript access. |
| **K8s** | HPA, PDB, Ingress, cert-manager; resource limits per service. |
| **GitOps** | Argo CD apps; image promotion staging → prod. |
| **Data** | RDS Multi-AZ, Redis cluster, MongoDB sharding plan; backup/restore runbooks. |
| **Platforms** | Google Meet + Teams adapters (parallel tracks after Zoom stable). |
| **Load** | Soak test target: roadmap to 1k concurrent meetings (RFC G6). |

### Exit criteria

- [ ] SLO defined (e.g. 99.9% API availability) and measured.  
- [ ] Runbooks for incident + Kafka replay.  
- [ ] Pen-test or internal security review completed.  

---

## Cross-Cutting Work (Spread Across Phases)

| Workstream | When |
|------------|------|
| **DTOs + OpenAPI** | Phase 1 start; expand each phase. |
| **Dead-letter topics + idempotency** | Phase 2+ for all consumers. |
| **Rate limiting (gateway)** | Phase 1 basic; Phase 6 tuned. |
| **Batch STT (Whisper large-v3)** | Phase 2–3 (fallback/reconciliation). |
| **Recording to S3** | Phase 5–6 if required by compliance. |

---

## Dependency Graph (Simplified)

```
Phase 0 ──► Phase 1 (MVP transcript)
              │
              ▼
         Phase 2 (mentions)
              │
              ▼
         Phase 3 (AI + TTS playback)
              │
              ├──► Phase 4 (telephony) ──┐
              │                         │
              ▼                         ▼
         Phase 5 (summary + notify) ◄───┘
              │
              ▼
         Phase 6 (production)
```

Phase 4 can start **after** Phase 3 decision logic exists (even if minimal). Phase 5 can start once **Phase 1** transcript storage is stable; full value needs Phase 4 only if summaries must reference call outcomes.

---

## Summary Table

| Phase | Focus | Rough duration | MVP? |
|-------|--------|----------------|------|
| 0 | Monorepo, CI, compose, skeletons | 2–3 wk | No |
| 1 | Auth, meeting, audio→STT→transcript→WS | 4–6 wk | **Yes (live transcript)** |
| 2 | Mentions + threshold + WS alerts | 3–4 wk | No |
| 3 | LLM + TTS + play in meeting | 5–6 wk | No |
| 4 | Twilio IVR + relay | 5–6 wk | No |
| 5 | Summary + notifications | 4–5 wk | No |
| 6 | Prod, scale, multi-platform | 6–8 wk | No |

**Total (indicative):** ~29–38 weeks calendar time with a small team, assuming parallel work in Phase 6 and some overlap between 4/5.

---

## RFC Alignment Checklist

Use this before marking the **program** complete against the RFC:

- [ ] All 10 deployables from RFC §4 exist and are versioned.  
- [ ] Kafka topic catalog (RFC §10) implemented or consciously deferred with ADR.  
- [ ] PostgreSQL + MongoDB + Redis roles as in RFC §11–12.  
- [ ] WebSocket event catalog (RFC §9) implemented.  
- [ ] Error handling (RFC §20) and observability (RFC §21) in production.  
- [ ] Security (RFC §22–23) enforced at edge and webhooks.  

---

*Document version: 1.0 — April 5, 2026*
