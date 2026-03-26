import { Breadcrumbs } from "@/components/shared/breadcrumbs";
import { ToolPageShell } from "@/components/tools/tool-page-shell";
import { toolRegistry } from "@/lib/ai/tool-registry";
import { TaskGeneratorWorkspace } from "@/features/tools/task-generator/components/task-generator-workspace";

export default function TaskGeneratorPage() {
  return (
    <div className="space-y-4">
      <Breadcrumbs
        items={[
          { label: "Tools", href: "/dashboard/tools" },
          { label: "Task Generator" }
        ]}
      />
      <ToolPageShell tool={toolRegistry["task-generator"]}>
        <TaskGeneratorWorkspace />
      </ToolPageShell>
    </div>
  );
}
