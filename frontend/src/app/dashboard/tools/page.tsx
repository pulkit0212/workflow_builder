import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ToolCard } from "@/components/tools/tool-card";
import { allTools } from "@/lib/ai/tool-registry";

// Badge assignments for existing tools
const TOOL_BADGES: Record<string, "POPULAR" | "NEW"> = {
  "meeting-summarizer": "POPULAR",
  "document-analyzer": "NEW",
};

export default function ToolsPage() {
  return (
    <ErrorBoundary>
      <div className="space-y-8">
        {/* Page header */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-[#6C3FF5]">Tools</p>
          <h1 className="mt-1 text-[22px] font-bold text-[#202124]" style={{ fontFamily: "'Work Sans', sans-serif" }}>
            AI Workflow Modules
          </h1>
          <p className="mt-1 text-sm text-[#5F6368]">
            Modular tools that plug into a shared execution layer — pick one and get to work.
          </p>
        </div>

        {/* Core Modules */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-[#202124]" style={{ fontFamily: "'Work Sans', sans-serif" }}>
              Core Modules
            </h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {allTools.map((tool) => (
              <ToolCard key={tool.slug} tool={tool} badge={TOOL_BADGES[tool.slug]} />
            ))}

            {/* Request Module card */}
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[#6C3FF5]/30 bg-[#faf9ff] p-5 text-center min-h-[180px]">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#EDE9FE] mb-3">
                <span className="material-symbols-outlined text-[#6C3FF5] text-[22px]">add</span>
              </div>
              <p className="text-sm font-bold text-[#6C3FF5]">Request Module</p>
              <p className="mt-1 text-xs text-[#5F6368] leading-relaxed">
                Can&apos;t find what you need? Request a custom AI module built for your workflow.
              </p>
            </div>
          </div>
        </section>

        {/* Enterprise CTA banner */}
        <div className="rounded-xl bg-gradient-to-r from-[#6C3FF5] to-[#5B2FE0] p-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-base font-semibold text-white" style={{ fontFamily: "'Work Sans', sans-serif" }}>
              Need a custom enterprise solution?
            </h3>
            <p className="mt-1 text-sm text-white/80">
              Our team builds specialized models trained on your proprietary data for maximum precision.
            </p>
          </div>
          <a href="mailto:contactartivaa@gmail.com"
            className="shrink-0 inline-flex items-center gap-2 rounded-xl bg-white px-5 py-2.5 text-sm font-semibold text-[#6C3FF5] hover:bg-white/90 transition-colors">
            Talk to an Expert
          </a>
        </div>
      </div>
    </ErrorBoundary>
  );
}
