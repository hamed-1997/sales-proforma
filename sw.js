// Service Worker — پیش‌کش کل برنامه برای کار آفلاین (فهرست با tools/build.mjs ساخته می‌شود)
const VERSION = 'e7918f4af5';
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
  "apple-touch-icon.png",
  "calc.js",
  "db.js",
  "favicon-64.png",
  "format.js",
  "icon-192.png",
  "icon-512.png",
  "icon-maskable-512.png",
  "importer.js",
  "index.html",
  "jalali.js",
  "logo-full.png",
  "logo-symbol.png",
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
  "update.js",
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

// «به‌روزرسانی» دستی: همه‌ی فایل‌های کش‌شده را بدون کش مرورگر دوباره می‌گیرد و فقط تغییرکرده‌ها را جایگزین می‌کند
self.addEventListener('message', e => {
  if (e.data?.type !== 'REFRESH') return;
  const port = e.ports[0];
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const urls = [...new Set([...ASSETS.map(a => new URL(a, self.registration.scope).href), ...(await cache.keys()).map(r => r.url)])];
    let changed = 0, failed = 0, checked = 0;
    const digest = async buf => [...new Uint8Array(await crypto.subtle.digest('SHA-1', buf))].join(',');
    await Promise.all(urls.map(async u => {
      try {
        const fresh = await fetch(u, { cache: 'reload' });
        if (!fresh.ok) { failed++; return; }
        checked++;
        const old = await cache.match(u);
        const nb = await fresh.clone().arrayBuffer();
        const same = old && (await digest(await old.arrayBuffer())) === (await digest(nb));
        if (!same) { await cache.put(u, fresh); changed++; }
      } catch { failed++; }
    }));
    port.postMessage({ changed, failed, checked });
  })());
});
