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
});
