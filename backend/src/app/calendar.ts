export const buildCalendar = (date: { id: string; title: string; startsAt?: string | Date | null; eventDate?: string | null; isAllDay?: boolean; organizerComment?: string | null; sequence?: number }, includePreparation = false) => {
  const escapeText = (value: string) => value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
  if (date.isAllDay && date.eventDate) {
    const day = new Date(`${date.eventDate}T00:00:00Z`);
    const nextDay = new Date(day.getTime() + 24 * 60 * 60 * 1000);
    const preparationDay = new Date(day.getTime() - 7 * 24 * 60 * 60 * 1000);
    const dateStamp = (value: Date) => value.toISOString().slice(0, 10).replace(/-/g, '');
    const title = date.title.replace(/[\r\n]/g, ' ');
    const preparation = includePreparation ? `BEGIN:VEVENT\r\nUID:${date.id}-preparation\r\nDTSTART;VALUE=DATE:${dateStamp(preparationDay)}\r\nDTEND;VALUE=DATE:${dateStamp(new Date(preparationDay.getTime() + 24 * 60 * 60 * 1000))}\r\nSUMMARY:Подготовить свидание\r\nDESCRIPTION:Пора с любовью подготовить «${title}».\r\nTRANSP:TRANSPARENT\r\nEND:VEVENT\r\n` : '';
    const comment = date.organizerComment ? `DESCRIPTION:${escapeText(date.organizerComment)}\r\n` : '';
    return `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Date not Hate//RU\r\n${preparation}BEGIN:VEVENT\r\nUID:${date.id}\r\nSEQUENCE:${date.sequence ?? 0}\r\nDTSTART;VALUE=DATE:${dateStamp(day)}\r\nDTEND;VALUE=DATE:${dateStamp(nextDay)}\r\nSUMMARY:${title}\r\n${comment}TRANSP:TRANSPARENT\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n`;
  }
  if (!date.startsAt) throw new Error('Date requires a start time or an all-day date.');
  const stamp = (value: Date) => value.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const startsAt = new Date(date.startsAt);
  const endsAt = new Date(startsAt.getTime() + 2 * 60 * 60 * 1000);
  const preparationAt = new Date(startsAt.getTime() - 7 * 24 * 60 * 60 * 1000);
  const title = date.title.replace(/[\r\n]/g, ' ');
  const preparation = includePreparation ? `BEGIN:VEVENT\r\nUID:${date.id}-preparation\r\nDTSTART:${stamp(preparationAt)}\r\nDTEND:${stamp(new Date(preparationAt.getTime() + 60 * 60 * 1000))}\r\nSUMMARY:Подготовить свидание\r\nDESCRIPTION:Пора с любовью подготовить «${title}».\r\nEND:VEVENT\r\n` : '';
  const comment = date.organizerComment ? `DESCRIPTION:${escapeText(date.organizerComment)}\r\n` : '';
  return `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Date not Hate//RU\r\n${preparation}BEGIN:VEVENT\r\nUID:${date.id}\r\nSEQUENCE:${date.sequence ?? 0}\r\nDTSTART:${stamp(startsAt)}\r\nDTEND:${stamp(endsAt)}\r\nSUMMARY:${title}\r\n${comment}END:VEVENT\r\nEND:VCALENDAR\r\n`;
};
