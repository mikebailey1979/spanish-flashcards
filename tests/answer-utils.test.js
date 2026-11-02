"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const answers=require("../answer-utils.js");

test("normalizes case, accents, punctuation, hyphens, and spacing",()=>{
 assert.equal(answers.normalizeAnswer("  ¡CORREOS  ELECTRÓNICOS!  "),"correos electronicos");
 assert.equal(answers.exactAnswerMatches("e-mails","emails"),true)
});

test("accepts the core translation without a parenthetical qualifier",()=>{
 assert.equal(answers.exactAnswerMatches("they","they (masculine / mixed)"),true);
 assert.equal(answers.exactAnswerMatches("they","they (feminine)"),true);
 assert.equal(answers.exactAnswerMatches("you","you (informal)"),true);
 assert.equal(answers.exactAnswerMatches("mixed","they (masculine / mixed)"),false)
});

test("still accepts slash-separated answer alternatives",()=>{
 assert.deepEqual(answers.splitAlternatives("they (masculine / mixed)"),["they (masculine / mixed)"]);
 assert.equal(answers.exactAnswerMatches("downtown","center / downtown"),true);
 assert.equal(answers.exactAnswerMatches("bonita","bonito / bonita"),true)
});

test("accepts either or all correct alternatives joined naturally",()=>{
 assert.equal(answers.exactAnswerMatches("lodging","lodging / accommodation"),true);
 assert.equal(answers.exactAnswerMatches("accommodation","lodging / accommodation"),true);
 assert.equal(answers.exactAnswerMatches("lodging and accommodation","lodging / accommodation"),true);
 assert.equal(answers.exactAnswerMatches("lodging or accommodation","lodging / accommodation"),true);
 assert.equal(answers.exactAnswerMatches("lodging / accommodation","lodging / accommodation"),true);
 assert.equal(answers.exactAnswerMatches("bello y bella","bello / bella"),true);
 assert.equal(answers.exactAnswerMatches("bello(a)","bello / bella"),true);
 assert.equal(answers.exactAnswerMatches("lodging and elevator","lodging / accommodation"),false);
 assert.equal(answers.exactAnswerMatches("lodging / elevator","lodging / accommodation"),false)
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

test("accepts numeric and written number answers in either direction",()=>{
 const englishEight=answers.numberAnswerVariants("ocho",8,"es-en");
 assert.equal(answers.exactAnswerMatches("8",englishEight),true);
 assert.equal(answers.exactAnswerMatches("eight",englishEight),true);
 const spanishFive=answers.numberAnswerVariants("cinco",5,"en-es");
 assert.equal(answers.exactAnswerMatches("5",spanishFive),true);
 assert.equal(answers.exactAnswerMatches("cinco",spanishFive),true);
 const englishOneOhOne=answers.numberAnswerVariants("ciento uno",101,"es-en");
 assert.equal(answers.exactAnswerMatches("one hundred and one",englishOneOhOne),true);
 assert.equal(answers.exactAnswerMatches("one hundred",englishOneOhOne),false)
});
