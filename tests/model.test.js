"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const model = require("../src/model/model.js");

const T0 = Date.UTC(2026, 0, 1, 12, 0, 0); // fixed epoch ms for determinism

test("createUser defaults role to 'user' and stamps a Syncable", () => {
  const u = model.createUser({ email: "a@b.com", displayName: "Aliyah" }, T0);
  assert.equal(u.role, "user");
  assert.equal(u.email, "a@b.com");
  assert.equal(typeof u.id, "string");
  assert.equal(u.id.length, 36);
  assert.equal(u.deletedAt, null);
  assert.equal(u.updatedAt, new Date(T0).toISOString());
});

test("admin role is honored", () => {
  const u = model.createUser({ email: "m@b.com", displayName: "Mike", role: "admin" }, T0);
  assert.equal(u.role, "admin");
});

test("createCard carries ownerId + strict flags and NO srs field", () => {
  const c = model.createCard(
    { ownerId: "u1", deckId: "d1", front: "el gato", back: "the cat", strict: { plural: true } },
    T0
  );
  assert.equal(c.ownerId, "u1");
  assert.deepEqual(c.strict, { plural: true });
  assert.deepEqual(c.accepts, []);
  assert.ok(!("srs" in c), "progress must live outside the card, not on it");
});

test("ids are unique across records", () => {
  const ids = new Set();
  for (let i = 0; i < 200; i++) ids.add(model.createCard({ ownerId: "u", deckId: "d", front: "x", back: "y" }).id);
  assert.equal(ids.size, 200);
});

test("Progress is keyed by studier, not by card owner", () => {
  // Aliyah owns the card; Mike (emulating) studies it → progress under Mike's id.
  const p = model.createProgress({ userId: "mike", cardId: "card-owned-by-aliyah", srs: {} }, T0);
  assert.equal(p.userId, "mike");
  assert.equal(p.cardId, "card-owned-by-aliyah");
  assert.equal(model.progressKey("mike", "card-owned-by-aliyah"), "mike:card-owned-by-aliyah");
});

test("createReviewEvent normalizes typedAnswer and stamps 'at'", () => {
  const e = model.createReviewEvent(
    { userId: "u1", cardId: "c1", grade: "good", mode: "type", at: T0 },
    T0
  );
  assert.equal(e.grade, "good");
  assert.equal(e.typedAnswer, null);
  assert.equal(e.at, new Date(T0).toISOString());
});

test("softDelete tombstones and bumps updatedAt", () => {
  const c = model.createCard({ ownerId: "u", deckId: "d", front: "x", back: "y" }, T0);
  assert.equal(model.isDeleted(c), false);
  model.softDelete(c, T0 + 1000);
  assert.equal(model.isDeleted(c), true);
  assert.equal(c.deletedAt, new Date(T0 + 1000).toISOString());
  assert.equal(c.updatedAt, c.deletedAt);
});

test("enums are exposed", () => {
  assert.deepEqual([...model.ROLES], ["admin", "user"]);
  assert.deepEqual([...model.GRADES], ["again", "hard", "good", "easy"]);
  assert.deepEqual([...model.LESSON_SOURCES], ["seed", "ocr", "manual"]);
});
