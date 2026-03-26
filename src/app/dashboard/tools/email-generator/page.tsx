import { Breadcrumbs } from "@/components/shared/breadcrumbs";
import { ToolPageShell } from "@/components/tools/tool-page-shell";
import { toolRegistry } from "@/lib/ai/tool-registry";
import { EmailGeneratorWorkspace } from "@/features/tools/email-generator/components/email-generator-workspace";

export default function EmailGeneratorPage() {
  return (
    <div className="space-y-4">
      <Breadcrumbs
        items={[
          { label: "Tools", href: "/dashboard/tools" },
          { label: "Email Generator" }
        ]}
      />
      <ToolPageShell tool={toolRegistry["email-generator"]}>
        <EmailGeneratorWorkspace />
      </ToolPageShell>
    </div>
  );
}
