const cacheName = 'volleyball-v11.1.0';
const absolute = path => new URL(path, self.registration.scope).href;
const home = absolute('./');
const shell = absolute('./index.html');
const video = absolute('./assets/intro.mp4');
const appAssets = [
  './index.html', './intro.js', './intro.css', './manifest.webmanifest',
  './assets/favicon.svg', './assets/logo-light.svg', './assets/logo-dark.svg',
  './assets/intro-logo.svg', './assets/icon-180.png', './assets/icon-192.png', './assets/icon-512.png'
].map(absolute);

self.addEventListener('install', event => {
  event.waitUntil(caches.open(cacheName).then(cache => cache.addAll(appAssets)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys
    .filter(key => key.startsWith('volleyball-') && key !== cacheName)
    .map(key => caches.delete(key)))).then(() => self.clients.claim()));
});

let warming;
async function warmVideo() {
  const cache = await caches.open(cacheName);
  if (await cache.match(video)) return;
  const response = await fetch(video);
  if (response.status === 200) await cache.put(video, response);
}

self.addEventListener('message', event => {
  if (event.data?.type !== 'cache-intro') return;
  warming ||= warmVideo().catch(() => {}).finally(() => { warming = undefined; });
  event.waitUntil(warming);
});

async function navigation(request) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok || response.status < 500) return response;
    return (await cache.match(shell)) || response;
  } catch {
    return (await cache.match(shell)) || Response.error();
  }
}

async function serveVideo(request) {
  const cache = await caches.open(cacheName);
  const response = await cache.match(video);
  if (!response) return fetch(request);

  const range = request.headers.get('Range');
  if (!range) return response;

  const media = await response.blob();
  const match = /^bytes=(\d*)-(\d*)$/i.exec(range.trim());
  const invalid = () => new Response(null, {
    status: 416,
    headers: { 'Content-Range': `bytes */${media.size}`, 'Accept-Ranges': 'bytes' }
  });
  if (!match || (!match[1] && !match[2])) return invalid();
  const start = match[1] ? Number(match[1]) : Math.max(0, media.size - Number(match[2]));
  const end = match[1] && match[2] ? Math.min(media.size - 1, Number(match[2])) : media.size - 1;
  if (start > end || start >= media.size) return invalid();
  const part = media.slice(start, end + 1, 'video/mp4');
  return new Response(part, {
    status: 206,
    headers: {
      'Content-Type': 'video/mp4',
      'Content-Length': String(part.size),
      'Content-Range': `bytes ${start}-${end}/${media.size}`,
      'Accept-Ranges': 'bytes'
    }
  });
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  const path = url.origin + url.pathname;
  if (request.mode === 'navigate' && (path === home || path === shell)) {
    event.respondWith(navigation(request));
  } else if (request.url === video) {
    event.respondWith(serveVideo(request));
  } else if (appAssets.includes(request.url)) {
    event.respondWith(caches.open(cacheName).then(cache => cache.match(request)).then(hit => hit || fetch(request)));
  }
});
