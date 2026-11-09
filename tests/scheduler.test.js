"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const srs = require("../src/srs/scheduler.js");

const T0 = Date.UTC(2026, 0, 1, 12, 0, 0);
const DAY = 86400000;
const MIN = 60000;

test("initSrs: a new card is due immediately, box 0, unseen", () => {
  const s = srs.initSrs(T0);
  assert.equal(s.box, 0);
  assert.equal(s.reps, 0);
  assert.equal(s.lapses, 0);
  assert.equal(s.ease, 2.5);
  assert.equal(Date.parse(s.dueAt), T0);
});

test("again: resets to box 0, counts a lapse, drops ease, re-due in 10 min", () => {
  let s = srs.initSrs(T0);
  s = srs.grade(s, "good", T0); // climb a bit first
  s = srs.grade(s, "again", T0 + DAY);
  assert.equal(s.box, 0);
  assert.equal(s.lapses, 1);
  assert.equal(s.ease, 2.3); // 2.5 - 0.2
  assert.equal(Date.parse(s.dueAt), T0 + DAY + 10 * MIN);
  assert.equal(s.reps, 2);
});

test("good climbs the ladder: box 0→1 is 2 days, →2 is 4 days", () => {
  let s = srs.initSrs(T0);
  s = srs.grade(s, "good", T0);
  assert.equal(s.box, 1);
  assert.equal(s.intervalDays, srs.GOOD_LADDER[1]); // 2
  assert.equal(Date.parse(s.dueAt), T0 + 2 * DAY);
  s = srs.grade(s, "good", T0 + 2 * DAY);
  assert.equal(s.box, 2);
  assert.equal(s.intervalDays, srs.GOOD_LADDER[2]); // 4
});

test("ease has a 1.3 floor even after many 'again's", () => {
  let s = srs.initSrs(T0);
  for (let i = 0; i < 12; i++) s = srs.grade(s, "again", T0 + i * DAY);
  assert.ok(s.ease >= srs.EASE_FLOOR);
  assert.equal(s.ease, srs.EASE_FLOOR);
});

test("easy gives a longer interval than good from the same state", () => {
  const start = srs.initSrs(T0);
  const good = srs.grade(start, "good", T0);
  const easy = srs.grade(start, "easy", T0);
  assert.ok(easy.intervalDays > good.intervalDays, `${easy.intervalDays} > ${good.intervalDays}`);
  assert.ok(easy.ease > good.ease); // easy bumps ease, good leaves it
});

test("hard keeps the box, nudges interval up ~1.2x, lowers ease", () => {
  let s = srs.initSrs(T0);
  s = srs.grade(s, "good", T0); // box1, interval 2
  s = srs.grade(s, "good", T0); // box2, interval 4
  const before = s.intervalDays;
  const beforeBox = s.box;
  s = srs.grade(s, "hard", T0);
  assert.equal(s.box, beforeBox);
  assert.equal(s.intervalDays, Math.max(1, Math.round(before * 1.2)));
  assert.ok(s.ease < 2.5);
});

test("box caps at 5", () => {
  let s = srs.initSrs(T0);
  for (let i = 0; i < 10; i++) s = srs.grade(s, "good", T0 + i * 100 * DAY);
  assert.equal(s.box, 5);
});

test("selectDue: overdue-first, then unseen, respecting limit", () => {
  const mk = (dueOffsetDays, reps) => ({
    box: 1, ease: 2.5, intervalDays: 1,
    dueAt: new Date(T0 + dueOffsetDays * DAY).toISOString(),
    lastReviewedAt: new Date(T0).toISOString(), reps, lapses: 0,
  });
  const items = [
    { card: "future", srs: mk(5, 3) },      // not due
    { card: "due-mild", srs: mk(-1, 3) },    // 1 day overdue
    { card: "due-worst", srs: mk(-10, 3) },  // 10 days overdue
    { card: "unseen", srs: null },           // never seen
    { card: "unseen2", srs: mk(0, 0) },      // reps 0 counts as unseen
  ];
  const now = T0;
  const all = srs.selectDue(items, now);
  assert.deepEqual(all, ["due-worst", "due-mild", "unseen", "unseen2"]);
  const capped = srs.selectDue(items, now, 2);
  assert.deepEqual(capped, ["due-worst", "due-mild"]);
});

test("grade never mutates the input state", () => {
  const s = srs.initSrs(T0);
  const snapshot = JSON.stringify(s);
  srs.grade(s, "good", T0 + DAY);
  assert.equal(JSON.stringify(s), snapshot);
});
