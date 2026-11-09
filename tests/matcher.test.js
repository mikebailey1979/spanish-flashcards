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
  const r = isCorrect("BIBLIOTECA", card("biblioteca"));
  assert.equal(r.correct, true);
  assert.equal(r.why, "exact");
});

test("slash alternatives are accepted (via answer-utils) as variant", () => {
  assert.equal(isCorrect("accommodation", card("lodging / accommodation")).correct, true);
  assert.equal(isCorrect("lodging", card("lodging / accommodation")).correct, true);
  assert.equal(isCorrect("bella", card("bello / bella")).why === null, false);
});

test("leading article/particle is forgiven by default", () => {
  assert.deepEqual(isCorrect("library", card("the library")), { correct: true, why: "article" });
  assert.deepEqual(isCorrect("la biblioteca", card("biblioteca")), { correct: true, why: "article" });
  assert.deepEqual(isCorrect("camp", card("to camp")), { correct: true, why: "article" });
});

test("article tolerance can be switched off per card", () => {
  assert.equal(isCorrect("library", card("the library", { strict: { article: true } })).correct, false);
});

test("singular ⇄ plural is forgiven by default", () => {
  assert.equal(isCorrect("libros", card("libro")).why, "plural");
  assert.equal(isCorrect("libro", card("libros")).why, "plural");
});

test("plural tolerance can be switched off per card", () => {
  assert.equal(isCorrect("libros", card("libro", { strict: { plural: true } })).correct, false);
});

test("a one-character typo is forgiven when the word is long enough", () => {
  assert.deepEqual(isCorrect("bibloteca", card("biblioteca")), { correct: true, why: "typo" });
});

test("typo tolerance can be switched off, and short words are never blurred", () => {
  assert.equal(isCorrect("bibloteca", card("biblioteca", { strict: { typo: true } })).correct, false);
  // 3-letter near-miss must NOT pass (length gate): "pan" vs "paz"
  assert.equal(isCorrect("pan", card("paz")).correct, false);
});

test("clearly wrong answers are rejected", () => {
  assert.deepEqual(isCorrect("perro", card("gato")), { correct: false, why: null });
  assert.deepEqual(isCorrect("", card("gato")), { correct: false, why: null });
});

test("extra accepted answers (accepts[]) are honored", () => {
  const c = card("free time", { accepts: ["spare time"] });
  assert.equal(isCorrect("spare time", c).correct, true);
});
