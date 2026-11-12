// @ts-check
/**
 * Export / import (M1) — a versioned JSON envelope that losslessly round-trips a
 * single user's data (content they own + the progress/events they generated).
 * This same envelope is the M2 sync payload shape, so it carries tombstones and
 * merges by `updatedAt` (newer wins).
 *
 * @typedef {import("../model/model.js").User} User
 */
(function (root, factory) {
  "use strict";
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("../model/model.js"));
  } else {
    root.SpanishFlashcardsIO = factory(root.SpanishFlashcardsModel);
  }
})(typeof self !== "undefined" ? self : this, function (model) {
  "use strict";

  const EXPORT_SCHEMA = "aliyah-flashcards/v1";
  const CONTENT = ["decks", "lessons", "cards"];
  const STUDY = ["progress", "reviewEvents"];

  /**
   * Build an envelope from already-gathered collections (pure).
   * @param {{user: User, decks: any[], lessons: any[], cards: any[], progress: any[], reviewEvents: any[]}} data
   * @param {number} [now]
   */
  function toEnvelope(data, now) {
    return {
      schema: EXPORT_SCHEMA,
      exportedAt: new Date(typeof now === "number" ? now : Date.now()).toISOString(),
      user: data.user,
      decks: data.decks,
      lessons: data.lessons,
      cards: data.cards,
      progress: data.progress,
      reviewEvents: data.reviewEvents,
    };
  }

  /**
   * Merge two collections by id (pure). "replace" takes incoming wholesale;
   * "merge" keeps whichever record has the newer updatedAt (tombstones included).
   * @param {Array<{id:string, updatedAt:string}>} current
   * @param {Array<{id:string, updatedAt:string}>} incoming
   * @param {"merge"|"replace"} mode
   * @returns {Array<{id:string, updatedAt:string}>}
   */
  function mergeCollections(current, incoming, mode) {
    if (mode === "replace") return incoming.slice();
    const byId = new Map(current.map((r) => [r.id, r]));
    for (const rec of incoming) {
      const have = byId.get(rec.id);
      if (!have || Date.parse(rec.updatedAt) >= Date.parse(have.updatedAt)) byId.set(rec.id, rec);
    }
    return [...byId.values()];
  }

  /**
   * Gather one user's full dataset from a store (includes tombstones so sync is
   * lossless) and return the envelope.
   * @param {any} store
   * @param {string} userId
   * @param {number} [now]
   */
  async function exportUser(store, userId, now) {
    const user = await store.getUser(userId);
    if (!user) throw new Error("no such user: " + userId);
    const owned = (rows) => rows.filter((r) => r.ownerId === userId);
    // Include the user's own track AND any emulation tracks they own (admin@as:*).
    const studied = (rows) => rows.filter((r) => model.trackBaseUser(r.userId) === userId);
    const [decks, lessons, cards, progress, reviewEvents] = await Promise.all([
      store.adapter.getAll("decks").then(owned),
      store.adapter.getAll("lessons").then(owned),
      store.adapter.getAll("cards").then(owned),
      store.adapter.getAll("progress").then(studied),
      store.adapter.getAll("reviewEvents").then(studied),
    ]);
    return toEnvelope({ user, decks, lessons, cards, progress, reviewEvents }, now);
  }

  /**
   * Load an envelope into a store. "replace" upserts every incoming record;
   * "merge" only overwrites when the incoming record is newer-or-equal.
   * @param {any} store
   * @param {{schema:string, user:User, decks:any[], lessons:any[], cards:any[], progress:any[], reviewEvents:any[]}} envelope
   * @param {{mode?: "merge"|"replace"}} [opts]
   */
  async function importUser(store, envelope, opts) {
    if (!envelope || envelope.schema !== EXPORT_SCHEMA) {
      throw new Error("unrecognized export schema: " + (envelope && envelope.schema));
    }
    const mode = (opts && opts.mode) || "merge";
    if (envelope.user) await upsert(store, "users", envelope.user, mode);
    for (const c of CONTENT) for (const rec of envelope[c] || []) await upsert(store, c, rec, mode);
    for (const c of STUDY) for (const rec of envelope[c] || []) await upsert(store, c, rec, mode);
  }

  /** @param {any} store @param {string} c @param {{id:string,updatedAt:string}} rec @param {"merge"|"replace"} mode */
  async function upsert(store, c, rec, mode) {
    if (mode === "replace") {
      await store.adapter.put(c, rec);
      return;
    }
    const have = await store.adapter.get(c, rec.id);
    if (!have || Date.parse(rec.updatedAt) >= Date.parse(have.updatedAt)) await store.adapter.put(c, rec);
  }

  return { EXPORT_SCHEMA, toEnvelope, mergeCollections, exportUser, importUser };
});
