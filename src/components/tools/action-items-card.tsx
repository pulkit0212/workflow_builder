import type { MeetingActionItem } from "@/features/tools/meeting-summarizer/types";
import { ResultSection } from "@/components/tools/result-section";
import { Badge } from "@/components/ui/badge";

type ActionItemsCardProps = {
  items: MeetingActionItem[];
};

export function ActionItemsCard({ items }: ActionItemsCardProps) {
  return (
    <ResultSection title="Action Items" description="Follow-ups extracted from the transcript.">
      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 p-4 text-sm text-slate-500">
          No clear action items were identified in this transcript.
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item, index) => (
            <div key={`${item.task}-${index}`} className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <p className="text-sm font-medium leading-6 text-slate-900">{item.task}</p>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="neutral" className="normal-case tracking-normal">
                    Owner: {item.owner || "Unspecified"}
                  </Badge>
                  <Badge variant="pending" className="normal-case tracking-normal">
                    Due: {item.deadline || "Unspecified"}
                  </Badge>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </ResultSection>
  );
}
