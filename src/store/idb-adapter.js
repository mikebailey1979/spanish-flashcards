// @ts-check
/**
 * IndexedDB storage adapter (browser) — the production backing for the store in
 * the PWA. Implements the same async contract as the in-memory adapter
 * (get/getAll/put/remove/clear), one object store per collection, keyed by `id`.
 *
 * Dependency-free and tiny on purpose. Node tests use the in-memory adapter;
 * this one is exercised in the browser (and later, integration tests).
 */
(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.SpanishFlashcardsIdbAdapter = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const DEFAULT_DB = "aliyah-flashcards";
  // Bumped to 2 to add the roleplaySessions object store (R4). onupgradeneeded
  // creates any missing store, so existing v1 databases upgrade in place.
  const DEFAULT_VERSION = 2;
  const STORES = ["users", "decks", "lessons", "cards", "progress", "reviewEvents", "roleplaySessions"];

  /** @param {IDBRequest} req @returns {Promise<any>} */
  function wrap(req) {
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * @param {{name?: string, version?: number, stores?: string[]}} [opts]
   */
  function createIdbAdapter(opts) {
    const name = (opts && opts.name) || DEFAULT_DB;
    const version = (opts && opts.version) || DEFAULT_VERSION;
    const stores = (opts && opts.stores) || STORES;
    /** @type {Promise<IDBDatabase>|null} */
    let dbp = null;

    function open() {
      if (dbp) return dbp;
      dbp = new Promise((resolve, reject) => {
        const req = indexedDB.open(name, version);
        req.onupgradeneeded = () => {
          const db = req.result;
          for (const s of stores) {
            if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: "id" });
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      return dbp;
    }

    /** @param {string} c @param {IDBTransactionMode} mode */
    async function tx(c, mode) {
      const db = await open();
      return db.transaction(c, mode).objectStore(c);
    }

    return {
      /** @param {string} c @param {string} id */
      async get(c, id) {
        return (await wrap((await tx(c, "readonly")).get(id))) ?? undefined;
      },
      /** @param {string} c */
      async getAll(c) {
        return (await wrap((await tx(c, "readonly")).getAll())) || [];
      },
      /** @param {string} c @param {{id: string}} rec */
      async put(c, rec) {
        if (!rec || typeof rec.id !== "string") throw new Error("record needs a string id");
        await wrap((await tx(c, "readwrite")).put(rec));
      },
      /** @param {string} c @param {string} id */
      async remove(c, id) {
        await wrap((await tx(c, "readwrite")).delete(id));
      },
      async clear() {
        const db = await open();
        await Promise.all(
          stores.map((s) => wrap(db.transaction(s, "readwrite").objectStore(s).clear()))
        );
      },
    };
  }

  return { createIdbAdapter, STORES };
});
