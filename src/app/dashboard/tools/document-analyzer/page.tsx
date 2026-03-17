import { ToolPageShell } from "@/components/tools/tool-page-shell";
import { ComingSoonPanel } from "@/features/tools/shared/components/coming-soon-panel";
import { toolRegistry } from "@/lib/ai/tool-registry";

export default function DocumentAnalyzerPage() {
  return (
    <ToolPageShell tool={toolRegistry["document-analyzer"]}>
      <ComingSoonPanel
        title="Document Analyzer is coming soon"
        description="The uploaded_files and ai_runs schema are prepared so file-based workflows can be added without redesigning storage or dashboard navigation."
      />
    </ToolPageShell>
  );
}
