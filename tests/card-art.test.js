"use strict";
// HITL regression guard for the icon matcher. Each row is a lesson name / topic and
// the icon it MUST map to; a matcher edit that breaks one fails here. Add a row
// whenever review turns up a bad association you want locked in (e.g. Vacation→beach).
const test = require("node:test");
const assert = require("node:assert/strict");

global.self = global;                         // let icons.js attach to a global the way the browser does
require("../src/ui/icons.js");                // loads the full set → self.SpanishFlashcardsIcons
const CardArt = require("../src/ui/card-art.js");
const ICONS = global.SpanishFlashcardsIcons || {};

const EXPECT = [
  ["Vacation — Unit 1, Lesson 2", "beach"],              // not umbrella (rain) / not cow (vaca)
  ["La playa / The beach", "beach"],
  ["Unit 1, Lesson 1 — Travel & Airport", "airplane"],  // topic beats the "Unit" structural word
  ["Transportation", "bus"],                             // not sport (tranSPORT)
  ["Days of the week — Los días", "calendar"],
  ["Food — Unidad 4 (La comida)", "vegetarian-food"],
  ["Parties — Las fiestas", "party"],
  ["Unidad 5 — Leisure, invitations, holidays & celebrations", "party"],
  ["El tiempo libre", "game-controller"],
  ["Lección preliminar — People, Activities & Places", "people"],
  ["Feelings — Los sentimientos", "smile"],
  ["Question words — Interrogativos", "quiz"],
  ["Classroom phrases — Frases útiles", "school"],
  ["Los animales", "paw-print"],
  ["La familia", "user-group"],
  ["La ropa / Clothes", "clothes"],
  ["Deportes", "dumbbell"],
  ["Música", "music-note"],
  ["Numbers 1–20", "calculator"],
  ["La casa / House", "house"],
  ["Weather — El clima", "weather"],
  ["Colores", "paint-board"],
];

for (const [name, icon] of EXPECT) {
  test("icon: " + name + " → " + icon, () => {
    assert.equal(CardArt.iconKey(name), icon);
  });
}

test("every expected icon actually exists in the set", () => {
  for (const [, icon] of EXPECT) assert.ok(ICONS[icon], icon + " is missing from icons.js");
});

test("structural-only names fall to the neutral study icon, not a topic", () => {
  assert.equal(CardArt.iconKey("Unidad 2"), "notebook");
  assert.equal(CardArt.iconKey("Lesson 9"), "notebook");
});

test("iconKeyExplain reports how each match was reached", () => {
  assert.equal(CardArt.iconKeyExplain("Vacation").via, "keyword");
  const nonsense = CardArt.iconKeyExplain("Zqxwk blort topic");
  assert.equal(nonsense.via, "fallback");
  assert.ok(ICONS[nonsense.icon], "fallback icon exists");
});
