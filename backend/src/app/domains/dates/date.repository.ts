import { Pool } from 'pg';
import { DateInput } from './date.types.js';

export class DateRepository {
  constructor(private readonly db: Pool) {}

  async list(spaceId: string) {
    const { rows } = await this.db.query(
      `SELECT d.id, d.title, d.starts_at AS "startsAt", d.event_date AS "eventDate", d.is_all_day AS "isAllDay", d.organizer_mode AS "organizerMode", d.created_by AS "createdBy", d.organizer_comment AS "organizerComment", d.status,
              t.title AS "typeTitle", t.emoji, COALESCE(p.photos, '[]'::json) AS photos
       FROM dates d JOIN date_types t ON t.id=d.type_id
       LEFT JOIN LATERAL (SELECT json_agg(json_build_object('id', id, 'filename', filename)) photos FROM date_photos WHERE date_id=d.id) p ON true
       WHERE d.space_id=$1 ORDER BY d.starts_at NULLS LAST, d.created_at DESC`, [spaceId]);
    return rows;
  }

  async create(spaceId: string, userId: string, input: DateInput) {
    const { rows } = await this.db.query(
      `INSERT INTO dates(space_id,type_id,title,starts_at,event_date,is_all_day,organizer_mode,created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING id,title,starts_at AS "startsAt",event_date AS "eventDate",is_all_day AS "isAllDay",organizer_mode AS "organizerMode",created_by AS "createdBy",status`,
      [spaceId, input.typeId, input.title, input.startsAt ?? null, input.eventDate ?? null, input.isAllDay ?? false, input.organizerMode, userId]);
    return rows[0];
  }

  async notifyOtherMembers(spaceId: string, senderId: string, body: string) {
    await this.db.query(
      `INSERT INTO notifications(user_id,body)
       SELECT user_id,$3 FROM space_members WHERE space_id=$1 AND user_id <> $2`,
      [spaceId, senderId, body]
    );
    return (await this.db.query(`SELECT u.id,u.email FROM space_members m JOIN users u ON u.id=m.user_id WHERE m.space_id=$1`, [spaceId])).rows;
  }
}
