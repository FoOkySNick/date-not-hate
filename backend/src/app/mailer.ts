type Attachment = { filename: string; content: string; contentType: string };

const sender = (from: string) => {
  const match = from.match(/^(.*?)\s*<([^>]+)>$/);
  return match
    ? { name: match[1].trim(), email: match[2].trim() }
    : { name: '', email: from.trim() };
};

export class Mailer {
  async send(to: string, subject: string, text: string, attachments?: Attachment[]) {
    const apiKey = process.env.UNISENDER_GO_API_KEY;
    if (!apiKey) throw new Error('Не настроена отправка email: укажите UNISENDER_GO_API_KEY в .env.');

    const configuredFrom = process.env.MAIL_FROM;
    if (!configuredFrom) throw new Error('Не настроен отправитель email: укажите MAIL_FROM с подтверждённым адресом Unisender Go.');
    const from = sender(configuredFrom);
    const response = await fetch('https://goapi.unisender.ru/ru/transactional/api/v1/email/send.json', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-API-KEY': apiKey
      },
      body: JSON.stringify({
        message: {
          recipients: [{ email: to }],
          body: { plaintext: text },
          subject,
          from_email: from.email,
          ...(from.name ? { from_name: from.name } : {}),
          track_links: 0,
          track_read: 0,
          attachments: attachments?.map(file => ({
            type: file.contentType,
            name: file.filename,
            content: Buffer.from(file.content).toString('base64')
          }))
        }
      })
    });

    if (!response.ok) throw new Error(`Unisender Go отклонил письмо: ${response.status} ${await response.text()}`);
  }
}
