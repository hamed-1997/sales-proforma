// Service Worker — پیش‌کش کل برنامه برای کار آفلاین (فهرست با tools/build.mjs ساخته می‌شود)
const VERSION = 'b8d316e43e';
const ASSETS = [
  "./",
  "Sahel-Bold.woff2",
  "Sahel.woff2",
  "Samim-Bold.woff2",
  "Samim.woff2",
  "Vazirmatn-Bold.woff2",
  "Vazirmatn-Medium.woff2",
  "Vazirmatn-Regular.woff2",
  "app.css",
  "app.js",
  "calc.js",
  "db.js",
  "format.js",
  "icon-192.png",
  "icon-512.png",
  "icon-maskable-512.png",
  "icon.svg",
  "importer.js",
  "index.html",
  "jalali.js",
  "manifest.webmanifest",
  "page-common.js",
  "page-dashboard.js",
  "page-invoice.js",
  "page-invoices.js",
  "page-products.js",
  "page-settings.js",
  "print.js",
  "settings.js",
  "ui.js",
  "xlsx.full.min.js"
];
const CACHE = 'proforma-' + VERSION;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('proforma-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(caches.match(req, { ignoreSearch: true }).then(hit => hit || fetch(req).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
    return res;
  }).catch(() => req.mode === 'navigate' ? caches.match('./index.html') : Response.error())));
});
