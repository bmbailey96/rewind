const CACHE = 'rewind-v30';
const SHELL = ['/', 'index.html', 'style.css', 'app.js', 'rewind-model.js', 'availability-ui.js', 'release-model.js', 'manifest.json', 'hub-model.js', 'counter-model.js', 'discovery-model.js', 'taste-model.js', 'oracle.js', 'hub.js', 'sync-model.js', 'static-model.js', 'static-experience.js', 'storage-model.js', 'occasion-model.js', 'watchlist-model.js', 'artwork-model.js', 'media-nav.js', 'media-nav.css'];

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
  // Availability, prices, credentials, and third-party responses are never cached here.
  if (e.request.method !== 'GET' || url.origin !== self.location.origin || !SHELL.some(p=>url.pathname === (p==='/' ? '/' : '/'+p))) return;

  e.respondWith(
    fetch(e.request)
      .then(res => {
        if (res.ok) {const resClone = res.clone();caches.open(CACHE).then(c => c.put(e.request, resClone));}
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
