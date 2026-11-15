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

test("the cursor stabilizes and stops re-pushing once settled", async () => {
  const { store, remote, sync } = setup();
  await store.putDeck(model.createDeck({ ownerId: "a", name: "D" }, T0));
  const c1 = await sync.sync();                 // pushes the deck (pull ran first, saw nothing)
  const c2 = await sync.sync(c1);               // pulls our own deck back; pull watermark catches up
  const remoteCountBefore = (await remote.getAll("decks")).length;
  const c3 = await sync.sync(c2);               // nothing left to move
  assert.deepEqual(c3, c2, "cursor is stable once both directions have settled");
  assert.equal((await remote.getAll("decks")).length, remoteCountBefore, "no duplicate push");
});

test("separate pull/push cursors: a newer local push never hides older remote rows", async () => {
  // Reproduces the cross-device bug: device L pushes a row stamped LATER than an
  // as-yet-unpulled remote row from device P. A single shared cursor would jump
  // past P's row and skip it forever; separate cursors must still pull it.
  const { store, remote, sync } = setup();
  // P already put an older row on the remote (phone studied at an earlier clock).
  const pRow = model.createCard({ ownerId: "a", deckId: "d", front: "phone", back: "P" }, T0 + DAY);
  await remote.put("cards", pRow);
  // L makes a NEWER local row, then syncs. Its push advances only the push cursor.
  const lRow = model.createCard({ ownerId: "a", deckId: "d", front: "laptop", back: "L" }, T0 + 2 * DAY);
  await store.putCard(lRow);
  const cursor = await sync.sync();
  assert.ok(await store.adapter.get("cards", pRow.id), "the older remote row was pulled, not skipped");
  assert.equal((await remote.get("cards", lRow.id)).back, "L", "the newer local row was pushed");
  // and it converges: once the pull watermark catches up, the cursor is stable
  assert.ok(await remote.get("cards", pRow.id), "remote still has P's row");
  const settled = await sync.sync(cursor);
  assert.deepEqual(settled, await sync.sync(settled), "stable after settle");
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
