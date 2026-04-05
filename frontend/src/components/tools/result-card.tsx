import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";

type ResultCardProps = {
  title: string;
  description?: string;
  children?: ReactNode;
};

export function ResultCard({ title, description, children }: ResultCardProps) {
  return (
    <Card className="min-h-48 p-5">
      <div className="space-y-4">
        <div className="space-y-1">
          <h3 className="text-lg font-semibold text-slate-950">{title}</h3>
          {description ? <p className="text-sm text-slate-500">{description}</p> : null}
        </div>
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 p-4 text-sm leading-6 text-slate-500">
          {children ?? "Results will appear here once the workflow is connected in Phase 2."}
        </div>
      </div>
    </Card>
  );
}
