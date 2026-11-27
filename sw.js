const version = 'volleyball-v11.0.6';
const resolve = path => new URL(path, self.registration.scope).href;
const shell = resolve('./index.html');
const assets = ['./pdf-report.js', './vendor/pdf-lib.min.js'].map(resolve);
self.addEventListener('install', event => {
  event.waitUntil(caches.open(version).then(cache => cache.addAll([shell, ...assets])).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys
    .filter(key => key.startsWith('volleyball-') && key !== version)
    .map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const {request} = event;
  if (request.method !== 'GET') return;
  if (request.mode === 'navigate' && [resolve('./'), shell].includes(request.url.split('?')[0])) {
    event.respondWith(fetch(request).catch(async () => (await caches.open(version)).match(shell)));
  } else if (assets.includes(request.url)) {
    event.respondWith(caches.open(version).then(cache => cache.match(request)).then(hit => hit || fetch(request)));
  }
});
