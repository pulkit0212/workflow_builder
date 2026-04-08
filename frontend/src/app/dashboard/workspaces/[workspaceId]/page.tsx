import { ErrorBoundary } from "@/components/ErrorBoundary";
import { WorkspaceDashboard } from "@/components/workspace/WorkspaceDashboard";

export default async function WorkspaceDashboardPage({
  params
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;

  return (
    <ErrorBoundary>
      <WorkspaceDashboard workspaceId={workspaceId} />
    </ErrorBoundary>
  );
}
