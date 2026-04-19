"use client";

import { useDeferredValue, useEffect, useState } from "react";
import {
  Check, CheckCircle2, Clipboard, Mail, RefreshCw, Search, Sparkles, User, Wand2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { CopyButton } from "@/components/tools/copy-button";
import { LoadingSpinner } from "@/components/tools/loading-spinner";
import { cn } from "@/lib/utils";
import { fetchMeetingReports } from "@/features/meetings/api";

type MeetingOption = {
  id: string;
  title: string;
  summary: string | null;
  createdAt: string;
  scheduledStartTime: string | null;
};

type GeneratedEmail = { subject: string; body: string };

const emailTypes = ["Follow-up", "Action Items", "Summary Update", "Thank You", "Next Steps", "Custom"] as const;
const tones = ["Professional", "Friendly", "Formal", "Concise"] as const;

const EMAIL_TYPE_ICONS: Record<string, string> = {
  "Follow-up": "↩",
  "Action Items": "✅",
  "Summary Update": "📋",
  "Thank You": "🙏",
  "Next Steps": "→",
  "Custom": "✏️",
};

function formatMeetingDate(value: string | null) {
  if (!value) return "Unknown date";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown date";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function initials(value: string) {
  const parts = value.split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("") || "M";
}

const AVATAR_COLORS = [
  "bg-[#6c63ff]", "bg-[#2563eb]", "bg-[#059669]", "bg-[#d97706]", "bg-[#dc2626]",
];

function avatarColor(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) & 0xffffffff;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export function EmailGeneratorWorkspace() {
  const [meetings, setMeetings] = useState<MeetingOption[]>([]);
  const [selectedMeetingId, setSelectedMeetingId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const deferredSearchTerm = useDeferredValue(searchTerm);
  const [context, setContext] = useState("");
  const [emailType, setEmailType] = useState<(typeof emailTypes)[number]>("Follow-up");
  const [tone, setTone] = useState<(typeof tones)[number]>("Professional");
  const [recipients, setRecipients] = useState("");
  const [generatedEmail, setGeneratedEmail] = useState<GeneratedEmail | null>(null);
  const [isLoadingMeetings, setIsLoadingMeetings] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<"subject" | "body" | "full" | null>(null);

  async function loadMeetings(search = "") {
    setIsLoadingMeetings(true);
    try {
      const payload = await fetchMeetingReports({ page: 1, limit: 20, status: "all", date: "all", search });
      setMeetings(payload.meetings.map((m) => ({
        id: m.id, title: m.title, summary: m.summary,
        createdAt: m.createdAt, scheduledStartTime: m.scheduledStartTime,
      })));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load meetings.");
    } finally {
      setIsLoadingMeetings(false);
    }
  }

  useEffect(() => { void loadMeetings(); }, []);
  useEffect(() => { void loadMeetings(deferredSearchTerm); }, [deferredSearchTerm]);

  async function handleGenerate() {
    if (!context.trim()) { setError("Meeting context is required."); return; }
    setIsGenerating(true); setError(null);
    try {
      const res = await fetch("/api/tools/email-generator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ context, emailType, tone, recipients }),
      });
      const payload = (await res.json()) as { success: true; subject: string; body: string } | { success: false; message?: string };
      if (!res.ok || !payload.success) throw new Error("message" in payload ? payload.message ?? "Failed." : "Failed.");
      setGeneratedEmail({ subject: payload.subject, body: payload.body });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate email.");
    } finally {
      setIsGenerating(false);
    }
  }

  function handleSelectMeeting(meeting: MeetingOption) {
    setSelectedMeetingId(meeting.id);
    setContext((meeting.summary || meeting.title).trim());
  }

  async function copyText(text: string, key: "subject" | "body" | "full") {
    await navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  }

  const combinedEmail = generatedEmail ? `Subject: ${generatedEmail.subject}\n\n${generatedEmail.body}` : "";

  return (
    <div className="grid gap-6 xl:grid-cols-[380px_minmax(0,1fr)]">

      {/* ── Left panel ── */}
      <div className="space-y-4">

        {/* Meeting selector */}
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 bg-slate-50/60 px-4 py-3">
            <p className="text-sm font-bold text-slate-900">Select a meeting</p>
            <p className="mt-0.5 text-xs text-slate-400">Pick a recorded meeting to use as context</p>
          </div>
          <div className="p-3">
            {/* Search */}
            <div className="relative mb-3">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search meetings..."
                className="h-9 w-full rounded-xl border border-slate-200 bg-slate-50 pl-8 pr-3 text-sm text-slate-900 outline-none transition focus:border-[#6c63ff] focus:bg-white focus:ring-2 focus:ring-[#6c63ff]/20"
              />
            </div>

            {isLoadingMeetings ? (
              <div className="space-y-2">
                {[0, 1, 2, 3].map((i) => <div key={i} className="h-14 animate-pulse rounded-xl bg-slate-100" />)}
              </div>
            ) : meetings.length === 0 ? (
              <div className="py-8 text-center">
                <Mail className="mx-auto h-8 w-8 text-slate-300" />
                <p className="mt-2 text-sm text-slate-500">No meetings found</p>
              </div>
            ) : (
              <div className="max-h-[280px] space-y-1.5 overflow-y-auto pr-0.5">
                {meetings.map((meeting) => {
                  const selected = meeting.id === selectedMeetingId;
                  return (
                    <button
                      key={meeting.id}
                      type="button"
                      onClick={() => handleSelectMeeting(meeting)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-all",
                        selected
                          ? "border-[#6c63ff] bg-[#f5f3ff] shadow-sm"
                          : "border-transparent hover:border-slate-200 hover:bg-slate-50"
                      )}
                    >
                      <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white", avatarColor(meeting.id))}>
                        {initials(meeting.title)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className={cn("truncate text-sm font-semibold", selected ? "text-[#6c63ff]" : "text-slate-900")}>
                          {meeting.title}
                        </p>
                        <p className="text-xs text-slate-400">{formatMeetingDate(meeting.scheduledStartTime ?? meeting.createdAt)}</p>
                      </div>
                      {selected && <Check className="h-4 w-4 shrink-0 text-[#6c63ff]" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Context */}
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 bg-slate-50/60 px-4 py-3">
            <p className="text-sm font-bold text-slate-900">Meeting context</p>
            <p className="mt-0.5 text-xs text-slate-400">Auto-filled from selection, or type manually</p>
          </div>
          <div className="p-3">
            <textarea
              rows={5}
              value={context}
              onChange={(e) => setContext(e.target.value)}
              placeholder="Paste meeting notes, summary, or describe what the meeting was about..."
              className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm leading-6 text-slate-900 outline-none transition focus:border-[#6c63ff] focus:bg-white focus:ring-2 focus:ring-[#6c63ff]/20"
            />
          </div>
        </div>

        {/* Email type */}
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 bg-slate-50/60 px-4 py-3">
            <p className="text-sm font-bold text-slate-900">Email type</p>
          </div>
          <div className="grid grid-cols-3 gap-1.5 p-3">
            {emailTypes.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setEmailType(option)}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-xl border px-2 py-2.5 text-center transition-all",
                  emailType === option
                    ? "border-[#6c63ff] bg-[#f5f3ff] text-[#6c63ff]"
                    : "border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                )}
              >
                <span className="text-base leading-none">{EMAIL_TYPE_ICONS[option]}</span>
                <span className="text-[11px] font-semibold leading-tight">{option}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Tone + Recipients */}
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 bg-slate-50/60 px-4 py-3">
            <p className="text-sm font-bold text-slate-900">Tone & Recipients</p>
          </div>
          <div className="space-y-3 p-3">
            <div className="grid grid-cols-4 gap-1.5">
              {tones.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setTone(option)}
                  className={cn(
                    "rounded-xl border px-2 py-2 text-center text-[11px] font-semibold transition-all",
                    tone === option
                      ? "border-[#6c63ff] bg-[#f5f3ff] text-[#6c63ff]"
                      : "border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                  )}
                >
                  {option}
                </button>
              ))}
            </div>
            <div className="relative">
              <User className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                value={recipients}
                onChange={(e) => setRecipients(e.target.value)}
                placeholder="Recipients (optional)"
                className="h-9 w-full rounded-xl border border-slate-200 bg-slate-50 pl-8 pr-3 text-sm text-slate-900 outline-none transition focus:border-[#6c63ff] focus:bg-white focus:ring-2 focus:ring-[#6c63ff]/20"
              />
            </div>
          </div>
        </div>

        {error && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
        )}

        <button
          type="button"
          disabled={!context.trim() || isGenerating}
          onClick={() => void handleGenerate()}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#6c63ff] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#5b52e0] disabled:opacity-50"
        >
          {isGenerating ? (
            <><LoadingSpinner size="sm" /> Generating…</>
          ) : (
            <><Wand2 className="h-4 w-4" /> Generate Email</>
          )}
        </button>
      </div>

      {/* ── Right panel ── */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {!generatedEmail ? (
          <div className="flex h-full min-h-[500px] flex-col items-center justify-center gap-4 p-8 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#f5f3ff]">
              <Sparkles className="h-8 w-8 text-[#6c63ff]" />
            </div>
            <div>
              <p className="text-base font-bold text-slate-900">Your email will appear here</p>
              <p className="mt-1 text-sm text-slate-400">Select a meeting and click Generate Email</p>
            </div>
          </div>
        ) : (
          <div className="flex h-full flex-col">
            {/* Output header */}
            <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/60 px-5 py-3.5">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#f5f3ff]">
                  <Mail className="h-3.5 w-3.5 text-[#6c63ff]" />
                </div>
                <p className="text-sm font-bold text-slate-900">Generated Email</p>
                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 ring-1 ring-emerald-200">
                  {emailType}
                </span>
              </div>
              <button
                type="button"
                onClick={() => void handleGenerate()}
                disabled={isGenerating || !context.trim()}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
              >
                <RefreshCw className={cn("h-3.5 w-3.5", isGenerating && "animate-spin")} />
                Regenerate
              </button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto p-5">
              {/* Subject */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label htmlFor="email-subject" className="text-xs font-semibold uppercase tracking-widest text-slate-400">Subject</label>
                  <button
                    type="button"
                    onClick={() => void copyText(generatedEmail.subject, "subject")}
                    className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
                  >
                    {copied === "subject" ? <><CheckCircle2 className="h-3 w-3 text-emerald-600" /> Copied</> : <><Clipboard className="h-3 w-3" /> Copy</>}
                  </button>
                </div>
                <input
                  id="email-subject"
                  value={generatedEmail.subject}
                  onChange={(e) => setGeneratedEmail((c) => c ? { ...c, subject: e.target.value } : c)}
                  className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-900 outline-none transition focus:border-[#6c63ff] focus:bg-white focus:ring-2 focus:ring-[#6c63ff]/20"
                />
              </div>

              {/* Body */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label htmlFor="email-body" className="text-xs font-semibold uppercase tracking-widest text-slate-400">Body</label>
                  <button
                    type="button"
                    onClick={() => void copyText(generatedEmail.body, "body")}
                    className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
                  >
                    {copied === "body" ? <><CheckCircle2 className="h-3 w-3 text-emerald-600" /> Copied</> : <><Clipboard className="h-3 w-3" /> Copy</>}
                  </button>
                </div>
                <textarea
                  id="email-body"
                  value={generatedEmail.body}
                  onChange={(e) => setGeneratedEmail((c) => c ? { ...c, body: e.target.value } : c)}
                  rows={18}
                  className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-7 text-slate-900 outline-none transition focus:border-[#6c63ff] focus:bg-white focus:ring-2 focus:ring-[#6c63ff]/20"
                />
              </div>
            </div>

            {/* Footer actions */}
            <div className="flex items-center gap-2 border-t border-slate-100 px-5 py-3.5">
              <button
                type="button"
                onClick={() => void copyText(combinedEmail, "full")}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#6c63ff] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#5b52e0]"
              >
                {copied === "full" ? <><CheckCircle2 className="h-4 w-4" /> Copied!</> : <><Clipboard className="h-4 w-4" /> Copy Full Email</>}
              </button>
              <button
                type="button"
                onClick={() => setGeneratedEmail(null)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
              >
                Clear
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
