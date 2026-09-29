import { afterEach, describe, expect, it, vi } from 'vitest';
import { homeApi } from './home.api-service';

afterEach(() => vi.unstubAllGlobals());

describe('homeApi', () => {
  it('keeps JSON content type alongside the authorisation header', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 204 });
    vi.stubGlobal('fetch', fetchMock);

    await homeApi.sendInvite('space-1', 'partner@example.com', 'member', 'token-1');

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.headers).toMatchObject({ Authorization: 'Bearer token-1', 'Content-Type': 'application/json' });
    expect(init.body).toBe(JSON.stringify({ email: 'partner@example.com', role: 'member' }));
  });

  it('accepts a successful text response when saving a push subscription', async () => {
    const parseJson = vi.fn();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      headers: new Headers({ 'Content-Type': 'text/plain; charset=utf-8' }),
      json: parseJson
    }));

    await expect(homeApi.subscribePush('token-1', { endpoint: 'https://push.example.com', keys: { p256dh: 'key', auth: 'auth' } })).resolves.toBeUndefined();

    expect(parseJson).not.toHaveBeenCalled();
  });

  it('downloads a calendar through the authorisation header without exposing the token in the URL', async () => {
    const calendar = new Blob(['BEGIN:VCALENDAR']);
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, blob: async () => calendar });
    vi.stubGlobal('fetch', fetchMock);

    await expect(homeApi.downloadCalendar('date-1', 'token-1')).resolves.toBe(calendar);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/dates/date-1/calendar.ics');
    expect(url).not.toContain('token-1');
    expect(init.headers).toMatchObject({ Authorization: 'Bearer token-1' });
    expect(init.method).toBe('POST');
  });

  it('uses protected mutation methods for photo deletion and moving an idea', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);

    await homeApi.deletePhoto('date-1', 'photo-1', 'token-1');
    expect(fetchMock).toHaveBeenLastCalledWith('/api/dates/date-1/photos/photo-1', expect.objectContaining({
      method: 'DELETE', headers: expect.objectContaining({ Authorization: 'Bearer token-1' })
    }));

    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ id: 'date-1', requestedWindow: 'idea' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }));
    await expect(homeApi.moveToIdeas('date-1', 'token-1')).resolves.toMatchObject({ id: 'date-1', requestedWindow: 'idea' });
    expect(fetchMock).toHaveBeenLastCalledWith('/api/dates/date-1/move-to-ideas', expect.objectContaining({
      method: 'PATCH', headers: expect.objectContaining({ Authorization: 'Bearer token-1' })
    }));
  });
});
