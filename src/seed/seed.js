// @ts-check
/**
 * Seed (M1) — turns Aliyah's reviewed homework into her starting content: a
 * "Spanish Core" deck, one lesson per assignment, a card per pair, with the
 * printed sub-headings stored as each card's `category` (bilingual section).
 *
 * Sources: the Vacation unit from vocabulary.js (51 cards, one lesson) + the
 * vision-pass lessons from seed-data.js. Idempotent: only seeds a user who has
 * no seed lessons yet. Future homework is layered in via import (source "ocr").
 */
(function (root, factory) {
  "use strict";
  if (typeof module === "object" && module.exports) {
    module.exports = factory(
      require("../model/model.js"),
      require("../../vocabulary.js"),
      require("./seed-data.js")
    );
  } else {
    root.SpanishFlashcardsSeed = factory(
      root.SpanishFlashcardsModel,
      root.SpanishFlashcardsVocabulary,
      root.SpanishFlashcardsSeedData
    );
  }
})(typeof self !== "undefined" ? self : this, function (model, vocab, seedData) {
  "use strict";

  const DECK_NAME = "Spanish Core";

  /**
   * @param {any} store
   * @param {string} ownerId
   * @param {number} [now]
   * @returns {Promise<{seeded: boolean, deck?: any, lessons?: any[], cards?: any[]}>}
   */
  async function seedUser(store, ownerId, now) {
    const existing = await store.listLessons(ownerId);
    if (existing.some((l) => l.source === "seed")) return { seeded: false };

    const deck = model.createDeck({ ownerId, name: DECK_NAME, frontLocale: "es", backLocale: "en" }, now);
    await store.putDeck(deck);

    const lessons = [];
    const cards = [];

    /**
     * @param {string} name
     * @param {Array<{cat: string, pairs: [string,string][]}>} sections
     */
    async function addLesson(name, sections) {
      const cardIds = [];
      for (const sec of sections) {
        for (const [es, en] of sec.pairs) {
          const card = model.createCard(
            { ownerId, deckId: deck.id, front: es, back: en, category: sec.cat },
            now
          );
          await store.putCard(card);
          cards.push(card);
          cardIds.push(card.id);
        }
      }
      const lesson = model.createLesson(
        { ownerId, deckId: deck.id, name, source: "seed", cardIds },
        now
      );
      await store.putLesson(lesson);
      lessons.push(lesson);
      return lesson;
    }

    // Vacation (Unit 1, Lesson 2) — the existing vocabulary.js 51, one lesson,
    // its categories kept as sections.
    const byCat = new Map();
    for (const v of vocab.VOCABULARY) {
      if (!byCat.has(v.cat)) byCat.set(v.cat, []);
      byCat.get(v.cat).push([v.es, v.en]);
    }
    const vacSections = [...byCat.entries()].map(([cat, pairs]) => ({ cat, pairs }));
    await addLesson("Vacation — Unit 1, Lesson 2", vacSections);

    // The vision-pass lessons.
    for (const L of seedData.SEED_LESSONS) await addLesson(L.name, L.sections);

    return { seeded: true, deck, lessons, cards };
  }

  return { seedUser, DECK_NAME };
});
