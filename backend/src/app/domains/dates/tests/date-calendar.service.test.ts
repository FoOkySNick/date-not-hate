import { describe, expect, it, vi } from 'vitest';
import { DateCalendarService } from '../date-calendar.service.js';

const setup = (row?: object, insertError?: Error) => {
  const query = vi.fn().mockImplementation(async (sql: string) => {
    if (sql.includes('SELECT title')) return { rows: row ? [row] : [] };
    if (sql.startsWith('INSERT INTO date_calendar_additions') && insertError) throw insertError;
    return { rows: [] };
  });
  const client = { query, release: vi.fn() };
  const db = { connect: vi.fn().mockResolvedValue(client) };
  return { service: new DateCalendarService(db as never), client };
};

describe('DateCalendarService', () => {
  it('locks the date and records one idempotent addition in the same transaction', async () => {
    const { service, client } = setup({ title: 'Кино', starts_at: '2026-10-01T15:00:00.000Z', event_date: null, is_all_day: false, organizer_comment: null, ics_sequence: 0 });

    const result = await service.download('date-1', 'user-1');

    expect(result).toContain('UID:date-1');
    expect(client.query).toHaveBeenCalledWith('BEGIN');
    expect(client.query).toHaveBeenCalledWith(expect.stringContaining('FOR SHARE'), ['date-1']);
    expect(client.query).toHaveBeenCalledWith(expect.stringContaining('ON CONFLICT (date_id,user_id) DO NOTHING'), ['date-1', 'user-1']);
    expect(client.query).toHaveBeenCalledWith('COMMIT');
    expect(client.release).toHaveBeenCalledOnce();
  });

  it('does not record an addition when no date can be generated', async () => {
    const { service, client } = setup({ title: 'Идея', starts_at: null, event_date: null, is_all_day: false });

    await expect(service.download('date-1', 'user-1')).rejects.toThrow('У свидания нет даты.');
    expect(client.query).not.toHaveBeenCalledWith(expect.stringContaining('INSERT INTO date_calendar_additions'), expect.anything());
    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
    expect(client.release).toHaveBeenCalledOnce();
  });

  it('reports a missing date without recording an addition', async () => {
    const { service, client } = setup();

    await expect(service.download('missing', 'user-1')).rejects.toThrow('Свидание не найдено.');
    expect(client.query).not.toHaveBeenCalledWith(expect.stringContaining('INSERT INTO date_calendar_additions'), expect.anything());
    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
  });

  it('rolls back when recording the addition fails', async () => {
    const { service, client } = setup({ title: 'Кино', starts_at: '2026-10-01T15:00:00.000Z', event_date: null, is_all_day: false }, new Error('insert failed'));

    await expect(service.download('date-1', 'user-1')).rejects.toThrow('insert failed');
    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
    expect(client.query).not.toHaveBeenCalledWith('COMMIT');
  });
});
