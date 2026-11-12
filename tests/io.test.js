"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const model = require("../src/model/model.js");
const { createStore } = require("../src/store/store.js");
const { createMemoryAdapter } = require("../src/store/memory-adapter.js");
const io = require("../src/io/export-import.js");

const T0 = Date.UTC(2026, 0, 1, 12, 0, 0);

test("mergeCollections: newer updatedAt wins", () => {
  const a = { id: "1", updatedAt: new Date(T0).toISOString(), v: "old" };
  const b = { id: "1", updatedAt: new Date(T0 + 1000).toISOString(), v: "new" };
  const merged = io.mergeCollections([a], [b], "merge");
  assert.equal(merged.length, 1);
  assert.equal(merged[0].v, "new");
});

test("mergeCollections: a newer tombstone deletes", () => {
  const live = { id: "1", updatedAt: new Date(T0).toISOString(), deletedAt: null };
  const tomb = { id: "1", updatedAt: new Date(T0 + 1000).toISOString(), deletedAt: new Date(T0 + 1000).toISOString() };
  const merged = io.mergeCollections([live], [tomb], "merge");
  assert.notEqual(merged[0].deletedAt, null);
});

test("mergeCollections: replace takes incoming wholesale", () => {
  const cur = [{ id: "1", updatedAt: new Date(T0).toISOString() }];
  const inc = [{ id: "2", updatedAt: new Date(T0).toISOString() }];
  assert.deepEqual(io.mergeCollections(cur, inc, "replace"), inc);
});

async function seededStore() {
  const store = createStore(createMemoryAdapter());
  const aliyah = model.createUser({ email: "a@x.com", displayName: "Aliyah" }, T0);
  await store.putUser(aliyah);
  const deck = model.createDeck({ ownerId: aliyah.id, name: "Spanish Core" }, T0);
  await store.putDeck(deck);
  const c1 = model.createCard({ ownerId: aliyah.id, deckId: deck.id, front: "acampar", back: "to camp" }, T0);
  await store.putCard(c1);
  const lesson = model.createLesson(
    { ownerId: aliyah.id, deckId: deck.id, name: "Vacation Activities", source: "seed", cardIds: [c1.id] },
    T0
  );
  await store.putLesson(lesson);
  await store.review(store.studyContext(aliyah), c1, "good", "type", T0); // some progress + an event
  return { store, aliyah };
}

test("exportUser → importUser round-trips a user's data losslessly", async () => {
  const { store, aliyah } = await seededStore();
  const env1 = await io.exportUser(store, aliyah.id, T0);
  assert.equal(env1.schema, "aliyah-flashcards/v1");
  assert.equal(env1.cards.length, 1);
  assert.equal(env1.progress.length, 1);
  assert.equal(env1.reviewEvents.length, 1);

  const fresh = createStore(createMemoryAdapter());
  await io.importUser(fresh, env1, { mode: "replace" });
  const env2 = await io.exportUser(fresh, aliyah.id, T0);

  delete env1.exportedAt;
  delete env2.exportedAt;
  assert.deepEqual(env2, env1);
});

test("importUser rejects an unknown schema", async () => {
  const fresh = createStore(createMemoryAdapter());
  await assert.rejects(() => io.importUser(fresh, { schema: "nope/v9" }, {}), /schema/);
});
