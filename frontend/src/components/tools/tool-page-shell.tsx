import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { type ToolDefinition } from "@/lib/ai/tool-registry";

// Tool-specific icon + color config
const TOOL_HEADER_STYLES: Record<string, { icon: string; color: string; bg: string }> = {
  "meeting-summarizer": { icon: "mic",      color: "#6C3FF5", bg: "#EDE9FE" },
  "task-generator":     { icon: "task_alt", color: "#059669", bg: "#D1FAE5" },
  "document-analyzer":  { icon: "article",  color: "#D97706", bg: "#FEF3C7" },
  "email-generator":    { icon: "mail",     color: "#2563EB", bg: "#DBEAFE" },
};

type ToolPageShellProps = {
  tool: ToolDefinition;
  children: ReactNode;
  /** Primary CTA button rendered top-right of the header */
  ctaButton?: ReactNode;
};

export function ToolPageShell({ tool, children, ctaButton }: ToolPageShellProps) {
  const style = TOOL_HEADER_STYLES[tool.slug] ?? { icon: "auto_awesome", color: "#6C3FF5", bg: "#EDE9FE" };

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm text-[#5F6368]">
        <Link href="/dashboard/tools" className="hover:text-[#6C3FF5] transition-colors font-medium">
          Tools
        </Link>
        <ChevronRight className="h-3.5 w-3.5 text-[#DADCE0]" />
        <span className="font-semibold text-[#6C3FF5]">{tool.name}</span>
      </nav>

      {/* Tool header — consistent across all tools */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          {/* Icon */}
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl"
            style={{ background: style.bg }}>
            <span className="material-symbols-outlined text-[26px]" style={{ color: style.color }}>
              {style.icon}
            </span>
          </div>
          {/* Title + description */}
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-[#202124]" style={{ fontFamily: "'Work Sans', sans-serif" }}>
                {tool.name}
              </h1>
              <span className="rounded-full bg-[#E6F4EA] px-2.5 py-0.5 text-[11px] font-bold text-[#137333]">
                {tool.status === "available" ? "Available" : "Coming Soon"}
              </span>
            </div>
            <p className="mt-0.5 text-sm text-[#5F6368] max-w-xl">{tool.description}</p>
          </div>
        </div>
        {/* CTA button slot */}
        {ctaButton && <div className="shrink-0">{ctaButton}</div>}
      </div>

      {/* Workspace content */}
      {children}
    </div>
  );
}
