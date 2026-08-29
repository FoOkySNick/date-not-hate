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

  it('downloads a calendar through the authorisation header without exposing the token in the URL', async () => {
    const calendar = new Blob(['BEGIN:VCALENDAR']);
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, blob: async () => calendar });
    vi.stubGlobal('fetch', fetchMock);

    await expect(homeApi.downloadCalendar('date-1', 'token-1')).resolves.toBe(calendar);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/dates/date-1/calendar.ics');
    expect(url).not.toContain('token-1');
    expect(init.headers).toMatchObject({ Authorization: 'Bearer token-1' });
  });
});
