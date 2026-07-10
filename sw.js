const CACHE = 'rewind-v2';
const SHELL = ['/', 'index.html', 'style.css', 'app.js', 'manifest.json'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
  );
  self.clients.claim();
});

// network-first: always try to fetch the latest version, only fall back to
// the cache if the network is unavailable (offline). Prevents old cached
// shell files (app.js, style.css) from sticking around after a deploy.
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (url.hostname.includes('themoviedb.org')) return; // always live, never cached

  e.respondWith(
    fetch(e.request)
      .then(res => {
        const resClone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, resClone));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
