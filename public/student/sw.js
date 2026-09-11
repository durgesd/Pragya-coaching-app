self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = { title: 'Pragya Coaching', body: 'You have new homework.' };
  try { data = event.data.json(); } catch (e) {}
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: undefined,
      data: { homeworkId: data.homeworkId }
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const homeworkId = event.notification.data && event.notification.data.homeworkId;
  const url = './index.html' + (homeworkId ? '?open=' + homeworkId : '');
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) { client.navigate(url); return client.focus(); }
      }
      return self.clients.openWindow(url);
    })
  );
});
