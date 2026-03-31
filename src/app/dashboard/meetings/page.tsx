import { ErrorBoundary } from "@/components/ErrorBoundary";
import { MeetingsList } from "@/features/meetings/components/meetings-list";

export default function MeetingsPage() {
  return (
    <ErrorBoundary>
      <MeetingsList />
    </ErrorBoundary>
  );
}
