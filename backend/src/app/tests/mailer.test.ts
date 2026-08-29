import { afterEach, describe, expect, it, vi } from 'vitest';
import { Mailer } from '../mailer.js';

const originalEnvironment = { ...process.env };
afterEach(() => { process.env = { ...originalEnvironment }; vi.unstubAllGlobals(); });

describe('Mailer', () => {
  it('sends email and calendar attachments through Unisender Go HTTPS API', async () => {
    process.env.UNISENDER_GO_API_KEY = 'unisender-key';
    process.env.MAIL_FROM = 'Date, not Hate <sender@example.com>';
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    await new Mailer().send('partner@example.com', 'Приглашение', 'Текст', [{ filename: 'date.ics', content: 'BEGIN:VCALENDAR', contentType: 'text/calendar' }]);

    expect(fetchMock).toHaveBeenCalledWith('https://goapi.unisender.ru/ru/transactional/api/v1/email/send.json', expect.objectContaining({ method: 'POST', headers: expect.objectContaining({ 'X-API-KEY': 'unisender-key' }) }));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
      message: {
        recipients: [{ email: 'partner@example.com' }],
        subject: 'Приглашение',
        body: { plaintext: 'Текст' },
        from_email: 'sender@example.com',
        from_name: 'Date, not Hate',
        track_links: 0,
        track_read: 0,
        attachments: [{ type: 'text/calendar', name: 'date.ics', content: Buffer.from('BEGIN:VCALENDAR').toString('base64') }]
      }
    });
  });

  it('does not fall back to SMTP or console output when Unisender is not configured', async () => {
    delete process.env.UNISENDER_GO_API_KEY;

    await expect(new Mailer().send('partner@example.com', 'Тема', 'Текст')).rejects.toThrow('UNISENDER_GO_API_KEY');
  });
});
