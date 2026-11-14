"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const model = require("../src/model/model.js");
const { createStore } = require("../src/store/store.js");
const { createMemoryAdapter } = require("../src/store/memory-adapter.js");
const rp = require("../src/roleplay/roleplay.js");

const T0 = Date.UTC(2026, 10, 13, 12, 0, 0);

// ---- shared module: scenario catalog ---------------------------------------
test("scenario catalog is non-empty and well-formed", () => {
  assert.ok(rp.SCENARIOS.length >= 4);
  for (const s of rp.SCENARIOS) {
    for (const k of ["id", "title", "aiRole", "setting", "goal", "openingEs", "openingEn"]) {
      assert.ok(s[k] && typeof s[k] === "string", `${s.id} missing ${k}`);
    }
  }
  // ids unique
  const ids = rp.SCENARIOS.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(rp.SCENARIO_IDS, ids);
});

test("getScenario resolves known ids and rejects unknown ones", () => {
  assert.equal(rp.getScenario("cafe").id, "cafe");
  assert.equal(rp.getScenario("not-a-scenario"), null);
  assert.equal(rp.getScenario(""), null);
  assert.equal(rp.getScenario(undefined), null);
});

// ---- lesson-word list ------------------------------------------------------
test("lessonWordList dedupes, caps, and skips blanks", () => {
  const cards = [
    { front: "la casa", back: "the house" },
    { front: "La Casa", back: "dup (case-insensitive)" },
    { front: "", back: "blank front skipped" },
    { front: "el perro", back: "the dog" },
  ];
  const words = rp.lessonWordList(cards);
  assert.deepEqual(words, [
    { es: "la casa", en: "the house" },
    { es: "el perro", en: "the dog" },
  ]);
  const many = Array.from({ length: 100 }, (_, i) => ({ front: "w" + i, back: "x" }));
  assert.equal(rp.lessonWordList(many).length, rp.MAX_LESSON_WORDS);
  assert.deepEqual(rp.lessonWordList(null), []);
});

// ---- turn cap --------------------------------------------------------------
test("turn counting / cap", () => {
  const session = { turns: [{ role: "ai" }] };
  assert.equal(rp.learnerTurnsTaken(session), 0);
  assert.equal(rp.turnsRemaining(session), rp.TURN_LIMIT);
  assert.equal(rp.atTurnLimit(session), false);
  for (let i = 0; i < rp.TURN_LIMIT; i++) session.turns.push({ role: "learner" }, { role: "ai" });
  assert.equal(rp.learnerTurnsTaken(session), rp.TURN_LIMIT);
  assert.equal(rp.turnsRemaining(session), 0);
  assert.equal(rp.atTurnLimit(session), true);
});

// ---- PII backstop ----------------------------------------------------------
test("looksLikePII flags obvious leaks, passes normal practice", () => {
  assert.equal(rp.looksLikePII("me llamo Ana"), false);
  assert.equal(rp.looksLikePII("quiero un café, por favor"), false);
  assert.equal(rp.looksLikePII("mi correo es ana@gmail.com"), true);
  assert.equal(rp.looksLikePII("llámame al 5551234"), true);
  assert.equal(rp.looksLikePII("555-123-4567"), true);
  assert.equal(rp.looksLikePII("sígueme @ana_b"), true);
});

test("clampInput trims and caps length", () => {
  assert.equal(rp.clampInput("  hola  "), "hola");
  assert.equal(rp.clampInput("x".repeat(500)).length, 300);
  assert.equal(rp.clampInput(null), "");
});

// ---- model + store: transcript persistence ---------------------------------
async function fixture() {
  const store = createStore(createMemoryAdapter());
  const aliyah = model.createUser({ email: "a@x.com", displayName: "Aliyah", role: "user" }, T0);
  await store.putUser(aliyah);
  return { store, aliyah };
}

test("createRoleplaySession has the expected shape", () => {
  const s = model.createRoleplaySession({ userId: "u1", scenarioId: "cafe", lessonId: "l1", lessonName: "Food" }, T0);
  assert.ok(s.id && s.updatedAt);
  assert.equal(s.deletedAt, null);
  assert.equal(s.status, "active");
  assert.equal(s.endedAt, null);
  assert.equal(s.scenarioId, "cafe");
  assert.equal(s.lessonId, "l1");
  assert.deepEqual(s.turns, []);
});

test("store saves, lists (newest first) and filters transcripts by studier", async () => {
  const { store, aliyah } = await fixture();
  const s1 = model.createRoleplaySession({ userId: aliyah.id, scenarioId: "cafe" }, T0);
  const s2 = model.createRoleplaySession({ userId: aliyah.id, scenarioId: "shopping" }, T0 + 1000);
  const sOther = model.createRoleplaySession({ userId: "someone-else", scenarioId: "school" }, T0 + 2000);
  await store.putRoleplaySession(s1);
  await store.putRoleplaySession(s2);
  await store.putRoleplaySession(sOther);

  const mine = await store.listRoleplaySessions(aliyah.id);
  assert.equal(mine.length, 2);
  assert.equal(mine[0].id, s2.id); // newest first

  const all = await store.listRoleplaySessions();
  assert.equal(all.length, 3); // admin view: everyone's

  assert.equal((await store.getRoleplaySession(s1.id)).scenarioId, "cafe");
});

test("roleplay collection is NOT in the default sync set (inert until table exists)", () => {
  assert.ok(!createStore(createMemoryAdapter()).COLLECTIONS.includes("roleplaySessions"));
  assert.equal(require("../src/store/store.js").ROLEPLAY_COLLECTION, "roleplaySessions");
});

// ---- transport owner mapping -----------------------------------------------
test("transport owns a transcript by the studier's base user", () => {
  const { ownerOf, TABLE } = require("../src/sync/supabase-transport.js");
  assert.equal(TABLE.roleplaySessions, "roleplay_sessions");
  assert.equal(ownerOf("roleplaySessions", { userId: "admin1@as:learner2" }), "admin1");
  assert.equal(ownerOf("roleplaySessions", { userId: "learner2" }), "learner2");
});
