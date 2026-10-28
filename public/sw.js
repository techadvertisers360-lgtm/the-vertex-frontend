/*
 * The Vertex Health service worker — only what an installed app needs. It caches NOTHING: clinic and patient data
 * always come live from the server (no stale or other-user data on a shared phone). When a page cannot load because
 * the phone is offline, a small "no internet" page is shown instead of the browser's error.
 * It also shows Web Push notifications (D-046) — like WhatsApp, also while the app is closed or the phone is locked —
 * and opens the exact record when one is tapped.
 */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

const OFFLINE_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>The Vertex Health</title><style>body{font-family:system-ui,sans-serif;background:#F2F4F3;color:#1a2b28;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;padding:24px;text-align:center}
.card{background:#fff;border-radius:12px;padding:24px;max-width:340px;box-shadow:0 1px 3px rgba(0,0,0,.08)}h1{font-size:18px;margin:0 0 8px}p{margin:0 0 16px;color:#5b6b67}
button{background:#0E4D45;color:#fff;border:0;border-radius:8px;padding:12px 20px;font-size:15px}</style></head>
<body><div class="card"><h1>Internet nahi hai</h1><p>Connection check karein aur dobara koshish karein.</p><button onclick="location.reload()">Dobara koshish karein</button></div></body></html>`;

self.addEventListener('fetch', (event) => {
  if (event.request.mode !== 'navigate') return; // everything else goes straight to the network as usual
  event.respondWith(fetch(event.request).catch(() => new Response(OFFLINE_HTML, { headers: { 'content-type': 'text/html; charset=utf-8' } })));
});

self.addEventListener('push', (event) => {
  let n = {};
  try {
    n = event.data ? event.data.json() : {};
  } catch {
    n = { title: 'The Vertex Health', body: event.data ? event.data.text() : '' };
  }
  const title = n.title || 'The Vertex Health';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: n.body || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/badge-96.png',
      tag: n.tag || undefined,
      renotify: !!n.tag,
      // Urgent ones stay on screen until the person acts (Doctor "Patient waiting", Manager overdue / approvals).
      requireInteraction: !!n.urgent,
      vibrate: n.urgent ? [200, 100, 200, 100, 200] : [150],
      data: { url: n.url || '/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || '/', self.location.origin).href;
  event.waitUntil(
    (async () => {
      const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const open = wins.find((w) => new URL(w.url).origin === self.location.origin);
      if (open) {
        await open.focus();
        if ('navigate' in open) return open.navigate(url);
        return undefined;
      }
      return self.clients.openWindow(url);
    })(),
  );
});

// The browser replaced the subscription (key rotation / expiry): the app re-registers it at next open.
self.addEventListener('pushsubscriptionchange', () => undefined);
