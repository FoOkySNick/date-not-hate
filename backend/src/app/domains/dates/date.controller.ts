import { Request, Response } from 'express';
import { DateRepository } from './date.repository.js';

export const datesController = (repository: DateRepository, onNotify?: (recipients: { id: string; email: string }[], body: string, date: { id: string; title: string; startsAt: string | null; eventDate: string | null; isAllDay: boolean; organizerMode: 'self' | 'partner'; createdBy: string }, senderId: string) => Promise<void>) => ({
  list: async (req: Request, res: Response) => res.json(await repository.list(String(req.params.spaceId))),
  create: async (req: Request, res: Response) => {
    const { organizerMode, startsAt, requestedWindow } = req.body;
    const hasExactTime = typeof startsAt === 'string' && !Number.isNaN(new Date(startsAt).valueOf());
    const hasWindow = ['today', 'this_week', 'this_month', 'next_month'].includes(requestedWindow);
    if (requestedWindow !== 'idea' && !hasExactTime && !hasWindow) {
      return res.status(400).json({ message: 'Выберите период, когда хотели бы пойти на свидание.' });
    }
    const item = await repository.create(String(req.params.spaceId), req.userId!, req.body);
    const body = 'Партнёр предложил новое свидание 💛';
    const recipients = await repository.notifyOtherMembers(String(req.params.spaceId), req.userId!, body, item.id);
    await onNotify?.(recipients, body, item, req.userId!);
    res.status(201).json(item);
  },
  claimIdea: async (req: Request, res: Response) => {
    const { startsAt, requestedWindow } = req.body;
    const hasExactTime = typeof startsAt === 'string' && !Number.isNaN(new Date(startsAt).valueOf());
    const hasWindow = ['today', 'this_week', 'this_month', 'next_month'].includes(requestedWindow);
    if (!hasExactTime && !hasWindow) return res.status(400).json({ message: 'Укажите точную дату и время или выберите период.' });
    const item = await repository.claimIdea(String(req.params.dateId), req.userId!, { startsAt: hasExactTime ? startsAt : null, requestedWindow: hasWindow ? requestedWindow : null });
    if (!item) return res.status(409).json({ message: 'Эта идея уже взята в работу.' });
    const body = 'Партнёр взял идею в работу 💛';
    const recipients = await repository.notifyOtherMembers(String(req.params.spaceId), req.userId!, body, item.id);
    await onNotify?.(recipients, body, item, req.userId!);
    res.json(item);
  }
});
