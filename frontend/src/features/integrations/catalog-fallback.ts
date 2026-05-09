/**
 * Used when GET /api/integrations/catalog fails or DB table is not migrated yet.
 */
export type IntegrationField = {
  key: string;
  label: string;
  placeholder: string;
  type: string;
  required: boolean;
  help: string;
};

export const INTEGRATIONS_UI_FALLBACK: Record<
  string,
  { fields: IntegrationField[]; setupSteps: string[] }
> = {
  slack: {
    fields: [
      {
        key: "webhookUrl",
        label: "Webhook URL",
        placeholder: "https://hooks.slack.com/services/...",
        type: "text",
        required: true,
        help: "Create at api.slack.com/apps → Incoming Webhooks",
      },
    ],
    setupSteps: [
      "Go to api.slack.com/apps",
      "Create a new app → From scratch",
      "Add feature: Incoming Webhooks",
      "Add new webhook to workspace",
      "Select your channel",
      "Copy webhook URL and paste above",
    ],
  },
  gmail: {
    fields: [
      {
        key: "recipients",
        label: "Recipients",
        placeholder: "john@company.com, sarah@company.com",
        type: "text",
        required: true,
        help: "Comma-separated email addresses",
      },
    ],
    setupSteps: [
      "Enter recipient email addresses above",
      "Uses your connected Google account",
      "Emails are sent automatically after each meeting",
    ],
  },
  notion: {
    fields: [
      {
        key: "webhookUrl",
        label: "Webhook URL",
        placeholder: "https://hook.eu1.make.com/...",
        type: "text",
        required: true,
        help: "Create a webhook in Make.com or Zapier that creates a Notion page",
      },
    ],
    setupSteps: [
      "Go to make.com and create a free account",
      "Create a new Scenario",
      "Add trigger: Webhooks → Custom webhook → Copy the URL",
      "Add action: Notion → Create a Database Item",
      "Paste the webhook URL above and save",
    ],
  },
  jira: {
    fields: [
      {
        key: "webhookUrl",
        label: "Webhook URL",
        placeholder: "https://hook.eu1.make.com/...",
        type: "text",
        required: true,
        help: "Create a webhook in Make.com or Zapier that creates Jira issues",
      },
    ],
    setupSteps: [
      "Go to make.com and create a free account",
      "Create a new Scenario",
      "Add trigger: Webhooks → Custom webhook → Copy the URL",
      "Add action: Jira → Create an Issue",
      "Paste the webhook URL above and save",
    ],
  },
};

export const CALENDAR_PROVIDERS_FALLBACK = [
  {
    provider: "google" as const,
    name: "Google Calendar",
    description: "Sync all your scheduled meetings and events automatically.",
    icon: "calendar_month",
    color: "#4285F4",
    bg: "#E8F0FE",
  },
  {
    provider: "microsoft_teams" as const,
    name: "Microsoft Teams",
    description: "Connect your enterprise calendar and video conferencing.",
    icon: "groups",
    color: "#6264A7",
    bg: "#EDE9FE",
  },
  {
    provider: "microsoft_outlook" as const,
    name: "Outlook",
    description: "Manage professional schedules via Exchange servers.",
    icon: "inbox",
    color: "#0078D4",
    bg: "#E3F2FD",
  },
] as const;

export type PromoButton = { label: string; variant?: string; href: string | null };

/** Display meta when API catalog is unavailable */
export const PRODUCTIVITY_META_FALLBACK = [
  { type: "slack", name: "Slack", description: "Push meeting summaries and action items to channels.", icon: "chat", color: "#E01E5A", bg: "#FFF0F3" },
  { type: "gmail", name: "Gmail", description: "Automated follow-up emails for all participants.", icon: "mail", color: "#EA4335", bg: "#FEF2F2" },
  { type: "notion", name: "Notion", description: "Export meeting transcripts to shared team wikis.", icon: "article", color: "#000000", bg: "#F8F8F8" },
  { type: "jira", name: "Jira", description: "Convert meeting decisions directly into Jira issues.", icon: "bug_report", color: "#0052CC", bg: "#EFF6FF" },
] as const;

export function buildDefaultProductivityConfig(): Array<{
  type: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  bg: string;
  fields: IntegrationField[];
  setupSteps: string[];
}> {
  return PRODUCTIVITY_META_FALLBACK.map((m) => {
    const ui = INTEGRATIONS_UI_FALLBACK[m.type] ?? { fields: [], setupSteps: [] };
    return { ...m, fields: ui.fields, setupSteps: ui.setupSteps };
  });
}

export const PROMO_FALLBACK: Array<{
  slug: string;
  title: string;
  description: string;
  icon: string;
  color: string;
  bg: string;
  bannerStyle: "purple" | "white";
  buttons: PromoButton[];
}> = [
  {
    slug: "custom_webhooks",
    title: "Custom Webhooks",
    description:
      "Build your own integrations by connecting Artivaa AI to your internal server endpoints.",
    icon: "webhook",
    color: "#FFFFFF",
    bg: "#6C3FF5",
    bannerStyle: "purple",
    buttons: [
      { label: "Create Webhook", variant: "solid", href: null },
      { label: "Developer Docs", variant: "outline", href: null },
    ],
  },
  {
    slug: "zapier",
    title: "Zapier Automations",
    description: "Connect to over 5,000+ apps without writing a single line of code.",
    icon: "bolt",
    color: "#137333",
    bg: "#FFFFFF",
    bannerStyle: "white",
    buttons: [{ label: "Open Zapier Store", variant: "green", href: "https://zapier.com/apps" }],
  },
];
