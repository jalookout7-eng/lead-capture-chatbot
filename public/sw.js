const CACHE = 'lead-admin-v2';
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
