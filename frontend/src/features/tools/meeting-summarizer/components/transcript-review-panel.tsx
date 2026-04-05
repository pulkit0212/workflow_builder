"use client";

import { AlertTriangle, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type TranscriptReviewPanelProps = {
  value: string;
  onChange: (value: string) => void;
  onSummarize: () => void;
  onRetranscribe: () => void;
  onDiscard: () => void;
  disabled?: boolean;
  error?: string | null;
  helperText?: string;
  isSummarizing?: boolean;
};

export function TranscriptReviewPanel({
  value,
  onChange,
  onSummarize,
  onRetranscribe,
  onDiscard,
  disabled = false,
  error = null,
  helperText,
  isSummarizing = false
}: TranscriptReviewPanelProps) {
  return (
    <Card className="p-5">
      <div className="space-y-5">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-950">
            <FileText className="h-4 w-4 text-sky-600" />
            Review transcript
          </div>
          <p className="text-sm leading-6 text-slate-600">
            Make any quick corrections before generating the final summary.
          </p>
        </div>

        <textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          rows={12}
          disabled={disabled}
          placeholder="Your transcript will appear here after transcription."
          className="w-full rounded-[1.75rem] border border-slate-200 bg-slate-50/80 px-5 py-4 text-sm leading-7 text-slate-900 outline-none placeholder:text-slate-400 focus:border-sky-300 disabled:cursor-not-allowed disabled:opacity-80"
        />

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">Transcript review</p>
            <p className="text-sm text-slate-500">{helperText || "Preserve speaker names, decisions, and action items where possible."}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" variant="ghost" onClick={onRetranscribe} disabled={disabled}>
              Transcribe Again
            </Button>
            <Button type="button" variant="ghost" onClick={onDiscard} disabled={disabled}>
              Discard Recording
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={onSummarize}
              disabled={disabled}
              className="min-w-[14rem] whitespace-nowrap px-5"
            >
              {isSummarizing ? "Generating Summary..." : "Summarize Transcript"}
            </Button>
          </div>
        </div>

        {error ? (
          <div className="flex items-center gap-2 text-sm text-rose-600">
            <AlertTriangle className="h-4 w-4" />
            {error}
          </div>
        ) : null}
      </div>
    </Card>
  );
}
