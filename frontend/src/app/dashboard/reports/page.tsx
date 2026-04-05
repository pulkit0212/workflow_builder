import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ReportsList } from "@/features/meetings/components/reports-list";

export default function ReportsPage() {
  return (
    <ErrorBoundary>
      <ReportsList />
    </ErrorBoundary>
  );
}
