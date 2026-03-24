import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { type ToolDefinition } from "@/lib/ai/tool-registry";

type ToolCardProps = {
  tool: ToolDefinition;
};

export function ToolCard({ tool }: ToolCardProps) {
  const Icon = tool.icon;
  const isAvailable = tool.status === "available";

  return (
    <Card className="flex h-full flex-col justify-between p-6">
      <div className="space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div className="rounded-2xl bg-[linear-gradient(145deg,#eef2ff,#dbeafe)] p-3 text-indigo-700">
            <Icon className="h-6 w-6" />
          </div>
          <Badge variant={isAvailable ? "available" : "pending"}>{isAvailable ? "Available" : "Coming Soon"}</Badge>
        </div>
        <div className="space-y-2">
          <h3 className="text-xl font-semibold text-slate-950">{tool.name}</h3>
          <p className="text-sm leading-6 text-slate-600">{tool.description}</p>
        </div>
      </div>
      <div className="pt-6">
        <Button asChild variant={isAvailable ? "default" : "secondary"} className="w-full justify-between">
          <Link href={tool.route}>
            {isAvailable ? "Open tool" : "View placeholder"}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </div>
    </Card>
  );
}
