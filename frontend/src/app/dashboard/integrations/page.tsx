"use client";

import { useEffect, useState } from "react";
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
      { key: "apiToken", label: "API Token", placeholder: "secret_...", type: "password", required: true, help: "Get at notion.so/my-integrations" },
      { key: "databaseId", label: "Database ID", placeholder: "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx", type: "text", required: true, help: "From your Notion database URL" }
    ],
    setupSteps: ["Go to notion.so/my-integrations", "Create a new integration", "Copy the API token", "Open your Notion database", "Settings → Connections → Add integration", "Copy the database ID from the URL"]
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
      { key: "domain", label: "Jira Domain", placeholder: "yourcompany.atlassian.net", type: "text", required: true, help: "Your Atlassian domain" },
      { key: "email", label: "Email", placeholder: "you@company.com", type: "text", required: true, help: "Your Atlassian account email" },
      { key: "apiToken", label: "API Token", placeholder: "ATATT...", type: "password", required: true, help: "Create at id.atlassian.com/manage-profile/security/api-tokens" },
      { key: "projectKey", label: "Project Key", placeholder: "PROJ", type: "text", required: true, help: "Your Jira project key (e.g. DEV or PROJ)" }
    ],
    setupSteps: ["Go to id.atlassian.com → Security → API Tokens", "Create a new API token", "Fill in your domain, email, and token above", "Enter your Jira project key", "Action items will become Jira tasks automatically"]
  }
] as const;

type ToastState = { msg: string; type: "success" | "error" };

export default function IntegrationsPage() {
  const [integrations, setIntegrations] = useState<Record<string, any>>({});
  const [configs, setConfigs] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);

  function showToast(msg: string, type: ToastState["type"]) {
    setToast({ msg, type });
    window.setTimeout(() => setToast(null), 3500);
  }

  useEffect(() => { void fetchIntegrations(); }, []);

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

      {/* Integration cards grid */}
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
                  <button
                    type="button"
                    onClick={() => { if (saving !== integration.type) void saveIntegration(integration.type, !isEnabled); }}
                    disabled={saving === integration.type}
                    className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-60 ${isEnabled ? "bg-[#6c63ff]" : "bg-slate-200"}`}
                  >
                    {saving === integration.type
                      ? <Loader2 className="absolute inset-0 m-auto h-3.5 w-3.5 animate-spin text-white" />
                      : <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${isEnabled ? "left-[22px]" : "left-0.5"}`} />
                    }
                  </button>
                </div>
              </div>

              {/* Configure button */}
              <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3">
                <p className="text-xs text-slate-400">
                  {isEnabled ? "Integration is active and running" : "Toggle to enable this integration"}
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
