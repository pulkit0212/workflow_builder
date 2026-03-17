"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { meetingAiProviderOptions } from "@/features/tools/meeting-summarizer/config";
import { meetingSummarizerInputSchema } from "@/features/tools/meeting-summarizer/schema";
import type { MeetingSummarizerInput } from "@/features/tools/meeting-summarizer/types";

export function MeetingSummarizerForm() {
  const form = useForm<MeetingSummarizerInput>({
    resolver: zodResolver(meetingSummarizerInputSchema),
    defaultValues: {
      provider: "gemini",
      transcript: ""
    }
  });

  return (
    <Card className="p-6">
      <form className="space-y-5">
        <div className="space-y-2">
          <label htmlFor="provider" className="text-sm font-medium text-slate-900">
            Provider
          </label>
          <select
            id="provider"
            className="w-full rounded-3xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm text-slate-900 outline-none focus:border-sky-300"
            {...form.register("provider")}
          >
            {meetingAiProviderOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <label htmlFor="transcript" className="text-sm font-medium text-slate-900">
            Meeting transcript
          </label>
          <textarea
            id="transcript"
            rows={14}
            placeholder="Paste meeting transcript here."
            className="w-full rounded-3xl border border-slate-200 bg-slate-50/80 px-4 py-4 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-sky-300"
            {...form.register("transcript")}
          />
          {form.formState.errors.transcript ? (
            <p className="text-sm text-rose-600">{form.formState.errors.transcript.message}</p>
          ) : null}
        </div>
        <div className="flex justify-end">
          <Button type="button" size="lg">
            Generate Summary
          </Button>
        </div>
      </form>
    </Card>
  );
}

export default MeetingSummarizerForm;
