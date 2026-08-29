import webpush from 'web-push';
import { Pool } from 'pg';

type PushSubscriptionInput = { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
export type PushMessage = { title: string; body: string; url?: string; tag?: string };

export class PushNotifications {
  private readonly publicKey = process.env.VAPID_PUBLIC_KEY;
  private readonly privateKey = process.env.VAPID_PRIVATE_KEY;
  private readonly subject = process.env.VAPID_SUBJECT;

  constructor(private readonly db: Pool) {
    if (this.isConfigured()) webpush.setVapidDetails(this.subject!, this.publicKey!, this.privateKey!);
  }

  isConfigured() { return Boolean(this.publicKey && this.privateKey && this.subject); }
  configuration() { return this.isConfigured() ? { enabled: true, publicKey: this.publicKey } : { enabled: false }; }

  async subscribe(userId: string, input: PushSubscriptionInput) {
    const endpoint = typeof input.endpoint === 'string' ? input.endpoint : '';
    const p256dh = typeof input.keys?.p256dh === 'string' ? input.keys.p256dh : '';
    const auth = typeof input.keys?.auth === 'string' ? input.keys.auth : '';
    if (!endpoint.startsWith('https://') || !p256dh || !auth) return false;
    await this.db.query(
      `INSERT INTO push_subscriptions(user_id,endpoint,p256dh,auth) VALUES($1,$2,$3,$4)
       ON CONFLICT (endpoint) DO UPDATE SET user_id=EXCLUDED.user_id,p256dh=EXCLUDED.p256dh,auth=EXCLUDED.auth,updated_at=now()`,
      [userId, endpoint, p256dh, auth]
    );
    return true;
  }

  async unsubscribe(userId: string, endpoint: unknown) {
    if (typeof endpoint !== 'string') return false;
    await this.db.query('DELETE FROM push_subscriptions WHERE user_id=$1 AND endpoint=$2', [userId, endpoint]);
    return true;
  }

  async send(userIds: string[], message: PushMessage) {
    if (!this.isConfigured() || !userIds.length) return;
    const { rows } = await this.db.query('SELECT id,endpoint,p256dh,auth FROM push_subscriptions WHERE user_id = ANY($1::uuid[])', [userIds]);
    await Promise.all(rows.map(async (subscription) => {
      try {
        await webpush.sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, JSON.stringify(message), { TTL: 60 * 60 * 24 });
      } catch (error) {
        const statusCode = (error as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) await this.db.query('DELETE FROM push_subscriptions WHERE id=$1', [subscription.id]);
        else console.error('Could not send push notification', error);
      }
    }));
  }
}
