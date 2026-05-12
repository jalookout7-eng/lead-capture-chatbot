const CACHE = 'lead-admin-v7';
const SHELL = ['/admin/', '/admin/index.html'];

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.url.includes('/api/')) return;

  const url = new URL(e.request.url);
  const isAdminShell = url.pathname === '/admin/' || url.pathname === '/admin/index.html';

  if (isAdminShell) {
    // Network-first so admin HTML updates propagate immediately
    e.respondWith(
      fetch(e.request)
        .then(res => {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
          return res;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  // Other resources: cache-first
  e.respondWith(caches.match(e.request).then(cached => cached || fetch(e.request)));
});

// Web Push: show a notification when a new lead arrives
self.addEventListener('push', e => {
  if (!e.data) return;
  let data;
  try { data = e.data.json(); } catch { data = { title: 'New lead', body: '' }; }
  const options = {
    body: data.body || '',
    icon: '/admin/icon-192.png',
    badge: '/admin/badge-72.png',
    data: { url: data.url || '/admin/' },
    tag: 'new-lead',
    requireInteraction: false
  };
  e.waitUntil(self.registration.showNotification(data.title || 'New lead', options));
});

// Notification click: focus existing admin tab or open a new one at the lead URL
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const target = (e.notification.data && e.notification.data.url) || '/admin/';
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existing = wins.find(w => w.url.includes('/admin/'));
    if (existing) {
      try { existing.navigate(target); } catch (_) { /* navigate may be unavailable; just focus */ }
      return existing.focus();
    }
    return self.clients.openWindow(target);
  })());
});
