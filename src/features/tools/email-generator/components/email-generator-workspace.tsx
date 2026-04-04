"use client";

import { useDeferredValue, useEffect, useState } from "react";
import { Check, Mail, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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

type GeneratedEmail = {
  subject: string;
  body: string;
};

const emailTypes = ["Follow-up", "Action Items", "Summary Update", "Thank You", "Next Steps", "Custom"] as const;
const tones = ["Professional", "Friendly", "Formal", "Concise"] as const;

function formatMeetingDate(value: string | null) {
  if (!value) {
    return "Unknown date";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Unknown date";
  }

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

function initials(value: string) {
  const parts = value.split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("") || "M";
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

  useEffect(() => {
    let isMounted = true;

    async function loadMeetings() {
      setIsLoadingMeetings(true);

      try {
        const payload = await fetchMeetingReports({
          page: 1,
          limit: 20,
          status: "completed",
          date: "all",
          search: ""
        });

        if (!isMounted) {
          return;
        }

        setMeetings(
          payload.meetings.map((meeting) => ({
            id: meeting.id,
            title: meeting.title,
            summary: meeting.summary,
            createdAt: meeting.createdAt,
            scheduledStartTime: meeting.scheduledStartTime
          }))
        );
      } catch (loadError) {
        if (isMounted) {
          setError(loadError instanceof Error ? loadError.message : "Failed to load meetings.");
        }
      } finally {
        if (isMounted) {
          setIsLoadingMeetings(false);
        }
      }
    }

    void loadMeetings();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function searchMeetings() {
      setIsLoadingMeetings(true);

      try {
        const payload = await fetchMeetingReports({
          page: 1,
          limit: 20,
          status: "completed",
          date: "all",
          search: deferredSearchTerm
        });

        if (!isMounted) {
          return;
        }

        setMeetings(
          payload.meetings.map((meeting) => ({
            id: meeting.id,
            title: meeting.title,
            summary: meeting.summary,
            createdAt: meeting.createdAt,
            scheduledStartTime: meeting.scheduledStartTime
          }))
        );
      } catch (loadError) {
        if (isMounted) {
          setError(loadError instanceof Error ? loadError.message : "Failed to load meetings.");
        }
      } finally {
        if (isMounted) {
          setIsLoadingMeetings(false);
        }
      }
    }

    void searchMeetings();

    return () => {
      isMounted = false;
    };
  }, [deferredSearchTerm]);

  async function handleGenerate() {
    if (!context.trim()) {
      setError("Meeting context is required.");
      return;
    }

    setIsGenerating(true);
    setError(null);

    try {
      const response = await fetch("/api/tools/email-generator", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          context,
          emailType,
          tone,
          recipients
        })
      });
      const payload = (await response.json()) as
        | {
            success: true;
            subject: string;
            body: string;
          }
        | {
            success: false;
            message?: string;
          };

      if (!response.ok || !("success" in payload) || payload.success !== true) {
        throw new Error("message" in payload ? payload.message || "Failed to generate email." : "Failed to generate email.");
      }

      setGeneratedEmail({
        subject: payload.subject,
        body: payload.body
      });
    } catch (generateError) {
      setError(generateError instanceof Error ? generateError.message : "Failed to generate email.");
    } finally {
      setIsGenerating(false);
    }
  }

  function handleSelectMeeting(meeting: MeetingOption) {
    setSelectedMeetingId(meeting.id);
    setContext((meeting.summary || meeting.title).trim());
  }

  function handleClearOutput() {
    setGeneratedEmail(null);
  }

  const combinedEmail = generatedEmail ? `${generatedEmail.subject}\n\n${generatedEmail.body}` : "";

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,4fr)_minmax(0,6fr)]">
      <Card className="p-5">
        <div className="space-y-6">
          <section className="space-y-4">
            <div className="space-y-1">
              <h3 className="text-lg font-semibold text-slate-950">Select a meeting</h3>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Search meetings..."
                  className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-900 outline-none transition focus:border-[#6c63ff] focus:ring-2 focus:ring-[#6c63ff]/20"
                />
              </div>
            </div>

            {isLoadingMeetings ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div key={index} className="h-16 animate-pulse rounded-2xl bg-slate-100" />
                ))}
              </div>
            ) : meetings.length === 0 ? (
              <EmptyState icon={Mail} title="No recorded meetings yet" description="Record a meeting first, then turn it into an email draft here." />
            ) : (
              <div className="max-h-[320px] space-y-2 overflow-y-auto pr-1">
                {meetings.map((meeting) => {
                  const selected = meeting.id === selectedMeetingId;

                  return (
                    <button
                      key={meeting.id}
                      type="button"
                      onClick={() => handleSelectMeeting(meeting)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-2xl border bg-white p-3 text-left transition",
                        selected
                          ? "border-[#6c63ff] bg-[#f5f3ff] shadow-sm"
                          : "border-slate-200 hover:border-[#c7c2ff] hover:bg-slate-50"
                      )}
                    >
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#6c63ff] text-sm font-semibold text-white">
                        {initials(meeting.title)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="truncate font-medium text-slate-950">{meeting.title}</p>
                          {selected ? <Check className="h-4 w-4 text-[#6c63ff]" /> : null}
                        </div>
                        <p className="text-sm text-slate-500">{formatMeetingDate(meeting.scheduledStartTime || meeting.createdAt)}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          <div className="text-center text-xs font-medium uppercase tracking-[0.24em] text-slate-400">Or type context manually</div>

          <section className="space-y-3">
            <label className="text-sm font-semibold text-slate-900">Meeting context</label>
            <textarea
              rows={4}
              value={context}
              onChange={(event) => setContext(event.target.value)}
              placeholder="Paste meeting notes, summary, or describe what the meeting was about..."
              className="w-full rounded-2xl border border-slate-200 bg-white p-4 text-sm leading-6 text-slate-900 outline-none transition focus:border-[#6c63ff] focus:ring-2 focus:ring-[#6c63ff]/20"
            />
          </section>

          <section className="space-y-4">
            <div className="space-y-2">
              <p className="text-sm font-semibold text-slate-900">Email type</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {emailTypes.map((option) => (
                  <Button
                    key={option}
                    type="button"
                    variant={emailType === option ? "default" : "outline"}
                    onClick={() => setEmailType(option)}
                    className="justify-center"
                  >
                    {option}
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-semibold text-slate-900">Tone</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {tones.map((option) => (
                  <Button
                    key={option}
                    type="button"
                    variant={tone === option ? "default" : "outline"}
                    onClick={() => setTone(option)}
                    className="justify-center"
                  >
                    {option}
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-900" htmlFor="email-recipients">
                To (optional)
              </label>
              <input
                id="email-recipients"
                value={recipients}
                onChange={(event) => setRecipients(event.target.value)}
                placeholder="e.g. client@company.com, John from sales"
                className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-[#6c63ff] focus:ring-2 focus:ring-[#6c63ff]/20"
              />
              <p className="text-xs text-slate-500">Helps personalize the email</p>
            </div>

            {error ? <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p> : null}

            <Button type="button" className="w-full" disabled={!context.trim() || isGenerating} onClick={() => void handleGenerate()}>
              {isGenerating ? (
                <>
                  <LoadingSpinner size="sm" />
                  Generating...
                </>
              ) : (
                "Generate Email →"
              )}
            </Button>
          </section>
        </div>
      </Card>

      <Card className="p-5">
        {!generatedEmail ? (
          <EmptyState
            icon={Mail}
            title="Your email will appear here"
            description="Select a meeting or type context, then click Generate"
          />
        ) : (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-lg font-semibold text-slate-950">Generated Email</h3>
              <Button type="button" variant="secondary" onClick={() => void handleGenerate()} disabled={isGenerating || !context.trim()}>
                {isGenerating ? <LoadingSpinner size="sm" /> : null}
                Regenerate ↺
              </Button>
            </div>

            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <label htmlFor="email-subject" className="text-sm font-semibold text-slate-900">
                  Subject
                </label>
                <CopyButton text={generatedEmail.subject} label="Copy Subject" />
              </div>
              <input
                id="email-subject"
                value={generatedEmail.subject}
                onChange={(event) => setGeneratedEmail((current) => (current ? { ...current, subject: event.target.value } : current))}
                className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-[#6c63ff] focus:ring-2 focus:ring-[#6c63ff]/20"
              />
            </div>

            <div className="border-t border-slate-200 pt-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <label htmlFor="email-body" className="text-sm font-semibold text-slate-900">
                  Email body
                </label>
              </div>
              <textarea
                id="email-body"
                value={generatedEmail.body}
                onChange={(event) => setGeneratedEmail((current) => (current ? { ...current, body: event.target.value } : current))}
                rows={16}
                className="mt-3 min-h-[300px] w-full rounded-2xl border border-slate-200 bg-white p-4 text-sm leading-7 text-slate-900 outline-none transition focus:border-[#6c63ff] focus:ring-2 focus:ring-[#6c63ff]/20"
                style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" }}
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={() => void navigator.clipboard.writeText(generatedEmail.body)}>
                Copy Email Body
              </Button>
              <Button type="button" variant="outline" onClick={() => void navigator.clipboard.writeText(combinedEmail)}>
                Copy Full Email
              </Button>
              <Button type="button" variant="ghost" onClick={handleClearOutput}>
                Clear
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
