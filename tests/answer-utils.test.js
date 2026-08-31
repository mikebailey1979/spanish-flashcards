"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const answers=require("../answer-utils.js");

test("normalizes case, accents, punctuation, hyphens, and spacing",()=>{
 assert.equal(answers.normalizeAnswer("  ¡CORREOS  ELECTRÓNICOS!  "),"correos electronicos");
 assert.equal(answers.exactAnswerMatches("e-mails","emails"),true)
});

test("accepts September to septiembre from any recognition alternative",()=>{
 assert.equal(answers.spokenAnswerMatches(["septiembro","septiembre"],"septiembre"),true);
 assert.equal(answers.spokenAnswerMatches(["setiembre"],"septiembre"),true)
});

test("keeps speech tolerance conservative",()=>{
 assert.equal(answers.spokenAnswerMatches(["octubre"],"septiembre"),false);
 assert.equal(answers.spokenAnswerMatches(["cinco"],"cine"),false)
});

test("extracts every recognition alternative and combined segments",()=>{
 const event={resultIndex:0,results:[
  {0:{transcript:"buenos"},1:{transcript:"buenas"},length:2},
  {0:{transcript:"días"},1:{transcript:"dia"},length:2}
 ]};
 assert.deepEqual(answers.recognitionAlternatives(event),["buenos","buenas","días","dia","buenos días","buenas dia"])
});

test("uses the locale of the answer language",()=>{
 assert.equal(answers.answerLocale("en-es"),"es-ES");
 assert.equal(answers.answerLocale("es-en"),"en-US")
});
