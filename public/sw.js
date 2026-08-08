const CACHE_NAME = 'starorbi-v3.8.0';
const urlsToCache = ['/mobile.html', '/manifest.json'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(urlsToCache)));
  self.skipWaiting();
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(names => Promise.all(names.filter(n => n !== CACHE_NAME).map(n => caches.delete(n)))));
  self.clients.claim();
});
self.addEventListener('fetch', e => {
  e.respondWith(fetch(e.request).then(r => {
    if (e.request.method === 'GET' && r.status === 200) {
      const clone = r.clone();
      caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
    }
    return r;
  }).catch(() => caches.match(e.request)));
});