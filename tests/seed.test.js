"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const model = require("../src/model/model.js");
const { createStore } = require("../src/store/store.js");
const { createMemoryAdapter } = require("../src/store/memory-adapter.js");
const { seedUser } = require("../src/seed/seed.js");
const { VOCABULARY } = require("../vocabulary.js");

const T0 = Date.UTC(2026, 0, 1, 12, 0, 0);

async function freshAliyah() {
  const store = createStore(createMemoryAdapter());
  const aliyah = model.createUser({ email: "a@x.com", displayName: "Aliyah" }, T0);
  await store.putUser(aliyah);
  return { store, aliyah };
}

test("seeds one lesson per category and a card per entry, all owned by the user", async () => {
  const { store, aliyah } = await freshAliyah();
  const res = await seedUser(store, aliyah.id, T0);
  assert.equal(res.seeded, true);

  const cats = new Set(VOCABULARY.map((v) => v.cat));
  assert.equal(res.lessons.length, cats.size);
  assert.equal(res.cards.length, VOCABULARY.length); // 51
  assert.equal(res.deck.frontLocale, "es");

  const lessons = await store.listLessons(aliyah.id);
  assert.ok(lessons.every((l) => l.ownerId === aliyah.id && l.source === "seed"));
  const cards = await store.listCards(aliyah.id);
  assert.ok(cards.every((c) => c.ownerId === aliyah.id));
  // every card belongs to exactly one lesson, and the counts add up
  const totalCardIds = lessons.reduce((n, l) => n + l.cardIds.length, 0);
  assert.equal(totalCardIds, VOCABULARY.length);
});

test("a known entry seeds into the right lesson with front=es / back=en", async () => {
  const { store, aliyah } = await freshAliyah();
  await seedUser(store, aliyah.id, T0);
  const cards = await store.listCards(aliyah.id);
  const acampar = cards.find((c) => c.front === "acampar");
  assert.ok(acampar);
  assert.equal(acampar.back, "to camp");
  const lessons = await store.listLessons(aliyah.id);
  const activities = lessons.find((l) => l.name === "Vacation Activities");
  assert.ok(activities.cardIds.includes(acampar.id));
});

test("seeding is idempotent — a second run is a no-op", async () => {
  const { store, aliyah } = await freshAliyah();
  await seedUser(store, aliyah.id, T0);
  const again = await seedUser(store, aliyah.id, T0);
  assert.equal(again.seeded, false);
  assert.equal((await store.listCards(aliyah.id)).length, VOCABULARY.length); // no duplicates
});
