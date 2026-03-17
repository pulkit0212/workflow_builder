import { Clock3 } from "lucide-react";
import { Card } from "@/components/ui/card";

type ComingSoonPanelProps = {
  title: string;
  description: string;
};

export function ComingSoonPanel({ title, description }: ComingSoonPanelProps) {
  return (
    <Card className="flex min-h-[360px] flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="rounded-2xl bg-amber-100 p-4 text-amber-700">
        <Clock3 className="h-8 w-8" />
      </div>
      <div className="space-y-2">
        <h3 className="text-2xl font-semibold text-slate-950">{title}</h3>
        <p className="max-w-lg text-sm leading-6 text-slate-600">{description}</p>
      </div>
    </Card>
  );
}
