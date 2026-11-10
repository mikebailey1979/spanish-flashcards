"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const model = require("../src/model/model.js");
const { isCorrect } = require("../src/match/matcher.js");

/** @param {string} back @param {object} [extra] */
function card(back, extra = {}) {
  return model.createCard(Object.assign({ ownerId: "u", deckId: "d", front: "x", back }, extra));
}

test("exact match ignores case and accents", () => {
  assert.deepEqual(isCorrect("BIBLIOTECA", card("biblioteca")), { correct: true, why: "exact" });
});

test("slash alternatives are accepted", () => {
  assert.equal(isCorrect("accommodation", card("lodging / accommodation")).correct, true);
  assert.equal(isCorrect("lodging", card("lodging / accommodation")).correct, true);
  assert.equal(isCorrect("bella", card("bello / bella")).correct, true);
});

test("multi-translation: any subset, any order, any separator", () => {
  const c = card("banana / plantain");
  for (const input of [
    "banana", "plantain",
    "banana plantain", "plantain banana",
    "banana, plantain", "banana & plantain",
    "banana and plantain", "banana/plantain", "banana or plantain",
  ]) {
    assert.equal(isCorrect(input, c).correct, true, `should accept "${input}"`);
  }
  assert.equal(isCorrect("banana apple", c).correct, false); // apple isn't accepted
});

test("multi-word alternatives combine too", () => {
  const c = card("fried eggs / ranchero-style eggs");
  assert.equal(isCorrect("fried eggs, ranchero-style eggs", c).correct, true);
  assert.equal(isCorrect("ranchero-style eggs and fried eggs", c).correct, true);
});

test("leading article/particle is forgiven by default", () => {
  assert.equal(isCorrect("library", card("the library")).why, "article");
  assert.equal(isCorrect("la biblioteca", card("biblioteca")).why, "article");
  assert.equal(isCorrect("camp", card("to camp")).why, "article");
});

test("articles are optional AND interchangeable anywhere in the phrase", () => {
  const c = card("to confirm the flight");
  assert.equal(isCorrect("to confirm a flight", c).correct, true); // the ≡ a mid-phrase
  assert.equal(isCorrect("confirm flight", c).correct, true); // both dropped
  assert.equal(isCorrect("to confirm flight", c).correct, true);
});

test("English possessives are optional/interchangeable", () => {
  const c = card("to check one's luggage");
  assert.equal(isCorrect("to check your luggage", c).correct, true);
  assert.equal(isCorrect("to check luggage", c).correct, true);
  assert.equal(isCorrect("check your luggage", c).correct, true);
});

test("hyphen ≡ space ≡ nothing", () => {
  const c = card("fruit-flavored water");
  assert.equal(isCorrect("fruit flavored water", c).correct, true);
  assert.equal(isCorrect("fruitflavored water", c).correct, true);
  assert.equal(isCorrect("fruit-flavored water", c).correct, true);
});

test("article tolerance can be switched off per card", () => {
  assert.equal(isCorrect("library", card("the library", { strict: { article: true } })).correct, false);
});

test("singular ⇄ plural is forgiven by default; strict turns it off", () => {
  assert.equal(isCorrect("libros", card("libro")).why, "plural");
  assert.equal(isCorrect("libro", card("libros")).why, "plural");
  assert.equal(isCorrect("libros", card("libro", { strict: { plural: true } })).correct, false);
});

test("a one-char typo is forgiven when long enough; strict/length guard it", () => {
  assert.equal(isCorrect("bibloteca", card("biblioteca")).why, "typo");
  assert.equal(isCorrect("bibloteca", card("biblioteca", { strict: { typo: true } })).correct, false);
  assert.equal(isCorrect("pan", card("paz")).correct, false); // too short
});

test("clearly wrong answers and empty input are rejected", () => {
  assert.deepEqual(isCorrect("perro", card("gato")), { correct: false, why: null });
  assert.deepEqual(isCorrect("", card("gato")), { correct: false, why: null });
});

test("extra accepted answers (accepts[]) are honored", () => {
  assert.equal(isCorrect("spare time", card("free time", { accepts: ["spare time"] })).correct, true);
});
