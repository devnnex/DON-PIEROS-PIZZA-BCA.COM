const PWA_BRAND_CACHE = "don-pieros-pwa-brand-v3";
const APP_ASSET_CACHE = "don-pieros-assets-20261030-v26";
const DYNAMIC_PWA_ASSETS = new Set([
  "pwa-manifest.webmanifest",
  "pwa-icon-192.png",
  "pwa-icon-512.png",
  "pwa-admin-manifest.webmanifest",
  "pwa-admin-icon-192.png",
  "pwa-admin-icon-512.png"
]);

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => (key.startsWith("don-pieros-assets-") && key !== APP_ASSET_CACHE) || (key.startsWith("don-pieros-pwa-brand-") && key !== PWA_BRAND_CACHE))
      .map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin === self.location.origin && event.request.mode === "navigate") {
    url.searchParams.set("__fresh", Date.now().toString(36));
    event.respondWith(fetch(url.href, { cache: "no-store", credentials: "same-origin" }));
    return;
  }
  const isCurrentAppAsset = url.origin === self.location.origin
    && ["script", "style"].includes(event.request.destination);
  if (isCurrentAppAsset) {
    event.respondWith((async () => {
      // Changing the shared connection must not leave another deployment cached.
      if(url.pathname.endsWith('/config.js')){
        const cache=await caches.open(APP_ASSET_CACHE);
        try{const response=await fetch(event.request,{cache:'no-store'});if(response.ok)event.waitUntil(cache.put(event.request,response.clone()));return response;}catch(error){const cached=await cache.match(event.request);if(cached)return cached;throw error;}
      }
      // La version de la URL permite reutilizar archivos sin servir otra version.
      if (!url.searchParams.has("v")) return fetch(event.request, { cache: "no-cache" });
      const cache = await caches.open(APP_ASSET_CACHE).catch(() => null);
      const cached = await cache?.match(event.request).catch(() => null);
      if (cached) return cached;
      const response = await fetch(event.request);
      if (response.ok && cache) event.waitUntil(cache.put(event.request, response.clone()).catch(() => undefined));
      return response;
    })());
    return;
  }
  const assetName = url.pathname.split("/").pop();
  if (!DYNAMIC_PWA_ASSETS.has(assetName)) return;
  event.respondWith((async () => {
    const cache = await caches.open(PWA_BRAND_CACHE);
    const cached = await cache.match(event.request, { ignoreSearch: true });
    if (cached) return cached;
    if(assetName.startsWith('pwa-admin-'))return fetch(assetName.endsWith('.webmanifest')?'./manifest.webmanifest':assetName.includes('192')?'./images/admin-icon-192.png':'./images/admin-icon-512.png');
    return fetch(assetName === "pwa-manifest.webmanifest" ? "./manifest.webmanifest" : assetName==='pwa-icon-192.png'?'./images/icon-192.png':'./images/icon-512.png');
  })());
});
