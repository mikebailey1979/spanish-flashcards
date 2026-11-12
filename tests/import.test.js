"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const model = require("../src/model/model.js");
const { createStore } = require("../src/store/store.js");
const { createMemoryAdapter } = require("../src/store/memory-adapter.js");
const { importLesson } = require("../src/io/import.js");
const { createStubAiAdapter, OPERATIONS } = require("../src/ai/ai-adapter.js");

const T0 = Date.UTC(2026, 0, 1, 12, 0, 0);

async function fresh() {
  const store = createStore(createMemoryAdapter());
  const u = model.createUser({ email: "a@x.com", displayName: "Aliyah" }, T0);
  await store.putUser(u);
  return { store, u };
}

test("importLesson commits a reviewed lesson as an ocr-sourced lesson with cards", async () => {
  const { store, u } = await fresh();
  const res = await importLesson(
    store,
    u.id,
    {
      name: "Colors — Los colores",
      sections: [{ cat: "Colors — Los colores", pairs: [["rojo", "red"], ["azul", "blue"]] }],
    },
    T0
  );
  assert.equal(res.cardCount, 2);
  assert.equal(res.lesson.source, "ocr");
  const cards = await store.listCards(u.id);
  assert.equal(cards.length, 2);
  assert.ok(cards.every((c) => c.category === "Colors — Los colores"));
});

test("importLesson dedupes repeated fronts within the import", async () => {
  const { store, u } = await fresh();
  const res = await importLesson(
    store,
    u.id,
    { name: "Dup test", cards: [
      { front: "la casa", back: "the house" },
      { front: "La Casa", back: "home" }, // same front (case/space-insensitive)
      { front: "el perro", back: "the dog" },
    ] },
    T0
  );
  assert.equal(res.cardCount, 2);
  assert.equal(res.skipped, 1);
});

test("importLesson reuses the user's existing deck", async () => {
  const { store, u } = await fresh();
  await importLesson(store, u.id, { name: "L1", cards: [{ front: "uno", back: "one" }] }, T0);
  await importLesson(store, u.id, { name: "L2", cards: [{ front: "dos", back: "two" }] }, T0);
  assert.equal((await store.listDecks(u.id)).length, 1);
  assert.equal((await store.listLessons(u.id)).length, 2);
});

test("the stub AI adapter rejects every operation until wired", async () => {
  const ai = createStubAiAdapter();
  for (const op of OPERATIONS) {
    await assert.rejects(() => ai[op](), /not wired yet/);
  }
});
