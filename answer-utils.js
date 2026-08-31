(function(root,factory){
 const api=factory();
 if(typeof module==="object"&&module.exports)module.exports=api;
 root.SpanishFlashcardsAnswers=api;
})(typeof self!=="undefined"?self:this,function(){
 "use strict";
 function normalizeAnswer(value){
  return String(value??"").toLocaleLowerCase().trim().normalize("NFD")
   .replace(/[\u0300-\u036f]/g,"")
   .replace(/['’\-‐‑‒–—]/g,"")
   .replace(/[^\p{L}\p{N}\s]/gu," ")
   .replace(/\s+/g," ").trim()
 }
 function splitAlternatives(value){
  const parts=[];let part="",depth=0;
  for(const char of String(value??"")){
   if(char==="(")depth++;
   if(char===")")depth=Math.max(0,depth-1);
   if(char==="/"&&depth===0){parts.push(part);part=""}else part+=char
  }
  parts.push(part);return parts
 }
 function answerVariants(value){
  const variants=[];
  for(const part of splitAlternatives(value)){
   variants.push(normalizeAnswer(part));
   variants.push(normalizeAnswer(part.replace(/\s*\([^)]*\)/g,"")))
  }
  return [...new Set(variants.filter(Boolean))]
 }
 function exactAnswerMatches(given,expected){
  const givenVariants=answerVariants(given),expectedVariants=answerVariants(expected);
  return givenVariants.some(g=>expectedVariants.includes(g))
 }
 function editDistance(a,b){
  if(a===b)return 0;
  if(!a.length)return b.length;
  if(!b.length)return a.length;
  let previous=Array.from({length:b.length+1},(_,i)=>i);
  for(let i=1;i<=a.length;i++){
   const current=[i];
   for(let j=1;j<=b.length;j++)current[j]=Math.min(current[j-1]+1,previous[j]+1,previous[j-1]+(a[i-1]===b[j-1]?0:1));
   previous=current
  }
  return previous[b.length]
 }
 function isConservativeSpeechMatch(given,expected){
  if(given===expected)return true;
  const longest=Math.max(given.length,expected.length);
  const limit=longest>=14?2:longest>=6?1:0;
  return limit>0&&Math.abs(given.length-expected.length)<=limit&&editDistance(given,expected)<=limit
 }
 function spokenAnswerMatches(alternatives,expected){
  const heard=(Array.isArray(alternatives)?alternatives:[alternatives]).flatMap(answerVariants);
  const expectedVariants=answerVariants(expected);
  return heard.some(given=>expectedVariants.some(answer=>isConservativeSpeechMatch(given,answer)))
 }
 function recognitionAlternatives(event){
  const segments=[];
  const results=event&&event.results;
  if(!results)return [];
  for(let i=event.resultIndex||0;i<results.length;i++){
   const result=results[i],choices=[];
   for(let j=0;j<result.length;j++)if(result[j]&&result[j].transcript)choices.push(result[j].transcript.trim());
   if(choices.length)segments.push(choices)
  }
  if(!segments.length)return [];
  const heard=segments.flat();
  if(segments.length>1){
   const maxChoices=Math.max(...segments.map(s=>s.length));
   for(let i=0;i<maxChoices;i++)heard.push(segments.map(s=>s[i]||s[0]).join(" "))
  }
  return [...new Set(heard.filter(Boolean))]
 }
 function answerLocale(direction){return direction==="en-es"?"es-ES":"en-US"}
 function numberWordsEN(value){
  const n=Number(value),small=["zero","one","two","three","four","five","six","seven","eight","nine","ten","eleven","twelve","thirteen","fourteen","fifteen","sixteen","seventeen","eighteen","nineteen"],tens=["","","twenty","thirty","forty","fifty","sixty","seventy","eighty","ninety"];
  if(n<20)return small[n];
  if(n<100)return tens[Math.floor(n/10)]+(n%10?" "+small[n%10]:"");
  if(n<1000)return small[Math.floor(n/100)]+" hundred"+(n%100?" "+numberWordsEN(n%100):"");
  if(n===1000)return"one thousand";
  return String(value)
 }
 function numberAnswerVariants(spanish,numeric,direction){
  const n=Number(numeric);
  if(direction==="en-es")return spanish+" / "+n;
  const written=numberWordsEN(n),withAnd=n>100&&n<1000&&n%100?written.replace(" hundred "," hundred and "):written;
  return [...new Set([String(n),written,withAnd])].join(" / ")
 }
 return{normalizeAnswer,splitAlternatives,answerVariants,exactAnswerMatches,editDistance,spokenAnswerMatches,recognitionAlternatives,answerLocale,numberWordsEN,numberAnswerVariants}
});
