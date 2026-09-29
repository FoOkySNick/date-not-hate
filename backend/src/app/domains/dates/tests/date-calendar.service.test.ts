import { describe, expect, it, vi } from 'vitest';
import { DateCalendarService } from '../date-calendar.service.js';

describe('DateCalendarService', () => {
  it('records one idempotent calendar addition after generating the file', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [{ title: 'Кино', starts_at: '2026-10-01T15:00:00.000Z', event_date: null, is_all_day: false, organizer_comment: null, ics_sequence: 0 }] })
      .mockResolvedValueOnce({ rows: [] });
    const service = new DateCalendarService({ query } as never);

    const result = await service.download('date-1', 'user-1');

    expect(result).toContain('UID:date-1');
    expect(query.mock.calls[1][0]).toContain('ON CONFLICT (date_id,user_id) DO NOTHING');
    expect(query.mock.calls[1][1]).toEqual(['date-1', 'user-1']);
  });

  it('does not record an addition when no date can be generated', async () => {
    const query = vi.fn().mockResolvedValueOnce({ rows: [{ title: 'Идея', starts_at: null, event_date: null, is_all_day: false }] });
    const service = new DateCalendarService({ query } as never);

    await expect(service.download('date-1', 'user-1')).rejects.toThrow('У свидания нет даты.');
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('reports a missing date without recording an addition', async () => {
    const query = vi.fn().mockResolvedValueOnce({ rows: [] });
    const service = new DateCalendarService({ query } as never);

    await expect(service.download('missing', 'user-1')).rejects.toThrow('Свидание не найдено.');
    expect(query).toHaveBeenCalledTimes(1);
  });
});
