// ── Altus Service Worker ─────────────────────────────────────
const CACHE_NAME    = 'altus-v1';
const CACHE_STATIC  = [
  '/altus_instructor.html',
  '/altus_instructor.css',
  '/altus_login.html',
  '/altus_resena.html',
  '/js/altus_offline.js',
  '/js/altus_audit.js',
  'https://cdn.jsdelivr.net/npm/flatpickr/dist/flatpickr.min.css',
  'https://cdn.jsdelivr.net/npm/flatpickr',
  'https://unpkg.com/@supabase/supabase-js@2/dist/umd/supabase.js'
];

// Instalar — cachear archivos estáticos
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(CACHE_STATIC))
      .then(() => self.skipWaiting())
  );
});

// Activar — limpiar caches viejos
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch — network first, fallback a caché
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Requests a Supabase siempre van a la red — no cachear datos dinámicos
  if (url.hostname.includes('supabase.co')) return;

  e.respondWith(
    fetch(e.request)
      .then(res => {
        // Guardar en caché si es exitosa
        if (res.ok && e.request.method === 'GET') {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
        }
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
