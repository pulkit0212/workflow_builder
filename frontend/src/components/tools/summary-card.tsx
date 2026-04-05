import type { ReactNode } from "react";
import { ResultSection } from "@/components/tools/result-section";

type SummaryCardProps = {
  summary: string;
  actions?: ReactNode;
};

export function SummaryCard({ summary, actions }: SummaryCardProps) {
  return (
    <ResultSection
      title="Summary"
      description="Condensed overview of the meeting discussion."
      actions={actions}
    >
      <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 text-sm leading-7 text-slate-700">
        {summary}
      </div>
    </ResultSection>
  );
}
