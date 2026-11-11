"use strict";
// Phase 4 — lesson + word content-management methods on the store.
const test = require("node:test");
const assert = require("node:assert/strict");
const model = require("../src/model/model.js");
const { createStore } = require("../src/store/store.js");
const { createMemoryAdapter } = require("../src/store/memory-adapter.js");

const T0 = Date.UTC(2026, 0, 1, 12, 0, 0);
const DAY = 86400000;

async function fixture() {
  const store = createStore(createMemoryAdapter());
  const aliyah = model.createUser({ email: "a@x.com", displayName: "Aliyah", role: "user" }, T0);
  await store.putUser(aliyah);
  const deck = model.createDeck({ ownerId: aliyah.id, name: "Spanish Core" }, T0);
  await store.putDeck(deck);
  const mk = async (front, back, cat) => {
    const c = model.createCard({ ownerId: aliyah.id, deckId: deck.id, front, back, category: cat || null }, T0);
    await store.putCard(c); return c;
  };
  const c1 = await mk("la manzana", "apple", "Fruit");
  const c2 = await mk("el plátano", "banana", "Fruit");
  const c3 = await mk("la zanahoria", "carrot", "Veg");
  const lesson = model.createLesson(
    { ownerId: aliyah.id, deckId: deck.id, name: "Food", source: "seed", cardIds: [c1.id, c2.id, c3.id] }, T0);
  await store.putLesson(lesson);
  return { store, aliyah, deck, lesson, c1, c2, c3 };
}

test("createCard defaults strictMode to 'follow'", async () => {
  const { c1 } = await fixture();
  assert.equal(c1.strictMode, "follow");
});

test("renameLesson changes the name and bumps updatedAt", async () => {
  const { store, lesson } = await fixture();
  const before = lesson.updatedAt;
  const l = await store.renameLesson(lesson.id, "Food — La comida", T0 + 1000);
  assert.equal(l.name, "Food — La comida");
  assert.notEqual(l.updatedAt, before);
  assert.equal((await store.getLesson(lesson.id)).name, "Food — La comida");
});

test("deleteLesson tombstones the lesson + its cards; restore brings them back with progress", async () => {
  const { store, aliyah, lesson, c1 } = await fixture();
  // give c1 some progress first
  const ctx = store.studyContext(aliyah);
  await store.review(ctx, c1, "good", "type", T0);
  const progBefore = await store.getProgress(aliyah.id, c1.id);
  assert.ok(progBefore, "progress exists before delete");

  await store.deleteLesson(lesson.id, T0 + DAY);
  assert.equal((await store.listLessons(aliyah.id)).length, 0, "lesson hidden");
  assert.equal((await store.listCards(aliyah.id)).length, 0, "its cards hidden");
  assert.equal((await store.listDeletedLessons(aliyah.id)).length, 1, "in recently-deleted");
  // progress record is NOT tombstoned
  assert.ok(await store.getProgress(aliyah.id, c1.id), "progress survives delete");

  await store.restoreLesson(lesson.id, T0 + 2 * DAY);
  assert.equal((await store.listLessons(aliyah.id)).length, 1, "lesson back");
  assert.equal((await store.listCards(aliyah.id)).length, 3, "cards back");
  assert.equal((await store.listDeletedLessons(aliyah.id)).length, 0);
  const progAfter = await store.getProgress(aliyah.id, c1.id);
  assert.deepEqual(progAfter.srs, progBefore.srs, "progress unchanged by delete/restore");
});

test("mergeLessons appends source cards into target and tombstones the source", async () => {
  const { store, aliyah, deck } = await fixture();
  const [target] = await store.listLessons(aliyah.id);
  const extra = await store.addCard(
    { ownerId: aliyah.id, deckId: deck.id, front: "el ajo", back: "garlic" },
    (await store.splitLesson(target.id, 2, "Second", T0 + 10)).second.id, T0 + 20);
  const lessons = await store.listLessons(aliyah.id);
  assert.equal(lessons.length, 2, "split produced two lessons");
  const a = lessons.find((l) => l.name === "Food");
  const b = lessons.find((l) => l.name === "Second");
  const merged = await store.mergeLessons(a.id, b.id, T0 + 30);
  assert.ok(merged.cardIds.includes(extra.id), "source's card now in target");
  assert.equal(merged.cardIds.length, 4, "2 + (1 moved + 1 added)");
  assert.equal((await store.listLessons(aliyah.id)).length, 1, "source tombstoned");
});

test("splitLesson keeps the first part and moves the tail to a new lesson", async () => {
  const { store, lesson, c1, c2, c3 } = await fixture();
  const { first, second } = await store.splitLesson(lesson.id, 2, "Food (part 2)", T0 + 5);
  assert.deepEqual(first.cardIds, [c1.id, c2.id]);
  assert.deepEqual(second.cardIds, [c3.id]);
  assert.equal(second.name, "Food (part 2)");
});

test("splitLesson rejects an out-of-range index", async () => {
  const { store, lesson } = await fixture();
  await assert.rejects(() => store.splitLesson(lesson.id, 0, "x", T0));
  await assert.rejects(() => store.splitLesson(lesson.id, 3, "x", T0)); // == length
});

test("moveCard changes membership and keeps progress", async () => {
  const { store, aliyah, lesson, c3 } = await fixture();
  const ctx = store.studyContext(aliyah);
  await store.review(ctx, c3, "good", "type", T0);
  const { second } = await store.splitLesson(lesson.id, 2, "Veg", T0 + 5);   // c3 → Veg
  await store.moveCard(c3.id, second.id, lesson.id, T0 + 10);                  // move it back to Food
  assert.ok((await store.getLesson(lesson.id)).cardIds.includes(c3.id));
  assert.ok(!(await store.getLesson(second.id)).cardIds.includes(c3.id));
  assert.ok(await store.getProgress(aliyah.id, c3.id), "progress kept across move");
});

test("editCard patches fields incl. strictMode", async () => {
  const { store, c1 } = await fixture();
  const c = await store.editCard(c1.id, { back: "the apple", accepts: ["apples"], strictMode: "exact" }, T0 + 5);
  assert.equal(c.back, "the apple");
  assert.deepEqual(c.accepts, ["apples"]);
  assert.equal(c.strictMode, "exact");
  assert.equal((await store.getCard(c1.id)).strictMode, "exact");
});

test("addCard appends to the lesson; deleteCard tombstones + drops it", async () => {
  const { store, aliyah, deck, lesson } = await fixture();
  const added = await store.addCard(
    { ownerId: aliyah.id, deckId: deck.id, front: "la uva", back: "grape", strictMode: "forgiving" }, lesson.id, T0 + 5);
  assert.equal(added.strictMode, "forgiving");
  assert.ok((await store.getLesson(lesson.id)).cardIds.includes(added.id));
  assert.equal((await store.listCards(aliyah.id)).length, 4);

  await store.deleteCard(added.id, lesson.id, T0 + 10);
  assert.ok(!(await store.getLesson(lesson.id)).cardIds.includes(added.id));
  assert.equal((await store.listCards(aliyah.id)).length, 3);
});

test("purgeExpired hard-deletes tombstoned records older than the TTL, keeps fresh ones", async () => {
  const { store, aliyah, lesson } = await fixture();
  await store.deleteLesson(lesson.id, T0);                 // deleted at T0
  // 3 days later: nothing purged (within 7-day window)
  assert.equal(await store.purgeExpired(aliyah.id, T0 + 3 * DAY), 0);
  assert.equal((await store.listDeletedLessons(aliyah.id)).length, 1);
  // 8 days later: lesson + its 3 cards hard-removed (4 records)
  const purged = await store.purgeExpired(aliyah.id, T0 + 8 * DAY);
  assert.equal(purged, 4);
  assert.equal((await store.listDeletedLessons(aliyah.id)).length, 0);
  assert.equal(await store.getLesson(lesson.id), null);
});
