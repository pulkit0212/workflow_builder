import { Breadcrumbs } from "@/components/shared/breadcrumbs";
import { ToolPageShell } from "@/components/tools/tool-page-shell";
import { toolRegistry } from "@/lib/ai/tool-registry";
import { DocumentAnalyzerWorkspace } from "@/features/tools/document-analyzer/components/document-analyzer-workspace";

export default function DocumentAnalyzerPage() {
  return (
    <div className="space-y-4">
      <Breadcrumbs
        items={[
          { label: "Tools", href: "/dashboard/tools" },
          { label: "Document Analyzer" }
        ]}
      />
      <ToolPageShell tool={toolRegistry["document-analyzer"]}>
        <DocumentAnalyzerWorkspace />
      </ToolPageShell>
    </div>
  );
}
