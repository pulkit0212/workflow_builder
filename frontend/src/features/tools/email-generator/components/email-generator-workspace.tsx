"use client";

import { useDeferredValue, useEffect, useState } from "react";
import {
  Check, CheckCircle2, Clipboard, Mail, RefreshCw, Search, Sparkles, Trash2, User, Wand2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { CopyButton } from "@/components/tools/copy-button";
import { LoadingSpinner } from "@/components/tools/loading-spinner";
import { cn } from "@/lib/utils";
import { fetchMeetingReports } from "@/features/meetings/api";
import { clientApiFetch } from "@/lib/api-client";

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
  "bg-[#6C3FF5]", "bg-[#2563eb]", "bg-[#059669]", "bg-[#d97706]", "bg-[#dc2626]",
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
      const res = await clientApiFetch("/api/tools/email-generator", {
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
        <div className="overflow-hidden rounded-xl border border-[#DADCE0] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
          <div className="border-b border-[#DADCE0] bg-[#F8F9FA] px-4 py-3">
            <p className="text-sm font-semibold text-[#202124]">Select Meeting Context</p>
            <p className="mt-0.5 text-xs text-[#5F6368]">Pick a recorded meeting to use as context</p>
          </div>
          <div className="p-3">
            <div className="relative mb-3">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#9AA0A6]" />
              <input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search meetings..."
                className="h-9 w-full rounded-lg border border-[#DADCE0] bg-[#F8F9FA] pl-8 pr-3 text-sm text-[#202124] outline-none transition focus:border-[#6C3FF5] focus:bg-white focus:ring-2 focus:ring-[#6C3FF5]/20 placeholder:text-[#9AA0A6]"
              />
            </div>
            {isLoadingMeetings ? (
              <div className="space-y-2">
                {[0, 1, 2, 3].map((i) => <div key={i} className="h-14 animate-pulse rounded-lg bg-[#F1F3F4]" />)}
              </div>
            ) : meetings.length === 0 ? (
              <div className="py-8 text-center">
                <Mail className="mx-auto h-8 w-8 text-[#DADCE0]" />
                <p className="mt-2 text-sm text-[#5F6368]">No meetings found</p>
              </div>
            ) : (
              <div className="max-h-[280px] space-y-1 overflow-y-auto pr-0.5">
                {meetings.map((meeting) => {
                  const selected = meeting.id === selectedMeetingId;
                  return (
                    <button key={meeting.id} type="button" onClick={() => handleSelectMeeting(meeting)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-all",
                        selected ? "border-[#6C3FF5] bg-[#EDE9FE]" : "border-transparent hover:border-[#DADCE0] hover:bg-[#F8F9FA]"
                      )}>
                      <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white", avatarColor(meeting.id))}>
                        {initials(meeting.title)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className={cn("truncate text-sm font-semibold", selected ? "text-[#6C3FF5]" : "text-[#202124]")}>{meeting.title}</p>
                        <p className="text-xs text-[#5F6368]">{formatMeetingDate(meeting.scheduledStartTime ?? meeting.createdAt)}</p>
                      </div>
                      {selected && <Check className="h-4 w-4 shrink-0 text-[#6C3FF5]" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Additional Notes */}
        <div className="overflow-hidden rounded-xl border border-[#DADCE0] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
          <div className="border-b border-[#DADCE0] bg-[#F8F9FA] px-4 py-3">
            <p className="text-sm font-semibold text-[#202124]">Additional Notes</p>
            <p className="mt-0.5 text-xs text-[#5F6368]">Auto-filled from selection, or type manually</p>
          </div>
          <div className="p-3">
            <textarea rows={5} value={context} onChange={(e) => setContext(e.target.value)}
              placeholder="Paste extra context or specific points to mention..."
              className="w-full resize-none rounded-lg border border-[#DADCE0] bg-[#F8F9FA] p-3 text-sm leading-6 text-[#202124] outline-none transition focus:border-[#6C3FF5] focus:bg-white focus:ring-2 focus:ring-[#6C3FF5]/20 placeholder:text-[#9AA0A6]" />
          </div>
        </div>

        {/* Email Type */}
        <div className="overflow-hidden rounded-xl border border-[#DADCE0] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
          <div className="border-b border-[#DADCE0] bg-[#F8F9FA] px-4 py-3">
            <p className="text-sm font-semibold text-[#202124]">Email Type</p>
          </div>
          <div className="grid grid-cols-2 gap-2 p-3">
            {emailTypes.map((option) => (
              <button key={option} type="button" onClick={() => setEmailType(option)}
                className={cn(
                  "flex items-center gap-2 rounded-lg border px-3 py-2.5 text-left transition-all",
                  emailType === option ? "border-[#6C3FF5] bg-[#EDE9FE] text-[#6C3FF5]" : "border-[#DADCE0] text-[#5F6368] hover:border-[#6C3FF5]/40 hover:bg-[#faf9ff]"
                )}>
                <span className="text-sm leading-none">{EMAIL_TYPE_ICONS[option]}</span>
                <span className="text-xs font-semibold">{option}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Tone & Recipients */}
        <div className="overflow-hidden rounded-xl border border-[#DADCE0] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
          <div className="border-b border-[#DADCE0] bg-[#F8F9FA] px-4 py-3">
            <p className="text-sm font-semibold text-[#202124]">Tone &amp; Recipients</p>
          </div>
          <div className="space-y-3 p-3">
            <div className="flex flex-wrap gap-1.5">
              {tones.map((option) => (
                <button key={option} type="button" onClick={() => setTone(option)}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-xs font-semibold transition-all",
                    tone === option ? "border-[#6C3FF5] bg-[#6C3FF5] text-white" : "border-[#DADCE0] text-[#5F6368] hover:border-[#6C3FF5]/40"
                  )}>
                  {option}
                </button>
              ))}
            </div>
            <div>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#5F6368]">Recipient Emails</p>
              <div className="relative">
                <User className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#9AA0A6]" />
                <input value={recipients} onChange={(e) => setRecipients(e.target.value)}
                  placeholder="Add recipients..."
                  className="h-9 w-full rounded-lg border border-[#DADCE0] bg-[#F8F9FA] pl-8 pr-3 text-sm text-[#202124] outline-none transition focus:border-[#6C3FF5] focus:bg-white focus:ring-2 focus:ring-[#6C3FF5]/20 placeholder:text-[#9AA0A6]" />
              </div>
            </div>
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-[#FCE8E6] bg-[#FCE8E6] px-4 py-3 text-sm text-[#C5221F]">{error}</div>
        )}

        <button type="button" disabled={!context.trim() || isGenerating} onClick={() => void handleGenerate()}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#6C3FF5] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#5B2FE0] disabled:opacity-50 shadow-sm">
          {isGenerating ? <><LoadingSpinner size="sm" /> Generating…</> : <><Wand2 className="h-4 w-4" /> Generate Email</>}
        </button>
      </div>

      {/* ── Right panel ── */}
      <div className="overflow-hidden rounded-xl border border-[#DADCE0] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
        {!generatedEmail ? (
          <div className="flex h-full min-h-[500px] flex-col items-center justify-center gap-4 p-8 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-[#DBEAFE]">
              <Sparkles className="h-8 w-8 text-[#2563EB]" />
            </div>
            <div>
              <p className="text-base font-bold text-[#202124]">Your email will appear here</p>
              <p className="mt-1 text-sm text-[#5F6368]">Select a meeting and click Generate Email</p>
            </div>
          </div>
        ) : (
          <div className="flex h-full flex-col">
            {/* Output header */}
            <div className="flex items-center justify-between border-b border-[#DADCE0] bg-[#F8F9FA] px-5 py-3.5">
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-[#EDE9FE] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#6C3FF5]">
                  EMAIL DRAFT: {emailType.toUpperCase()}
                </span>
                <span className="text-xs text-[#9AA0A6]">Generated just now</span>
              </div>
              <button type="button" onClick={() => void handleGenerate()} disabled={isGenerating || !context.trim()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#DADCE0] bg-white px-3 py-1.5 text-xs font-semibold text-[#5F6368] transition hover:bg-[#F8F9FA] disabled:opacity-50">
                <RefreshCw className={cn("h-3.5 w-3.5", isGenerating && "animate-spin")} /> Regenerate
              </button>
            </div>

            <div className="flex-1 space-y-5 overflow-y-auto p-5">
              {/* Subject */}
              <div className="space-y-1.5">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-[#5F6368]">Subject Line</p>
                <p className="text-base font-bold text-[#202124] leading-snug">{generatedEmail.subject}</p>
              </div>

              {/* Body */}
              <div className="space-y-1.5">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-[#5F6368]">Email Body</p>
                <div className="rounded-lg border border-[#DADCE0] bg-[#F8F9FA] p-4 text-sm leading-7 text-[#374151] whitespace-pre-wrap">
                  {generatedEmail.body}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between border-t border-[#DADCE0] bg-[#F8F9FA] px-5 py-3.5">
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => void copyText(combinedEmail, "full")}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-[#6C3FF5] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#5B2FE0]">
                  {copied === "full" ? <><CheckCircle2 className="h-4 w-4" /> Copied!</> : <><Clipboard className="h-4 w-4" /> Copy Full Email</>}
                </button>
                <button type="button" onClick={() => setGeneratedEmail(null)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-[#DADCE0] bg-white px-4 py-2 text-sm font-semibold text-[#5F6368] transition hover:bg-[#F8F9FA]">
                  <Trash2 className="h-4 w-4" /> Clear
                </button>
              </div>
              <span className="text-xs text-[#9AA0A6]">Powered by Artivaa Llama 3</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
