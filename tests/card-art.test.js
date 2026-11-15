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

// Single-icon rules: the specific differentiators that must land on an exact icon.
const EXPECT = [
  ["Unit 1, Lesson 1 — Travel & Airport", "airplane"],  // topic beats the "Unit" structural word
  ["Transportation", "bus"],                             // not sport (tranSPORT)
  ["Months / Los meses", "calendar-01"],
  ["Holidays / Los días festivos", "gift"],
  ["Birthdays / Los cumpleaños", "birthday-cake"],
  ["Celebrations / Las celebraciones", "confetti"],
  ["Parties — Las fiestas", "party"],
  ["Breakfast / El desayuno", "croissant"],
  ["Lunch / El almuerzo", "sandwich"],
  ["Dinner / La cena", "plate"],
  ["Colors / Los colores", "colors"],
  ["Art / El arte", "paint-brush-01"],
  ["Shapes / Las formas", "geometric-shapes"],
  ["Homework / La tarea", "notebook-pen"],
  ["Classroom phrases — Frases útiles", "school"],
  ["Adjectives / Los adjetivos", "bubble-chat"],
  ["Question words — Interrogativos", "quiz"],
  ["Games", "game-controller"],
  ["Hobbies", "puzzle"],
  ["El tiempo libre", "kite"],
  ["My daily routine", "alarm-clock"],
  ["Emotions / Las emociones", "happy"],
  ["Farm animals / La granja", "tractor"],
  ["La familia", "user-group"],
  ["La ropa / Clothes", "clothes"],
  ["Deportes", "dumbbell"],
  ["Música / Music", "music-note"],
  ["Numbers 1–20", "calculator"],
  ["La casa / House", "house"],
  ["Weather — El clima", "weather"],
];

// Pooled families: related lessons must get DISTINCT icons (variant pools), while
// each stays on-theme. [family, lessons, min distinct].
const FAMILIES = [
  ["food", ["Food — Unidad 4", "Food / La comida", "Food is culture", "Foods (review)"], 3],
  ["people", ["Friends", "People / La gente", "Lección preliminar — People"], 2],
  ["feelings", ["Feelings — Los sentimientos", "Feelings & conditions"], 2],
  ["animals", ["Animals / Los animales", "Pets / Las mascotas"], 2],
  ["beach", ["Vacation — Unit 1, Lesson 2", "Vacation / Las vacaciones"], 2],
  ["grammar", ["Grammar", "Verbs / Los verbos", "The alphabet / El alfabeto"], 2],
  ["calendar", ["Days / Los días", "Days of the week", "The calendar"], 2],
];

for (const [name, icon] of EXPECT) {
  test("icon: " + name + " → " + icon, () => {
    assert.equal(CardArt.iconKey(name), icon);
  });
}

test("every expected icon actually exists in the set", () => {
  for (const [, icon] of EXPECT) assert.ok(ICONS[icon], icon + " is missing from icons.js");
});

for (const [family, lessons, minDistinct] of FAMILIES) {
  test("family '" + family + "' gives distinct icons per lesson", () => {
    const got = lessons.map((l) => CardArt.iconKey(l));
    for (const g of got) assert.ok(ICONS[g], g + " missing from icons.js");
    assert.ok(new Set(got).size >= minDistinct,
      family + " should differ across lessons, got: " + got.join(", "));
  });
}

test("a pooled icon is stable for the same lesson name", () => {
  assert.equal(CardArt.iconKey("Food / La comida"), CardArt.iconKey("Food / La comida"));
  assert.equal(CardArt.iconKey("Friends"), CardArt.iconKey("Friends"));
});

test("'Places' maps to a places icon (not the 'positions' substring trap)", () => {
  const icon = CardArt.iconKey("Places / Los lugares");
  assert.ok(["location", "maps", "pin-location", "map-pinpoint-01", "city", "building"].includes(icon), "got " + icon);
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
