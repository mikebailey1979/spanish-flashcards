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
     * @param {{autoGrade?: Grade, rating?: string|null}} [meta] optional: the pre-rating
     *   auto grade and her face rating (recorded on the event; `grade` is what's applied).
     * @returns {Promise<{srs: SrsState, persisted: boolean}>}
     */
    async function review(ctx, card, grade, mode, now, typedAnswer, meta) {
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
          {
            userId: ctx.studierId, cardId: card.id, grade, mode,
            autoGrade: meta && meta.autoGrade != null ? meta.autoGrade : grade,
            rating: meta && meta.rating != null ? meta.rating : null,
            typedAnswer: typedAnswer ?? null, at: now,
          },
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

    // ---- content management (Phase 4) -----------------------------------
    //  Lesson rename/merge/split/delete + restore, and card edit/add/move/delete.
    //  Deleting tombstones (deletedAt) so sync + 7-day undo work; per-word PROGRESS
    //  is keyed by cardId and never touched, so it survives move/merge/split/restore.
    const getLesson = async (id) => { const l = await get("lessons", id); return live(l) ? l : null; };
    const getCard = async (id) => { const c = await get("cards", id); return live(c) ? c : null; };

    async function renameLesson(id, name, now) {
      const l = await getLesson(id); if (!l) throw new Error("lesson not found: " + id);
      l.name = String(name); model.markUpdated(l, now); await putLesson(l); return l;
    }

    /** Tombstone a lesson and its member cards (progress kept). 7-day undo via restoreLesson. */
    async function deleteLesson(id, now) {
      const l = await getLesson(id); if (!l) throw new Error("lesson not found: " + id);
      for (const cid of l.cardIds) {
        const c = await get("cards", cid);
        if (live(c)) { model.softDelete(c, now); await putCard(c); }
      }
      model.softDelete(l, now); await putLesson(l); return l;
    }

    /** Un-tombstone a lesson and the cards it still references. */
    async function restoreLesson(id, now) {
      const l = await get("lessons", id); if (!l) throw new Error("lesson not found: " + id);
      l.deletedAt = null; model.markUpdated(l, now); await putLesson(l);
      for (const cid of l.cardIds) {
        const c = await get("cards", cid);
        if (c && c.deletedAt != null) { c.deletedAt = null; model.markUpdated(c, now); await putCard(c); }
      }
      return l;
    }

    /** Tombstoned lessons for an owner, newest-deleted first (Recently deleted). */
    async function listDeletedLessons(ownerId) {
      return (await all("lessons"))
        .filter((l) => l.ownerId === ownerId && l.deletedAt != null)
        .sort((a, b) => String(b.deletedAt).localeCompare(String(a.deletedAt)));
    }

    /** Append source's cards into target, then tombstone the source lesson (cards kept). */
    async function mergeLessons(targetId, sourceId, now) {
      const t = await getLesson(targetId), s = await getLesson(sourceId);
      if (!t || !s) throw new Error("lesson not found");
      const have = new Set(t.cardIds);
      for (const cid of s.cardIds) if (!have.has(cid)) t.cardIds.push(cid);
      model.markUpdated(t, now); await putLesson(t);
      model.softDelete(s, now); await putLesson(s);
      return t;
    }

    /** Move cards at [atIndex..] into a new second lesson; keep the rest in the first. */
    async function splitLesson(id, atIndex, secondName, now) {
      const l = await getLesson(id); if (!l) throw new Error("lesson not found: " + id);
      if (!(atIndex > 0 && atIndex < l.cardIds.length)) throw new Error("split index out of range: " + atIndex);
      const moved = l.cardIds.slice(atIndex);
      const second = model.createLesson(
        { ownerId: l.ownerId, deckId: l.deckId, name: secondName, source: l.source, cardIds: moved }, now);
      l.cardIds = l.cardIds.slice(0, atIndex);
      model.markUpdated(l, now);
      await putLesson(second); await putLesson(l);
      return { first: l, second };
    }

    /** Move one card between lessons (membership only; progress unaffected). */
    async function moveCard(cardId, fromLessonId, toLessonId, now) {
      const from = await getLesson(fromLessonId), to = await getLesson(toLessonId);
      if (!from || !to) throw new Error("lesson not found");
      from.cardIds = from.cardIds.filter((x) => x !== cardId);
      if (!to.cardIds.includes(cardId)) to.cardIds.push(cardId);
      model.markUpdated(from, now); model.markUpdated(to, now);
      await putLesson(from); await putLesson(to);
      return { from, to };
    }

    /** Patch a card: front/back/accepts/category/strictMode. */
    async function editCard(cardId, patch, now) {
      const c = await getCard(cardId); if (!c) throw new Error("card not found: " + cardId);
      if (patch.front != null) c.front = String(patch.front);
      if (patch.back != null) c.back = String(patch.back);
      if (patch.accepts) c.accepts = patch.accepts.slice();
      if ("category" in patch) c.category = patch.category == null ? null : String(patch.category);
      if (patch.strictMode) c.strictMode = patch.strictMode;
      model.markUpdated(c, now); await putCard(c); return c;
    }

    /** Create a card and append it to a lesson. */
    async function addCard(input, lessonId, now) {
      const l = await getLesson(lessonId); if (!l) throw new Error("lesson not found: " + lessonId);
      const card = model.createCard(input, now);
      await putCard(card);
      l.cardIds.push(card.id); model.markUpdated(l, now); await putLesson(l);
      return card;
    }

    /** Tombstone a card and drop it from its lesson. */
    async function deleteCard(cardId, lessonId, now) {
      const c = await getCard(cardId); if (!c) throw new Error("card not found: " + cardId);
      model.softDelete(c, now); await putCard(c);
      const l = await getLesson(lessonId);
      if (l) { l.cardIds = l.cardIds.filter((x) => x !== cardId); model.markUpdated(l, now); await putLesson(l); }
      return c;
    }

    /** Un-tombstone a single card and re-add it to a lesson (word-delete undo). */
    async function restoreCard(cardId, lessonId, now) {
      const c = await get("cards", cardId); if (!c) return null;
      c.deletedAt = null; model.markUpdated(c, now); await putCard(c);
      const l = await getLesson(lessonId);
      if (l && !l.cardIds.includes(cardId)) { l.cardIds.push(cardId); model.markUpdated(l, now); await putLesson(l); }
      return c;
    }

    /** Hard-delete tombstoned lessons + cards older than ttlDays (the real 7-day purge). */
    async function purgeExpired(ownerId, now, ttlDays = 7) {
      const cutoff = now - ttlDays * 86400000;
      let purged = 0;
      for (const coll of ["lessons", "cards"]) {
        for (const rec of await all(coll)) {
          if (rec.ownerId === ownerId && rec.deletedAt != null && Date.parse(rec.deletedAt) < cutoff) {
            await adapter.remove(coll, rec.id); purged++;
          }
        }
      }
      return purged;
    }

    return {
      COLLECTIONS,
      adapter,
      // users
      putUser, getUser, listUsers,
      // content
      putDeck, putLesson, putCard, listDecks, listLessons, listCards, cardsByIds,
      getLesson, getCard,
      // content management (Phase 4)
      renameLesson, deleteLesson, restoreLesson, listDeletedLessons,
      mergeLessons, splitLesson, moveCard,
      editCard, addCard, deleteCard, restoreCard, purgeExpired,
      // study
      studyContext, getProgress, review, selectDue,
    };
  }

  return { createStore, COLLECTIONS };
});
