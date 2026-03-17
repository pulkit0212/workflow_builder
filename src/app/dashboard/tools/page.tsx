import { SectionHeader } from "@/components/shared/section-header";
import { ToolCard } from "@/components/tools/tool-card";
import { allTools } from "@/lib/ai/tool-registry";

export default function ToolsPage() {
  return (
    <div className="space-y-8">
      <SectionHeader
        eyebrow="Tools"
        title="AI workflow modules"
        description="The product is structured around modular tools so future features can plug into a shared execution and billing layer."
      />
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
        {allTools.map((tool) => (
          <ToolCard key={tool.slug} tool={tool} />
        ))}
      </div>
    </div>
  );
}
