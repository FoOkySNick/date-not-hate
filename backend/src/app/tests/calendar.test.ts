import { describe, expect, it } from 'vitest';
import { buildCalendar } from '../calendar.js';

describe('buildCalendar', () => {
  it('creates a transparent all-day event when a date has no time', () => {
    const ics = buildCalendar({ id: 'date-1', title: 'Прогулка', eventDate: '2026-09-01', isAllDay: true });
    expect(ics).toContain('DTSTART;VALUE=DATE:20260901');
    expect(ics).toContain('DTEND;VALUE=DATE:20260902');
    expect(ics).toContain('TRANSP:TRANSPARENT');
    expect(ics).not.toContain('UID:date-1-preparation');
  });

  it('keeps the event UID and increases the sequence for a partner update', () => {
    const ics = buildCalendar({ id: 'date-1', title: 'Прогулка', startsAt: '2026-09-01T15:00:00.000Z', organizerComment: 'Возьми куртку, вечером прохладно.', sequence: 1 });
    expect(ics).toContain('UID:date-1');
    expect(ics).toContain('SEQUENCE:1');
    expect(ics).toContain('DESCRIPTION:Возьми куртку\\, вечером прохладно.');
  });
});
