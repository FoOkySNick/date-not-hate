import { NextFunction, Request, Response } from 'express';

type Entry = { count: number; resetAt: number };

export const rateLimit = (limit: number, windowMs: number) => {
  const entries = new Map<string, Entry>();
  return (req: Request, res: Response, next: NextFunction) => {
    const key = `${req.path}:${req.ip}`;
    const now = Date.now(); const current = entries.get(key);
    const entry = !current || current.resetAt < now ? { count: 0, resetAt: now + windowMs } : current;
    entry.count += 1; entries.set(key, entry);
    if (entry.count > limit) return res.status(429).json({ message: 'Слишком много попыток. Попробуйте позже.' });
    return next();
  };
};
