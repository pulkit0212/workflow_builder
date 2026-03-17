import { ToolPageShell } from "@/components/tools/tool-page-shell";
import { ComingSoonPanel } from "@/features/tools/shared/components/coming-soon-panel";
import { toolRegistry } from "@/lib/ai/tool-registry";

export default function TaskGeneratorPage() {
  return (
    <ToolPageShell tool={toolRegistry["task-generator"]}>
      <ComingSoonPanel
        title="Task Generator is coming soon"
        description="This tool will inherit the same route contracts, result shell, history model, and usage accounting as the rest of the platform."
      />
    </ToolPageShell>
  );
}
