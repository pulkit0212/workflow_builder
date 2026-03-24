import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type SectionHeaderProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
};

export function SectionHeader({ eyebrow, title, description, action, className }: SectionHeaderProps) {
  return (
    <div className={cn("flex flex-col gap-4 md:flex-row md:items-end md:justify-between", className)}>
      <div className="space-y-2">
        {eyebrow ? <p className="text-xs font-semibold uppercase tracking-[0.24em] text-indigo-600">{eyebrow}</p> : null}
        <div className="space-y-1">
          <h2 className="text-2xl font-semibold tracking-tight text-slate-950 md:text-3xl">{title}</h2>
          {description ? <p className="max-w-2xl text-sm leading-6 text-slate-600 md:text-base">{description}</p> : null}
        </div>
      </div>
      {action ? <div>{action}</div> : null}
    </div>
  );
}
