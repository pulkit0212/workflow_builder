const calendarMeetingPrefix = "calendar__";

export function encodeCalendarMeetingId(id: string) {
  return `${calendarMeetingPrefix}${id}`;
}

export function isCalendarMeetingId(id: string) {
  return id.startsWith(calendarMeetingPrefix);
}

export function decodeCalendarMeetingId(id: string) {
  return isCalendarMeetingId(id) ? id.slice(calendarMeetingPrefix.length) : id;
}
