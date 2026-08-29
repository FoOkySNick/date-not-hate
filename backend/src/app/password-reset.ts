import { createHash, randomBytes } from 'node:crypto';
import { Pool } from 'pg';
import { Mailer } from './mailer.js';

const hash = (token: string) => createHash('sha256').update(token).digest('hex');

export class PasswordResetService {
  constructor(private readonly db: Pool, private readonly mailer: Mailer) {}

  async request(email: string) {
    await this.ensureTable();
    const user = (await this.db.query('SELECT id FROM users WHERE email=$1', [email])).rows[0];
    if (!user) return;
    const token = randomBytes(32).toString('base64url');
    await this.db.query('DELETE FROM password_reset_tokens WHERE user_id=$1 OR expires_at < now()', [user.id]);
    await this.db.query(`INSERT INTO password_reset_tokens(user_id,token_hash,expires_at) VALUES($1,$2,now() + interval '30 minutes')`, [user.id, hash(token)]);
    const link = `${process.env.APP_URL ?? process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173'}/?reset=${token}`;
    await this.mailer.send(email, 'Восстановление пароля — Date, not Hate', `Чтобы задать новый пароль, откройте ссылку в течение 30 минут:\n${link}`);
  }

  async reset(token: string, passwordHash: string) {
    await this.ensureTable();
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      const record = (await client.query(`SELECT id,user_id FROM password_reset_tokens WHERE token_hash=$1 AND used_at IS NULL AND expires_at > now() FOR UPDATE`, [hash(token)])).rows[0];
      if (!record) { await client.query('ROLLBACK'); return false; }
      await client.query('UPDATE users SET password_hash=$1 WHERE id=$2', [passwordHash, record.user_id]);
      await client.query('UPDATE password_reset_tokens SET used_at=now() WHERE id=$1', [record.id]);
      await client.query('COMMIT'); return true;
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  }

  private async ensureTable() {
    await this.db.query(`CREATE TABLE IF NOT EXISTS password_reset_tokens (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, token_hash TEXT NOT NULL UNIQUE, expires_at TIMESTAMPTZ NOT NULL, used_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  }
}
