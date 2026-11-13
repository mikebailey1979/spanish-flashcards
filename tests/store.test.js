"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const model = require("../src/model/model.js");
const { createStore } = require("../src/store/store.js");
const { createMemoryAdapter } = require("../src/store/memory-adapter.js");

const T0 = Date.UTC(2026, 0, 1, 12, 0, 0);
const DAY = 86400000;

async function fixture() {
  const store = createStore(createMemoryAdapter());
  const mike = model.createUser({ email: "m@x.com", displayName: "Mike", role: "admin" }, T0);
  const aliyah = model.createUser({ email: "a@x.com", displayName: "Aliyah", role: "user" }, T0);
  await store.putUser(mike);
  await store.putUser(aliyah);

  const deck = model.createDeck({ ownerId: aliyah.id, name: "Spanish Core" }, T0);
  await store.putDeck(deck);
  const c1 = model.createCard({ ownerId: aliyah.id, deckId: deck.id, front: "acampar", back: "to camp" }, T0);
  const c2 = model.createCard({ ownerId: aliyah.id, deckId: deck.id, front: "pescar", back: "to fish" }, T0);
  await store.putCard(c1);
  await store.putCard(c2);
  const lesson = model.createLesson(
    { ownerId: aliyah.id, deckId: deck.id, name: "Vacation Activities", source: "seed", cardIds: [c1.id, c2.id] },
    T0
  );
  await store.putLesson(lesson);
  return { store, mike, aliyah, deck, lesson, c1, c2 };
}

test("content is separated by owner", async () => {
  const { store, mike, aliyah } = await fixture();
  assert.equal((await store.listLessons(aliyah.id)).length, 1);
  assert.equal((await store.listLessons(mike.id)).length, 0);
  assert.equal((await store.listCards(aliyah.id)).length, 2);
  assert.equal((await store.listCards(mike.id)).length, 0);
});

test("a user studying their own content persists progress + an event", async () => {
  const { store, aliyah, c1 } = await fixture();
  const ctx = store.studyContext(aliyah);
  assert.equal(ctx.persist, true);
  const res = await store.review(ctx, c1, "good", "type", T0);
  assert.equal(res.persisted, true);
  const p = await store.getProgress(aliyah.id, c1.id);
  assert.ok(p, "progress saved");
  assert.equal(p.srs.reps, 1);
  assert.ok(p.srs.stability > 0, "FSRS stability set after a review");
  const events = await store.adapter.getAll("reviewEvents");
  assert.equal(events.length, 1);
  assert.equal(events[0].userId, aliyah.id);
});

test("admin emulation is a non-persisting preview by default", async () => {
  const { store, mike, aliyah, c1 } = await fixture();
  const ctx = store.studyContext(mike, { actingAsUserId: aliyah.id });
  assert.equal(ctx.emulating, true);
  assert.equal(ctx.persist, false);
  assert.equal(ctx.contentOwnerId, aliyah.id);
  assert.ok(ctx.studierId.startsWith("preview:"));

  const res = await store.review(ctx, c1, "again", "type", T0);
  assert.equal(res.persisted, false);
  assert.equal(res.srs.lapses, 1); // the preview still behaves correctly in-session
  // ...but NOTHING was written for Aliyah (or anyone).
  assert.equal(await store.getProgress(aliyah.id, c1.id), null);
  assert.equal((await store.adapter.getAll("progress")).length, 0);
  assert.equal((await store.adapter.getAll("reviewEvents")).length, 0);
});

test("emulation never disturbs the emulated user's existing schedule", async () => {
  const { store, mike, aliyah, c1 } = await fixture();
  // Aliyah really studies the card.
  await store.review(store.studyContext(aliyah), c1, "good", "type", T0);
  const before = await store.getProgress(aliyah.id, c1.id);
  // Mike emulates her and grades it hard — should not touch her row.
  await store.review(store.studyContext(mike, { actingAsUserId: aliyah.id }), c1, "again", "type", T0 + DAY);
  const after = await store.getProgress(aliyah.id, c1.id);
  assert.deepEqual(after.srs, before.srs);
});

test("opt-in emulated progress uses a per-target track owned by the admin, never the emulated user", async () => {
  const { store, mike, aliyah, c1 } = await fixture();
  const track = model.makeTrack(mike.id, aliyah.id);
  const ctx = store.studyContext(mike, { actingAsUserId: aliyah.id, countEmulatedProgress: true });
  assert.equal(ctx.persist, true);
  assert.equal(ctx.studierId, track);
  await store.review(ctx, c1, "good", "type", T0);
  assert.ok(await store.getProgress(track, c1.id), "recorded on the mike@as:aliyah track");
  assert.equal(await store.getProgress(mike.id, c1.id), null, "not on Mike's own-content track");
  assert.equal(await store.getProgress(aliyah.id, c1.id), null, "Aliyah's real data untouched");
});

test("admin tracks are separate per target and from the admin's own track", async () => {
  const { store, mike, aliyah } = await fixture();
  // A second user B with their own card, plus a card Mike owns himself.
  const userB = model.createUser({ email: "b@x.com", displayName: "Bea" }, T0);
  await store.putUser(userB);
  const deckB = model.createDeck({ ownerId: userB.id, name: "B deck" }, T0);
  await store.putDeck(deckB);
  const cB = model.createCard({ ownerId: userB.id, deckId: deckB.id, front: "uno", back: "one" }, T0);
  await store.putCard(cB);
  const deckM = model.createDeck({ ownerId: mike.id, name: "M deck" }, T0);
  await store.putDeck(deckM);
  const cM = model.createCard({ ownerId: mike.id, deckId: deckM.id, front: "dos", back: "two" }, T0);
  await store.putCard(cM);
  const aCard = (await store.listCards(aliyah.id))[0];

  await store.review(store.studyContext(mike), cM, "good", "type", T0); // own track
  await store.review(store.studyContext(mike, { actingAsUserId: aliyah.id, countEmulatedProgress: true }), aCard, "good", "type", T0);
  await store.review(store.studyContext(mike, { actingAsUserId: userB.id, countEmulatedProgress: true }), cB, "good", "type", T0);

  const trackA = model.makeTrack(mike.id, aliyah.id);
  const trackB = model.makeTrack(mike.id, userB.id);
  assert.ok(await store.getProgress(mike.id, cM.id), "own track");
  assert.ok(await store.getProgress(trackA, aCard.id), "Aliyah-emulation track");
  assert.ok(await store.getProgress(trackB, cB.id), "B-emulation track");

  const rows = await store.adapter.getAll("progress");
  const tracks = new Set(rows.map((r) => r.userId));
  assert.deepEqual([...tracks].sort(), [mike.id, trackA, trackB].sort());
  // The emulated users' own schedules stay empty.
  assert.equal(await store.getProgress(aliyah.id, aCard.id), null);
  assert.equal(await store.getProgress(userB.id, cB.id), null);
});

test("a non-admin cannot act as another user", async () => {
  const { store, mike, aliyah } = await fixture();
  assert.throws(() => store.studyContext(aliyah, { actingAsUserId: mike.id }), /admin/);
});

test("selectDue returns unseen cards, and drops ones not yet due", async () => {
  const { store, aliyah, lesson, c1 } = await fixture();
  const ctx = store.studyContext(aliyah);
  let due = await store.selectDue(ctx, [lesson], T0);
  assert.equal(due.length, 2); // both unseen
  // Study c1 "good" → due in 2 days; at T0 it should drop out, leaving the unseen one.
  await store.review(ctx, c1, "good", "type", T0);
  due = await store.selectDue(ctx, [lesson], T0);
  assert.equal(due.length, 1);
  assert.notEqual(due[0].id, c1.id);
});

test("setUserRole promotes/demotes and guards the sole admin", async () => {
  const { store, mike, aliyah } = await fixture(); // mike=admin, aliyah=user
  assert.equal((await store.listAdmins()).length, 1);

  // promote Aliyah → two admins
  const a = await store.setUserRole(aliyah.id, "admin", T0);
  assert.equal(a.role, "admin");
  assert.equal((await store.listAdmins()).length, 2);

  // now either admin may be demoted
  await store.setUserRole(aliyah.id, "user", T0);
  assert.equal((await store.getUser(aliyah.id)).role, "user");
  assert.equal((await store.listAdmins()).length, 1);

  // the last admin cannot be demoted
  await assert.rejects(() => store.setUserRole(mike.id, "user", T0), /only admin/);
  assert.equal((await store.getUser(mike.id)).role, "admin");
});
