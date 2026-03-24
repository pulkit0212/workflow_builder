import type { ReactNode } from "react";
import type { MeetingActionItem } from "@/features/tools/meeting-summarizer/types";
import { ResultSection } from "@/components/tools/result-section";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type ActionItemsCardProps = {
  items: MeetingActionItem[];
  actions?: ReactNode;
  onToggleItem?: (index: number, completed: boolean) => void;
  isUpdating?: boolean;
};

export function ActionItemsCard({ items, actions, onToggleItem, isUpdating = false }: ActionItemsCardProps) {
  return (
    <ResultSection title="Action Items" description="Follow-ups extracted from the transcript." actions={actions}>
      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 p-4 text-sm text-slate-500">
          No clear action items were identified in this transcript.
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item, index) => (
            <div key={`${item.task}-${index}`} className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex items-start gap-3">
                  {onToggleItem ? (
                    <input
                      type="checkbox"
                      checked={item.completed}
                      disabled={isUpdating}
                      onChange={(event) => onToggleItem(index, event.target.checked)}
                      className="mt-1 h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                    />
                  ) : null}
                  <div>
                    <p
                      className={cn(
                        "text-sm font-medium leading-6 text-slate-900 transition",
                        item.completed && "text-slate-500 line-through"
                      )}
                    >
                      {item.task}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="neutral" className="normal-case tracking-normal">
                    Owner: {item.owner || "Unspecified"}
                  </Badge>
                  <Badge variant={item.completed ? "available" : "pending"} className="normal-case tracking-normal">
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
