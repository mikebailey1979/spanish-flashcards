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
  // fixed regressions
  ["Vacation — Unit 1, Lesson 2", "beach"],              // not umbrella (rain) / not cow (vaca)
  ["La playa / The beach", "beach"],
  ["Unit 1, Lesson 1 — Travel & Airport", "airplane"],  // topic beats the "Unit" structural word
  ["Transportation", "bus"],                             // not sport (tranSPORT)
  // calendar vs festive (must stay distinct)
  ["Days of the week — Los días", "calendar"],
  ["Months / Los meses", "calendar-01"],
  ["Holidays / Los días festivos", "gift"],
  ["Birthdays / Los cumpleaños", "birthday-cake"],
  ["Celebrations / Las celebraciones", "confetti"],
  ["Parties — Las fiestas", "party"],
  // meals (distinct, not one "food" icon)
  ["Breakfast / El desayuno", "croissant"],
  ["Lunch / El almuerzo", "sandwich"],
  ["Dinner / La cena", "plate"],
  ["Food — Unidad 4 (La comida)", "vegetarian-food"],
  // art / colors / shapes
  ["Colors / Los colores", "colors"],
  ["Art / El arte", "paint-brush-01"],
  ["Shapes / Las formas", "geometric-shapes"],
  // school / grammar
  ["Homework / La tarea", "notebook-pen"],
  ["Classroom phrases — Frases útiles", "school"],
  ["Adjectives / Los adjetivos", "bubble-chat"],
  ["Grammar", "language-skill"],
  ["Question words — Interrogativos", "quiz"],
  // play / leisure / routine (distinct)
  ["Games", "game-controller"],
  ["Hobbies", "puzzle"],
  ["El tiempo libre", "kite"],
  ["My daily routine", "alarm-clock"],
  // feelings vs emotions
  ["Feelings — Los sentimientos", "smile"],
  ["Emotions / Las emociones", "happy"],
  // anchors
  ["Lección preliminar — People, Activities & Places", "people"],
  ["Farm animals / La granja", "tractor"],
  ["Los animales", "paw-print"],
  ["La familia", "user-group"],
  ["La ropa / Clothes", "clothes"],
  ["Deportes", "dumbbell"],
  ["Música", "music-note"],
  ["Numbers 1–20", "calculator"],
  ["La casa / House", "house"],
  ["Weather — El clima", "weather"],
];

for (const [name, icon] of EXPECT) {
  test("icon: " + name + " → " + icon, () => {
    assert.equal(CardArt.iconKey(name), icon);
  });
}

test("every expected icon actually exists in the set", () => {
  for (const [, icon] of EXPECT) assert.ok(ICONS[icon], icon + " is missing from icons.js");
});

test("structural-only names vary (hashed fallback), not one shared icon", () => {
  const a = CardArt.iconKey("Lección 3"), b = CardArt.iconKey("Module 5"), c = CardArt.iconKey("Unidad 2");
  assert.ok(ICONS[a] && ICONS[b] && ICONS[c], "all are real icons");
  assert.ok(new Set([a, b, c]).size >= 2, "structural names shouldn't all collapse to one icon");
});

test("iconKeyExplain reports how each match was reached", () => {
  assert.equal(CardArt.iconKeyExplain("Vacation").via, "keyword");
  const nonsense = CardArt.iconKeyExplain("Zqxwk blort topic");
  assert.equal(nonsense.via, "fallback");
  assert.ok(ICONS[nonsense.icon], "fallback icon exists");
});
