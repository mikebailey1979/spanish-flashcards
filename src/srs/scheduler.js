// @ts-check
/**
 * SRS scheduler (M1) — Leitner / SM-2-lite with real due dates.
 *
 * Pure and deterministic: `now` (epoch ms) is always injected, never read from
 * the clock inside, so every transition is unit-testable. Operates on the
 * `SrsState` shape defined in ../model/model.js.
 *
 * @typedef {import("../model/model.js").SrsState} SrsState
 * @typedef {import("../model/model.js").Grade} Grade
 */
(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.SpanishFlashcardsScheduler = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const DAY_MS = 86400000;
  const MIN_MS = 60000;
  const AGAIN_DELAY_MIN = 10;
  const EASE_FLOOR = 1.3;
  const EASE_START = 2.5;
  const MAX_BOX = 5;
  // Interval (days) a "good" grade lands on, indexed by the box AFTER increment.
  const GOOD_LADDER = [1, 2, 4, 9, 21, 45];

  /** @param {number} e @returns {number} */
  function clampEase(e) {
    return Math.round(Math.max(EASE_FLOOR, e) * 100) / 100;
  }

  /** @param {number} ms @returns {string} */
  function iso(ms) {
    return new Date(ms).toISOString();
  }

  /**
   * Fresh state for a never-seen card: due immediately.
   * @param {number} now epoch ms
   * @returns {SrsState}
   */
  function initSrs(now) {
    return {
      box: 0,
      ease: EASE_START,
      intervalDays: 0,
      dueAt: iso(now),
      lastReviewedAt: null,
      reps: 0,
      lapses: 0,
    };
  }

  /**
   * Interval (days) for a successful climb, honoring the ladder then ease growth.
   * @param {number} prevBox @param {number} newBox @param {number} prevInterval @param {number} ease
   * @returns {number}
   */
  function climbInterval(prevBox, newBox, prevInterval, ease) {
    if (newBox > prevBox && newBox < GOOD_LADDER.length) return GOOD_LADDER[newBox];
    // At the cap (or already past the ladder): grow by ease.
    return Math.max(1, Math.round((prevInterval || 1) * ease));
  }

  /**
   * Apply a grade, returning a NEW SrsState (never mutates the input).
   * @param {SrsState} srs
   * @param {Grade} grade
   * @param {number} now epoch ms
   * @returns {SrsState}
   */
  function grade(srs, grade, now) {
    /** @type {SrsState} */
    const s = {
      box: srs.box,
      ease: srs.ease,
      intervalDays: srs.intervalDays,
      dueAt: srs.dueAt,
      lastReviewedAt: srs.lastReviewedAt,
      reps: srs.reps,
      lapses: srs.lapses,
    };

    let intervalDays;
    switch (grade) {
      case "again": {
        s.box = 0;
        s.lapses = srs.lapses + 1;
        s.ease = clampEase(srs.ease - 0.2);
        intervalDays = (AGAIN_DELAY_MIN * MIN_MS) / DAY_MS;
        s.dueAt = iso(now + AGAIN_DELAY_MIN * MIN_MS);
        break;
      }
      case "hard": {
        s.box = Math.max(1, srs.box);
        s.ease = clampEase(srs.ease - 0.15);
        intervalDays = Math.max(1, Math.round((srs.intervalDays || 1) * 1.2));
        s.dueAt = iso(now + intervalDays * DAY_MS);
        break;
      }
      case "good": {
        s.box = Math.min(MAX_BOX, srs.box + 1);
        s.ease = clampEase(srs.ease);
        intervalDays = climbInterval(srs.box, s.box, srs.intervalDays, srs.ease);
        s.dueAt = iso(now + intervalDays * DAY_MS);
        break;
      }
      case "easy": {
        s.box = Math.min(MAX_BOX, srs.box + 1);
        s.ease = clampEase(srs.ease + 0.15);
        const step = climbInterval(srs.box, s.box, srs.intervalDays, srs.ease);
        intervalDays = Math.max(step + 1, Math.round(step * 1.3));
        s.dueAt = iso(now + intervalDays * DAY_MS);
        break;
      }
      default:
        throw new Error("unknown grade: " + grade);
    }

    s.intervalDays = intervalDays;
    s.reps = srs.reps + 1;
    s.lastReviewedAt = iso(now);
    return s;
  }

  /**
   * Choose which cards to study, most-overdue first, then never-seen cards.
   * The caller passes only the items belonging to the selected lesson(s), so
   * lesson filtering lives at the call site (keeps this pure).
   *
   * @template T
   * @param {Array<{card: T, srs: SrsState|null}>} items  card + its progress (null = unseen)
   * @param {number} now epoch ms
   * @param {number} [limit] max cards to return (default: all)
   * @returns {T[]}
   */
  function selectDue(items, now, limit) {
    const due = [];
    const unseen = [];
    for (const it of items) {
      if (!it.srs || it.srs.reps === 0) {
        unseen.push(it);
      } else if (Date.parse(it.srs.dueAt) <= now) {
        due.push(it);
      }
    }
    // Most overdue first.
    due.sort((a, b) => Date.parse(a.srs.dueAt) - Date.parse(b.srs.dueAt));
    const ordered = due.concat(unseen).map((it) => it.card);
    return typeof limit === "number" ? ordered.slice(0, limit) : ordered;
  }

  return { initSrs, grade, selectDue, GOOD_LADDER, EASE_FLOOR, EASE_START, MAX_BOX };
});
