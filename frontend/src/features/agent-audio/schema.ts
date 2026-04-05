import { z } from "zod";

export const supportedAgentPlatformSchema = z.enum(["google_meet", "zoom_web", "teams_web"]);

export const agentAudioStartSchema = z.object({
  platform: supportedAgentPlatformSchema,
  meetingUrl: z.string().trim().url(),
  meetingTitle: z.string().trim().max(500).nullable().optional(),
  meetingSessionId: z.string().uuid().optional(),
  startedAt: z.string().datetime(),
  mimeType: z.string().trim().min(1).max(100)
});

export const agentAudioChunkFormSchema = z.object({
  sessionId: z.string().trim().min(1).max(120),
  sequence: z.coerce.number().int().min(1).max(1_000_000),
  platform: supportedAgentPlatformSchema,
  meetingUrl: z.string().trim().url(),
  mimeType: z.string().trim().min(1).max(100),
  chunkStartedAt: z.string().datetime()
});

export const agentAudioStopSchema = z.object({
  sessionId: z.string().trim().min(1).max(120),
  endedAt: z.string().datetime()
});

export type SupportedAgentPlatform = z.infer<typeof supportedAgentPlatformSchema>;
export type AgentAudioStartInput = z.infer<typeof agentAudioStartSchema>;
export type AgentAudioChunkFormInput = z.infer<typeof agentAudioChunkFormSchema>;
export type AgentAudioStopInput = z.infer<typeof agentAudioStopSchema>;
