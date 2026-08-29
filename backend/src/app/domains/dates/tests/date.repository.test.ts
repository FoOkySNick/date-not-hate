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
});
