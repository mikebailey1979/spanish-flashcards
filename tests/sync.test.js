"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const model = require("../src/model/model.js");
const { createStore, COLLECTIONS } = require("../src/store/store.js");
const { createMemoryAdapter } = require("../src/store/memory-adapter.js");
const { createSync } = require("../src/sync/sync.js");

const T = (ms) => new Date(ms).toISOString();
const T0 = Date.UTC(2026, 0, 1, 12, 0, 0);
const DAY = 86400000;

/** A fake remote: a memory adapter + LWW push / since-pull over it. */
function mockTransport(remote) {
  return {
    async pullSince(since) {
      const out = {};
      for (const c of COLLECTIONS) {
        out[c] = (await remote.getAll(c)).filter((r) => Date.parse(r.updatedAt) > Date.parse(since));
      }
      return out;
    },
    async push(changes) {
      for (const c of Object.keys(changes)) {
        for (const rec of changes[c]) {
          const have = await remote.get(c, rec.id);
          if (!have || Date.parse(rec.updatedAt) >= Date.parse(have.updatedAt)) await remote.put(c, rec);
        }
      }
    },
  };
}

function setup() {
  const store = createStore(createMemoryAdapter());
  const remote = createMemoryAdapter();
  const sync = createSync(store, mockTransport(remote));
  return { store, remote, sync };
}

test("push: local changes reach the remote", async () => {
  const { store, remote, sync } = setup();
  const deck = model.createDeck({ ownerId: "a", name: "Spanish Core" }, T0);
  await store.putDeck(deck);
  await sync.sync();
  assert.ok(await remote.get("decks", deck.id), "remote received the deck");
});

test("pull: remote changes reach the local store", async () => {
  const { store, remote, sync } = setup();
  const card = model.createCard({ ownerId: "a", deckId: "d", front: "hola", back: "hello" }, T0);
  await remote.put("cards", card); // appeared on another device
  await sync.sync();
  const local = await store.adapter.get("cards", card.id);
  assert.equal(local.back, "hello");
});

test("last-write-wins both directions", async () => {
  const { store, remote, sync } = setup();
  const card = model.createCard({ ownerId: "a", deckId: "d", front: "x", back: "v1" }, T0);
  await store.putCard(card);
  let cursor = await sync.sync(); // remote now has v1

  // remote edits it newer -> pull should win locally
  const remoteEdit = Object.assign({}, card, { back: "v2-remote", updatedAt: T(T0 + DAY) });
  await remote.put("cards", remoteEdit);
  cursor = await sync.sync(cursor);
  assert.equal((await store.adapter.get("cards", card.id)).back, "v2-remote");

  // local edits it newer still -> push should win remotely
  const localEdit = Object.assign({}, remoteEdit, { back: "v3-local", updatedAt: T(T0 + 2 * DAY) });
  await store.putCard(localEdit);
  cursor = await sync.sync(cursor);
  assert.equal((await remote.get("cards", card.id)).back, "v3-local");
});

test("tombstones propagate", async () => {
  const { store, remote, sync } = setup();
  const lesson = model.createLesson({ ownerId: "a", deckId: "d", name: "Temp" }, T0);
  await store.putLesson(lesson);
  await sync.sync();
  // delete locally
  model.softDelete(lesson, T0 + DAY);
  await store.putLesson(lesson);
  await sync.sync(T(T0)); // push since before the delete
  const remoteRow = await remote.get("lessons", lesson.id);
  assert.notEqual(remoteRow.deletedAt, null, "tombstone reached the remote");
});

test("a second sync with the returned cursor is a no-op", async () => {
  const { store, remote, sync } = setup();
  await store.putDeck(model.createDeck({ ownerId: "a", name: "D" }, T0));
  const cursor = await sync.sync();
  const remoteCountBefore = (await remote.getAll("decks")).length;
  const cursor2 = await sync.sync(cursor);
  assert.equal(cursor2, cursor, "cursor does not advance when nothing changed");
  assert.equal((await remote.getAll("decks")).length, remoteCountBefore);
});

test("a full seeded user round-trips to an empty remote and back to a fresh device", async () => {
  const { store, remote, sync } = setup();
  const { seedUser } = require("../src/seed/seed.js");
  const aliyah = model.createUser({ email: "a@x.com", displayName: "Aliyah" }, T0);
  await store.putUser(aliyah);
  await seedUser(store, aliyah.id, T0);
  const localCards = (await store.listCards(aliyah.id)).length;

  await sync.sync(); // push everything up
  assert.equal((await remote.getAll("cards")).length, localCards);

  // fresh device pulls it all down
  const device2 = createStore(createMemoryAdapter());
  await createSync(device2, mockTransport(remote)).sync();
  assert.equal((await device2.listCards(aliyah.id)).length, localCards);
});
