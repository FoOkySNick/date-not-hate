// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { homeApi } from './api/home.api-service';
import { homeService } from './page.service';

const session = { user: { id: 'user-1', name: 'Аня', email: 'anya@example.com' }, space: { id: 'space-1', name: 'Мы' }, token: 'expired-token' };
const space = { ...session.space, members: [], dateTypes: [] };
const response = (status: number, body: unknown = {}) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

beforeEach(() => {
  homeService.session$.next(session);
  homeService.space$.next(space);
  homeService.error$.next(null);
  localStorage.setItem('dnh-session', JSON.stringify(session));
});
afterEach(() => { homeService.logout(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('expired sessions', () => {
  it('clears the saved session and private data when refresh receives 401', async () => {
    homeService.notifications$.next([{ id: 'notification-1', body: 'Reminder', dateId: null, createdAt: '', readAt: null }]);
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => response(401)));

    await homeService.refresh();

    expect(homeService.session$.value).toBeNull();
    expect(localStorage.getItem('dnh-session')).toBeNull();
    expect(homeService.space$.value).toBeNull();
    expect(homeService.dates$.value).toEqual([]);
    expect(homeService.notifications$.value).toEqual([]);
    expect(homeService.error$.value).toBe('Сессия завершилась. Войдите ещё раз.');
  });

  it.each(['json', 'upload', 'calendar'] as const)('logs out on a 401 from a %s request', async (kind) => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => response(401)));
    const request = kind === 'json' ? homeApi.pushConfig(session.token)
      : kind === 'upload' ? homeApi.upload('date-1', session.token, [])
      : homeApi.downloadCalendar('date-1', session.token);

    await expect(request).rejects.toThrow();
    expect(homeService.session$.value).toBeNull();
    expect(localStorage.getItem('dnh-session')).toBeNull();
  });

  it.each([403, 500, 'offline'])('keeps the session on %s', async (status) => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => {
      if (status === 'offline') throw new TypeError('Failed to fetch');
      return response(Number(status));
    }));
    await homeService.refresh();
    expect(homeService.session$.value).toEqual(session);
    expect(localStorage.getItem('dnh-session')).not.toBeNull();
  });

  it('does not treat an incorrect login password as an expired session', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(401, { message: 'Неверный пароль' })));
    await expect(homeApi.login({ email: session.user.email, password: 'wrong' })).rejects.toThrow('Неверный пароль');
    expect(homeService.session$.value).toEqual(session);
    expect(homeService.error$.value).toBeNull();
  });

  it('ignores a late 401 from the previous session after a new login', async () => {
    let finish!: (result: Response) => void;
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => new Promise<Response>(resolve => { finish = resolve; })));
    const request = homeApi.space(session.space.id, session.token);
    const nextSession = { ...session, token: 'new-token' };
    homeService.session$.next(nextSession);
    localStorage.setItem('dnh-session', JSON.stringify(nextSession));
    finish(response(401));

    await expect(request).rejects.toThrow();
    expect(homeService.session$.value).toEqual(nextSession);
    expect(JSON.parse(localStorage.getItem('dnh-session')!)).toEqual(nextSession);
    expect(homeService.error$.value).toBeNull();
  });

  it('does not restore private data when an old refresh finishes after logout', async () => {
    const pending: Array<() => void> = [];
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => new Promise<Response>(resolve => {
      pending.push(() => resolve(response(200, url.endsWith('/space-1') ? space : [])));
    })));
    const refresh = homeService.refresh();
    homeService.logout();
    pending.forEach(finish => finish());
    await refresh;
    expect(homeService.space$.value).toBeNull();
    expect(homeService.error$.value).toBeNull();
  });

  it.each([false, true])('ignores a late creation response after logout (new login: %s)', async (loginAgain) => {
    let finish!: (result: Response) => void;
    const fetchMock = vi.fn().mockImplementation(() => new Promise<Response>(resolve => { finish = resolve; }));
    vi.stubGlobal('fetch', fetchMock);
    const creation = homeService.createDate({ title: 'Old session date' });
    homeService.logout();
    if (loginAgain) homeService.session$.next({ ...session, token: 'new-token' });
    finish(response(201, { id: 'old-date', title: 'Old session date' }));

    await creation;

    expect(homeService.dates$.value).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('date collaboration actions', () => {
  it('refreshes after deleting an owned photo', async () => {
    vi.spyOn(homeApi, 'deletePhoto').mockResolvedValue();
    const refresh = vi.spyOn(homeService, 'refresh').mockResolvedValue();

    await homeService.deletePhoto('date-1', 'photo-1');

    expect(homeApi.deletePhoto).toHaveBeenCalledWith('date-1', 'photo-1', session.token);
    expect(refresh).toHaveBeenCalledOnce();
  });

  it('refreshes after moving a creator-owned plan to ideas', async () => {
    vi.spyOn(homeApi, 'moveToIdeas').mockResolvedValue({ id: 'date-1', requestedWindow: 'idea' } as never);
    const refresh = vi.spyOn(homeService, 'refresh').mockResolvedValue();

    await homeService.moveToIdeas('date-1');

    expect(homeApi.moveToIdeas).toHaveBeenCalledWith('date-1', session.token);
    expect(refresh).toHaveBeenCalledOnce();
  });

  it.each(['deletePhoto', 'moveToIdeas'] as const)('ignores a late %s response after logout', async (action) => {
    let finish!: () => void;
    const pending = new Promise<void>(resolve => { finish = resolve; });
    if (action === 'deletePhoto') vi.spyOn(homeApi, action).mockReturnValue(pending);
    else vi.spyOn(homeApi, action).mockReturnValue(pending.then(() => ({ id: 'date-1' } as never)));
    const refresh = vi.spyOn(homeService, 'refresh').mockResolvedValue();

    const request = action === 'deletePhoto'
      ? homeService.deletePhoto('date-1', 'photo-1')
      : homeService.moveToIdeas('date-1');
    homeService.logout();
    finish();
    await request;

    expect(refresh).not.toHaveBeenCalled();
    expect(homeService.dates$.value).toEqual([]);
  });
});
