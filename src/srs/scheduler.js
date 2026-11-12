// @ts-check
/**
 * SRS scheduler (M1 → FSRS-6) — the Free Spaced Repetition Scheduler.
 *
 * Replaces the earlier SM-2-lite with FSRS-6 (models memory as Difficulty +
 * Stability, schedules to a target retention), keeping the same pure interface
 * (`initSrs` / `grade` / `selectDue`): `now` (epoch ms) is always injected, never
 * read from the clock inside, so every transition is deterministic + unit-testable.
 *
 * Default weights are the published FSRS-6 defaults; the long-term formulas are the
 * standard FSRS set (S0 / D0 / difficulty mean-reversion / recall + lapse stability /
 * retrievability / interval). Same-day (short-term) review refinements (w17–w19) are
 * intentionally omitted — the daily study loop never needs them, and an "again" uses a
 * short 10-minute relearning step (the memory state still updates via the lapse formula).
 *
 * Migration: a card carrying an old SM-2 state (no `stability`/`difficulty`) is treated
 * as a first review on its next grade — FSRS state is initialized fresh (acceptable: no
 * real review history exists yet). Fields kept: reps, lapses, dueAt, lastReviewedAt.
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
  const AGAIN_DELAY_MIN = 10; // relearning step for a failed card

  // Published FSRS-6 default weights (w[0]..w[20]).
  const W = [
    0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001, 1.8722, 0.1666,
    0.796, 1.4835, 0.0614, 0.2629, 1.6483, 0.6014, 1.8729, 0.5425, 0.0912, 0.0658, 0.1542,
  ];
  const DECAY = -W[20];
  const FACTOR = Math.pow(0.9, 1 / DECAY) - 1; // ⇒ R(S,S)=0.9 and I(S)=S at r=0.9
  const REQUEST_RETENTION = 0.9;

  const S_MIN = 0.01, S_MAX = 36500;
  const D_MIN = 1, D_MAX = 10;
  const MAX_INTERVAL = 36500; // days

  const GRADE = { again: 1, hard: 2, good: 3, easy: 4 };

  const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
  const iso = (ms) => new Date(ms).toISOString();

  /** Initial stability for a first-review grade (days). */
  const initStability = (g) => clamp(W[g - 1], S_MIN, S_MAX);
  /** Initial difficulty for a first-review grade. */
  const initDifficulty = (g) => clamp(W[4] - Math.exp(W[5] * (g - 1)) + 1, D_MIN, D_MAX);

  /** Probability the card is still recalled after `t` days at stability `s`. */
  function retrievability(t, s) {
    return Math.pow(1 + (FACTOR * Math.max(0, t)) / s, DECAY);
  }
  /** Interval (whole days) that lands on the target retention for stability `s`. */
  function nextInterval(s) {
    const i = (s / FACTOR) * (Math.pow(REQUEST_RETENTION, 1 / DECAY) - 1);
    return clamp(Math.round(i), 1, MAX_INTERVAL);
  }
  /** Difficulty after a grade, with linear damping + mean-reversion toward D0(easy). */
  function nextDifficulty(d, g) {
    const delta = -W[6] * (g - 3) * (10 - d) / 9;
    const dPrime = d + delta;
    return clamp(W[7] * initDifficulty(4) + (1 - W[7]) * dPrime, D_MIN, D_MAX);
  }
  /** New stability after a successful recall (hard/good/easy). */
  function recallStability(d, s, r, g) {
    const hard = g === 2 ? W[15] : 1;
    const easy = g === 4 ? W[16] : 1;
    const grow = Math.exp(W[8]) * (11 - d) * Math.pow(s, -W[9]) * (Math.exp(W[10] * (1 - r)) - 1) * hard * easy;
    return clamp(s * (1 + grow), S_MIN, S_MAX);
  }
  /** New stability after a lapse ("again"); never exceeds the current stability. */
  function lapseStability(d, s, r) {
    const sf = W[11] * Math.pow(d, -W[12]) * (Math.pow(s + 1, W[13]) - 1) * Math.exp(W[14] * (1 - r));
    return clamp(Math.min(sf, s), S_MIN, S_MAX);
  }

  /**
   * Fresh state for a never-seen card: due immediately, no memory yet.
   * @param {number} now epoch ms @returns {SrsState}
   */
  function initSrs(now) {
    return {
      stability: null,
      difficulty: null,
      dueAt: iso(now),
      lastReviewedAt: null,
      reps: 0,
      lapses: 0,
      intervalDays: 0,
    };
  }

  /**
   * Apply a grade, returning a NEW SrsState (never mutates the input).
   * @param {SrsState} srs @param {Grade} gradeStr @param {number} now epoch ms
   * @returns {SrsState}
   */
  function grade(srs, gradeStr, now) {
    const g = GRADE[gradeStr];
    if (!g) throw new Error("unknown grade: " + gradeStr);

    const hasMemory = typeof srs.stability === "number" && typeof srs.difficulty === "number";
    const firstReview = srs.reps === 0 || !hasMemory;

    let stability, difficulty;
    let lapses = srs.lapses || 0;
    let intervalDays, dueMs;

    if (firstReview) {
      stability = initStability(g);
      difficulty = initDifficulty(g);
    } else {
      const t = srs.lastReviewedAt ? (now - Date.parse(srs.lastReviewedAt)) / DAY_MS : 0;
      const r = retrievability(t, srs.stability);
      difficulty = nextDifficulty(srs.difficulty, g);
      stability = g === 1
        ? lapseStability(srs.difficulty, srs.stability, r)
        : recallStability(srs.difficulty, srs.stability, r, g);
    }

    if (g === 1) {
      lapses += 1;
      intervalDays = AGAIN_DELAY_MIN / 1440; // relearning step, in days
      dueMs = now + AGAIN_DELAY_MIN * MIN_MS;
    } else {
      intervalDays = nextInterval(stability);
      dueMs = now + intervalDays * DAY_MS;
    }

    return {
      stability,
      difficulty,
      dueAt: iso(dueMs),
      lastReviewedAt: iso(now),
      reps: srs.reps + 1,
      lapses,
      intervalDays,
    };
  }

  /**
   * Choose which cards to study, most-overdue first, then never-seen cards.
   * The caller passes only the items for the selected lesson(s) (lesson filtering
   * lives at the call site, keeping this pure).
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
      if (!it.srs || it.srs.reps === 0) unseen.push(it);
      else if (Date.parse(it.srs.dueAt) <= now) due.push(it);
    }
    due.sort((a, b) => Date.parse(a.srs.dueAt) - Date.parse(b.srs.dueAt));
    const ordered = due.concat(unseen).map((it) => it.card);
    return typeof limit === "number" ? ordered.slice(0, limit) : ordered;
  }

  return {
    initSrs, grade, selectDue,
    retrievability, nextInterval, nextDifficulty,
    WEIGHTS: W, REQUEST_RETENTION, DECAY, FACTOR,
  };
});
