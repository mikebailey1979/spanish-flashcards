// @ts-check
/**
 * Forgiving answer matching (M1) — "accept unless the form is the lesson."
 *
 * Builds on the existing, tested answer-utils.js (accent/case/punctuation
 * normalization, "/"-alternatives, parentheticals) and layers the confirmed
 * tolerances, each switchable OFF per card via `strict` where the form IS the
 * teaching point:
 *   - multi-translation: any subset of a card's accepted answers, in any order,
 *     joined by anything (space, comma, /, &, and/or/y/o)
 *   - leading/in-phrase articles optional & interchangeable (the ≡ a ≡ none;
 *     ES el/la/los/las/un/una/…) and the infinitive "to"  [strict.article]
 *   - English possessives optional/interchangeable (my/your/one's/…) [strict.article]
 *   - hyphen ≡ space ≡ nothing (fruit-flavored = fruit flavored) [always on]
 *   - singular ⇄ plural                                          [strict.plural]
 *   - edit-distance-1 typo, token length ≥ 4                     [strict.typo]
 *
 * `isCorrect(input, card)` → { correct, why } where why is
 * exact | variant | article | plural | typo | null.
 *
 * NOTE (M3): the rule tables below are the seed of the "config-driven matcher"
 * in MATCHING-STRATEGY.md; dispute-learned rules get appended here.
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

  const { normalizeAnswer, answerVariants, editDistance } = answers;

  // Function words dropped when article tolerance is on (gated by strict.article).
  // Normalization has already lowercased, stripped accents, and removed apostrophes
  // (so "one's" → "ones").
  const ARTICLES = new Set([
    "el", "la", "los", "las", "un", "una", "unos", "unas", // ES articles
    "the", "a", "an", // EN articles
    "to", // EN infinitive marker
  ]);
  const POSSESSIVES = new Set(["my", "your", "his", "her", "its", "our", "their", "ones"]);
  // Words that merely join alternatives ("A and B", "A or B", ES "A y B / A o B").
  const CONNECTORS = new Set(["and", "or", "y", "o"]);

  /** @param {string} s normalized @returns {string} hyphen/space/none-insensitive key */
  function despace(s) {
    return s.replace(/\s+/g, "");
  }

  /** Drop leading/in-phrase articles & possessives (unless strict.article). @param {string} s @param {object} strict */
  function stripFunctionWords(s, strict) {
    if (strict && strict.article) return s;
    return s
      .split(" ")
      .filter((t) => t && !ARTICLES.has(t) && !POSSESSIVES.has(t))
      .join(" ");
  }

  /** Crude, symmetric singularization (accents already stripped). @param {string} w */
  function singularizeWord(w) {
    if (w.length < 4) return w;
    if (w.endsWith("ces")) return w.slice(0, -3) + "z"; // lapices -> lapiz
    if (w.endsWith("es")) return w.slice(0, -2);
    if (w.endsWith("s")) return w.slice(0, -1);
    return w;
  }
  /** @param {string} s */
  function singularize(s) {
    return s.split(" ").map(singularizeWord).join(" ");
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
    return [...new Set(out.filter(Boolean))];
  }

  /**
   * Can the normalized input be fully covered by a sequence of accepted
   * alternatives? Handles any order, any separator (all are spaces post-
   * normalization), connector words, and multi-word alternatives.
   * @param {string} norm @param {string[]} accepted @returns {boolean}
   */
  function partitionsIntoAccepted(norm, accepted) {
    const alts = accepted.filter(Boolean).map((a) => a.split(" ").filter(Boolean));
    if (!alts.length) return false;
    const tokens = norm.split(" ").filter((t) => t && !CONNECTORS.has(t));
    if (!tokens.length) return false;
    const n = tokens.length;
    const reach = new Array(n + 1).fill(false);
    reach[0] = true;
    for (let i = 0; i < n; i++) {
      if (!reach[i]) continue;
      for (const alt of alts) {
        const len = alt.length;
        if (i + len <= n && alt.every((w, k) => w === tokens[i + k])) reach[i + len] = true;
      }
    }
    return reach[n];
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
    const accepted = acceptedVariants(card);
    if (!accepted.length) return { correct: false, why: null };

    // 1) exact
    if (accepted.includes(normIn)) return { correct: true, why: "exact" };

    // 2) variant: hyphen/space/none-insensitive, OR any combination of accepted answers
    const inKey = despace(normIn);
    if (accepted.some((v) => despace(v) === inKey)) return { correct: true, why: "variant" };
    if (partitionsIntoAccepted(normIn, accepted)) return { correct: true, why: "variant" };

    // 3) articles/possessives optional & interchangeable (anywhere), gated
    if (!strict.article) {
      const inStripped = stripFunctionWords(normIn, strict);
      const strippedAccepted = accepted.map((v) => stripFunctionWords(v, strict));
      const inStrippedKey = despace(inStripped);
      if (strippedAccepted.some((v) => v === inStripped || despace(v) === inStrippedKey)) {
        return { correct: true, why: "article" };
      }
      if (partitionsIntoAccepted(inStripped, strippedAccepted)) return { correct: true, why: "article" };
    }

    // 4) singular ⇄ plural, gated (respecting strict.article for the strip)
    if (!strict.plural) {
      const prep = (s) => singularize(stripFunctionWords(s, strict));
      const inSing = prep(normIn);
      if (accepted.some((v) => prep(v) === inSing)) return { correct: true, why: "plural" };
    }

    // 5) edit-distance-1 typo, both sides long enough; never bridge a strict rule
    if (!strict.typo && normIn.length >= 4) {
      const bridgesStrict = (v) =>
        (strict.plural && singularize(normIn) === singularize(v)) ||
        (strict.article && stripFunctionWords(normIn, {}) === stripFunctionWords(v, {}));
      if (
        accepted.some(
          (v) => v.length >= 4 && v !== normIn && editDistance(normIn, v) <= 1 && !bridgesStrict(v)
        )
      ) {
        return { correct: true, why: "typo" };
      }
    }

    return { correct: false, why: null };
  }

  return { isCorrect, stripFunctionWords, singularize, partitionsIntoAccepted, acceptedVariants, ARTICLES, POSSESSIVES };
});
