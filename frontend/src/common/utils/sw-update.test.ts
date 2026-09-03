import { describe, expect, it, vi } from 'vitest';
import { activateUpdateImmediately } from './sw-update';

describe('activateUpdateImmediately', () => {
  it('activates the new worker and claims open pages after activation', () => {
    const skipWaiting = vi.fn();
    const claimResult = Promise.resolve();
    const claim = vi.fn(() => claimResult);
    const waitUntil = vi.fn();
    let activate: ((event: { waitUntil: (promise: Promise<unknown>) => void }) => void) | undefined;
    const addEventListener = vi.fn((type: string, listener: (event: { waitUntil: (promise: Promise<unknown>) => void }) => void) => {
      if (type === 'activate') activate = listener;
    });

    activateUpdateImmediately({ skipWaiting, clients: { claim }, addEventListener });

    expect(skipWaiting).toHaveBeenCalledOnce();
    expect(addEventListener).toHaveBeenCalledWith('activate', expect.any(Function));

    activate?.({ waitUntil });

    expect(claim).toHaveBeenCalledOnce();
    expect(waitUntil).toHaveBeenCalledWith(claimResult);
  });
});
