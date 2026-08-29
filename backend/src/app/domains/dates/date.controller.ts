import { Request, Response } from 'express';
import { DateRepository } from './date.repository.js';

export const datesController = (repository: DateRepository, onNotify?: (recipients: { id: string; email: string }[], body: string, date: { id: string; title: string; startsAt: string | null; eventDate: string | null; isAllDay: boolean; organizerMode: 'self' | 'partner'; createdBy: string }) => Promise<void>) => ({
  list: async (req: Request, res: Response) => res.json(await repository.list(String(req.params.spaceId))),
  create: async (req: Request, res: Response) => {
    const item = await repository.create(String(req.params.spaceId), req.userId!, req.body);
    const body = 'Партнёр предложил новое свидание 💛';
    const recipients = await repository.notifyOtherMembers(String(req.params.spaceId), req.userId!, body);
    await onNotify?.(recipients, body, item);
    res.status(201).json(item);
  }
});
