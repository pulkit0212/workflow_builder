import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ToolCard } from "@/components/tools/tool-card";
import { allTools } from "@/lib/ai/tool-registry";

export default function ToolsPage() {
  return (
    <ErrorBoundary>
      <div className="space-y-8">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-[#6c63ff]">Tools</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">AI Workflow Modules</h1>
          <p className="mt-1 text-sm text-slate-400">
            Modular tools that plug into a shared execution layer — pick one and get to work.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {allTools.map((tool) => (
            <ToolCard key={tool.slug} tool={tool} />
          ))}
        </div>
      </div>
    </ErrorBoundary>
  );
}
