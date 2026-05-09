import { ToolPageShell } from "@/components/tools/tool-page-shell";
import { toolRegistry } from "@/lib/ai/tool-registry";
import { DocumentAnalyzerWorkspace } from "@/features/tools/document-analyzer/components/document-analyzer-workspace";

export default function DocumentAnalyzerPage() {
  return (
    <ToolPageShell
      tool={toolRegistry["document-analyzer"]}
      ctaButton={
        <button
          form="document-analyzer-form"
          type="submit"
          className="inline-flex items-center gap-2 rounded-xl bg-[#6C3FF5] px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#5B2FE0] transition-colors"
        >
          <span className="material-symbols-outlined text-[18px]">auto_awesome</span>
          Run Analysis
        </button>
      }
    >
      <DocumentAnalyzerWorkspace />
    </ToolPageShell>
  );
}
