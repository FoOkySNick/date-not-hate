import { precacheAndRoute } from 'workbox-precaching';

precacheAndRoute(self.__WB_MANIFEST);

self.addEventListener('push', (event) => {
  let message = { title: 'Date, not Hate', body: 'У вас новое уведомление', url: '/', tag: 'date-not-hate' };
  try { message = { ...message, ...event.data?.json() }; } catch { /* Notification still appears with a safe fallback. */ }
  event.waitUntil(self.registration.showNotification(message.title, {
    body: message.body,
    icon: '/heart.svg',
    badge: '/heart.svg',
    tag: message.tag,
    data: { url: message.url }
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? '/';
  event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
    const existing = windows.find((windowClient) => new URL(windowClient.url).pathname === new URL(url, self.location.origin).pathname);
    return existing ? existing.focus() : clients.openWindow(url);
  }));
});
