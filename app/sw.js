/* Aliyah's Flashcards — service worker (R5, offline-first study).
 *
 * Strategy: NETWORK-FIRST for same-origin GETs, falling back to the cache when
 * offline. This is deliberate so the app is never "stale" while online (important
 * during device testing / right after a deploy — a cache-first SW is exactly what
 * made us defer this), while still giving true offline study from the cache.
 *
 * Scope: registered at /app/sw.js, so it controls the /app/ pages. A controlled
 * page's fetches are intercepted wherever they point (same origin), so this also
 * covers the shared modules the app loads from the parent dir (../src, ../answer-
 * utils.js, ../vocabulary.js).
 *
 * Not touched: non-GET requests, cross-origin requests (the Supabase API, the
 * supabase-js / Azure Speech CDNs), and the AI Netlify Function — all pass straight
 * through to the network. Study data lives in IndexedDB, which is already offline.
 *
 * Updates: bump CACHE to force a fresh precache. skipWaiting + clients.claim make a
 * new worker take over immediately, so a deploy's fixes reach installed PWAs.
 */
"use strict";

const CACHE = "aliyah-v1";

// The shell needed to boot and study offline. Precached tolerantly (one missing
// file never blocks install); everything else is cached on first network success.
const CORE = [
  "./",
  "./index.html",
  "./config.js",
  "./main.js",
  "./manifest.webmanifest",
  "../answer-utils.js",
  "../vocabulary.js",
  "../src/model/model.js",
  "../src/srs/scheduler.js",
  "../src/match/matcher.js",
  "../src/store/store.js",
  "../src/store/idb-adapter.js",
  "../src/io/export-import.js",
  "../src/seed/seed-data.js",
  "../src/seed/seed.js",
  "../src/auth/auth.js",
  "../src/sync/sync.js",
  "../src/sync/supabase-transport.js",
  "../src/account/account.js",
  "../src/io/import.js",
  "../src/ai/ai-adapter.js",
  "../src/roleplay/roleplay.js",
  "./design/tokens.css",
  "./design/fonts.css",
  "./design/base.css",
  "./design/motion.css",
  "./design/components.css",
  "./design/screens.css",
  "./design/auth.css",
  "./design/fonts/sora-latin.woff2",
  "./design/fonts/sora-latin-ext.woff2",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // Tolerant precache: add each file on its own so a single 404 can't abort install.
      await Promise.allSettled(CORE.map((url) => cache.add(new Request(url, { cache: "reload" }))));
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

function isCacheable(request, url) {
  if (request.method !== "GET") return false;                 // never cache writes
  if (url.origin !== self.location.origin) return false;      // CDNs / Supabase API: pass through
  if (url.pathname.includes("/.netlify/functions/")) return false; // dynamic AI endpoint
  if (url.pathname.endsWith("/sw.js")) return false;          // let the browser manage the worker
  return true;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (!isCacheable(request, url)) return;                     // default browser handling

  event.respondWith(
    (async () => {
      try {
        const fresh = await fetch(request);
        // Cache a copy of good, basic responses for offline use.
        if (fresh && fresh.ok && fresh.type === "basic") {
          const cache = await caches.open(CACHE);
          cache.put(request, fresh.clone());
        }
        return fresh;
      } catch (err) {
        const cached = await caches.match(request, { ignoreSearch: true });
        if (cached) return cached;
        // Offline SPA fallback: serve the cached app shell for navigations.
        if (request.mode === "navigate") {
          const shell = await caches.match("./index.html");
          if (shell) return shell;
        }
        throw err;
      }
    })()
  );
});
