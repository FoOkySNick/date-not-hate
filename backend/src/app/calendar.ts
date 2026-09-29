export const buildCalendar = (date: { id: string; title: string; startsAt?: string | Date | null; eventDate?: string | null; isAllDay?: boolean; organizerComment?: string | null; sequence?: number }) => {
  const escapeText = (value: string) => value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
  if (date.isAllDay && date.eventDate) {
    const day = new Date(`${date.eventDate}T00:00:00Z`);
    const nextDay = new Date(day.getTime() + 24 * 60 * 60 * 1000);
    const dateStamp = (value: Date) => value.toISOString().slice(0, 10).replace(/-/g, '');
    const title = date.title.replace(/[\r\n]/g, ' ');
    const comment = date.organizerComment ? `DESCRIPTION:${escapeText(date.organizerComment)}\r\n` : '';
    return `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Date not Hate//RU\r\nBEGIN:VEVENT\r\nUID:${date.id}\r\nSEQUENCE:${date.sequence ?? 0}\r\nDTSTART;VALUE=DATE:${dateStamp(day)}\r\nDTEND;VALUE=DATE:${dateStamp(nextDay)}\r\nSUMMARY:${title}\r\n${comment}TRANSP:TRANSPARENT\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n`;
  }
  if (!date.startsAt) throw new Error('Date requires a start time or an all-day date.');
  const stamp = (value: Date) => value.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const startsAt = new Date(date.startsAt);
  const endsAt = new Date(startsAt.getTime() + 2 * 60 * 60 * 1000);
  const title = date.title.replace(/[\r\n]/g, ' ');
  const comment = date.organizerComment ? `DESCRIPTION:${escapeText(date.organizerComment)}\r\n` : '';
  return `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Date not Hate//RU\r\nBEGIN:VEVENT\r\nUID:${date.id}\r\nSEQUENCE:${date.sequence ?? 0}\r\nDTSTART:${stamp(startsAt)}\r\nDTEND:${stamp(endsAt)}\r\nSUMMARY:${title}\r\n${comment}END:VEVENT\r\nEND:VCALENDAR\r\n`;
};
