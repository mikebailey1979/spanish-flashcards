// @ts-check
/**
 * Seed (M1) — turns the reviewed vocabulary.js entries into a user's starting
 * content: a "Spanish Core" deck with one lesson per category, a card per entry.
 * Idempotent: it only seeds a user who has no seed lessons yet.
 *
 * NOTE: this seeds the clean 51 vacation entries as Aliyah's base content. Her
 * real homework (the OCR'd photo sets, deduped and grouped) is layered in later
 * via the import flow after HITL review; those lessons use source "ocr".
 */
(function (root, factory) {
  "use strict";
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("../model/model.js"), require("../../vocabulary.js"));
  } else {
    root.SpanishFlashcardsSeed = factory(root.SpanishFlashcardsModel, root.SpanishFlashcardsVocabulary);
  }
})(typeof self !== "undefined" ? self : this, function (model, vocab) {
  "use strict";

  const DECK_NAME = "Spanish Core";

  /**
   * Seed `ownerId`'s base lessons from vocabulary.js. Returns a summary.
   * @param {any} store
   * @param {string} ownerId
   * @param {number} [now] epoch ms (injected for deterministic ids-independent timestamps)
   * @returns {Promise<{seeded: boolean, deck?: any, lessons?: any[], cards?: any[]}>}
   */
  async function seedUser(store, ownerId, now) {
    const existing = await store.listLessons(ownerId);
    if (existing.some((l) => l.source === "seed")) return { seeded: false };

    const deck = model.createDeck({ ownerId, name: DECK_NAME, frontLocale: "es", backLocale: "en" }, now);
    await store.putDeck(deck);

    // Group entries by category, preserving first-seen order.
    /** @type {Map<string, {es:string,en:string}[]>} */
    const groups = new Map();
    for (const entry of vocab.VOCABULARY) {
      if (!groups.has(entry.cat)) groups.set(entry.cat, []);
      groups.get(entry.cat).push({ es: entry.es, en: entry.en });
    }

    const lessons = [];
    const cards = [];
    for (const [cat, entries] of groups) {
      const cardIds = [];
      for (const e of entries) {
        const card = model.createCard(
          { ownerId, deckId: deck.id, front: e.es, back: e.en, strict: {} },
          now
        );
        await store.putCard(card);
        cards.push(card);
        cardIds.push(card.id);
      }
      const lesson = model.createLesson(
        { ownerId, deckId: deck.id, name: cat, source: "seed", cardIds },
        now
      );
      await store.putLesson(lesson);
      lessons.push(lesson);
    }

    return { seeded: true, deck, lessons, cards };
  }

  return { seedUser, DECK_NAME };
});
