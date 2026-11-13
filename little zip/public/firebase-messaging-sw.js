// Service worker for Firebase Cloud Messaging in browser
importScripts('https://www.gstatic.com/firebasejs/11.9.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/11.9.1/firebase-messaging-compat.js');

self.addEventListener('push', function (event) {
  if (event.data) {
    const payload = event.data.json();
    const notificationTitle = payload.notification?.title || payload.data?.title || 'Hotshot Assist';
    const notificationOptions = {
      body: payload.notification?.body || payload.data?.body || '',
      icon: '/favicon.ico',
      data: {
        click_action: payload.notification?.click_action || payload.data?.click_action || payload.fcmOptions?.link || '/',
      },
    };
    event.waitUntil(self.registration.showNotification(notificationTitle, notificationOptions));
  }
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  const urlToOpen = event.notification.data?.click_action || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
      for (let i = 0; i < clientList.length; i++) {
        const client = clientList[i];
        if (client.url === urlToOpen && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});
