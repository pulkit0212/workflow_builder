"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowRight, ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { useApiFetch, useIsAuthReady } from "@/hooks/useApiFetch";
import {
  buildDefaultProductivityConfig,
  CALENDAR_PROVIDERS_FALLBACK,
  INTEGRATIONS_UI_FALLBACK,
  PROMO_FALLBACK,
  type IntegrationField,
  type PromoButton,
} from "@/features/integrations/catalog-fallback";

type ProductivityIntegrationRow = {
  type: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  bg: string;
  fields: IntegrationField[];
  setupSteps: string[];
};

type CalendarProviderRow = {
  provider: "google" | "microsoft_teams" | "microsoft_outlook";
  name: string;
  description: string;
  icon: string;
  color: string;
  bg: string;
};

type PromoRow = {
  slug: string;
  title: string;
  description: string;
  icon: string;
  color: string;
  bg: string;
  bannerStyle: "purple" | "white";
  buttons: PromoButton[];
};

type CatalogApiItem = {
  slug: string;
  category: string;
  integrationType: string | null;
  displayName: string;
  description: string;
  icon: string;
  colorHex: string;
  bgHex: string;
  sortOrder: number;
  uiConfig: unknown;
};

function parseProductivityFromCatalog(items: CatalogApiItem[]): ProductivityIntegrationRow[] {
  return items
    .filter((i) => i.category === "productivity" && i.integrationType)
    .map((i) => {
      const t = i.integrationType as string;
      const fb = INTEGRATIONS_UI_FALLBACK[t] ?? { fields: [] as IntegrationField[], setupSteps: [] as string[] };
      const ui = (i.uiConfig && typeof i.uiConfig === "object" ? i.uiConfig : {}) as {
        fields?: IntegrationField[];
        setupSteps?: string[];
      };
      return {
        type: t,
        name: i.displayName,
        description: i.description,
        icon: i.icon,
        color: i.colorHex,
        bg: i.bgHex,
        fields: Array.isArray(ui.fields) && ui.fields.length > 0 ? ui.fields : fb.fields,
        setupSteps: Array.isArray(ui.setupSteps) && ui.setupSteps.length > 0 ? ui.setupSteps : fb.setupSteps,
      };
    });
}

function parseCalendarFromCatalog(items: CatalogApiItem[]): CalendarProviderRow[] {
  return items
    .filter((i) => i.category === "calendar" && i.integrationType)
    .map((i) => ({
      provider: i.integrationType as CalendarProviderRow["provider"],
      name: i.displayName,
      description: i.description,
      icon: i.icon,
      color: i.colorHex,
      bg: i.bgHex,
    }));
}

function parsePromoFromCatalog(items: CatalogApiItem[]): PromoRow[] {
  return items
    .filter((i) => i.category === "promo")
    .map((i) => {
      const ui = (i.uiConfig && typeof i.uiConfig === "object" ? i.uiConfig : {}) as {
        bannerStyle?: string;
        buttons?: PromoButton[];
      };
      const bannerStyle = ui.bannerStyle === "white" ? "white" : "purple";
      const buttons = Array.isArray(ui.buttons) && ui.buttons.length > 0 ? ui.buttons : [];
      return {
        slug: i.slug,
        title: i.displayName,
        description: i.description,
        icon: i.icon,
        color: i.colorHex,
        bg: i.bgHex,
        bannerStyle,
        buttons,
      };
    });
}

type CalendarStatus = { google: boolean; microsoft_teams: boolean; microsoft_outlook: boolean };
type ToastState = { msg: string; type: "success" | "error" };

export default function IntegrationsPage() {
  const searchParams = useSearchParams();
  const apiFetch = useApiFetch();
  const isAuthReady = useIsAuthReady();

  const [calendarProviders, setCalendarProviders] = useState<CalendarProviderRow[]>(
    () => [...CALENDAR_PROVIDERS_FALLBACK]
  );
  const [productivityConfig, setProductivityConfig] = useState<ProductivityIntegrationRow[]>(() =>
    buildDefaultProductivityConfig()
  );
  const [promoRows, setPromoRows] = useState<PromoRow[]>(() =>
    PROMO_FALLBACK.map((p) => ({
      slug: p.slug,
      title: p.title,
      description: p.description,
      icon: p.icon,
      color: p.color,
      bg: p.bg,
      bannerStyle: p.bannerStyle,
      buttons: [...p.buttons],
    }))
  );
  const [catalogPlan, setCatalogPlan] = useState<string | null>(null);

  const [integrations, setIntegrations] = useState<Record<string, { type: string; enabled: boolean; config?: Record<string, string> }>>({});
  const [configs, setConfigs] = useState<Record<string, Record<string, string>>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [isGoogleConnected, setIsGoogleConnected] = useState(false);
  const [calendarStatus, setCalendarStatus] = useState<CalendarStatus>({ google: false, microsoft_teams: false, microsoft_outlook: false });
  const [calendarStatusLoading, setCalendarStatusLoading] = useState(true);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);

  const persistedRef = useRef(false);
  useEffect(() => {
    if (!isAuthReady || persistedRef.current) return;
    persistedRef.current = true;
    void (async () => {
      try {
        const sessionRes = await fetch("/api/auth/session");
        if (!sessionRes.ok) return;
        const session = await sessionRes.json() as { accessToken?: string; user?: { email?: string } };
        if (!session?.accessToken) return;
        await apiFetch("/api/google/integration", { method: "POST", body: JSON.stringify({ accessToken: session.accessToken, refreshToken: null, email: session.user?.email ?? null, scopes: "openid email profile https://www.googleapis.com/auth/calendar.readonly", expiresAt: null }) });
        void fetchCalendarStatus();
      } catch { /* non-critical */ }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthReady]);

  function showToast(msg: string, type: ToastState["type"]) {
    setToast({ msg, type });
    window.setTimeout(() => setToast(null), 3500);
  }

  useEffect(() => {
    const error = searchParams.get("error");
    const connected = searchParams.get("connected");
    if (error === "oauth_cancelled") showToast("Calendar connection was cancelled.", "error");
    else if (error === "oauth_failed") showToast("Calendar connection failed. Please try again.", "error");
    else if (connected) { showToast("Calendar connected successfully.", "success"); if (isAuthReady) void fetchCalendarStatus(); }
  }, [searchParams, isAuthReady]);

  useEffect(() => { if (isAuthReady) void fetchIntegrations(); }, [isAuthReady]);
  useEffect(() => { if (isAuthReady) void fetchCalendarStatus(); }, [isAuthReady]);
  useEffect(() => {
    if (!isAuthReady) return;
    void (async () => {
      try {
        const res = await apiFetch("/api/integrations/catalog", { cache: "no-store" });
        const data = (await res.json()) as {
          success?: boolean;
          plan?: string;
          items?: CatalogApiItem[];
        };
        if (!res.ok || !data.success || !Array.isArray(data.items)) {
          setCalendarProviders([...CALENDAR_PROVIDERS_FALLBACK]);
          setProductivityConfig(buildDefaultProductivityConfig());
          setPromoRows(
            PROMO_FALLBACK.map((p) => ({
              slug: p.slug,
              title: p.title,
              description: p.description,
              icon: p.icon,
              color: p.color,
              bg: p.bg,
              bannerStyle: p.bannerStyle,
              buttons: [...p.buttons],
            }))
          );
          setCatalogPlan(null);
          return;
        }
        setCatalogPlan(data.plan ?? null);
        const items = data.items;
        const cal = parseCalendarFromCatalog(items);
        const prod = parseProductivityFromCatalog(items);
        const promo = parsePromoFromCatalog(items);
        setCalendarProviders(cal);
        setProductivityConfig(prod);
        setPromoRows(promo);
      } catch {
        setCalendarProviders([...CALENDAR_PROVIDERS_FALLBACK]);
        setProductivityConfig(buildDefaultProductivityConfig());
        setPromoRows(
          PROMO_FALLBACK.map((p) => ({
            slug: p.slug,
            title: p.title,
            description: p.description,
            icon: p.icon,
            color: p.color,
            bg: p.bg,
            bannerStyle: p.bannerStyle,
            buttons: [...p.buttons],
          }))
        );
      }
    })();
  }, [isAuthReady, apiFetch]);

  async function fetchCalendarStatus() {
    setCalendarStatusLoading(true);
    try {
      const res = await apiFetch("/api/calendar/status", { cache: "no-store" });
      if (res.ok) { const data = await res.json() as { success: boolean; connections: CalendarStatus }; setCalendarStatus(data.connections); }
    } catch { /* silent */ } finally { setCalendarStatusLoading(false); }
  }

  async function fetchIntegrations() {
    try {
      const [intRes, googleRes] = await Promise.all([apiFetch("/api/integrations", { cache: "no-store" }), apiFetch("/api/google/integration", { cache: "no-store" })]);
      const data = await intRes.json() as Array<{ type: string; enabled: boolean; config?: Record<string, string> }>;
      const iMap: Record<string, { type: string; enabled: boolean; config?: Record<string, string> }> = {};
      const cMap: Record<string, Record<string, string>> = {};
      for (const i of Array.isArray(data) ? data : []) { iMap[i.type] = i; cMap[i.type] = i.config || {}; }
      setIntegrations(iMap); setConfigs(cMap);
      if (googleRes.ok) { const gData = await googleRes.json() as { integration?: { connected: boolean } }; setIsGoogleConnected(gData.integration?.connected ?? false); }
    } catch { showToast("Failed to load integrations", "error"); }
    finally { setLoading(false); }
  }

  async function saveIntegration(type: string, enabled: boolean) {
    setSaving(type);
    try {
      const res = await apiFetch("/api/integrations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type, enabled, config: configs[type] || {} }) });
      const data = await res.json() as { type?: string; enabled?: boolean; error?: string; message?: string };
      if (res.ok && data.type) { setIntegrations(c => ({ ...c, [type]: data as { type: string; enabled: boolean } })); showToast(`${type} saved!`, "success"); }
      else showToast(data.error || data.message || "Failed to save", "error");
    } catch { showToast("Failed to save", "error"); }
    finally { setSaving(null); }
  }

  async function testIntegration(type: string) {
    setTesting(type);
    try {
      const res = await apiFetch("/api/integrations/test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type, config: configs[type] || {} }) });
      const data = await res.json() as { success?: boolean; message?: string };
      showToast(data.message || "Test completed", data.success ? "success" : "error");
    } catch { showToast("Test failed", "error"); }
    finally { setTesting(null); }
  }

  async function connectCalendar(provider: string) {
    if (provider === "google") {
      const form = document.createElement("form"); form.method = "POST"; form.action = "/api/auth/signin/google";
      const csrfInput = document.createElement("input"); csrfInput.type = "hidden"; csrfInput.name = "csrfToken";
      try { const csrfRes = await fetch("/api/auth/csrf"); const { csrfToken } = await csrfRes.json() as { csrfToken: string }; csrfInput.value = csrfToken; } catch { csrfInput.value = ""; }
      const callbackInput = document.createElement("input"); callbackInput.type = "hidden"; callbackInput.name = "callbackUrl"; callbackInput.value = "/dashboard/integrations";
      form.appendChild(csrfInput); form.appendChild(callbackInput); document.body.appendChild(form); form.submit();
      return;
    }
    window.location.href = `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"}/api/calendar/connect/${provider}`;
  }

  async function disconnectCalendar(provider: string) {
    setDisconnecting(provider);
    try {
      const res = await apiFetch(`/api/calendar/disconnect/${provider}`, { method: "POST" });
      if (res.ok) { showToast("Calendar disconnected successfully.", "success"); await fetchCalendarStatus(); }
      else showToast("Failed to disconnect calendar.", "error");
    } catch { showToast("Failed to disconnect calendar.", "error"); }
    finally { setDisconnecting(null); }
  }

  function isConfigured(type: string) {
    const integration = productivityConfig.find((i) => i.type === type);
    if (!integration) return true;
    const config = configs[type] || {};
    return integration.fields.filter((f) => f.required).every((f) => Boolean((config[f.key] as string | undefined)?.trim?.() ?? config[f.key]));
  }

  function handleToggle(type: string, currentlyEnabled: boolean) {
    if (saving === type) return;
    if (!currentlyEnabled && !isConfigured(type)) { setExpanded(type); showToast(`Configure ${type} first, then enable it.`, "error"); return; }
    void saveIntegration(type, !currentlyEnabled);
  }

  function updateConfig(type: string, key: string, value: string) {
    setConfigs(c => ({ ...c, [type]: { ...(c[type] || {}), [key]: value } }));
  }

  if (loading) return (
    <div className="flex items-center justify-center py-24">
      <Loader2 className="h-7 w-7 animate-spin text-[#6C3FF5]" />
    </div>
  );

  return (
    <div className="space-y-8">
      {/* Toast */}
      {toast && (
        <div className={`fixed right-6 top-6 z-50 rounded-xl px-4 py-3 text-sm font-semibold text-white shadow-lg ${toast.type === "success" ? "bg-[#34A853]" : "bg-[#EA4335]"}`}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div>
        <h1 className="text-[22px] font-semibold text-[#202124]" style={{ fontFamily: "'Work Sans', sans-serif" }}>Integrations</h1>
        <p className="text-sm text-[#5F6368] mt-0.5">Connect your tools to automate meeting workflows</p>
        {catalogPlan && (
          <p className="text-xs text-[#9AA0A6] mt-1">Showing integrations included in your <span className="font-semibold text-[#5F6368]">{catalogPlan}</span> plan.</p>
        )}
      </div>

      {/* ── Calendar Connections ── */}
      {calendarProviders.length > 0 && (
      <section>
        <div className="flex items-center gap-2 mb-4">
          <span className="material-symbols-outlined text-[#6C3FF5] text-[20px]">calendar_month</span>
          <h2 className="text-base font-semibold text-[#202124]" style={{ fontFamily: "'Work Sans', sans-serif" }}>Calendar Connections</h2>
        </div>

        {calendarStatusLoading ? (
          <div className="flex items-center gap-2 py-4 text-sm text-[#5F6368]">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            {calendarProviders.map(({ provider, name, description, icon, color, bg }) => {
              const isConnected = calendarStatus[provider];
              const isDisc = disconnecting === provider;
              return (
                <div key={provider} className="rounded-xl border border-[#DADCE0] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.05)] hover:shadow-md transition-shadow">
                  <div className="flex justify-between items-start mb-4">
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center border border-[#DADCE0]" style={{ background: bg }}>
                      <span className="material-symbols-outlined text-[24px]" style={{ color }}>{icon}</span>
                    </div>
                    <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${isConnected ? "bg-[#E6F4EA] text-[#137333]" : "bg-[#F1F3F4] text-[#5F6368]"}`}>
                      {isConnected ? "Connected" : "Available"}
                    </span>
                  </div>
                  <h3 className="text-sm font-bold text-[#202124] mb-1">{name}</h3>
                  <p className="text-xs text-[#5F6368] mb-4 leading-relaxed">{description}</p>
                  {isConnected ? (
                    <button type="button" onClick={() => void disconnectCalendar(provider)} disabled={isDisc}
                      className="w-full py-2 border border-[#DADCE0] text-[#5F6368] text-sm font-semibold rounded-lg hover:bg-[#F8F9FA] transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                      {isDisc && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                      Manage Sync
                    </button>
                  ) : (
                    <button type="button" onClick={() => void connectCalendar(provider)}
                      className="w-full py-2 bg-[#6C3FF5] text-white text-sm font-semibold rounded-lg hover:bg-[#5B2FE0] transition-colors">
                      Connect
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
      )}

      {/* ── Productivity Tools ── */}
      {productivityConfig.length > 0 && (
      <section>
        <div className="flex items-center gap-2 mb-4">
          <span className="material-symbols-outlined text-[#6C3FF5] text-[20px]">bolt</span>
          <h2 className="text-base font-semibold text-[#202124]" style={{ fontFamily: "'Work Sans', sans-serif" }}>Productivity Tools</h2>
        </div>

        <div className="rounded-xl border border-[#DADCE0] bg-white overflow-hidden shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
          {/* Table header */}
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)_100px_100px] border-b border-[#DADCE0] bg-[#F8F9FA]">
            {["Application", "Description", "Status", "Action"].map((col, i) => (
              <div key={col} className={`px-6 py-3 text-[11px] font-semibold uppercase tracking-wider text-[#5F6368] ${i === 3 ? "text-right" : ""}`}>{col}</div>
            ))}
          </div>

          {/* Rows */}
          {productivityConfig.map((intg) => {
            const saved = integrations[intg.type];
            const isEnabled = saved?.enabled || false;
            const isExpanded = expanded === intg.type;
            const config = configs[intg.type] || {};

            return (
              <div key={intg.type}>
                <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)_100px_100px] items-center border-b border-[#F1F3F4] hover:bg-[#F8F9FA] transition-colors">
                  {/* App name */}
                  <div className="px-6 py-4 flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: intg.bg }}>
                      <span className="material-symbols-outlined text-[18px]" style={{ color: intg.color }}>{intg.icon}</span>
                    </div>
                    <span className="text-sm font-semibold text-[#202124]">{intg.name}</span>
                  </div>
                  {/* Description */}
                  <div className="px-6 py-4">
                    <span className="text-sm text-[#5F6368]">{intg.description}</span>
                  </div>
                  {/* Toggle */}
                  <div className="px-6 py-4">
                    <button type="button" onClick={() => handleToggle(intg.type, isEnabled)} disabled={saving === intg.type}
                      className={`relative h-6 w-11 rounded-full transition-colors disabled:opacity-60 ${isEnabled ? "bg-[#6C3FF5]" : "bg-[#DADCE0]"}`}>
                      {saving === intg.type
                        ? <Loader2 className="absolute inset-0 m-auto h-3.5 w-3.5 animate-spin text-white" />
                        : <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${isEnabled ? "left-[22px]" : "left-0.5"}`} />
                      }
                    </button>
                  </div>
                  {/* Configure */}
                  <div className="px-6 py-4 text-right">
                    <button type="button" onClick={() => setExpanded(isExpanded ? null : intg.type)}
                      className="inline-flex items-center gap-1 text-sm font-semibold text-[#6C3FF5] hover:underline">
                      Configure
                      {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                </div>

                {/* Expanded config panel */}
                {isExpanded && (
                  <div className="border-b border-[#DADCE0] bg-[#F8F9FA] px-6 py-5 space-y-4">
                    {/* Gmail Google account warning */}
                    {intg.type === "gmail" && !isGoogleConnected && (
                      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 flex items-start gap-3">
                        <span className="material-symbols-outlined text-amber-500 text-[20px]">warning</span>
                        <div>
                          <p className="text-sm font-semibold text-amber-800">Google account required</p>
                          <p className="text-xs text-amber-700 mt-0.5">Connect Google Calendar first to use Gmail integration.</p>
                          <button type="button" onClick={() => void connectCalendar("google")}
                            className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 transition-colors">
                            <ArrowRight className="h-3.5 w-3.5" /> Connect Google Account
                          </button>
                        </div>
                      </div>
                    )}
                    {intg.type === "gmail" && isGoogleConnected && (
                      <div className="rounded-xl border border-[#E6F4EA] bg-[#E6F4EA] px-4 py-3 flex items-center gap-2">
                        <span className="material-symbols-outlined text-[#34A853] text-[18px]">check_circle</span>
                        <p className="text-xs font-semibold text-[#137333]">Google account connected — emails will be sent from your account.</p>
                      </div>
                    )}

                    {/* Setup guide */}
                    <div className="rounded-xl border border-[#DADCE0] bg-white p-4">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-[#5F6368] mb-2">Setup Guide</p>
                      <ol className="space-y-1.5">
                        {intg.setupSteps.map((step, i) => (
                          <li key={i} className="flex gap-2 text-xs text-[#5F6368]">
                            <span className="shrink-0 font-bold text-[#6C3FF5]">{i + 1}.</span>
                            {step}
                          </li>
                        ))}
                      </ol>
                    </div>

                    {/* Fields */}
                    <div className="space-y-3">
                      {intg.fields.map((field) => (
                        <div key={field.key}>
                          <label className="mb-1 block text-xs font-semibold text-[#202124]">
                            {field.label}{field.required && <span className="ml-0.5 text-[#EA4335]">*</span>}
                          </label>
                          <input type={field.type} placeholder={field.placeholder} value={(config[field.key] as string) || ""}
                            onChange={(e) => updateConfig(intg.type, field.key, e.target.value)}
                            className="w-full rounded-lg border border-[#DADCE0] bg-white px-3 py-2 text-sm text-[#202124] placeholder:text-[#9AA0A6] focus:outline-none focus:ring-2 focus:ring-[#6C3FF5]/30" />
                          <p className="mt-1 text-xs text-[#9AA0A6]">{field.help}</p>
                        </div>
                      ))}
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2">
                      <button type="button" onClick={() => void saveIntegration(intg.type, isEnabled)} disabled={saving === intg.type}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-[#6C3FF5] px-4 py-2 text-sm font-semibold text-white hover:bg-[#5B2FE0] disabled:opacity-50 transition-colors">
                        {saving === intg.type && <Loader2 className="h-4 w-4 animate-spin" />}
                        Save Configuration
                      </button>
                      <button type="button" onClick={() => void testIntegration(intg.type)} disabled={testing === intg.type}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-[#DADCE0] bg-white px-4 py-2 text-sm font-semibold text-[#5F6368] hover:bg-[#F8F9FA] disabled:opacity-50 transition-colors">
                        {testing === intg.type && <Loader2 className="h-4 w-4 animate-spin" />}
                        Test Connection
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>
      )}

      {/* ── Bottom banners (promo) ── */}
      {promoRows.length > 0 && (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {promoRows.map((promo) =>
          promo.bannerStyle === "purple" ? (
            <div key={promo.slug} className="rounded-xl p-6 flex flex-col justify-between" style={{ background: "#6C3FF5" }}>
              <div className="flex items-start gap-3">
                <span className="material-symbols-outlined text-white text-[28px] shrink-0">{promo.icon}</span>
                <div>
                  <h4 className="text-base font-semibold text-white mb-2" style={{ fontFamily: "'Work Sans', sans-serif" }}>{promo.title}</h4>
                  <p className="text-sm text-white/80 mb-4 leading-relaxed">{promo.description}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-3">
                {promo.buttons.map((b, idx) =>
                  b.variant === "outline" ? (
                    <button key={idx} type="button" {...(b.href ? { onClick: () => window.open(b.href!, "_blank", "noopener,noreferrer") } : {})}
                      className="px-4 py-2 border border-white/20 text-white text-sm font-semibold rounded-lg hover:bg-white/10 transition-colors">
                      {b.label}
                    </button>
                  ) : (
                    <button key={idx} type="button" {...(b.href ? { onClick: () => window.open(b.href!, "_blank", "noopener,noreferrer") } : {})}
                      className="px-4 py-2 bg-white text-[#6C3FF5] text-sm font-semibold rounded-lg hover:bg-white/90 transition-colors">
                      {b.label}
                    </button>
                  )
                )}
              </div>
            </div>
          ) : (
            <div key={promo.slug} className="rounded-xl p-6 flex flex-col justify-between border border-[#DADCE0] bg-white">
              <div className="flex items-start gap-3">
                <span className="material-symbols-outlined text-[#137333] text-[28px] shrink-0">{promo.icon}</span>
                <div>
                  <h4 className="text-base font-semibold text-[#202124] mb-2" style={{ fontFamily: "'Work Sans', sans-serif" }}>{promo.title}</h4>
                  <p className="text-sm text-[#5F6368] mb-4 leading-relaxed">{promo.description}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-3">
                {promo.buttons.map((b, idx) => (
                  <button
                    key={idx}
                    type="button"
                    {...(b.href ? { onClick: () => window.open(b.href!, "_blank", "noopener,noreferrer") } : {})}
                    className={`w-fit px-4 py-2 text-sm font-semibold rounded-lg transition-colors ${
                      b.variant === "green"
                        ? "bg-[#E6F4EA] text-[#137333] hover:bg-[#D4EDDA]"
                        : "border border-[#DADCE0] text-[#5F6368] hover:bg-[#F8F9FA]"
                    }`}
                  >
                    {b.label}
                  </button>
                ))}
              </div>
            </div>
          )
        )}
      </div>
      )}
    </div>
  );
}
