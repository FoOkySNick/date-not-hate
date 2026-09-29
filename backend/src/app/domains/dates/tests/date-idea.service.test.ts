import { describe, expect, it, vi } from 'vitest';
import { DateIdeaService } from '../date-idea.service.js';

type SelectedDate = {
  id: string;
  created_by: string;
  status: string;
  requested_window: string | null;
};

const setupIdeaService = (selected?: SelectedDate, updateError?: Error) => {
  const movedDate = {
    id: 'date-1',
    title: 'Ужин',
    startsAt: null,
    eventDate: null,
    isAllDay: false,
    organizerMode: 'self',
    requestedWindow: 'idea',
    createdBy: 'user-1',
    organizerComment: null,
    status: 'planned'
  };
  const query = vi.fn().mockImplementation(async (sql: string) => {
    if (sql.includes('SELECT id,created_by,status,requested_window')) return { rows: selected ? [selected] : [] };
    if (sql.includes('UPDATE dates')) {
      if (updateError) throw updateError;
      return { rows: [movedDate] };
    }
    return { rows: [], rowCount: 1 };
  });
  const client = { query, release: vi.fn() };
  const db = { connect: vi.fn().mockResolvedValue(client) };
  return { service: new DateIdeaService(db as never), client, movedDate };
};

describe('DateIdeaService', () => {
  it('clears scheduling, comments, and calendar additions for the creator', async () => {
    const { service, client, movedDate } = setupIdeaService({
      id: 'date-1', created_by: 'user-1', status: 'planned', requested_window: null
    });

    await expect(service.move('date-1', 'user-1')).resolves.toEqual({ kind: 'moved', date: movedDate });

    expect(client.query).toHaveBeenCalledWith('BEGIN');
    expect(client.query).toHaveBeenCalledWith(expect.stringContaining('FOR UPDATE'), ['date-1']);
    expect(client.query).toHaveBeenCalledWith(expect.stringContaining("requested_window='idea'"), ['date-1']);
    expect(client.query).toHaveBeenCalledWith('DELETE FROM date_calendar_additions WHERE date_id=$1', ['date-1']);
    expect(client.query).toHaveBeenCalledWith('COMMIT');
    expect(client.release).toHaveBeenCalledOnce();
  });

  it.each([
    [undefined, 'not-found'],
    [{ id: 'date-1', created_by: 'user-2', status: 'planned', requested_window: null }, 'forbidden'],
    [{ id: 'date-1', created_by: 'user-1', status: 'completed', requested_window: null }, 'conflict'],
    [{ id: 'date-1', created_by: 'user-1', status: 'planned', requested_window: 'idea' }, 'conflict']
  ] as const)('leaves an invalid state unchanged', async (selection, expectedKind) => {
    const { service, client } = setupIdeaService(selection);

    await expect(service.move('date-1', 'user-1')).resolves.toEqual({ kind: expectedKind });

    expect(client.query).not.toHaveBeenCalledWith(expect.stringContaining('UPDATE dates'), expect.anything());
    expect(client.query).not.toHaveBeenCalledWith('DELETE FROM date_calendar_additions WHERE date_id=$1', expect.anything());
    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
    expect(client.release).toHaveBeenCalledOnce();
  });

  it('rolls back when the update fails', async () => {
    const { service, client } = setupIdeaService(
      { id: 'date-1', created_by: 'user-1', status: 'planned', requested_window: null },
      new Error('write failed')
    );

    await expect(service.move('date-1', 'user-1')).rejects.toThrow('write failed');
    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
    expect(client.release).toHaveBeenCalledOnce();
  });
});
