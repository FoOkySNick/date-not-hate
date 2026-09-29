import { Pool } from 'pg';
import { buildCalendar } from '../../calendar.js';

export class DateCalendarService {
  constructor(private readonly db: Pool) {}

  async download(dateId: string, userId: string) {
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      const row = (await client.query(
        'SELECT title,starts_at,event_date,is_all_day,organizer_comment,ics_sequence FROM dates WHERE id=$1 FOR SHARE',
        [dateId]
      )).rows[0];
      if (!row) throw new Error('Свидание не найдено.');
      if (!row.starts_at && !row.event_date) throw new Error('У свидания нет даты.');

      const content = buildCalendar({
        id: dateId,
        title: row.title,
        startsAt: row.starts_at,
        eventDate: row.event_date,
        isAllDay: row.is_all_day,
        organizerComment: row.organizer_comment,
        sequence: row.ics_sequence
      });
      await client.query(
        'INSERT INTO date_calendar_additions(date_id,user_id) VALUES($1,$2) ON CONFLICT (date_id,user_id) DO NOTHING',
        [dateId, userId]
      );
      await client.query('COMMIT');
      return content;
    } catch (error) {
      await Promise.allSettled([client.query('ROLLBACK')]);
      throw error;
    } finally {
      client.release();
    }
  }
}
