import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { Pool } from 'pg';

declare global { namespace Express { interface Request { userId?: string; } } }

const secret = process.env.JWT_SECRET ?? 'date-not-hate-local-development-secret';

export const issueToken = (userId: string) => jwt.sign({ sub: userId }, secret, { expiresIn: '30d' });

export const requireAuth = (req: Request, res: Response, next: NextFunction) => {
  const token = req.header('authorization')?.replace(/^Bearer\s+/i, '') ?? (typeof req.query.token === 'string' ? req.query.token : undefined);
  if (!token) return res.status(401).json({ message: 'Сначала войдите в приложение.' });
  try { req.userId = String(jwt.verify(token, secret).sub); return next(); }
  catch { return res.status(401).json({ message: 'Сессия завершилась. Войдите ещё раз.' }); }
};

export const requireSpaceMember = (db: Pool, adminOnly = false) => (req: Request, res: Response, next: NextFunction) => {
  void (async () => {
    const membership = (await db.query('SELECT role FROM space_members WHERE space_id=$1 AND user_id=$2', [req.params.spaceId, req.userId])).rows[0];
    if (!membership) return res.status(403).json({ message: 'У вас нет доступа к этому пространству.' });
    if (adminOnly && membership.role !== 'admin') return res.status(403).json({ message: 'Это действие доступно администратору пространства.' });
    return next();
  })().catch(next);
};
