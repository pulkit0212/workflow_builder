"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowRight, CheckCircle, ChevronDown, ChevronUp, Loader2, Zap } from "lucide-react";

const INTEGRATIONS_CONFIG = [
  {
    type: "slack",
    name: "Slack",
    description: "Post meeting summaries and action items to a Slack channel automatically.",
    icon: "💬",
    color: "#E01E5A",
    gradient: "from-pink-50 to-rose-50",
    accent: "#E01E5A",
    fields: [
      { key: "webhookUrl", label: "Webhook URL", placeholder: "https://hooks.slack.com/services/...", type: "text", required: true, help: "Create at api.slack.com/apps → Incoming Webhooks" }
    ],
    setupSteps: ["Go to api.slack.com/apps", "Create a new app → From scratch", "Add feature: Incoming Webhooks", "Add new webhook to workspace", "Select your channel", "Copy webhook URL and paste above"]
  },
  {
    type: "gmail",
    name: "Gmail",
    description: "Send meeting summary emails to participants after each meeting.",
    icon: "📧",
    color: "#EA4335",
    gradient: "from-red-50 to-orange-50",
    accent: "#EA4335",
    fields: [
      { key: "recipients", label: "Recipients", placeholder: "john@company.com, sarah@company.com", type: "text", required: true, help: "Comma-separated email addresses" }
    ],
    setupSteps: ["Enter recipient email addresses above", "Uses your connected Google account", "Emails are sent automatically after each meeting"]
  },
  {
    type: "notion",
    name: "Notion",
    description: "Create a Notion page for each meeting with summary, action items, and transcript.",
    icon: "📝",
    color: "#000000",
    gradient: "from-slate-50 to-gray-50",
    accent: "#374151",
    fields: [
      { key: "webhookUrl", label: "Webhook URL", placeholder: "https://hook.eu1.make.com/...", type: "text", required: true, help: "Create a webhook in Make.com, Zapier, or n8n that creates a Notion page" }
    ],
    setupSteps: [
      "Go to make.com and create a free account",
      "Create a new Scenario",
      "Add trigger: Webhooks → Custom webhook → Copy the URL",
      "Add action: Notion → Create a Database Item",
      "Connect your Notion account and select your database",
      "Map fields: title, summary, action_items, key_points from the webhook payload",
      "Paste the webhook URL above and save"
    ]
  },
  {
    type: "jira",
    name: "Jira",
    description: "Automatically create Jira tickets from meeting action items.",
    icon: "🎯",
    color: "#0052CC",
    gradient: "from-blue-50 to-indigo-50",
    accent: "#0052CC",
    fields: [
      { key: "webhookUrl", label: "Webhook URL", placeholder: "https://hook.eu1.make.com/...", type: "text", required: true, help: "Create a webhook in Make.com, Zapier, or n8n that creates Jira issues" }
    ],
    setupSteps: [
      "Go to make.com and create a free account",
      "Create a new Scenario",
      "Add trigger: Webhooks → Custom webhook → Copy the URL",
      "Add action: Jira → Create an Issue",
      "Connect your Jira account and select your project",
      "Map fields: action_items[].task, owner, due_date, priority from the webhook payload",
      "Paste the webhook URL above and save"
    ]
  }
] as const;

const CALENDAR_PROVIDERS_CONFIG = [
  {
    provider: "google" as const,
    name: "Google Calendar",
    description: "Sync your Google Calendar meetings",
    icon: "📅",
    gradient: "from-blue-50 to-cyan-50",
  },
  {
    provider: "microsoft_teams" as const,
    name: "Microsoft Teams",
    description: "Sync your Microsoft Teams meetings",
    icon: "🟦",
    gradient: "from-indigo-50 to-blue-50",
  },
  {
    provider: "microsoft_outlook" as const,
    name: "Outlook Calendar",
    description: "Sync your Outlook Calendar meetings",
    icon: "📨",
    gradient: "from-sky-50 to-blue-50",
  },
] as const;

type CalendarStatus = {
  google: boolean;
  microsoft_teams: boolean;
  microsoft_outlook: boolean;
};

type ToastState = { msg: string; type: "success" | "error" };

export default function IntegrationsPage() {
  const searchParams = useSearchParams();

  const [integrations, setIntegrations] = useState<Record<string, any>>({});
  const [configs, setConfigs] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);

  const [calendarStatus, setCalendarStatus] = useState<CalendarStatus>({
    google: false,
    microsoft_teams: false,
    microsoft_outlook: false,
  });
  const [calendarStatusLoading, setCalendarStatusLoading] = useState(true);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);

  function showToast(msg: string, type: ToastState["type"]) {
    setToast({ msg, type });
    window.setTimeout(() => setToast(null), 3500);
  }

  // Handle OAuth error query params on mount
  useEffect(() => {
    const error = searchParams.get("error");
    if (error === "oauth_cancelled") {
      showToast("Calendar connection was cancelled. You can try again anytime.", "error");
    } else if (error === "oauth_failed") {
      showToast("Calendar connection failed. Please try again or contact support.", "error");
    }
  }, [searchParams]);

  useEffect(() => { void fetchIntegrations(); }, []);
  useEffect(() => { void fetchCalendarStatus(); }, []);

  async function fetchCalendarStatus() {
    setCalendarStatusLoading(true);
    try {
      const res = await fetch("/api/calendar/status", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json() as CalendarStatus;
        setCalendarStatus(data);
      }
    } catch {
      // silently fail — calendar section will show disconnected state
    } finally {
      setCalendarStatusLoading(false);
    }
  }

  async function fetchIntegrations() {
    try {
      const res = await fetch("/api/integrations", { cache: "no-store" });
      const data = await res.json() as { integrations?: any[] };
      const iMap: Record<string, any> = {}, cMap: Record<string, any> = {};
      for (const i of data.integrations || []) { iMap[i.type] = i; cMap[i.type] = i.config || {}; }
      setIntegrations(iMap); setConfigs(cMap);
    } catch { showToast("Failed to load integrations", "error"); }
    finally { setLoading(false); }
  }

  async function saveIntegration(type: string, enabled: boolean) {
    setSaving(type);
    try {
      const res = await fetch("/api/integrations", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, enabled, config: configs[type] || {} })
      });
      const data = await res.json() as { success?: boolean; integration?: any; message?: string };
      if (res.ok && data.success) { setIntegrations(c => ({ ...c, [type]: data.integration })); showToast(`${type} saved!`, "success"); }
      else showToast(data.message || "Failed to save", "error");
    } catch { showToast("Failed to save", "error"); }
    finally { setSaving(null); }
  }

  async function testIntegration(type: string) {
    setTesting(type);
    try {
      const res = await fetch("/api/integrations/test", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, config: configs[type] || {} })
      });
      const data = await res.json() as { success?: boolean; message?: string };
      showToast(data.message || "Test completed", data.success ? "success" : "error");
    } catch { showToast("Test failed", "error"); }
    finally { setTesting(null); }
  }

  async function disconnectCalendar(provider: string) {
    setDisconnecting(provider);
    try {
      const res = await fetch(`/api/calendar/disconnect/${provider}`, { method: "POST" });
      if (res.ok) {
        showToast("Calendar disconnected successfully.", "success");
        await fetchCalendarStatus();
      } else {
        showToast("Failed to disconnect calendar. Please try again.", "error");
      }
    } catch {
      showToast("Failed to disconnect calendar. Please try again.", "error");
    } finally {
      setDisconnecting(null);
    }
  }

  function isConfigured(type: string) {
    const integration = INTEGRATIONS_CONFIG.find((i) => i.type === type);
    if (!integration) return true;
    const config = configs[type] || {};
    return integration.fields.filter((f) => f.required).every((f) => Boolean(config[f.key]?.trim?.() ?? config[f.key]));
  }

  function handleToggle(type: string, currentlyEnabled: boolean) {
    if (saving === type) return;
    if (!currentlyEnabled && !isConfigured(type)) {
      setExpanded(type);
      showToast(`Configure ${type} first, then enable it.`, "error");
      return;
    }
    void saveIntegration(type, !currentlyEnabled);
  }

  function updateConfig(type: string, key: string, value: string) {
    setConfigs(c => ({ ...c, [type]: { ...(c[type] || {}), [key]: value } }));
  }

  const activeCount = Object.values(integrations).filter((i: any) => i?.enabled).length;

  if (loading) return (
    <div className="flex items-center justify-center py-24">
      <Loader2 className="h-7 w-7 animate-spin text-[#6c63ff]" />
    </div>
  );

  return (
    <div className="space-y-8">

      {/* Toast */}
      {toast && (
        <div className={`fixed right-6 top-6 z-50 rounded-xl px-4 py-3 text-sm font-semibold text-white shadow-lg transition-all ${toast.type === "success" ? "bg-emerald-600" : "bg-red-600"}`}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-[#6c63ff]">Integrations</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">Connect Your Tools</h1>
          <p className="mt-1 text-sm text-slate-400">Automatically send meeting summaries and action items to your favorite tools.</p>
        </div>
        {activeCount > 0 && (
          <div className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700 ring-1 ring-emerald-200">
            <CheckCircle className="h-4 w-4" />
            {activeCount} active integration{activeCount !== 1 ? "s" : ""}
          </div>
        )}
      </div>

      {/* Calendar Connections section */}
      <div className="space-y-4">
        <div>
          <h2 className="text-base font-bold text-slate-900">Calendar Connections</h2>
          <p className="mt-0.5 text-sm text-slate-400">Connect your calendar to surface meetings in the app.</p>
        </div>

        {calendarStatusLoading ? (
          <div className="flex items-center gap-2 py-4 text-sm text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading calendar status…
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            {CALENDAR_PROVIDERS_CONFIG.map(({ provider, name, description, icon, gradient }) => {
              const isConnected = calendarStatus[provider];
              const isDisconnecting = disconnecting === provider;

              return (
                <div
                  key={provider}
                  className={`overflow-hidden rounded-2xl border bg-white shadow-sm transition-all ${
                    isConnected
                      ? "border-[#6c63ff]/30 shadow-[#6c63ff]/5"
                      : "border-slate-200 hover:border-slate-300 hover:shadow-md"
                  }`}
                >
                  {/* Card header */}
                  <div className={`bg-gradient-to-br ${gradient} px-5 py-4`}>
                    <div className="flex items-start gap-3">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white shadow-sm text-2xl shrink-0">
                        {icon}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-base font-bold text-slate-900">{name}</h3>
                          {isConnected && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                              Active
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 text-xs text-slate-500">{description}</p>
                      </div>
                    </div>
                  </div>

                  {/* Card footer with action button */}
                  <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3">
                    <p className="text-xs text-slate-400">
                      {isConnected ? "Calendar is synced and active" : "Not connected"}
                    </p>
                    {isConnected ? (
                      <button
                        type="button"
                        onClick={() => void disconnectCalendar(provider)}
                        disabled={isDisconnecting}
                        className="inline-flex items-center gap-1 rounded-xl border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 hover:border-red-300 transition-all disabled:opacity-50"
                      >
                        {isDisconnecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                        Disconnect
                      </button>
                    ) : (
                      <a
                        href={`/api/calendar/connect/${provider}`}
                        className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:border-[#6c63ff]/30 hover:bg-[#faf9ff] hover:text-[#6c63ff] transition-all"
                      >
                        <ArrowRight className="h-3.5 w-3.5" />
                        Connect
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Productivity Tools section */}
      <div className="space-y-4">
        <div>
          <h2 className="text-base font-bold text-slate-900">Productivity Tools</h2>
          <p className="mt-0.5 text-sm text-slate-400">Send meeting summaries and action items to your workflow tools.</p>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {INTEGRATIONS_CONFIG.map((integration) => {
            const saved = integrations[integration.type];
            const isEnabled = saved?.enabled || false;
            const isExpanded = expanded === integration.type;
            const config = configs[integration.type] || {};

            return (
              <div
                key={integration.type}
                className={`overflow-hidden rounded-2xl border bg-white shadow-sm transition-all ${
                  isEnabled
                    ? "border-[#6c63ff]/30 shadow-[#6c63ff]/5"
                    : "border-slate-200 hover:border-slate-300 hover:shadow-md"
                }`}
              >
                {/* Card header */}
                <div className={`bg-gradient-to-br ${integration.gradient} px-5 py-4`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white shadow-sm text-2xl">
                        {integration.icon}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-base font-bold text-slate-900">{integration.name}</h3>
                          {isEnabled && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                              Active
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 text-xs text-slate-500">{integration.description}</p>
                      </div>
                    </div>

                    {/* Toggle */}
                    <div className="flex flex-col items-end gap-1">
                      <button
                        type="button"
                        onClick={() => handleToggle(integration.type, isEnabled)}
                        disabled={saving === integration.type}
                        title={!isEnabled && !isConfigured(integration.type) ? "Configure first to enable" : undefined}
                        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-60 ${isEnabled ? "bg-[#6c63ff]" : isConfigured(integration.type) ? "bg-slate-200" : "bg-slate-100 cursor-not-allowed"}`}
                      >
                        {saving === integration.type
                          ? <Loader2 className="absolute inset-0 m-auto h-3.5 w-3.5 animate-spin text-white" />
                          : <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${isEnabled ? "left-[22px]" : "left-0.5"}`} />
                        }
                      </button>
                      {!isEnabled && !isConfigured(integration.type) && (
                        <span className="text-[10px] text-slate-400">Configure first</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Configure button */}
                <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3">
                  <p className="text-xs text-slate-400">
                    {isEnabled ? "Integration is active and running" : isConfigured(integration.type) ? "Toggle to enable this integration" : "Configure credentials to enable"}
                  </p>
                  <button
                    type="button"
                    onClick={() => setExpanded(isExpanded ? null : integration.type)}
                    className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:border-[#6c63ff]/30 hover:bg-[#faf9ff] hover:text-[#6c63ff] transition-all"
                  >
                    {isExpanded ? <><ChevronUp className="h-3.5 w-3.5" /> Close</> : <><ArrowRight className="h-3.5 w-3.5" /> Configure</>}
                  </button>
                </div>

                {/* Expanded config */}
                {isExpanded && (
                  <div className="border-t border-slate-100 px-5 pb-5 pt-4 space-y-4">
                    {/* Setup guide */}
                    <div className="rounded-xl bg-slate-50 p-4">
                      <p className="mb-2 text-xs font-bold uppercase tracking-widest text-slate-500">Setup Guide</p>
                      <ol className="space-y-1.5">
                        {integration.setupSteps.map((step, i) => (
                          <li key={i} className="flex gap-2 text-xs text-slate-600">
                            <span className="shrink-0 font-bold text-[#6c63ff]">{i + 1}.</span>
                            {step}
                          </li>
                        ))}
                      </ol>
                    </div>

                    {/* Fields */}
                    <div className="space-y-3">
                      {integration.fields.map((field) => (
                        <div key={field.key}>
                          <label className="mb-1 block text-xs font-semibold text-slate-700">
                            {field.label}{field.required && <span className="ml-0.5 text-red-500">*</span>}
                          </label>
                          <input
                            type={field.type}
                            placeholder={field.placeholder}
                            value={config[field.key] || ""}
                            onChange={(e) => updateConfig(integration.type, field.key, e.target.value)}
                            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#6c63ff]/40"
                          />
                          <p className="mt-1 text-xs text-slate-400">{field.help}</p>
                        </div>
                      ))}
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => void saveIntegration(integration.type, isEnabled)}
                        disabled={saving === integration.type}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-[#6c63ff] px-4 py-2 text-sm font-semibold text-white hover:bg-[#5b52e0] disabled:opacity-50 transition-colors"
                      >
                        {saving === integration.type ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                        Save Configuration
                      </button>
                      <button
                        type="button"
                        onClick={() => void testIntegration(integration.type)}
                        disabled={testing === integration.type}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors"
                      >
                        {testing === integration.type ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                        Test Connection
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* How it works */}
      <div className="rounded-2xl border border-[#6c63ff]/20 bg-gradient-to-br from-[#faf9ff] to-white p-6">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#6c63ff]/10">
            <Zap className="h-4 w-4 text-[#6c63ff]" />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-900">How it works</p>
            <p className="mt-1 text-sm text-slate-500">
              When a meeting recording completes, Artivaa automatically sends the summary and action items to all enabled integrations. No manual action needed.
            </p>
          </div>
        </div>
      </div>

    </div>
  );
}
