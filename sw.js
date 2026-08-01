/* ProjectPro Service Worker — offline-first precache + cache-first strategy.
 * Bump CACHE_VERSION whenever any asset changes; index.html uses network-first
 * so updates roll out while the app itself is fully usable offline.
 */
const CACHE_VERSION = 'projectpro-v1.0.0';
const CORE_CACHE = CACHE_VERSION + '-core';

const PRECACHE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/styles.css',
  './js/utils.js',
  './js/icons.js',
  './js/crypto.js',
  './js/db.js',
  './js/pdf.js',
  './js/templates.js',
  './js/calc.js',
  './js/ui.js',
  './js/views/dashboard.js',
  './js/views/projects.js',
  './js/views/people.js',
  './js/views/materials.js',
  './js/views/documents.js',
  './js/views/sketch.js',
  './js/views/reports.js',
  './js/views/settings.js',
  './js/app.js',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/icon-maskable-192.png',
  './assets/icons/icon-maskable-512.png',
  './assets/icons/apple-touch-icon.png',
  './assets/splash/splash-640x1136.png',
  './assets/splash/splash-750x1334.png',
  './assets/splash/splash-828x1792.png',
  './assets/splash/splash-1125x2436.png',
  './assets/splash/splash-1170x2532.png',
  './assets/splash/splash-1284x2778.png',
  './assets/splash/splash-1536x2048.png',
  './assets/splash/splash-2048x2732.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CORE_CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys
        .filter((k) => k.startsWith('projectpro-') && k !== CORE_CACHE)
        .map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // HTML navigation: network-first so new versions deploy cleanly, cache fallback for offline.
  if (req.mode === 'navigate' || req.destination === 'document') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CORE_CACHE).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((r) => r || caches.match('./index.html')))
    );
    return;
  }

  // All other assets: cache-first, then network, then update cache.
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CORE_CACHE).then((c) => c.put(req, copy));
        }
        return res;
      });
    })
  );
});
