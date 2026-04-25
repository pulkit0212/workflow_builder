import { MeetingDetail } from "@/features/meetings/components/meeting-detail";
import { CalendarEventDetail } from "@/features/meetings/components/meeting-detail";
import { isCalendarMeetingId } from "@/features/meetings/ids";

export default async function MeetingDetailPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  if (isCalendarMeetingId(id)) {
    return <CalendarEventDetail encodedId={id} />;
  }

  return <MeetingDetail meetingId={id} />;
}
