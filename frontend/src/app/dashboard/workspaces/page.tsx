import { ErrorBoundary } from "@/components/ErrorBoundary";
import { WorkspaceList } from "@/components/workspace/WorkspaceList";

export default function WorkspacesPage() {
  return (
    <ErrorBoundary>
      <WorkspaceList />
    </ErrorBoundary>
  );
}
