import { describe, expect, it, vi } from 'vitest';
import { sendVerificationEmail } from '../email-verification-notifier.js';

describe('sendVerificationEmail', () => {
  it('keeps registration successful when verification email delivery fails', async () => {
    const error = new Error('Unisender unavailable');
    const send = vi.fn().mockRejectedValue(error);
    const reportFailure = vi.fn();

    await expect(sendVerificationEmail(send, reportFailure)).resolves.toBeUndefined();
    expect(reportFailure).toHaveBeenCalledWith('Unable to send verification email', error);
  });
});
