// @ts-check
/**
 * Lesson import (M3) — the commit step behind the photo → OCR → HITL-review flow.
 *
 * The AI/OCR pipeline (a Netlify Function; see src/ai/ai-adapter.js) produces a
 * *proposed* structured lesson; the admin reviews/edits it; then `importLesson`
 * writes it to the local store as an `ocr`-sourced lesson (it then syncs like
 * anything else). This module is the pure, testable commit — no network.
 *
 * Accepts either shape the proposer may emit:
 *   { name, source?, cards:    [{front, back, category?, strict?, accepts?}] }
 *   { name, source?, sections: [{cat, pairs: [[es, en]]}] }   // same as seed-data
 */
(function (root, factory) {
  "use strict";
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("../model/model.js"));
  } else {
    root.SpanishFlashcardsImport = factory(root.SpanishFlashcardsModel);
  }
})(typeof self !== "undefined" ? self : this, function (model) {
  "use strict";

  /** Normalize either input shape to a flat card list. */
  function toCards(lesson) {
    if (lesson.cards) return lesson.cards.slice();
    const out = [];
    for (const sec of lesson.sections || []) {
      for (const [front, back] of sec.pairs || []) out.push({ front, back, category: sec.cat });
    }
    return out;
  }

  /** Get the user's deck named `name`, creating it if absent. */
  async function ensureDeck(store, ownerId, name, now) {
    const decks = await store.listDecks(ownerId);
    const existing = decks.find((d) => d.name === name);
    if (existing) return existing;
    const deck = model.createDeck({ ownerId, name, frontLocale: "es", backLocale: "en" }, now);
    await store.putDeck(deck);
    return deck;
  }

  /**
   * Commit a reviewed/approved lesson for a user. Dedupes cards by normalized
   * front within the import (a photo often repeats a word across sections).
   * @param {any} store
   * @param {string} ownerId
   * @param {{name: string, source?: string, cards?: any[], sections?: any[], deckName?: string}} lesson
   * @param {number} [now]
   * @returns {Promise<{lesson: any, deck: any, cardCount: number, skipped: number}>}
   */
  async function importLesson(store, ownerId, lesson, now) {
    const deck = await ensureDeck(store, ownerId, lesson.deckName || "Spanish Core", now);
    const cards = toCards(lesson);
    const seen = new Set();
    const cardIds = [];
    let skipped = 0;
    for (const c of cards) {
      const key = String(c.front || "").trim().toLowerCase();
      if (!key || seen.has(key)) {
        skipped++;
        continue;
      }
      seen.add(key);
      const card = model.createCard(
        {
          ownerId,
          deckId: deck.id,
          front: c.front,
          back: c.back,
          category: c.category || null,
          strict: c.strict,
          accepts: c.accepts,
        },
        now
      );
      await store.putCard(card);
      cardIds.push(card.id);
    }
    const lessonRec = model.createLesson(
      { ownerId, deckId: deck.id, name: lesson.name, source: lesson.source || "ocr", cardIds },
      now
    );
    await store.putLesson(lessonRec);
    return { lesson: lessonRec, deck, cardCount: cardIds.length, skipped };
  }

  return { importLesson, ensureDeck, toCards };
});
