import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { type ToolDefinition } from "@/lib/ai/tool-registry";

type ToolCardProps = {
  tool: ToolDefinition;
};

export function ToolCard({ tool }: ToolCardProps) {
  const Icon = tool.icon;
  const isAvailable = tool.status === "available";

  return (
    <Link
      href={tool.route}
      className="group relative flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:border-[#6c63ff]/50 hover:bg-[#faf9ff] hover:shadow-lg hover:shadow-[#6c63ff]/10 focus:outline-none focus:ring-2 focus:ring-[#6c63ff]/40"
    >
      {/* Top row — icon + status badge */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#eef2ff] to-[#dbeafe] text-indigo-600 transition-colors group-hover:from-[#ede9fe] group-hover:to-[#ddd6fe] group-hover:text-[#6c63ff]">
          <Icon className="h-5 w-5" />
        </div>
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${
          isAvailable
            ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
            : "bg-slate-100 text-slate-400 ring-slate-200"
        }`}>
          {isAvailable ? "Available" : "Coming Soon"}
        </span>
      </div>

      {/* Name + description */}
      <h3 className="mt-4 text-base font-bold text-slate-900">{tool.name}</h3>
      <p className="mt-1.5 flex-1 text-sm leading-relaxed text-slate-500">{tool.description}</p>

      {/* Footer — date placeholder + hover hint */}
      <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-3">
        <span className={`text-xs font-medium ${isAvailable ? "text-slate-400" : "text-slate-300"}`}>
          {isAvailable ? "AI powered" : "Planned"}
        </span>
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#6c63ff] opacity-0 transition-opacity group-hover:opacity-100">
          Open tool <ArrowRight className="h-3.5 w-3.5" />
        </span>
      </div>
    </Link>
  );
}
