import type { ReactNode } from "react";
import { AlertTriangle, Sparkles, LoaderCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type ResultStateProps = {
  title: string;
  description: string;
  icon?: "empty" | "loading" | "error";
  children?: ReactNode;
  className?: string;
};

const iconMap = {
  empty: Sparkles,
  loading: LoaderCircle,
  error: AlertTriangle
} as const;

export function ResultState({
  title,
  description,
  icon = "empty",
  children,
  className
}: ResultStateProps) {
  const Icon = iconMap[icon];

  return (
    <Card className={cn("p-6", className)}>
      <div className="flex min-h-[220px] flex-col items-center justify-center gap-4 rounded-[1.4rem] border border-dashed border-slate-200 bg-slate-50/70 p-6 text-center">
        <div
          className={cn(
            "rounded-2xl p-4",
            icon === "error" && "bg-rose-100 text-rose-700",
            icon === "empty" && "bg-sky-100 text-sky-700",
            icon === "loading" && "bg-amber-100 text-amber-700"
          )}
        >
          <Icon className={cn("h-8 w-8", icon === "loading" && "animate-spin")} />
        </div>
        <div className="space-y-2">
          <h3 className="text-lg font-semibold text-slate-950">{title}</h3>
          <p className="max-w-sm text-sm leading-6 text-slate-600">{description}</p>
        </div>
        {children}
      </div>
    </Card>
  );
}
