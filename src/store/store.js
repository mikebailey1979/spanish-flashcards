// @ts-check
/**
 * Store (M1) — the per-user repository layer over a storage adapter. It is where
 * the two product rules are *enforced*:
 *
 *   1. Content separation — Deck/Lesson/Card are filtered by `ownerId`, so one
 *      user never sees another's content through the normal API.
 *   2. Emulation isolation — an admin may study another user's content, but by
 *      default that runs in a non-persisting PREVIEW context: progress and
 *      review events are never written to the emulated user. Only a deliberate
 *      `countEmulatedProgress` opt-in records anything, and then under the
 *      admin's OWN id — never the emulated user's.
 *
 * @typedef {import("../model/model.js").Card} Card
 * @typedef {import("../model/model.js").Lesson} Lesson
 * @typedef {import("../model/model.js").User} User
 * @typedef {import("../model/model.js").Progress} Progress
 * @typedef {import("../model/model.js").Grade} Grade
 * @typedef {import("../model/model.js").ReviewMode} ReviewMode
 * @typedef {import("../model/model.js").SrsState} SrsState
 *
 * @typedef {Object} StudyContext
 * @property {string} studierId      Whose progress this session reads/writes.
 * @property {boolean} persist       Whether progress/events are saved at all.
 * @property {string} contentOwnerId Whose content is being studied.
 * @property {boolean} emulating     True when an admin is acting as someone else.
 */
(function (root, factory) {
  "use strict";
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("../model/model.js"), require("../srs/scheduler.js"));
  } else {
    root.SpanishFlashcardsStore = factory(root.SpanishFlashcardsModel, root.SpanishFlashcardsScheduler);
  }
})(typeof self !== "undefined" ? self : this, function (model, scheduler) {
  "use strict";

  const COLLECTIONS = ["users", "decks", "lessons", "cards", "progress", "reviewEvents"];
  const live = (rec) => rec && rec.deletedAt == null;

  /**
   * @param {ReturnType<import("./memory-adapter.js").createMemoryAdapter>} adapter
   */
  function createStore(adapter) {
    // ---- generic helpers -------------------------------------------------
    /** @param {string} c @param {{id:string}} rec */
    const put = (c, rec) => adapter.put(c, rec);
    /** @param {string} c @param {string} id */
    const get = (c, id) => adapter.get(c, id);
    /** @param {string} c */
    const all = (c) => adapter.getAll(c);

    // ---- users -----------------------------------------------------------
    /** @param {User} u */
    const putUser = (u) => put("users", u);
    /** @param {string} id @returns {Promise<User|null>} (tombstoned users read as null) */
    const getUser = async (id) => {
      const u = await get("users", id);
      return u && u.deletedAt == null ? u : null;
    };
    /** @returns {Promise<User[]>} */
    const listUsers = async () => (await all("users")).filter(live);

    // ---- content (owner-scoped) -----------------------------------------
    const putDeck = (d) => put("decks", d);
    const putLesson = (l) => put("lessons", l);
    const putCard = (c) => put("cards", c);

    /** @param {string} ownerId @returns {Promise<Lesson[]>} */
    async function listLessons(ownerId) {
      return (await all("lessons")).filter((l) => live(l) && l.ownerId === ownerId);
    }
    /** @param {string} ownerId @returns {Promise<import("../model/model.js").Deck[]>} */
    async function listDecks(ownerId) {
      return (await all("decks")).filter((d) => live(d) && d.ownerId === ownerId);
    }
    /** @param {string} ownerId @returns {Promise<Card[]>} */
    async function listCards(ownerId) {
      return (await all("cards")).filter((c) => live(c) && c.ownerId === ownerId);
    }
    /** @param {string[]} ids @param {string} ownerId @returns {Promise<Card[]>} */
    async function cardsByIds(ids, ownerId) {
      const want = new Set(ids);
      return (await all("cards")).filter((c) => live(c) && c.ownerId === ownerId && want.has(c.id));
    }

    // ---- study context ---------------------------------------------------
    /**
     * Resolve who is studying and whether anything persists.
     * @param {User} currentUser
     * @param {{actingAsUserId?: string, countEmulatedProgress?: boolean}} [opts]
     * @returns {StudyContext}
     */
    function studyContext(currentUser, opts) {
      const actingAs = opts && opts.actingAsUserId;
      if (actingAs && actingAs !== currentUser.id) {
        if (currentUser.role !== "admin") {
          throw new Error("only an admin may act as another user");
        }
        const countOwn = !!(opts && opts.countEmulatedProgress);
        return {
          // Persisted emulation goes to the admin's OWN per-target track
          // (`admin@as:target`) — separate from their own-content track and
          // from every other emulation track, and never the target's real data.
          studierId: countOwn ? model.makeTrack(currentUser.id, actingAs) : "preview:" + currentUser.id,
          persist: countOwn,
          contentOwnerId: actingAs,
          emulating: true,
        };
      }
      return { studierId: currentUser.id, persist: true, contentOwnerId: currentUser.id, emulating: false };
    }

    // ---- progress (studier-scoped) --------------------------------------
    /** @param {string} studierId @param {string} cardId @returns {Promise<Progress|null>} */
    async function getProgress(studierId, cardId) {
      const rows = await all("progress");
      return rows.find((p) => live(p) && p.userId === studierId && p.cardId === cardId) || null;
    }

    /**
     * Apply a grade for the current study context. Returns the next SRS state
     * whether or not it persisted (so a preview still behaves correctly in-session).
     * @param {StudyContext} ctx
     * @param {Card} card
     * @param {Grade} grade
     * @param {ReviewMode} mode
     * @param {number} now epoch ms
     * @param {string|null} [typedAnswer]
     * @returns {Promise<{srs: SrsState, persisted: boolean}>}
     */
    async function review(ctx, card, grade, mode, now, typedAnswer) {
      const prev = await getProgress(ctx.studierId, card.id);
      const prevSrs = prev ? prev.srs : scheduler.initSrs(now);
      const nextSrs = scheduler.grade(prevSrs, grade, now);
      if (ctx.persist) {
        let rec = prev;
        if (rec) {
          rec.srs = nextSrs;
          model.markUpdated(rec, now);
        } else {
          rec = model.createProgress({ userId: ctx.studierId, cardId: card.id, srs: nextSrs }, now);
        }
        await put("progress", rec);
        const ev = model.createReviewEvent(
          { userId: ctx.studierId, cardId: card.id, grade, mode, typedAnswer: typedAnswer ?? null, at: now },
          now
        );
        await put("reviewEvents", ev);
      }
      return { srs: nextSrs, persisted: ctx.persist };
    }

    /**
     * Cards to study across the given lessons, due-first then unseen.
     * @param {StudyContext} ctx
     * @param {Lesson[]} lessons
     * @param {number} now epoch ms
     * @param {number} [limit]
     * @returns {Promise<Card[]>}
     */
    async function selectDue(ctx, lessons, now, limit) {
      const ids = [...new Set(lessons.flatMap((l) => l.cardIds))];
      const cards = await cardsByIds(ids, ctx.contentOwnerId);
      const items = [];
      for (const card of cards) {
        const p = await getProgress(ctx.studierId, card.id);
        items.push({ card, srs: p ? p.srs : null });
      }
      return scheduler.selectDue(items, now, limit);
    }

    return {
      COLLECTIONS,
      adapter,
      // users
      putUser, getUser, listUsers,
      // content
      putDeck, putLesson, putCard, listDecks, listLessons, listCards, cardsByIds,
      // study
      studyContext, getProgress, review, selectDue,
    };
  }

  return { createStore, COLLECTIONS };
});
