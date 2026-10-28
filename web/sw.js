// Service worker: o app abre sem internet na academia.
// Arquivos do próprio app: rede primeiro (pega a versão nova na hora), cache só quando estiver offline.
// Fontes: cache primeiro (não mudam). API do Apps Script e ntfy: não passam por aqui.
const VERSION = "gtm-v1";
const SHELL = ["./", "index.html", "styles.css", "app.js", "parser.js", "pixel.js", "sample-week.js", "config.js", "manifest.webmanifest",
  "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png"];

self.addEventListener("install", e => {
  // cache: "reload" ignora o cache HTTP do navegador; sem isso a versão nova podia guardar arquivos antigos
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL.map(u => new Request(u, { cache: "reload" })))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET") return;
  const fonts = /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);
  if (url.origin !== location.origin && !fonts) return;
  e.respondWith(caches.open(VERSION).then(async cache => {
    if (fonts) {
      const hit = await cache.match(req);
      if (hit) return hit;
      const res = await fetch(req); if (res.ok || res.type === "opaque") cache.put(req, res.clone()); return res;
    }
    try {
      const res = await fetch(req, { cache: "no-cache" });
      if (res.ok) cache.put(req, res.clone());
      return res;
    } catch (err) {
      return (await cache.match(req, { ignoreSearch: true })) || (req.mode === "navigate" ? cache.match("index.html") : Response.error());
    }
  }));
});
