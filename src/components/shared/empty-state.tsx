import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";

type EmptyStateProps = {
  icon: LucideIcon;
  title: string;
  description: string;
};

export function EmptyState({ icon: Icon, title, description }: EmptyStateProps) {
  return (
    <Card className="flex min-h-72 flex-col items-center justify-center gap-4 border-dashed bg-white/60 p-8 text-center">
      <div className="rounded-2xl bg-sky-50 p-4 text-sky-600">
        <Icon className="h-8 w-8" />
      </div>
      <div className="space-y-2">
        <h3 className="text-xl font-semibold text-slate-950">{title}</h3>
        <p className="max-w-md text-sm leading-6 text-slate-600">{description}</p>
      </div>
    </Card>
  );
}
