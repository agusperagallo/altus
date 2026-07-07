// ── Vertex Service Worker ─────────────────────────────────────
const CACHE_NAME    = 'vertex-v2';
const CACHE_STATIC  = [
  '/vertex_instructor.html',
  '/vertex_instructor.css',
  '/vertex_login.html',
  '/js/vertex_offline.js',
  '/js/vertex_audit.js',
  'https://cdn.jsdelivr.net/npm/flatpickr/dist/flatpickr.min.css',
  'https://cdn.jsdelivr.net/npm/flatpickr',
  'https://unpkg.com/@supabase/supabase-js@2/dist/umd/supabase.js'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(CACHE_STATIC))
      .then(() => self.skipWaiting()) // Activar inmediatamente sin esperar
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
  // Notificar a todos los clientes que hay una nueva versión
  self.clients.matchAll().then(clients => {
    clients.forEach(client => client.postMessage({ type: 'SW_UPDATED' }));
  });
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (url.hostname.includes('supabase.co')) return;
  if (url.hostname.includes('sheetjs.com')) return;
  if (url.hostname.includes('cdnjs.cloudflare.com')) return;
  if (url.hostname.includes('unpkg.com')) return;
  e.respondWith(
    fetch(e.request)
      .then(res => {
        if (res.ok && e.request.method === 'GET') {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
        }
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});

// ── PUSH NOTIFICATIONS ───────────────────────────────────────
self.addEventListener('push', e => {
  let data = { title: 'Vertex', body: 'Tenés una notificación nueva' };
  try { data = e.data?.json() || data; } catch {}

  e.waitUntil(
    self.registration.showNotification(data.title, {
      body:  data.body,
      icon:  '/icon-192.png',
      badge: '/icon-192.png',
      data:  data.data || {},
      vibrate: [200, 100, 200],
    })
  );
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type:'window', includeUncontrolled:true }).then(clientList => {
      for (const client of clientList) {
        if (client.url.includes('vertex_instructor') && 'focus' in client) return client.focus();
      }
      return clients.openWindow('/vertex_instructor.html');
    })
  );
});
