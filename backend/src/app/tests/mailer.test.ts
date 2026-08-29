import { afterEach, describe, expect, it, vi } from 'vitest';
import { Mailer } from '../mailer.js';

const originalEnvironment = { ...process.env };
afterEach(() => { process.env = { ...originalEnvironment }; vi.unstubAllGlobals(); });

describe('Mailer', () => {
  it('sends email and calendar attachments through Resend HTTPS API', async () => {
    process.env.RESEND_API_KEY = 'resend-key';
    process.env.MAIL_FROM = 'Date, not Hate <sender@example.com>';
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    await new Mailer().send('partner@example.com', 'Приглашение', 'Текст', [{ filename: 'date.ics', content: 'BEGIN:VCALENDAR', contentType: 'text/calendar' }]);

    expect(fetchMock).toHaveBeenCalledWith('https://api.resend.com/emails', expect.objectContaining({ method: 'POST', headers: expect.objectContaining({ Authorization: 'Bearer resend-key', 'User-Agent': 'date-not-hate/1.0' }) }));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
      to: ['partner@example.com'],
      from: 'Date, not Hate <sender@example.com>',
      subject: 'Приглашение',
      text: 'Текст',
      attachments: [{ filename: 'date.ics', content: Buffer.from('BEGIN:VCALENDAR').toString('base64') }]
    });
  });

  it('does not fall back to SMTP or console output when Resend is not configured', async () => {
    delete process.env.RESEND_API_KEY;

    await expect(new Mailer().send('partner@example.com', 'Тема', 'Текст')).rejects.toThrow('RESEND_API_KEY');
  });
});
