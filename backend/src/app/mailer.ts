type Attachment = { filename: string; content: string; contentType: string };

export class Mailer {
  async send(to: string, subject: string, text: string, attachments?: Attachment[]) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) throw new Error('Не настроена отправка email: укажите RESEND_API_KEY в .env.');

    const configuredFrom = process.env.MAIL_FROM;
    if (!configuredFrom) throw new Error('Не настроен отправитель email: укажите MAIL_FROM с подтверждённым доменом Resend.');

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'User-Agent': 'date-not-hate/1.0'
      },
      body: JSON.stringify({
        to: [to],
        from: configuredFrom,
        subject,
        text,
        attachments: attachments?.map(file => ({
          filename: file.filename,
          content: Buffer.from(file.content).toString('base64')
        }))
      })
    });

    if (!response.ok) throw new Error(`Resend отклонил письмо: ${response.status} ${await response.text()}`);
  }
}
