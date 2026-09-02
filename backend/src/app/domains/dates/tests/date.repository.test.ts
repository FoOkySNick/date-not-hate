import { describe, expect, it, vi } from 'vitest';
import { DateRepository } from '../date.repository.js';

describe('DateRepository', () => {
  it('creates a date with an optional time and selected organiser', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ id: 'date-1', title: 'Кино', status: 'planned' }] });
    const repository = new DateRepository({ query } as never);

    const result = await repository.create('space-1', 'user-1', {
      typeId: 'type-1', title: 'Кино', startsAt: null, organizerMode: 'partner'
    });

    expect(result).toMatchObject({ id: 'date-1', title: 'Кино' });
    expect(query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO dates'), ['space-1', 'type-1', 'Кино', null, null, false, 'partner', 'user-1']);
  });

  it('hides a date type without changing dates that already use it', async () => {
    const query = vi.fn().mockResolvedValue({ rowCount: 1, rows: [] });
    const repository = new DateRepository({ query } as never);

    await repository.removeType('space-1', 'type-1');

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE date_types SET enabled=false'),
      ['type-1', 'space-1']
    );
  });

  it('reactivates a hidden type when its title and emoji are added again', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ id: 'type-1', title: 'Кино', emoji: '🎬', enabled: true }] });
    const repository = new DateRepository({ query } as never);

    const result = await repository.addOrReactivateType('space-1', 'Кино', '🎬');

    expect(result).toEqual({ id: 'type-1', title: 'Кино', emoji: '🎬', enabled: true });
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('ON CONFLICT (space_id,title,emoji)'),
      ['space-1', 'Кино', '🎬']
    );
  });

  it('lists disabled types until they are deleted from the space', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ id: 'type-1', title: 'Прогулка', emoji: '🌿', enabled: false }] });
    const repository = new DateRepository({ query } as never);

    const result = await repository.listVisibleTypes('space-1');

    expect(result).toEqual([{ id: 'type-1', title: 'Прогулка', emoji: '🌿', enabled: false }]);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('WHERE space_id=$1 AND deleted_at IS NULL'),
      ['space-1']
    );
  });

  it('records the related date when notifying the partner', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const repository = new DateRepository({ query } as never);

    await repository.notifyOtherMembers('space-1', 'author-1', 'Новые детали', 'date-1');

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('date_id'),
      ['space-1', 'author-1', 'Новые детали', 'date-1']
    );
  });

  it('stores an exact start time and comment for a date', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const repository = new DateRepository({ query } as never);

    await repository.saveOrganizerDetails('date-1', '2026-09-10T18:30:00.000Z', 'Будь у входа в 18:20.', 2);

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('SET starts_at=$1,event_date=NULL,is_all_day=false,organizer_comment=$2,ics_sequence=$3'),
      ['2026-09-10T18:30:00.000Z', 'Будь у входа в 18:20.', 2, 'date-1']
    );
  });
});
