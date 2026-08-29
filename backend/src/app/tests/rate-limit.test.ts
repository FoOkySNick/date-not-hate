import { describe, expect, it, vi } from 'vitest';
import { rateLimit } from '../rate-limit.js';

describe('rateLimit', () => {
  it('rejects attempts above the configured threshold', () => {
    const middleware = rateLimit(1, 60_000);
    const request = { path: '/api/auth/login', ip: '127.0.0.1' } as never;
    const next = vi.fn();
    const response = () => ({ status: vi.fn().mockReturnThis(), json: vi.fn() });
    middleware(request, response() as never, next);
    const blocked = response(); middleware(request, blocked as never, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(blocked.status).toHaveBeenCalledWith(429);
  });
});
