import { describe, expect, it, vi } from 'vitest';
import { DatePhotoService, PhotoLimitError } from '../date-photo.service.js';

const setupPhotoService = (count: number, removeFile = vi.fn().mockResolvedValue(undefined), insertError?: Error) => {
  const query = vi.fn().mockImplementation(async (sql: string) => {
    if (sql.includes('count(*)')) return { rows: [{ count }] };
    if (sql.startsWith('INSERT INTO date_photos') && insertError) throw insertError;
    return { rows: [], rowCount: 1 };
  });
  const client = { query, release: vi.fn() };
  const db = { connect: vi.fn().mockResolvedValue(client), query: vi.fn() };
  return { service: new DatePhotoService(db as never, '/photos', removeFile), client, removeFile };
};

describe('DatePhotoService', () => {
  it('counts only the current user photos while holding a date lock', async () => {
    const { service, client } = setupPhotoService(2);

    await service.add('date-1', 'user-1', [{ filename: 'third.jpg' }]);

    expect(client.query).toHaveBeenCalledWith('SELECT id FROM dates WHERE id=$1 FOR UPDATE', ['date-1']);
    expect(client.query).toHaveBeenCalledWith(expect.stringContaining('uploaded_by=$2'), ['date-1', 'user-1']);
    expect(client.query).toHaveBeenCalledWith(
      'INSERT INTO date_photos(date_id,filename,uploaded_by) VALUES($1,$2,$3)',
      ['date-1', 'third.jpg', 'user-1']
    );
    expect(client.query).toHaveBeenCalledWith('COMMIT');
  });

  it('rejects a fourth owned photo and removes the new upload', async () => {
    const { service, client, removeFile } = setupPhotoService(3);

    await expect(service.add('date-1', 'user-1', [{ filename: 'fourth.jpg' }])).rejects.toBeInstanceOf(PhotoLimitError);

    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
    expect(client.release).toHaveBeenCalledOnce();
    expect(removeFile).toHaveBeenCalledWith('/photos/fourth.jpg');
  });

  it('rolls back and removes every new file when insertion fails', async () => {
    const insertError = new Error('database write failed');
    const { service, client, removeFile } = setupPhotoService(1, undefined, insertError);

    await expect(service.add('date-1', 'user-1', [{ filename: 'one.jpg' }, { filename: 'two.jpg' }])).rejects.toThrow('database write failed');

    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
    expect(client.release).toHaveBeenCalledOnce();
    expect(removeFile).toHaveBeenCalledWith('/photos/one.jpg');
    expect(removeFile).toHaveBeenCalledWith('/photos/two.jpg');
  });

  it('removes new files when a database connection cannot be acquired', async () => {
    const removeFile = vi.fn().mockResolvedValue(undefined);
    const db = { connect: vi.fn().mockRejectedValue(new Error('connection failed')) };
    const service = new DatePhotoService(db as never, '/photos', removeFile);

    await expect(service.add('date-1', 'user-1', [{ filename: 'orphan.jpg' }])).rejects.toThrow('connection failed');

    expect(removeFile).toHaveBeenCalledWith('/photos/orphan.jpg');
  });

  it('still removes new files and preserves the write error when rollback fails', async () => {
    const writeError = new Error('database write failed');
    const query = vi.fn().mockImplementation(async (sql: string) => {
      if (sql.includes('count(*)')) return { rows: [{ count: 0 }] };
      if (sql.startsWith('INSERT INTO date_photos')) throw writeError;
      if (sql === 'ROLLBACK') throw new Error('rollback failed');
      return { rows: [] };
    });
    const client = { query, release: vi.fn() };
    const removeFile = vi.fn().mockResolvedValue(undefined);
    const service = new DatePhotoService({ connect: vi.fn().mockResolvedValue(client) } as never, '/photos', removeFile);

    await expect(service.add('date-1', 'user-1', [{ filename: 'cleanup.jpg' }])).rejects.toBe(writeError);

    expect(removeFile).toHaveBeenCalledWith('/photos/cleanup.jpg');
    expect(client.release).toHaveBeenCalledOnce();
  });

  it('removes only a photo owned by the current user and date', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [{ uploaded_by: 'user-1', filename: 'mine.jpg' }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] });
    const removeFile = vi.fn().mockResolvedValue(undefined);
    const service = new DatePhotoService({ query } as never, '/photos', removeFile);

    await expect(service.remove('date-1', 'user-1', 'photo-1')).resolves.toBe('deleted');

    expect(query.mock.calls[0][1]).toEqual(['date-1', 'photo-1']);
    expect(query.mock.calls[1][1]).toEqual(['photo-1', 'date-1', 'user-1']);
    expect(removeFile).toHaveBeenCalledWith('/photos/mine.jpg');
  });

  it('does not find a photo from another date', async () => {
    const query = vi.fn().mockResolvedValueOnce({ rows: [] });
    const removeFile = vi.fn();
    const service = new DatePhotoService({ query } as never, '/photos', removeFile);

    await expect(service.remove('date-1', 'user-1', 'other-date-photo')).resolves.toBe('not-found');
    expect(removeFile).not.toHaveBeenCalled();
  });

  it('rejects deletion by another member without touching the file', async () => {
    const query = vi.fn().mockResolvedValueOnce({ rows: [{ uploaded_by: 'user-2', filename: 'theirs.jpg' }] });
    const removeFile = vi.fn();
    const service = new DatePhotoService({ query } as never, '/photos', removeFile);

    await expect(service.remove('date-1', 'user-1', 'photo-2')).resolves.toBe('forbidden');
    expect(removeFile).not.toHaveBeenCalled();
  });
});
