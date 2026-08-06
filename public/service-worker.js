const SHELL_CACHE = "orthofluoro-shell-v3";
const ASSET_CACHE = "orthofluoro-assets-v2";
const CONTENT_CACHE = "orthofluoro-content-v2";
const CURRENT_CACHES = new Set([SHELL_CACHE, ASSET_CACHE, CONTENT_CACHE]);
const SHELL_URLS = [
  "/",
  "/asset-manifest.json",
  "/manifest.webmanifest",
  "/favicon.svg",
];

async function installApplicationShell() {
  const cache = await caches.open(SHELL_CACHE);
  await cache.addAll(SHELL_URLS);
  const manifestResponse = await cache.match("/asset-manifest.json");
  if (!manifestResponse)
    throw new Error("The asset manifest could not be cached");
  const assetUrls = await manifestResponse.json();
  if (
    !Array.isArray(assetUrls) ||
    assetUrls.some((url) => typeof url !== "string")
  ) {
    throw new Error("The asset manifest is invalid");
  }
  await cache.addAll(assetUrls);
}

self.addEventListener("install", (event) => {
  event.waitUntil(installApplicationShell());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (key) =>
                key.startsWith("orthofluoro-") && !CURRENT_CACHES.has(key),
            )
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") void self.skipWaiting();
});

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(cacheName);
    await cache.put(request, response.clone());
  }
  return response;
}

async function networkFirstNavigation(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(SHELL_CACHE);
      await cache.put(request, response.clone());
    }
    return response;
  } catch {
    return (await caches.match(request)) ?? (await caches.match("/"));
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  if (/^\/(models|content|anatomy|draco)\//.test(url.pathname)) {
    event.respondWith(cacheFirst(request, CONTENT_CACHE));
    return;
  }

  if (
    url.pathname.startsWith("/assets/") ||
    /\.(?:css|js|png|svg|webmanifest|woff2)$/.test(url.pathname)
  ) {
    event.respondWith(cacheFirst(request, ASSET_CACHE));
  }
});
