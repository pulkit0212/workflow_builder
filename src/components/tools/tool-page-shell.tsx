import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { SectionHeader } from "@/components/shared/section-header";
import { type ToolDefinition } from "@/lib/ai/tool-registry";

type ToolPageShellProps = {
  tool: ToolDefinition;
  children: ReactNode;
  aside?: ReactNode;
};

export function ToolPageShell({ tool, children, aside }: ToolPageShellProps) {
  return (
    <div className="space-y-8">
      <SectionHeader
        eyebrow="AI Tool"
        title={tool.name}
        description={tool.description}
        action={<Badge variant={tool.status === "available" ? "available" : "pending"}>{tool.status === "available" ? "Available" : "Coming Soon"}</Badge>}
      />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div>{children}</div>
        {aside ? <aside className="space-y-4">{aside}</aside> : null}
      </div>
    </div>
  );
}
