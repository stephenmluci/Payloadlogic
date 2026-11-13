// PayloadLogic Service Worker (PWA Offline Support & Web Push)
const CACHE_NAME = 'payloadlogic-pwa-v3';

const PRECACHE_ASSETS = [
  '/',
  '/dashboard',
  '/driver-view',
  '/login',
  '/manifest.json',
  '/site.webmanifest',
  '/favicon.ico',
  '/apple-touch-icon.png',
  '/icons/favicon-16x16.png',
  '/icons/favicon-32x32.png',
  '/icons/apple-touch-icon.png',
  '/icons/apple-touch-icon-120x120.png',
  '/icons/apple-touch-icon-152x152.png',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
  '/icons/icon-maskable-512x512.png',
  '/brand/logo-horizontal.png',
  '/brand/app-icon.png'
];

// Install: precache essential shell assets individually so a single failure never blocks installation
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return Promise.allSettled(
        PRECACHE_ASSETS.map((asset) =>
          cache.add(asset).catch((err) => {
            console.warn('[PWA SW] Precache skipped for', asset, err);
          })
        )
      );
    }).then(() => self.skipWaiting())
  );
});

// Activate: clean up outdated caches and claim clients immediately
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: Network-first with cache fallback (meets Chrome & Android PWA install criteria)
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;
  if (url.pathname.startsWith('/_next/webpack-hmr')) return;

  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        if (
          networkResponse &&
          networkResponse.status === 200 &&
          (url.pathname.startsWith('/_next/static/') ||
           url.pathname.startsWith('/icons/') ||
           url.pathname.startsWith('/brand/') ||
           url.pathname.endsWith('.png') ||
           url.pathname.endsWith('.ico') ||
           url.pathname.endsWith('.svg') ||
           url.pathname === '/manifest.json' ||
           url.pathname === '/site.webmanifest' ||
           event.request.mode === 'navigate')
        ) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return networkResponse;
      })
      .catch(async () => {
        const cachedResponse = await caches.match(event.request);
        if (cachedResponse) return cachedResponse;

        if (event.request.mode === 'navigate') {
          const dashboardCached = await caches.match('/dashboard');
          if (dashboardCached) return dashboardCached;
          const rootCached = await caches.match('/');
          if (rootCached) return rootCached;
        }

        return new Response('You are currently offline. Please reconnect to access PayloadLogic.', {
          status: 503,
          headers: { 'Content-Type': 'text/plain' },
        });
      })
  );
});

// ── Web Push Notification Listeners ──────────────────────────────────────────
self.addEventListener('push', (event) => {
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data = { title: 'PayloadLogic Dispatch', body: event.data.text() };
    }
  }

  const title = data.title || 'PayloadLogic Dispatch';
  const options = {
    body: data.body || data.message || 'You have a new dispatch notification.',
    icon: data.icon || '/icons/icon-192x192.png',
    badge: data.badge || '/icons/favicon-32x32.png',
    vibrate: [200, 100, 200],
    tag: data.tag || 'payloadlogic-dispatch',
    renotify: true,
    data: {
      url: data.url || data.click_action || '/dashboard',
      loadId: data.loadId || null,
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/dashboard';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client && client.url.includes(self.location.origin)) {
          client.focus();
          if ('navigate' in client) {
            return client.navigate(targetUrl);
          }
          return;
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
