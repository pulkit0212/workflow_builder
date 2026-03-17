import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";

type ResultSectionProps = {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
};

export function ResultSection({ title, description, actions, children }: ResultSectionProps) {
  return (
    <Card className="p-5">
      <div className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h3 className="text-lg font-semibold text-slate-950">{title}</h3>
            {description ? <p className="text-sm text-slate-500">{description}</p> : null}
          </div>
          {actions ? <div>{actions}</div> : null}
        </div>
        <div>{children}</div>
      </div>
    </Card>
  );
}
