import Link from "next/link";
import { ArrowRight, Bot, FileText, ListTodo, Mail } from "lucide-react";
import { type ToolDefinition } from "@/lib/ai/tool-registry";

// Tool-specific icon colors and backgrounds matching the Stitch design
const TOOL_STYLES: Record<string, { color: string; bg: string; icon: string }> = {
  "meeting-summarizer": { color: "#6C3FF5", bg: "#EDE9FE", icon: "mic" },
  "task-generator":     { color: "#059669", bg: "#D1FAE5", icon: "task_alt" },
  "document-analyzer":  { color: "#D97706", bg: "#FEF3C7", icon: "article" },
  "email-generator":    { color: "#2563EB", bg: "#DBEAFE", icon: "mail" },
};

type ToolCardProps = {
  tool: ToolDefinition;
  badge?: "POPULAR" | "NEW";
};

export function ToolCard({ tool, badge }: ToolCardProps) {
  const isAvailable = tool.status === "available";
  const style = TOOL_STYLES[tool.slug] ?? { color: "#6C3FF5", bg: "#EDE9FE", icon: "auto_awesome" };

  return (
    <Link
      href={tool.route}
      className="group relative flex flex-col rounded-xl border border-[#DADCE0] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.05)] transition-all hover:border-[#6C3FF5]/40 hover:shadow-md hover:shadow-[#6C3FF5]/10 focus:outline-none focus:ring-2 focus:ring-[#6C3FF5]/40"
    >
      {/* Badge */}
      {badge && (
        <span className={`absolute right-3 top-3 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
          badge === "POPULAR" ? "bg-[#EDE9FE] text-[#6C3FF5]" : "bg-[#FEF3C7] text-[#D97706]"
        }`}>
          {badge}
        </span>
      )}

      {/* Icon */}
      <div className="flex h-12 w-12 items-center justify-center rounded-xl"
        style={{ background: style.bg }}>
        <span className="material-symbols-outlined text-[24px]" style={{ color: style.color }}>{style.icon}</span>
      </div>

      {/* Name + description */}
      <h3 className="mt-4 text-[15px] font-bold text-[#202124]">{tool.name}</h3>
      <p className="mt-1.5 flex-1 text-sm leading-relaxed text-[#5F6368] line-clamp-2">{tool.description}</p>

      {/* Footer */}
      <div className="mt-4 flex items-center justify-between border-t border-[#F1F3F4] pt-3">
        {isAvailable ? (
          <span className="text-xs font-semibold text-[#6C3FF5] flex items-center gap-1">
            Open Tool <ArrowRight className="h-3.5 w-3.5" />
          </span>
        ) : (
          <span className="rounded-full bg-[#F1F3F4] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#5F6368]">
            Coming Soon
          </span>
        )}
      </div>
    </Link>
  );
}
