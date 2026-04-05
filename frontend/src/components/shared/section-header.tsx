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
        {eyebrow ? <p className="text-[12px] font-semibold uppercase tracking-[0.24em] text-[#6c63ff]">{eyebrow}</p> : null}
        <div className="space-y-1">
          <h2 className="text-[24px] font-bold tracking-tight text-[#111827]">{title}</h2>
          {description ? <p className="max-w-2xl text-[14px] leading-6 text-[#4b5563]">{description}</p> : null}
        </div>
      </div>
      {action ? <div>{action}</div> : null}
    </div>
  );
}
