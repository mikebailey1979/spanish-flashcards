// @ts-check
/**
 * In-memory storage adapter (M1) — the hand-rolled, dependency-free backing the
 * store uses in tests and anywhere IndexedDB isn't available. Mirrors the exact
 * async contract of the IndexedDB adapter so the store never knows the difference.
 *
 * Contract: get(c,id) getAll(c) put(c,rec) remove(c,id) clear() — all async,
 * records are plain objects with a string `id`.
 */
(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.SpanishFlashcardsMemoryAdapter = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  function createMemoryAdapter() {
    /** @type {Map<string, Map<string, any>>} */
    const db = new Map();
    const col = (name) => {
      let m = db.get(name);
      if (!m) {
        m = new Map();
        db.set(name, m);
      }
      return m;
    };
    const clone = (v) => (v == null ? v : JSON.parse(JSON.stringify(v)));

    return {
      /** @param {string} c @param {string} id */
      async get(c, id) {
        return clone(col(c).get(id));
      },
      /** @param {string} c */
      async getAll(c) {
        return [...col(c).values()].map(clone);
      },
      /** @param {string} c @param {{id: string}} rec */
      async put(c, rec) {
        if (!rec || typeof rec.id !== "string") throw new Error("record needs a string id");
        col(c).set(rec.id, clone(rec));
      },
      /** @param {string} c @param {string} id */
      async remove(c, id) {
        col(c).delete(id);
      },
      async clear() {
        db.clear();
      },
    };
  }

  return { createMemoryAdapter };
});
