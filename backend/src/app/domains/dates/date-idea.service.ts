import { Pool } from 'pg';

type MoveResult =
  | { kind: 'moved'; date: object }
  | { kind: 'not-found' }
  | { kind: 'forbidden' }
  | { kind: 'conflict' };

export class DateIdeaService {
  constructor(private readonly db: Pool) {}

  async move(dateId: string, userId: string): Promise<MoveResult> {
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      const date = (await client.query(
        'SELECT id,created_by,status,requested_window FROM dates WHERE id=$1 FOR UPDATE',
        [dateId]
      )).rows[0];

      let invalidKind: 'not-found' | 'forbidden' | 'conflict' | undefined;
      if (!date) invalidKind = 'not-found';
      else if (String(date.created_by) !== userId) invalidKind = 'forbidden';
      else if (date.status !== 'planned' || date.requested_window === 'idea') invalidKind = 'conflict';
      if (invalidKind) {
        await client.query('ROLLBACK');
        return { kind: invalidKind };
      }

      const moved = (await client.query(
        `UPDATE dates
         SET starts_at=NULL,
             event_date=NULL,
             is_all_day=false,
             requested_window='idea',
             organizer_comment=NULL,
             ics_sequence=ics_sequence+1
         WHERE id=$1
         RETURNING id,title,starts_at AS "startsAt",event_date AS "eventDate",
                   is_all_day AS "isAllDay",organizer_mode AS "organizerMode",
                   requested_window AS "requestedWindow",created_by AS "createdBy",
                   organizer_comment AS "organizerComment",status`,
        [dateId]
      )).rows[0];
      await client.query('DELETE FROM date_calendar_additions WHERE date_id=$1', [dateId]);
      await client.query('COMMIT');
      return { kind: 'moved', date: moved };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
