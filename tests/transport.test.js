"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const model = require("../src/model/model.js");
const { ownerOf, TABLE } = require("../src/sync/supabase-transport.js");

test("content rows are owned by the content owner", () => {
  assert.equal(ownerOf("cards", { ownerId: "aliyah" }), "aliyah");
  assert.equal(ownerOf("lessons", { ownerId: "aliyah" }), "aliyah");
  assert.equal(ownerOf("decks", { ownerId: "aliyah" }), "aliyah");
});

test("a user row is owned by itself (id = auth uid)", () => {
  assert.equal(ownerOf("users", { id: "uid-123" }), "uid-123");
});

test("progress/events are owned by the studier's BASE user (admin for an emulation track)", () => {
  assert.equal(ownerOf("progress", { userId: "aliyah" }), "aliyah");
  assert.equal(ownerOf("reviewEvents", { userId: "aliyah" }), "aliyah");
  const track = model.makeTrack("mike", "aliyah"); // admin emulating Aliyah
  assert.equal(ownerOf("progress", { userId: track }), "mike"); // owned by the admin, never Aliyah
  assert.equal(ownerOf("reviewEvents", { userId: track }), "mike");
});

test("every sync collection maps to a table", () => {
  assert.deepEqual(Object.keys(TABLE).sort(), ["cards", "decks", "lessons", "progress", "reviewEvents", "users"]);
  assert.equal(TABLE.reviewEvents, "review_events");
});
