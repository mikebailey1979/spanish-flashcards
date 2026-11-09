// @ts-check
/**
 * Forgiving answer matching (M1) — builds on the existing, tested answer-utils.js
 * (accent/case/punctuation normalization, "/"-alternatives, parentheticals,
 * "or/and/y/o" joins) and layers the §9A tolerances that are each switched OFF
 * by a per-card `strict` flag where the form IS the lesson:
 *   - leading article/particle (strict.article)
 *   - singular ⇄ plural          (strict.plural)
 *   - edit-distance-1 typo, len ≥ 4 (strict.typo)
 *
 * `isCorrect(input, card)` returns { correct, why } where why is one of
 * exact | variant | article | plural | typo | null.
 *
 * @typedef {import("../model/model.js").Card} Card
 */
(function (root, factory) {
  "use strict";
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("../../answer-utils.js"));
  } else {
    root.SpanishFlashcardsMatcher = factory(root.SpanishFlashcardsAnswers);
  }
})(typeof self !== "undefined" ? self : this, function (answers) {
  "use strict";

  const { normalizeAnswer, answerVariants, exactAnswerMatches, editDistance } = answers;

  // Determiners/particles stripped from the FRONT of an answer when article
  // tolerance is on. "to" covers English infinitives ("to camp" ⇄ "camp").
  const LEADING = new Set([
    "el", "la", "los", "las", "un", "una", "unos", "unas", // ES articles
    "the", "a", "an", // EN articles
    "to", // EN infinitive marker
  ]);

  /** @param {string} norm normalized string @returns {string} */
  function stripLeading(norm) {
    const parts = norm.split(" ");
    if (parts.length > 1 && LEADING.has(parts[0])) return parts.slice(1).join(" ");
    return norm;
  }

  /** Crude, symmetric singularization (accents already stripped upstream). @param {string} w */
  function singularizeWord(w) {
    if (w.length < 4) return w;
    if (w.endsWith("ces")) return w.slice(0, -3) + "z"; // lapices -> lapiz
    if (w.endsWith("es")) return w.slice(0, -2); // libros? no; handles "flashes"->"flash"
    if (w.endsWith("s")) return w.slice(0, -1); // libros -> libro
    return w;
  }

  /** @param {string} norm @returns {string} */
  function singularize(norm) {
    return norm.split(" ").map(singularizeWord).join(" ");
  }

  /** @param {Card} card @returns {string[]} the back plus any extra accepted strings */
  function acceptedStrings(card) {
    const list = [card.back];
    if (card.accepts && card.accepts.length) list.push(...card.accepts);
    return list;
  }

  /** All normalized variants across every accepted string. @param {Card} card @returns {string[]} */
  function acceptedVariants(card) {
    const out = [];
    for (const s of acceptedStrings(card)) out.push(...answerVariants(s));
    return [...new Set(out)];
  }

  /**
   * @param {string} input
   * @param {Card} card
   * @returns {{correct: boolean, why: "exact"|"variant"|"article"|"plural"|"typo"|null}}
   */
  function isCorrect(input, card) {
    const strict = card.strict || {};
    const normIn = normalizeAnswer(input);
    if (!normIn) return { correct: false, why: null };

    // 1) exact / variant — defer to the existing matcher (handles / ( ) or/and/y/o).
    for (const candidate of acceptedStrings(card)) {
      if (exactAnswerMatches(input, candidate)) {
        const why = normIn === normalizeAnswer(candidate) ? "exact" : "variant";
        return { correct: true, why };
      }
    }

    const variants = acceptedVariants(card);

    // 2) leading article / particle (symmetric strip on both sides)
    if (!strict.article) {
      const inStripped = stripLeading(normIn);
      if (variants.some((v) => stripLeading(v) === inStripped)) {
        return { correct: true, why: "article" };
      }
    }

    // 3) singular ⇄ plural (symmetric). Only strip a leading article here when
    //    article tolerance is also on, so a strict.article card isn't forgiven
    //    an article via the plural step.
    if (!strict.plural) {
      const prep = (s) => singularize(strict.article ? s : stripLeading(s));
      const inSing = prep(normIn);
      if (variants.some((v) => prep(v) === inSing)) {
        return { correct: true, why: "plural" };
      }
    }

    // 4) edit-distance-1 typo, only when both sides are long enough to be safe.
    //    Guard: a typo match must not bridge a difference that a strict flag is
    //    there to protect (e.g. libros↔libro under strict.plural is a 1-edit gap).
    if (!strict.typo && normIn.length >= 4) {
      const bridgesStrictRule = (v) =>
        (strict.plural && singularize(normIn) === singularize(v)) ||
        (strict.article && stripLeading(normIn) === stripLeading(v));
      if (
        variants.some(
          (v) => v.length >= 4 && v !== normIn && editDistance(normIn, v) <= 1 && !bridgesStrictRule(v)
        )
      ) {
        return { correct: true, why: "typo" };
      }
    }

    return { correct: false, why: null };
  }

  return { isCorrect, stripLeading, singularize, acceptedStrings, acceptedVariants };
});
