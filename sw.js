const CACHE = 'jmc-courtier-v4';
const ASSETS = [
  'index.html',
  'style.css',
  'app.js',
  'config.js',
  'manifest.json'
];

self.addEventListener('install', e => e.waitUntil(
  caches.open(CACHE).then(c => c.addAll(ASSETS))
));

self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  )
));

self.addEventListener('fetch', e => {
  const url = e.request.url;
  const isFontRequest =
    url.includes('fonts.googleapis.com') ||
    url.includes('fonts.gstatic.com');

  if (isFontRequest) {
    e.respondWith(
      caches.open(CACHE).then(cache =>
        cache.match(e.request).then(cached => {
          if (cached) return cached;
          return fetch(e.request)
            .then(response => {
              if (response.ok) cache.put(e.request, response.clone());
              return response;
            })
            .catch(() => new Response('', { status: 408, statusText: 'Offline' }));
        })
      )
    );
    return;
  }

  e.respondWith(
    fetch(e.request)
      .then(r => {
        if (r.ok) caches.open(CACHE).then(c => c.put(e.request, r.clone()));
        return r;
      })
      .catch(() => caches.match(e.request))
  );
});
