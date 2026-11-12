// @ts-check
/**
 * Account tools (M4) — export + delete-my-data, built on the privacy stance
 * (minor's app: keep data minimal, ship export + delete from day one).
 *
 * - exportAccount: the full JSON envelope for a user (reuses io.exportUser).
 * - deleteAccount: tombstones everything the user owns or generated (content +
 *   their progress/event tracks + the user row) so the deletion PROPAGATES via
 *   sync to the server and every device — not just a local wipe. (A server-side
 *   purge of tombstoned rows is a later housekeeping job.)
 */
(function (root, factory) {
  "use strict";
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("../model/model.js"), require("../io/export-import.js"));
  } else {
    root.SpanishFlashcardsAccount = factory(root.SpanishFlashcardsModel, root.SpanishFlashcardsIO);
  }
})(typeof self !== "undefined" ? self : this, function (model, io) {
  "use strict";

  /** @param {any} store @param {string} userId @param {number} [now] */
  function exportAccount(store, userId, now) {
    return io.exportUser(store, userId, now);
  }

  /**
   * Tombstone all of a user's data (content + their progress/event tracks + the
   * user row). Returns how many rows were tombstoned.
   * @param {any} store @param {string} userId @param {number} [now]
   * @returns {Promise<{tombstoned: number}>}
   */
  async function deleteAccount(store, userId, now) {
    let count = 0;
    async function touch(collection, keep) {
      for (const r of await store.adapter.getAll(collection)) {
        if (r.deletedAt == null && keep(r)) {
          model.softDelete(r, now);
          await store.adapter.put(collection, r);
          count++;
        }
      }
    }
    const ownedByUser = (r) => r.ownerId === userId;
    const studiedByUser = (r) => model.trackBaseUser(r.userId) === userId;
    await touch("decks", ownedByUser);
    await touch("lessons", ownedByUser);
    await touch("cards", ownedByUser);
    await touch("progress", studiedByUser);
    await touch("reviewEvents", studiedByUser);
    await touch("users", (r) => r.id === userId);
    return { tombstoned: count };
  }

  return { exportAccount, deleteAccount };
});
