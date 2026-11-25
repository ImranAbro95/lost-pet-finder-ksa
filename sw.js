// Service worker: lets people install the site like an app and open it with a weak connection.
// Network first (so updates appear straight away), saved copy only when offline. Only this site's own files are saved;
// the database, photos and sign-in always go to the network.
const CACHE = "lpf-v2";
const SHELL = ["/", "/index.html", "/styles.css", "/config.js", "/app.js", "/i18n.js", "/data.js", "/guard.js", "/geo.js", "/match.js", "/ai.js",
  "/poster.js", "/icons.js", "/legal.js", "/icon.svg", "/manifest.webmanifest", "/icons/icon-192.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(SHELL.map(u => c.add(u).catch(() => null)))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/p/")) return;
  e.respondWith((async () => {
    try {
      const res = await fetch(req);
      if (res.ok && res.type === "basic") { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)).catch(() => null); }
      return res;
    } catch (err) {
      const hit = await caches.match(req, { ignoreSearch: true });
      if (hit) return hit;
      if (req.mode === "navigate") return (await caches.match("/index.html")) || Response.error();
      return Response.error();
    }
  })());
});
