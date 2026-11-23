// CareSlot service worker.
//
// Makes the installed app open quickly and shows a friendly page when there is
// no connection. Patient data is never stored here: requests to the API (its
// own address) and anything that isn't a plain GET pass straight through. Only
// this site's pages (which hold no personal data; it's fetched after sign-in)
// and its static files are cached.
const VERSION = "v1";
const STATIC = `careslot-static-${VERSION}`;
const PAGES = `careslot-pages-${VERSION}`;
const OFFLINE = "/offline.html";
const PRECACHE = [OFFLINE, "/icons/icon-192.png", "/icons/icon-512.png", "/icons/maskable-512.png"];
const MAX_PAGES = 40;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("careslot-") && k !== STATIC && k !== PAGES).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // the API and other sites: untouched
  if (url.pathname.startsWith("/api/")) return;

  if (req.mode === "navigate") {
    event.respondWith(page(req));
    return;
  }
  // Build files have a content hash in their name, so a cached copy is always right.
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/") || /\.(?:woff2?|png|svg|ico)$/.test(url.pathname)) {
    event.respondWith(cacheFirst(req));
  }
});

/** Pages: always try the network for the latest version; fall back to the last copy, then the offline page. */
async function page(req) {
  try {
    const res = await fetch(req);
    if (res.ok && res.type === "basic") {
      const cache = await caches.open(PAGES);
      await cache.put(req, res.clone());
      trim(cache);
    }
    return res;
  } catch {
    const cache = await caches.open(PAGES);
    return (await cache.match(req, { ignoreSearch: true })) || (await caches.match(OFFLINE));
  }
}

async function cacheFirst(req) {
  const hit = await caches.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok && res.type === "basic") (await caches.open(STATIC)).put(req, res.clone());
  return res;
}

async function trim(cache) {
  const keys = await cache.keys();
  for (const k of keys.slice(0, Math.max(0, keys.length - MAX_PAGES))) await cache.delete(k);
}
