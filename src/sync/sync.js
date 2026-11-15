// @ts-check
/**
 * Sync engine (M2) — local ⇄ remote reconciliation over a pluggable transport.
 *
 * Strategy: a single `updatedAt` watermark cursor + last-write-wins merge
 * (newer `updatedAt` wins; tombstones are ordinary records and propagate). This
 * is the transport-agnostic core; the real transport is a thin Supabase REST
 * client (added with the browser/auth wiring). The records on the wire are the
 * same documents export/import uses, so the formats already match.
 *
 * Transport contract (async):
 *   pullSince(sinceIso) -> { <collection>: record[] }   // remote rows changed since
 *   push(changes)       -> void                         // { <collection>: record[] }
 *
 * The store is the local one from ../store/store.js (its `.adapter` and
 * `.COLLECTIONS` are used directly for a collection-agnostic sweep).
 */
(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.SpanishFlashcardsSync = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const EPOCH = "1970-01-01T00:00:00.000Z";
  const t = (iso) => Date.parse(iso || EPOCH);
  const newer = (a, b) => t(a) > t(b);

  /**
   * @param {any} store   local store (from store.js)
   * @param {{pullSince: (s: string) => Promise<Record<string, any[]>>, push: (c: Record<string, any[]>) => Promise<void>}} transport
   * @param {{collections?: string[]}} [opts]
   */
  function createSync(store, transport, opts) {
    const COLLECTIONS = (opts && opts.collections) || store.COLLECTIONS;

    /** Upsert a remote record locally iff it is newer-or-equal (LWW). */
    async function upsertLocal(c, rec, maxRef) {
      const have = await store.adapter.get(c, rec.id);
      if (!have || t(rec.updatedAt) >= t(have.updatedAt)) await store.adapter.put(c, rec);
      if (newer(rec.updatedAt, maxRef.iso)) maxRef.iso = rec.updatedAt;
    }

    /**
     * Pull remote changes since `sinceIso` into the local store (LWW).
     * @param {string} [sinceIso] @returns {Promise<string>} new cursor
     */
    async function pull(sinceIso) {
      const since = sinceIso || EPOCH;
      const maxRef = { iso: since };
      const remote = await transport.pullSince(since);
      for (const c of COLLECTIONS) {
        for (const rec of remote[c] || []) await upsertLocal(c, rec, maxRef);
      }
      return maxRef.iso;
    }

    /**
     * Push local changes since `sinceIso` to the remote.
     * @param {string} [sinceIso] @returns {Promise<string>} new cursor
     */
    async function push(sinceIso) {
      const since = sinceIso || EPOCH;
      const maxRef = { iso: since };
      /** @type {Record<string, any[]>} */
      const changes = {};
      for (const c of COLLECTIONS) {
        const rows = (await store.adapter.getAll(c)).filter((r) => newer(r.updatedAt, since));
        if (rows.length) changes[c] = rows;
        for (const r of rows) if (newer(r.updatedAt, maxRef.iso)) maxRef.iso = r.updatedAt;
      }
      await transport.push(changes);
      return maxRef.iso;
    }

    /**
     * Normalize a stored cursor into separate pull/push watermarks. Accepts the
     * new `{pull, push}` shape, a legacy single string (used for both), or
     * undefined (fresh — EPOCH for both).
     * @param {{pull?: string, push?: string}|string} [cursor]
     * @returns {{pull: string, push: string}}
     */
    function normalize(cursor) {
      if (cursor && typeof cursor === "object") return { pull: cursor.pull || EPOCH, push: cursor.push || EPOCH };
      const s = (typeof cursor === "string" && cursor) || EPOCH;
      return { pull: s, push: s };
    }

    /**
     * Pull then push, each from its OWN watermark. The pull watermark tracks only
     * what we've pulled from the remote; the push watermark tracks only what we've
     * pushed. Keeping them apart is essential: with a single shared cursor, pushing
     * a newer *local* row advances the watermark past *remote* rows we haven't
     * pulled yet (e.g. the other device studied at a slightly earlier wall-clock),
     * so those remote changes are skipped forever — the cross-device "my laptop is
     * a day behind my phone" bug. Returns the advanced `{pull, push}` cursor; store
     * it and pass it back next time.
     * @param {{pull?: string, push?: string}|string} [cursor]
     * @returns {Promise<{pull: string, push: string}>}
     */
    async function sync(cursor) {
      const cur = normalize(cursor);
      const afterPull = await pull(cur.pull);
      const afterPush = await push(cur.push);
      return { pull: afterPull, push: afterPush };
    }

    return { pull, push, sync, normalize, EPOCH };
  }

  return { createSync, EPOCH };
});
