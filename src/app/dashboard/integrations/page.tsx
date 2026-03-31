"use client";

import { useEffect, useState } from "react";

const INTEGRATIONS_CONFIG = [
  {
    type: "slack",
    name: "Slack",
    description: "Post meeting summaries and action items to a Slack channel automatically.",
    icon: "💬",
    color: "#E01E5A",
    bg: "#fdf2f8",
    fields: [
      {
        key: "webhookUrl",
        label: "Webhook URL",
        placeholder: "https://hooks.slack.com/services/...",
        type: "text",
        required: true,
        help: "Create at api.slack.com/apps → Incoming Webhooks"
      }
    ],
    setupSteps: [
      "Go to api.slack.com/apps",
      "Create a new app → From scratch",
      "Add feature: Incoming Webhooks",
      "Add new webhook to workspace",
      "Select your channel",
      "Copy webhook URL and paste above"
    ]
  },
  {
    type: "gmail",
    name: "Gmail",
    description: "Send meeting summary emails to participants after each meeting.",
    icon: "📧",
    color: "#EA4335",
    bg: "#fef2f2",
    fields: [
      {
        key: "recipients",
        label: "Recipients",
        placeholder: "john@company.com, sarah@company.com",
        type: "text",
        required: true,
        help: "Comma-separated email addresses"
      }
    ],
    setupSteps: [
      "Enter recipient email addresses above",
      "Uses your connected Google account",
      "Emails are sent automatically after each meeting"
    ]
  },
  {
    type: "notion",
    name: "Notion",
    description: "Create a Notion page for each meeting with summary, action items, and transcript.",
    icon: "📝",
    color: "#000000",
    bg: "#f9fafb",
    fields: [
      {
        key: "apiToken",
        label: "API Token",
        placeholder: "secret_...",
        type: "password",
        required: true,
        help: "Get at notion.so/my-integrations"
      },
      {
        key: "databaseId",
        label: "Database ID",
        placeholder: "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
        type: "text",
        required: true,
        help: "From your Notion database URL"
      }
    ],
    setupSteps: [
      "Go to notion.so/my-integrations",
      "Create a new integration",
      "Copy the API token",
      "Open your Notion database",
      "Settings → Connections → Add integration",
      "Copy the database ID from the URL"
    ]
  },
  {
    type: "jira",
    name: "Jira",
    description: "Automatically create Jira tickets from meeting action items.",
    icon: "🎯",
    color: "#0052CC",
    bg: "#eff6ff",
    fields: [
      {
        key: "domain",
        label: "Jira Domain",
        placeholder: "yourcompany.atlassian.net",
        type: "text",
        required: true,
        help: "Your Atlassian domain"
      },
      {
        key: "email",
        label: "Email",
        placeholder: "you@company.com",
        type: "text",
        required: true,
        help: "Your Atlassian account email"
      },
      {
        key: "apiToken",
        label: "API Token",
        placeholder: "ATATT...",
        type: "password",
        required: true,
        help: "Create at id.atlassian.com/manage-profile/security/api-tokens"
      },
      {
        key: "projectKey",
        label: "Project Key",
        placeholder: "PROJ",
        type: "text",
        required: true,
        help: "Your Jira project key (for example DEV or PROJ)"
      }
    ],
    setupSteps: [
      "Go to id.atlassian.com → Security → API Tokens",
      "Create a new API token",
      "Fill in your domain, email, and token above",
      "Enter your Jira project key",
      "Action items will become Jira tasks automatically"
    ]
  }
] as const;

type ToastState = {
  msg: string;
  type: "success" | "error";
};

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
    window.setTimeout(() => setToast(null), 3000);
  }

  useEffect(() => {
    void fetchIntegrations();
  }, []);

  async function fetchIntegrations() {
    try {
      const response = await fetch("/api/integrations", { cache: "no-store" });
      const data = (await response.json()) as { integrations?: Array<any> };

      const integrationMap: Record<string, any> = {};
      const configMap: Record<string, any> = {};

      for (const integration of data.integrations || []) {
        integrationMap[integration.type] = integration;
        configMap[integration.type] = integration.config || {};
      }

      setIntegrations(integrationMap);
      setConfigs(configMap);
    } catch (error) {
      console.error("Failed to fetch integrations:", error);
      showToast("Failed to load integrations", "error");
    } finally {
      setLoading(false);
    }
  }

  async function saveIntegration(type: string, enabled: boolean) {
    setSaving(type);

    try {
      const response = await fetch("/api/integrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          enabled,
          config: configs[type] || {}
        })
      });

      const data = (await response.json()) as {
        success?: boolean;
        integration?: any;
        message?: string;
      };

      if (response.ok && data.success) {
        setIntegrations((current) => ({ ...current, [type]: data.integration }));
        showToast(`${type} integration saved!`, "success");
      } else {
        showToast(data.message || "Failed to save integration", "error");
      }
    } catch {
      showToast("Failed to save integration", "error");
    } finally {
      setSaving(null);
    }
  }

  async function testIntegration(type: string) {
    setTesting(type);

    try {
      const response = await fetch("/api/integrations/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          config: configs[type] || {}
        })
      });

      const data = (await response.json()) as {
        success?: boolean;
        message?: string;
      };

      showToast(data.message || "Test completed", data.success ? "success" : "error");
    } catch {
      showToast("Test failed", "error");
    } finally {
      setTesting(null);
    }
  }

  function updateConfig(type: string, key: string, value: string) {
    setConfigs((current) => ({
      ...current,
      [type]: { ...(current[type] || {}), [key]: value }
    }));
  }

  if (loading) {
    return (
      <div style={{ padding: "32px" }}>
        <div style={{ color: "#6b7280" }}>Loading integrations...</div>
      </div>
    );
  }

  return (
    <div style={{ padding: "32px", maxWidth: "900px" }}>
      {toast ? (
        <div
          style={{
            position: "fixed",
            top: "20px",
            right: "20px",
            background: toast.type === "success" ? "#16a34a" : "#dc2626",
            color: "white",
            padding: "12px 20px",
            borderRadius: "8px",
            fontSize: "14px",
            zIndex: 1000,
            boxShadow: "0 4px 12px rgba(0,0,0,0.15)"
          }}
        >
          {toast.msg}
        </div>
      ) : null}

      <div style={{ marginBottom: "32px" }}>
        <p
          style={{
            fontSize: "12px",
            fontWeight: 600,
            color: "#6c63ff",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            marginBottom: "4px"
          }}
        >
          INTEGRATIONS
        </p>
        <h1 style={{ fontSize: "24px", fontWeight: 700, color: "#111827", marginBottom: "8px" }}>
          Connect Your Tools
        </h1>
        <p style={{ color: "#6b7280", fontSize: "14px" }}>
          Automatically send meeting summaries and action items to your favorite tools.
        </p>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        {INTEGRATIONS_CONFIG.map((integration) => {
          const saved = integrations[integration.type];
          const isEnabled = saved?.enabled || false;
          const isExpanded = expanded === integration.type;
          const config = configs[integration.type] || {};

          return (
            <div
              key={integration.type}
              style={{
                background: "white",
                borderRadius: "12px",
                border: `1px solid ${isEnabled ? `${integration.color}40` : "#f3f4f6"}`,
                overflow: "hidden",
                boxShadow: "0 1px 3px rgba(0,0,0,0.06)"
              }}
            >
              <div
                style={{
                  padding: "20px 24px",
                  display: "flex",
                  alignItems: "center",
                  gap: "16px"
                }}
              >
                <div
                  style={{
                    width: "48px",
                    height: "48px",
                    background: integration.bg,
                    borderRadius: "12px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "24px"
                  }}
                >
                  {integration.icon}
                </div>

                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                    <h3 style={{ fontSize: "16px", fontWeight: 600, color: "#111827", margin: 0 }}>
                      {integration.name}
                    </h3>
                    {isEnabled ? (
                      <span
                        style={{
                          background: "#f0fdf4",
                          color: "#16a34a",
                          fontSize: "11px",
                          fontWeight: 600,
                          padding: "2px 8px",
                          borderRadius: "9999px"
                        }}
                      >
                        ✓ Active
                      </span>
                    ) : null}
                  </div>
                  <p style={{ fontSize: "13px", color: "#6b7280", margin: 0 }}>{integration.description}</p>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <button
                    onClick={() => setExpanded(isExpanded ? null : integration.type)}
                    style={{
                      padding: "6px 14px",
                      border: "1px solid #e5e7eb",
                      borderRadius: "8px",
                      background: "white",
                      color: "#374151",
                      fontSize: "13px",
                      cursor: "pointer"
                    }}
                  >
                    {isExpanded ? "Close" : "Configure"}
                  </button>

                  <div
                    onClick={() => {
                      if (saving !== integration.type) {
                        void saveIntegration(integration.type, !isEnabled);
                      }
                    }}
                    style={{
                      width: "44px",
                      height: "24px",
                      background: isEnabled ? "#6c63ff" : "#d1d5db",
                      borderRadius: "9999px",
                      cursor: saving === integration.type ? "wait" : "pointer",
                      position: "relative",
                      transition: "background 0.2s"
                    }}
                  >
                    <div
                      style={{
                        position: "absolute",
                        top: "2px",
                        left: isEnabled ? "22px" : "2px",
                        width: "20px",
                        height: "20px",
                        background: "white",
                        borderRadius: "50%",
                        transition: "left 0.2s",
                        boxShadow: "0 1px 3px rgba(0,0,0,0.2)"
                      }}
                    />
                  </div>
                </div>
              </div>

              {isExpanded ? (
                <div style={{ padding: "0 24px 24px", borderTop: "1px solid #f3f4f6" }}>
                  <div
                    style={{
                      background: "#f8fafc",
                      borderRadius: "8px",
                      padding: "16px",
                      marginBottom: "20px",
                      marginTop: "16px"
                    }}
                  >
                    <p style={{ fontSize: "12px", fontWeight: 600, color: "#374151", marginBottom: "8px" }}>
                      SETUP GUIDE
                    </p>
                    {integration.setupSteps.map((step, index) => (
                      <div
                        key={index}
                        style={{
                          display: "flex",
                          gap: "8px",
                          marginBottom: "6px",
                          fontSize: "13px",
                          color: "#4b5563"
                        }}
                      >
                        <span style={{ color: "#6c63ff", fontWeight: 600, minWidth: "20px" }}>{index + 1}.</span>
                        {step}
                      </div>
                    ))}
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: "16px", marginBottom: "16px" }}>
                    {integration.fields.map((field) => (
                      <div key={field.key}>
                        <label
                          style={{
                            display: "block",
                            fontSize: "13px",
                            fontWeight: 500,
                            color: "#374151",
                            marginBottom: "6px"
                          }}
                        >
                          {field.label}
                          {field.required ? <span style={{ color: "#dc2626" }}> *</span> : null}
                        </label>
                        <input
                          type={field.type}
                          placeholder={field.placeholder}
                          value={config[field.key] || ""}
                          onChange={(event) => updateConfig(integration.type, field.key, event.target.value)}
                          style={{
                            width: "100%",
                            padding: "10px 12px",
                            border: "1px solid #e5e7eb",
                            borderRadius: "8px",
                            fontSize: "13px",
                            outline: "none",
                            boxSizing: "border-box"
                          }}
                        />
                        <p style={{ fontSize: "12px", color: "#9ca3af", marginTop: "4px" }}>{field.help}</p>
                      </div>
                    ))}
                  </div>

                  <div style={{ display: "flex", gap: "8px" }}>
                    <button
                      onClick={() => void saveIntegration(integration.type, isEnabled)}
                      disabled={saving === integration.type}
                      style={{
                        background: "#6c63ff",
                        color: "white",
                        border: "none",
                        padding: "10px 20px",
                        borderRadius: "8px",
                        fontSize: "13px",
                        fontWeight: 500,
                        cursor: "pointer"
                      }}
                    >
                      {saving === integration.type ? "Saving..." : "Save Configuration"}
                    </button>
                    <button
                      onClick={() => void testIntegration(integration.type)}
                      disabled={testing === integration.type}
                      style={{
                        background: "white",
                        color: "#374151",
                        border: "1px solid #e5e7eb",
                        padding: "10px 20px",
                        borderRadius: "8px",
                        fontSize: "13px",
                        fontWeight: 500,
                        cursor: "pointer"
                      }}
                    >
                      {testing === integration.type ? "Testing..." : "Test Connection"}
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      <div
        style={{
          marginTop: "32px",
          padding: "16px 20px",
          background: "#f8fafc",
          borderRadius: "8px",
          fontSize: "13px",
          color: "#6b7280"
        }}
      >
        💡 <strong>How it works:</strong> When a meeting recording completes, Artiva automatically sends the summary
        and action items to all enabled integrations. No manual action needed.
      </div>
    </div>
  );
}
