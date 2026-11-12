"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const model = require("../src/model/model.js");
const { createStore } = require("../src/store/store.js");
const { createMemoryAdapter } = require("../src/store/memory-adapter.js");
const { seedUser } = require("../src/seed/seed.js");
const { VOCABULARY } = require("../vocabulary.js");
const { SEED_LESSONS } = require("../src/seed/seed-data.js");
const { isCorrect } = require("../src/match/matcher.js");

const T0 = Date.UTC(2026, 0, 1, 12, 0, 0);

function seedDataCardCount() {
  return SEED_LESSONS.reduce((n, L) => n + L.sections.reduce((m, s) => m + s.pairs.length, 0), 0);
}

async function freshAliyah() {
  const store = createStore(createMemoryAdapter());
  const aliyah = model.createUser({ email: "a@x.com", displayName: "Aliyah" }, T0);
  await store.putUser(aliyah);
  return { store, aliyah };
}

test("seeds one lesson per assignment, a card per pair, all owned by the user", async () => {
  const { store, aliyah } = await freshAliyah();
  const res = await seedUser(store, aliyah.id, T0);
  assert.equal(res.seeded, true);

  // Vacation (vocabulary.js) + every vision-pass lesson.
  assert.equal(res.lessons.length, 1 + SEED_LESSONS.length);
  assert.equal(res.cards.length, VOCABULARY.length + seedDataCardCount());

  const lessons = await store.listLessons(aliyah.id);
  assert.ok(lessons.every((l) => l.ownerId === aliyah.id && l.source === "seed"));
  const cards = await store.listCards(aliyah.id);
  assert.ok(cards.every((c) => c.ownerId === aliyah.id && c.category));
  const totalCardIds = lessons.reduce((n, l) => n + l.cardIds.length, 0);
  assert.equal(totalCardIds, cards.length);
});

test("Vacation unit is one lesson of 51, with its categories as sections", async () => {
  const { store, aliyah } = await freshAliyah();
  await seedUser(store, aliyah.id, T0);
  const lessons = await store.listLessons(aliyah.id);
  const vac = lessons.find((l) => /Vacation/.test(l.name));
  assert.ok(vac);
  assert.equal(vac.cardIds.length, VOCABULARY.length); // 51
});

test("known cards land with front=es / back=en and the right category", async () => {
  const { store, aliyah } = await freshAliyah();
  await seedUser(store, aliyah.id, T0);
  const cards = await store.listCards(aliyah.id);

  const acampar = cards.find((c) => c.front === "acampar");
  assert.ok(acampar);
  assert.equal(acampar.back, "to camp");
  assert.equal(acampar.category, "Vacation Activities");

  const fresa = cards.find((c) => c.front === "la fresa");
  assert.ok(fresa);
  assert.equal(fresa.back, "strawberry");
  assert.equal(fresa.category, "Fruits — Frutas");
});

test("seed + matcher: a multi-translation card accepts either/both answers", async () => {
  const { store, aliyah } = await freshAliyah();
  await seedUser(store, aliyah.id, T0);
  const cards = await store.listCards(aliyah.id);
  // back = "banana / plantain" (the English answer side) → either/both accepted
  const platano = cards.find((c) => c.front === "el plátano");
  assert.ok(platano);
  assert.equal(isCorrect("banana", platano).correct, true);
  assert.equal(isCorrect("plantain", platano).correct, true);
  assert.equal(isCorrect("banana plantain", platano).correct, true);
  assert.equal(isCorrect("apple", platano).correct, false);

  // gender variants live on the Spanish (front) — accepted when Spanish is the
  // answer (reverse direction); here we just confirm the stored forms.
  const alto = cards.find((c) => c.front === "alto / alta");
  assert.ok(alto);
  assert.equal(isCorrect("tall", alto).correct, true);
  // matching against the Spanish side (what the quiz does in reverse) accepts either gender:
  assert.equal(isCorrect("alta", { back: alto.front, accepts: [], strict: {} }).correct, true);
  assert.equal(isCorrect("alto", { back: alto.front, accepts: [], strict: {} }).correct, true);
});

test("seeding is idempotent — a second run is a no-op", async () => {
  const { store, aliyah } = await freshAliyah();
  await seedUser(store, aliyah.id, T0);
  const count = (await store.listCards(aliyah.id)).length;
  const again = await seedUser(store, aliyah.id, T0);
  assert.equal(again.seeded, false);
  assert.equal((await store.listCards(aliyah.id)).length, count);
});
