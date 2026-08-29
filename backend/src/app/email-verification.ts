import { createHash, randomBytes } from 'node:crypto';
import { Pool } from 'pg';
import { Mailer } from './mailer.js';

const hash = (token: string) => createHash('sha256').update(token).digest('hex');

export class EmailVerificationService {
  constructor(private readonly db: Pool, private readonly mailer: Mailer) {}

  async send(userId: string, email: string) {
    await this.ensureTable();
    const token = randomBytes(32).toString('base64url');
    await this.db.query('DELETE FROM email_verification_tokens WHERE user_id=$1 OR expires_at < now()', [userId]);
    await this.db.query(`INSERT INTO email_verification_tokens(user_id,token_hash,expires_at) VALUES($1,$2,now() + interval '24 hours')`, [userId, hash(token)]);
    const link = `${process.env.APP_URL ?? process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173'}/?verify=${token}`;
    await this.mailer.send(email, 'Подтвердите email — Date, not Hate', `Подтвердите email в течение 24 часов:\n${link}`);
  }

  async verify(token: string) {
    await this.ensureTable();
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      const record = (await client.query(`SELECT id,user_id FROM email_verification_tokens WHERE token_hash=$1 AND used_at IS NULL AND expires_at > now() FOR UPDATE`, [hash(token)])).rows[0];
      if (!record) { await client.query('ROLLBACK'); return null; }
      await client.query('UPDATE users SET email_verified_at=now() WHERE id=$1', [record.user_id]);
      await client.query('UPDATE email_verification_tokens SET used_at=now() WHERE id=$1', [record.id]);
      const user = (await client.query('SELECT id,name,email FROM users WHERE id=$1', [record.user_id])).rows[0];
      await client.query('COMMIT'); return user;
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  }

  private async ensureTable() { await this.db.query(`CREATE TABLE IF NOT EXISTS email_verification_tokens (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, token_hash TEXT NOT NULL UNIQUE, expires_at TIMESTAMPTZ NOT NULL, used_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`); }
}
