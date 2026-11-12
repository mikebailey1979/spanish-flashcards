"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const srs = require("../src/srs/scheduler.js");

const T0 = Date.UTC(2026, 0, 1, 12, 0, 0);
const DAY = 86400000;
const MIN = 60000;
const approx = (a, b, eps = 1e-3) => assert.ok(Math.abs(a - b) <= eps, `${a} ≈ ${b}`);

test("initSrs: new card due now, no memory yet, unseen", () => {
  const s = srs.initSrs(T0);
  assert.equal(s.reps, 0);
  assert.equal(s.lapses, 0);
  assert.equal(s.stability, null);
  assert.equal(s.difficulty, null);
  assert.equal(Date.parse(s.dueAt), T0);
});

test("first 'good': stability = S0(3) = w2, interval = round(S) days, reps 1", () => {
  const s = srs.grade(srs.initSrs(T0), "good", T0);
  assert.equal(s.reps, 1);
  approx(s.stability, srs.WEIGHTS[2]); // 2.3065
  assert.equal(s.intervalDays, 2); // round(2.3065)
  assert.equal(Date.parse(s.dueAt), T0 + 2 * DAY);
  assert.ok(s.difficulty >= 1 && s.difficulty <= 10);
});

test("first 'easy' schedules further out than first 'good'", () => {
  const start = srs.initSrs(T0);
  const good = srs.grade(start, "good", T0);
  const easy = srs.grade(start, "easy", T0);
  assert.ok(easy.intervalDays > good.intervalDays, `${easy.intervalDays} > ${good.intervalDays}`);
  approx(easy.stability, srs.WEIGHTS[3]); // 8.2956
});

test("'again' counts a lapse, re-dues in 10 min, never raises stability", () => {
  let s = srs.grade(srs.initSrs(T0), "good", T0); // S ≈ 2.3065
  const prev = s.stability;
  s = srs.grade(s, "again", T0 + 2 * DAY);
  assert.equal(s.lapses, 1);
  assert.equal(Date.parse(s.dueAt), T0 + 2 * DAY + 10 * MIN);
  assert.ok(s.stability <= prev, "lapse never increases stability");
  assert.equal(s.reps, 2);
});

test("a successful review grows stability and the interval", () => {
  const first = srs.grade(srs.initSrs(T0), "good", T0);
  const second = srs.grade(first, "good", T0 + first.intervalDays * DAY);
  assert.ok(second.stability > first.stability, `${second.stability} > ${first.stability}`);
  assert.ok(second.intervalDays > first.intervalDays);
});

test("difficulty stays within [1,10] across many mixed reviews", () => {
  let s = srs.initSrs(T0);
  let t = T0;
  for (const g of ["again", "good", "hard", "good", "easy", "again", "good", "good"]) {
    s = srs.grade(s, g, t);
    t += (s.intervalDays || 0.01) * DAY;
    assert.ok(s.difficulty >= 1 && s.difficulty <= 10, `difficulty ${s.difficulty}`);
  }
});

test("retrievability: ~0.9 at t=S, 1.0 at t=0, falls as time passes", () => {
  const s = 10;
  approx(srs.retrievability(s, s), 0.9);
  approx(srs.retrievability(0, s), 1.0, 1e-9);
  assert.ok(srs.retrievability(2 * s, s) < srs.retrievability(s, s));
});

test("migrates an old SM-2 state (no stability) without crashing", () => {
  const legacy = {
    box: 2, ease: 2.5, intervalDays: 4,
    dueAt: new Date(T0).toISOString(), lastReviewedAt: new Date(T0).toISOString(),
    reps: 3, lapses: 0,
  };
  const s = srs.grade(legacy, "good", T0 + DAY);
  assert.equal(typeof s.stability, "number");
  assert.equal(typeof s.difficulty, "number");
  assert.equal(s.reps, 4);
  assert.ok(s.intervalDays >= 1);
});

test("selectDue: overdue-first, then unseen, respecting limit", () => {
  const mk = (dueOffsetDays, reps) => ({
    stability: 5, difficulty: 5, intervalDays: 5,
    dueAt: new Date(T0 + dueOffsetDays * DAY).toISOString(),
    lastReviewedAt: new Date(T0).toISOString(), reps, lapses: 0,
  });
  const items = [
    { card: "future", srs: mk(5, 3) },
    { card: "due-mild", srs: mk(-1, 3) },
    { card: "due-worst", srs: mk(-10, 3) },
    { card: "unseen", srs: null },
    { card: "unseen2", srs: mk(0, 0) },
  ];
  assert.deepEqual(srs.selectDue(items, T0), ["due-worst", "due-mild", "unseen", "unseen2"]);
  assert.deepEqual(srs.selectDue(items, T0, 2), ["due-worst", "due-mild"]);
});

test("grade is deterministic and never mutates the input", () => {
  const s = srs.initSrs(T0);
  const snap = JSON.stringify(s);
  const a = srs.grade(s, "good", T0 + DAY);
  const b = srs.grade(s, "good", T0 + DAY);
  assert.equal(JSON.stringify(s), snap, "input untouched");
  assert.deepEqual(a, b, "same inputs ⇒ same output");
});
