import { HistoryRunDetail } from "@/features/history/components/history-run-detail";

export default async function HistoryRunDetailPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return <HistoryRunDetail runId={id} />;
}
