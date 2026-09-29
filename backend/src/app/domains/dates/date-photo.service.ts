import { unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { Pool, PoolClient } from 'pg';

type UploadedPhoto = { filename: string };
type RemoveFile = (path: string) => Promise<void>;

export class PhotoLimitError extends Error {
  constructor() {
    super('Каждый участник может добавить не больше трёх фото к одному свиданию.');
  }
}

export class DatePhotoService {
  constructor(
    private readonly db: Pool,
    private readonly directory: string,
    private readonly removeFile: RemoveFile = unlink
  ) {}

  async add(dateId: string, userId: string, files: UploadedPhoto[]) {
    let client: PoolClient | undefined;
    try {
      client = await this.db.connect();
      await client.query('BEGIN');
      await client.query('SELECT id FROM dates WHERE id=$1 FOR UPDATE', [dateId]);
      const count = Number((await client.query(
        'SELECT count(*)::int AS count FROM date_photos WHERE date_id=$1 AND uploaded_by=$2',
        [dateId, userId]
      )).rows[0].count);
      if (count + files.length > 3) throw new PhotoLimitError();
      for (const file of files) {
        await client.query(
          'INSERT INTO date_photos(date_id,filename,uploaded_by) VALUES($1,$2,$3)',
          [dateId, file.filename, userId]
        );
      }
      await client.query('COMMIT');
    } catch (error) {
      if (client) await Promise.allSettled([client.query('ROLLBACK')]);
      await Promise.allSettled(files.map(file => this.removeFile(join(this.directory, file.filename))));
      throw error;
    } finally {
      client?.release();
    }
  }

  async remove(dateId: string, userId: string, photoId: string): Promise<'deleted' | 'not-found' | 'forbidden'> {
    const photo = (await this.db.query(
      'SELECT uploaded_by,filename FROM date_photos WHERE date_id=$1 AND id=$2',
      [dateId, photoId]
    )).rows[0];
    if (!photo) return 'not-found';
    if (String(photo.uploaded_by) !== userId) return 'forbidden';

    const deletion = await this.db.query(
      'DELETE FROM date_photos WHERE id=$1 AND date_id=$2 AND uploaded_by=$3',
      [photoId, dateId, userId]
    );
    if (!deletion.rowCount) return 'not-found';
    try {
      await this.removeFile(join(this.directory, photo.filename));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') console.error('Could not remove date photo file.', error);
    }
    return 'deleted';
  }
}
