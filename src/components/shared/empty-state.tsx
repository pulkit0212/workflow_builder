import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";

type EmptyStateProps = {
  icon: LucideIcon;
  title: string;
  description: string;
};

export function EmptyState({ icon: Icon, title, description }: EmptyStateProps) {
  return (
    <Card className="flex min-h-72 flex-col items-center justify-center gap-4 border-dashed border-[#d1d5db] p-8 text-center">
      <div className="rounded-full bg-[#f3f4f6] p-5 text-[#9ca3af]">
        <Icon className="h-10 w-10" />
      </div>
      <div className="space-y-2">
        <h3 className="text-[18px] font-semibold text-[#1f2937]">{title}</h3>
        <p className="max-w-md text-[14px] leading-6 text-[#4b5563]">{description}</p>
      </div>
    </Card>
  );
}
