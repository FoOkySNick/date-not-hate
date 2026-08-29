import dotenv from 'dotenv';
import cors from 'cors';
import express from 'express';
import multer from 'multer';
import { Pool } from 'pg';
import bcrypt from 'bcryptjs';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { v4 as uuid } from 'uuid';
import { createHash, randomBytes } from 'node:crypto';
import { DateRepository } from './app/domains/dates/date.repository.js';
import { datesController } from './app/domains/dates/date.controller.js';
import { issueToken, requireAuth, requireSpaceMember } from './app/auth.js';
import { PasswordResetService } from './app/password-reset.js';
import { Mailer } from './app/mailer.js';
import { EmailVerificationService } from './app/email-verification.js';
import { sendVerificationEmail } from './app/email-verification-notifier.js';
import { rateLimit } from './app/rate-limit.js';
import { buildCalendar } from './app/calendar.js';
import { PushNotifications } from './app/push-notifications.js';

dotenv.config({ path: fileURLToPath(new URL('../../.env', import.meta.url)) });
const directory = fileURLToPath(new URL('../photos', import.meta.url));
const frontendDirectory = fileURLToPath(new URL('../../frontend/dist', import.meta.url));
mkdirSync(directory, { recursive: true });
const app = express();
const db = new Pool({ connectionString: process.env.DATABASE_URL ?? 'postgres://date_not_hate:date_not_hate@localhost:5432/date_not_hate' });
const mailer = new Mailer();
const passwordReset = new PasswordResetService(db, mailer);
const emailVerification = new EmailVerificationService(db, mailer);
const push = new PushNotifications(db);
const upload = multer({ storage: multer.diskStorage({ destination: directory, filename: (_req, file, done) => done(null, `${uuid()}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`) }), limits: { files: 3, fileSize: 8 * 1024 * 1024 } });

app.use(cors({ origin: process.env.FRONTEND_ORIGIN?.split(',') ?? true }));
app.use(express.json());
app.use('/photos', express.static(directory));

app.get('/health', (_req, res) => res.json({ ok: true }));

const validPassword = (password: unknown): password is string => typeof password === 'string' && password.length >= 8;
type AsyncHandler = (req: express.Request, res: express.Response, next: express.NextFunction) => Promise<unknown>;
const asyncHandler = (handler: AsyncHandler): express.RequestHandler => (req, res, next) => { void handler(req, res, next).catch(next); };

app.post('/api/auth/register', rateLimit(5, 15 * 60 * 1000), asyncHandler(async (req, res) => {
  const { email, name, password, spaceName = 'Наше пространство' } = req.body;
  if (!email || !name || !validPassword(password)) return res.status(400).json({ message: 'Укажите имя, email и пароль не короче 8 символов.' });
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const exists = (await client.query('SELECT 1 FROM users WHERE email=$1', [email])).rowCount;
    if (exists) { await client.query('ROLLBACK'); return res.status(409).json({ message: 'Профиль с этим email уже есть. Войдите в него.' }); }
    const user = (await client.query('INSERT INTO users(email,name,password_hash) VALUES($1,$2,$3) RETURNING id,email,name', [email, name, await bcrypt.hash(password, 12)])).rows[0];
    const space = (await client.query('INSERT INTO spaces(name) VALUES($1) RETURNING id,name', [spaceName])).rows[0];
    await client.query('INSERT INTO space_members(space_id,user_id,role) VALUES($1,$2,$3)', [space.id, user.id, 'admin']);
    await client.query(`INSERT INTO date_types(space_id,title,emoji) VALUES
      ($1,'Ужин вне дома','🍝'),($1,'Кино или театр','🎬'),($1,'Прогулка','🌿'),($1,'Игра вдвоём','🎲'),($1,'Домашний киносеанс','🍿'),($1,'Новое впечатление','✨')`, [space.id]);
    await client.query('COMMIT'); await sendVerificationEmail(() => emailVerification.send(user.id, user.email)); res.status(201).json({ user, space, token: issueToken(user.id), verificationPending: true });
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
}));

app.post('/api/auth/login', rateLimit(10, 15 * 60 * 1000), asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  if (!email || !validPassword(password)) return res.status(400).json({ message: 'Укажите email и пароль.' });
  const user = (await db.query('SELECT id,email,name,password_hash,email_verified_at FROM users WHERE email=$1', [email])).rows[0];
  if (!user?.password_hash || !await bcrypt.compare(password, user.password_hash)) return res.status(401).json({ message: 'Неверный email или пароль.' });
  if (!user.email_verified_at) { await emailVerification.send(user.id, user.email); return res.status(403).json({ message: 'Подтвердите email по новой ссылке из письма.' }); }
  const space = (await db.query(`SELECT s.id,s.name FROM spaces s JOIN space_members m ON m.space_id=s.id WHERE m.user_id=$1 ORDER BY s.created_at LIMIT 1`, [user.id])).rows[0];
  if (!space) return res.status(404).json({ message: 'Для этого профиля пока нет пространства.' });
  res.json({ user: { id: user.id, email: user.email, name: user.name }, space, token: issueToken(user.id) });
}));

app.post('/api/auth/password-reset/request', rateLimit(5, 15 * 60 * 1000), asyncHandler(async (req, res) => {
  if (typeof req.body.email !== 'string') return res.status(400).json({ message: 'Укажите email.' });
  await passwordReset.request(req.body.email);
  res.status(202).json({ message: 'Если профиль с таким email существует, ссылка для восстановления уже отправлена.' });
}));

app.post('/api/auth/password-reset/confirm', asyncHandler(async (req, res) => {
  const { token, password } = req.body;
  if (typeof token !== 'string' || !validPassword(password)) return res.status(400).json({ message: 'Ссылка недействительна или пароль короче 8 символов.' });
  const updated = await passwordReset.reset(token, await bcrypt.hash(password, 12));
  if (!updated) return res.status(400).json({ message: 'Ссылка недействительна или истекла.' });
  res.json({ message: 'Пароль изменён. Теперь можно войти.' });
}));

app.post('/api/auth/email-verification/confirm', asyncHandler(async (req, res) => {
  if (typeof req.body.token !== 'string') return res.status(400).json({ message: 'Ссылка недействительна.' });
  const user = await emailVerification.verify(req.body.token);
  if (!user) return res.status(400).json({ message: 'Ссылка недействительна или истекла.' });
  const space = (await db.query(`SELECT s.id,s.name FROM spaces s JOIN space_members m ON m.space_id=s.id WHERE m.user_id=$1 ORDER BY s.created_at LIMIT 1`, [user.id])).rows[0];
  res.json({ user, space, token: issueToken(user.id) });
}));

app.post('/api/spaces/:spaceId/invites', requireAuth, requireSpaceMember(db, true), asyncHandler(async (req, res) => {
  const { email, role = 'member' } = req.body;
  if (typeof email !== 'string' || !['admin', 'member'].includes(role)) return res.status(400).json({ message: 'Укажите email и роль приглашённого.' });
  const token = randomBytes(32).toString('base64url');
  const tokenHash = createHash('sha256').update(token).digest('hex');
  await db.query('DELETE FROM space_invites WHERE space_id=$1 AND email=$2 AND accepted_at IS NULL', [req.params.spaceId, email.trim().toLowerCase()]);
  await db.query(`INSERT INTO space_invites(space_id,email,role,token_hash,expires_at) VALUES($1,$2,$3,$4,now() + interval '7 days')`, [req.params.spaceId, email.trim().toLowerCase(), role, tokenHash]);
  const link = `${process.env.APP_URL ?? process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173'}/?invite=${token}`;
  await mailer.send(email, 'Приглашение в Date, not Hate', `Вас приглашают в пространство для планирования свиданий. Ссылка действует 7 дней:\n${link}`);
  res.status(202).json({ message: 'Приглашение отправлено.' });
}));

app.post('/api/invites/:token/accept', rateLimit(10, 15 * 60 * 1000), asyncHandler(async (req, res) => {
  const { email, name, password } = req.body;
  if (!email || !name || !validPassword(password)) return res.status(400).json({ message: 'Укажите имя, email и пароль не короче 8 символов.' });
  const hash = createHash('sha256').update(String(req.params.token)).digest('hex');
  const invite = (await db.query(`SELECT id,space_id,email,role FROM space_invites WHERE token_hash=$1 AND accepted_at IS NULL AND expires_at > now()`, [hash])).rows[0];
  if (!invite) return res.status(404).json({ message: 'Ссылка больше не действительна.' });
  if (invite.email !== String(email).trim().toLowerCase()) return res.status(403).json({ message: 'Эта ссылка создана для другого email.' });
  let user = (await db.query('SELECT id,name,email,password_hash FROM users WHERE email=$1', [email])).rows[0];
  if (user?.password_hash && !await bcrypt.compare(password, user.password_hash)) return res.status(401).json({ message: 'У этого email уже есть профиль. Укажите его пароль.' });
  if (!user) user = (await db.query('INSERT INTO users(email,name,password_hash,email_verified_at) VALUES($1,$2,$3,now()) RETURNING id,name,email,password_hash', [email, name, await bcrypt.hash(password, 12)])).rows[0];
  await db.query('INSERT INTO space_members(space_id,user_id,role) VALUES($1,$2,$3) ON CONFLICT DO NOTHING', [invite.space_id, user.id, invite.role]);
  await db.query('UPDATE space_invites SET accepted_at=now() WHERE id=$1', [invite.id]);
  const spaceData = (await db.query('SELECT id,name FROM spaces WHERE id=$1', [invite.space_id])).rows[0];
  res.json({ user: { id: user.id, name: user.name, email: user.email }, space: spaceData, token: issueToken(user.id) });
}));

app.get('/api/spaces/:spaceId', requireAuth, requireSpaceMember(db), asyncHandler(async (req, res) => {
  const space = (await db.query('SELECT id,name FROM spaces WHERE id=$1', [req.params.spaceId])).rows[0];
  if (!space) return res.sendStatus(404);
  const [members, types] = await Promise.all([
    db.query(`SELECT u.id,u.name,u.email,m.role FROM space_members m JOIN users u ON u.id=m.user_id WHERE m.space_id=$1`, [space.id]),
    db.query('SELECT id,title,emoji,enabled FROM date_types WHERE space_id=$1 ORDER BY title', [space.id])
  ]);
  res.json({ ...space, members: members.rows, dateTypes: types.rows });
}));
app.post('/api/spaces/:spaceId/types', requireAuth, requireSpaceMember(db, true), asyncHandler(async (req, res) => {
  const { title, emoji = '💛' } = req.body;
  if (!title || typeof title !== 'string') return res.status(400).json({ message: 'Укажите название типа свидания.' });
  const type = (await db.query('INSERT INTO date_types(space_id,title,emoji) VALUES($1,$2,$3) RETURNING id,title,emoji,enabled', [req.params.spaceId, title.trim(), String(emoji).slice(0, 8)])).rows[0];
  res.status(201).json(type);
}));
app.patch('/api/spaces/:spaceId/types/:typeId', requireAuth, requireSpaceMember(db, true), asyncHandler(async (req, res) => {
  await db.query('UPDATE date_types SET enabled=$1 WHERE id=$2 AND space_id=$3', [req.body.enabled, req.params.typeId, req.params.spaceId]); res.sendStatus(204);
}));
const dates = datesController(new DateRepository(db), async (recipients, body, date) => {
  const organiserId = date.organizerMode === 'self' ? date.createdBy : recipients.find(recipient => recipient.id !== date.createdBy)?.id;
  await Promise.all(recipients.map(recipient => {
    const attachment = (date.startsAt || date.eventDate) ? [{ filename: 'date-not-hate.ics', content: buildCalendar({ id: date.id, title: date.title, startsAt: date.startsAt, eventDate: date.eventDate, isAllDay: date.isAllDay }, recipient.id === organiserId), contentType: 'text/calendar; charset=utf-8' }] : undefined;
    return mailer.send(recipient.email, 'Новое свидание — Date, not Hate', `${body}${date.startsAt || date.eventDate ? '\n\nДобавили .ics-файл: откройте его, чтобы добавить свидание в календарь.' : ''}`, attachment);
  }));
  await push.send(recipients.filter(recipient => recipient.id !== date.createdBy).map(recipient => recipient.id), { title: 'Новое свидание 💛', body, url: '/', tag: `date-${date.id}` });
});
const requireDateMember = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  void (async () => {
    const member = (await db.query(`SELECT 1 FROM dates d JOIN space_members m ON m.space_id=d.space_id WHERE d.id=$1 AND m.user_id=$2`, [req.params.dateId, req.userId])).rows[0];
    if (!member) return res.status(403).json({ message: 'У вас нет доступа к этому свиданию.' });
    return next();
  })().catch(next);
};
app.get('/api/spaces/:spaceId/dates', requireAuth, requireSpaceMember(db), asyncHandler(dates.list));
app.post('/api/spaces/:spaceId/dates', requireAuth, requireSpaceMember(db), asyncHandler(dates.create));
app.get('/api/push/config', requireAuth, (_req, res) => res.json(push.configuration()));
app.post('/api/push/subscriptions', requireAuth, asyncHandler(async (req, res) => {
  if (!push.isConfigured()) return res.status(503).json({ message: 'Push-уведомления ещё не настроены на сервере.' });
  if (!await push.subscribe(req.userId!, req.body)) return res.status(400).json({ message: 'Не удалось сохранить подписку устройства.' });
  res.sendStatus(201);
}));
app.delete('/api/push/subscriptions', requireAuth, asyncHandler(async (req, res) => {
  if (!await push.unsubscribe(req.userId!, req.body.endpoint)) return res.status(400).json({ message: 'Не удалось отключить уведомления.' });
  res.sendStatus(204);
}));
app.patch('/api/dates/:dateId/organizer-comment', requireAuth, requireDateMember, asyncHandler(async (req, res) => {
  const comment = typeof req.body.comment === 'string' ? req.body.comment.trim() : '';
  if (!comment) return res.status(400).json({ message: 'Напишите комментарий для партнёра.' });
  if (comment.length > 1000) return res.status(400).json({ message: 'Комментарий не должен быть длиннее 1000 символов.' });
  const date = (await db.query(
    'SELECT id,title,starts_at,event_date,is_all_day,organizer_mode,created_by,ics_sequence FROM dates WHERE id=$1',
    [req.params.dateId]
  )).rows[0];
  if (!date?.starts_at && !date?.event_date) return res.status(400).json({ message: 'Сначала укажите дату свидания, чтобы отправить обновление в календарь.' });
  const isOrganiser = date.organizer_mode === 'self' ? date.created_by === req.userId : date.created_by !== req.userId;
  if (!isOrganiser) return res.status(403).json({ message: 'Комментарий может отправить только тот, кто организует свидание.' });
  const recipients = (await db.query(
    `SELECT u.id,u.email FROM space_members m JOIN users u ON u.id=m.user_id
     WHERE m.space_id=(SELECT space_id FROM dates WHERE id=$1) AND m.user_id <> $2`,
    [req.params.dateId, req.userId]
  )).rows;
  if (!recipients.length) return res.status(400).json({ message: 'Для отправки комментария нужен партнёр в пространстве.' });
  const sequence = Number(date.ics_sequence) + 1;
  await db.query('UPDATE dates SET organizer_comment=$1,ics_sequence=$2 WHERE id=$3', [comment, sequence, req.params.dateId]);
  const attachment = [{
    filename: 'date-not-hate.ics',
    content: buildCalendar({ id: date.id, title: date.title, startsAt: date.starts_at, eventDate: date.event_date, isAllDay: date.is_all_day, organizerComment: comment, sequence }),
    contentType: 'text/calendar; charset=utf-8'
  }];
  const body = `Партнёр добавил детали к свиданию «${date.title}»:\n\n${comment}\n\nВо вложении — обновлённый .ics-файл. Он заменит исходное событие в календаре.`;
  await Promise.all(recipients.map(async (recipient: { id: string; email: string }) => {
    await db.query('INSERT INTO notifications(user_id,body) VALUES($1,$2)', [recipient.id, 'Партнёр добавил детали к свиданию 💛']);
    await mailer.send(recipient.email, 'Детали свидания — Date, not Hate', body, attachment);
  }));
  await push.send(recipients.map((recipient: { id: string }) => recipient.id), { title: 'Детали свидания 💛', body: `Партнёр добавил детали к «${date.title}».`, url: '/', tag: `date-${date.id}` });
  res.sendStatus(204);
}));
app.patch('/api/dates/:dateId/status', requireAuth, requireDateMember, asyncHandler(async (req, res) => { await db.query('UPDATE dates SET status=$1 WHERE id=$2', [req.body.status, req.params.dateId]); res.sendStatus(204); }));
app.post('/api/dates/:dateId/photos', requireAuth, requireDateMember, upload.array('photos', 3), asyncHandler(async (req, res) => {
  const files = req.files as Express.Multer.File[];
  const previous = await db.query('SELECT count(*)::int AS count FROM date_photos WHERE date_id=$1', [req.params.dateId]);
  if (previous.rows[0].count + files.length > 3) return res.status(400).json({ message: 'У одного свидания может быть не больше трёх фото.' });
  const userId = req.userId!;
  for (const file of files) await db.query('INSERT INTO date_photos(date_id,filename,uploaded_by) VALUES($1,$2,$3)', [req.params.dateId, file.filename, userId]);
  const members = await db.query(`SELECT m.user_id,u.email FROM space_members m JOIN users u ON u.id=m.user_id WHERE m.space_id=(SELECT space_id FROM dates WHERE id=$1)`, [req.params.dateId]);
  const body = 'Партнёр добавил фотографии со свидания 💛';
  const recipients = members.rows.filter(member => member.user_id !== userId);
  for (const member of recipients) { await db.query('INSERT INTO notifications(user_id,body) VALUES($1,$2)', [member.user_id, body]); await mailer.send(member.email, 'Новые фотографии — Date, not Hate', body); }
  await push.send(recipients.map(member => member.user_id), { title: 'Новые фотографии 💛', body, url: '/', tag: `photos-${req.params.dateId}` });
  res.status(201).json(files.map(file => ({ filename: file.filename, url: `/photos/${file.filename}` })));
}));
app.get('/api/users/:userId/notifications', requireAuth, asyncHandler(async (req, res) => {
  if (req.params.userId !== req.userId) return res.status(403).json({ message: 'Можно просматривать только свои уведомления.' });
  res.json((await db.query('SELECT id,body,created_at AS "createdAt",read_at AS "readAt" FROM notifications WHERE user_id=$1 ORDER BY created_at DESC', [req.userId])).rows);
}));
app.patch('/api/notifications/:notificationId/read', requireAuth, asyncHandler(async (req, res) => {
  await db.query('UPDATE notifications SET read_at=now() WHERE id=$1 AND user_id=$2', [req.params.notificationId, req.userId]); res.sendStatus(204);
}));
app.get('/api/dates/:dateId/calendar.ics', requireAuth, requireDateMember, asyncHandler(async (req, res) => {
  const row = (await db.query('SELECT title,starts_at,event_date,is_all_day,organizer_mode,created_by,organizer_comment,ics_sequence FROM dates WHERE id=$1', [req.params.dateId])).rows[0];
  if (!row?.starts_at && !row?.event_date) return res.status(400).send('У свидания нет даты.');
  const isOrganiser = row.organizer_mode === 'self' ? row.created_by === req.userId : row.created_by !== req.userId;
  res.type('text/calendar').attachment('date-not-hate.ics').send(buildCalendar({ id: String(req.params.dateId), title: row.title, startsAt: row.starts_at, eventDate: row.event_date, isAllDay: row.is_all_day, organizerComment: row.organizer_comment, sequence: row.ics_sequence }, isOrganiser));
}));
app.use((error: NodeJS.ErrnoException, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(error);
  if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') return res.status(503).json({ message: 'База данных недоступна. Запустите Docker Desktop и выполните docker compose up -d.' });
  if (error.message.startsWith('Не настроена отправка email') || error.message.startsWith('Не настроен отправитель email')) return res.status(503).json({ message: error.message });
  if (error.message.includes('"code":229')) return res.status(502).json({ message: 'Unisender Go требует настроить tracking-домен или разрешить отключение трекинга в поддержке сервиса.' });
  if (error.message.startsWith('Unisender Go отклонил письмо')) return res.status(502).json({ message: 'Unisender Go не принял письмо. Проверьте API-ключ и подтверждение адреса отправителя.' });
  res.status(500).json({ message: 'Не удалось выполнить действие.' });
});
app.use(express.static(frontendDirectory));
app.get('*', (_req, res) => res.sendFile('index.html', { root: frontendDirectory }));

app.listen(Number(process.env.PORT ?? 3001), () => console.log('Date Not Hate API running'));
