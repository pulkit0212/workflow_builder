import { ToolPageShell } from "@/components/tools/tool-page-shell";
import { ComingSoonPanel } from "@/features/tools/shared/components/coming-soon-panel";
import { toolRegistry } from "@/lib/ai/tool-registry";

export default function EmailGeneratorPage() {
  return (
    <ToolPageShell tool={toolRegistry["email-generator"]}>
      <ComingSoonPanel
        title="Email Generator is coming soon"
        description="The route, registry entry, and shared shell are already in place. Phase 2 can add prompts, templates, and run execution without changing the surrounding app architecture."
      />
    </ToolPageShell>
  );
}
