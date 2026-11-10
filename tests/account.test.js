"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const model = require("../src/model/model.js");
const { createStore } = require("../src/store/store.js");
const { createMemoryAdapter } = require("../src/store/memory-adapter.js");
const { seedUser } = require("../src/seed/seed.js");
const { exportAccount, deleteAccount } = require("../src/account/account.js");

const T0 = Date.UTC(2026, 0, 1, 12, 0, 0);

async function seeded() {
  const store = createStore(createMemoryAdapter());
  const aliyah = model.createUser({ email: "a@x.com", displayName: "Aliyah" }, T0);
  const mike = model.createUser({ email: "m@x.com", displayName: "Mike", role: "admin" }, T0);
  await store.putUser(aliyah);
  await store.putUser(mike);
  await seedUser(store, aliyah.id, T0);
  const c1 = (await store.listCards(aliyah.id))[0];
  await store.review(store.studyContext(aliyah), c1, "good", "type", T0); // some progress
  return { store, aliyah, mike };
}

test("exportAccount returns the user's full envelope", async () => {
  const { store, aliyah } = await seeded();
  const env = await exportAccount(store, aliyah.id, T0);
  assert.equal(env.schema, "aliyah-flashcards/v1");
  assert.ok(env.cards.length > 400);
  assert.equal(env.progress.length, 1);
});

test("deleteAccount tombstones all of the user's data (and syncs via tombstones)", async () => {
  const { store, aliyah } = await seeded();
  const before = (await store.listCards(aliyah.id)).length;
  assert.ok(before > 0);

  const res = await deleteAccount(store, aliyah.id, T0 + 1000);
  assert.ok(res.tombstoned > before, "content + progress + user all tombstoned");

  // live views are empty, but the rows still exist as tombstones for sync
  assert.equal((await store.listCards(aliyah.id)).length, 0);
  assert.equal((await store.listLessons(aliyah.id)).length, 0);
  assert.equal(await store.getUser(aliyah.id), null);
  const rawCards = await store.adapter.getAll("cards");
  assert.ok(rawCards.length > 0 && rawCards.every((c) => c.deletedAt != null));
});

test("deleteAccount does not touch another user's data", async () => {
  const { store, aliyah, mike } = await seeded();
  await seedUser(store, mike.id, T0); // Mike has his own content too
  const mikeCardsBefore = (await store.listCards(mike.id)).length;
  await deleteAccount(store, aliyah.id, T0 + 1000);
  assert.equal((await store.listCards(mike.id)).length, mikeCardsBefore);
});
