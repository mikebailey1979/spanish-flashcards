"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {VOCABULARY}=require("../vocabulary.js");

test("contains the 51 approved vocabulary pairs",()=>{
 assert.equal(VOCABULARY.length,51);
 assert.equal(new Set(VOCABULARY.map(item=>item.id)).size,51);
 assert.deepEqual(VOCABULARY[0],{id:"v2-1",es:"acampar",en:"to camp",cat:"Vacation Activities"});
 assert.deepEqual(VOCABULARY.at(-1),{id:"v2-51",es:"los autos chocadores",en:"bumper cars",cat:"Student Choices"})
});

test("keeps both reservation phrases as separate study cards",()=>{
 const spanish=VOCABULARY.map(item=>item.es);
 assert.ok(spanish.includes("hacer una reservación"));
 assert.ok(spanish.includes("tener una reservación"))
});
