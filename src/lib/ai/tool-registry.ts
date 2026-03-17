import type { Route } from "next";
import { Bot, FileText, ListTodo, Mail, type LucideIcon } from "lucide-react";
import { buildMeetingSummarizerPrompt } from "@/features/tools/meeting-summarizer/prompts/build-prompt";
import {
  meetingSummarizerInputSchema,
  meetingSummarizerOutputSchema
} from "@/features/tools/meeting-summarizer/schema";
import type { ToolPromptBuilder } from "@/lib/ai/tool-contracts";
import type { ZodTypeAny } from "zod";

export type ToolStatus = "available" | "coming-soon";

export type ToolDefinition = {
  slug: ToolSlug;
  name: string;
  description: string;
  status: ToolStatus;
  route: Route;
  icon: LucideIcon;
  marketingCopy: string;
  implemented: boolean;
  inputSchema?: ZodTypeAny;
  outputSchema?: ZodTypeAny;
  promptBuilder?: ToolPromptBuilder<any>;
};

export const toolSlugs = [
  "meeting-summarizer",
  "email-generator",
  "document-analyzer",
  "task-generator"
] as const;

export type ToolSlug = (typeof toolSlugs)[number];

export const toolRegistry: Record<ToolSlug, ToolDefinition> = {
  "meeting-summarizer": {
    slug: "meeting-summarizer",
    name: "Meeting Summarizer",
    description: "Turn raw conversations into structured summaries, key points, and next actions.",
    status: "available",
    route: "/dashboard/tools/meeting-summarizer",
    icon: Bot,
    marketingCopy: "Launch transcript-based meeting summaries with a reusable execution pipeline.",
    implemented: true,
    inputSchema: meetingSummarizerInputSchema,
    outputSchema: meetingSummarizerOutputSchema,
    promptBuilder: buildMeetingSummarizerPrompt
  },
  "email-generator": {
    slug: "email-generator",
    name: "Email Generator",
    description: "Draft outbound emails, replies, and follow-ups with shared prompt orchestration.",
    status: "coming-soon",
    route: "/dashboard/tools/email-generator",
    icon: Mail,
    marketingCopy: "Create polished emails from simple inputs without reinventing product structure.",
    implemented: false
  },
  "document-analyzer": {
    slug: "document-analyzer",
    name: "Document Analyzer",
    description: "Extract insights from uploaded files with support for reusable file and run history.",
    status: "coming-soon",
    route: "/dashboard/tools/document-analyzer",
    icon: FileText,
    marketingCopy: "Prepare for file analysis with the same run storage, usage logs, and UI shell.",
    implemented: false
  },
  "task-generator": {
    slug: "task-generator",
    name: "Task Generator",
    description: "Convert messy notes into action-ready task lists, owners, and deadlines.",
    status: "coming-soon",
    route: "/dashboard/tools/task-generator",
    icon: ListTodo,
    marketingCopy: "Expand into AI task planning using the same tool contract and dashboard patterns.",
    implemented: false
  }
};

export const allTools = toolSlugs.map((slug) => toolRegistry[slug]);

export const availableTools = allTools.filter((tool) => tool.status === "available");
