"use strict";
const {exactAnswerMatches:correct,spokenAnswerMatches,recognitionAlternatives,answerLocale}=window.SpanishFlashcardsAnswers;
const {VOCABULARY:BASE}=window.SpanishFlashcardsVocabulary;
const PROGRESS_KEY="spanishProgressV3";
const ALL=[...BASE];
const $=id=>document.getElementById(id), card=$("card"), controls=$("controls"), feedback=$("feedback");
let progress=JSON.parse(localStorage.getItem(PROGRESS_KEY)||"{}"), current=null, dir="es-en", mode="type", answered=false, activeRecognition=null, speechWatchdog=null, resultTimer=null, confettiTimer=null, confettiLayer=null;
function rec(id){return progress[id]||{right:0,wrong:0,streak:0,last:0,box:0}}
function weight(x){let r=rec(x.id), age=(Date.now()-r.last)/86400000; return 1+(r.wrong*2.2)+(r.right===0?4:0)+Math.min(age,4)-Math.min(r.box*1.2,5)}
function pick(){let pool=ALL.map(x=>({x,w:Math.max(.25,weight(x))})),sum=pool.reduce((a,b)=>a+b.w,0),z=Math.random()*sum;for(const p of pool){z-=p.w;if(z<=0)return p.x}return pool[0].x}
function save(id,ok){let r=rec(id);r.right+=ok?1:0;r.wrong+=ok?0:1;r.streak=ok?r.streak+1:0;r.box=ok?Math.min(5,r.box+1):Math.max(0,r.box-2);r.last=Date.now();progress[id]=r;localStorage.setItem(PROGRESS_KEY,JSON.stringify(progress))}
function updateStats(){let rs=Object.values(progress),right=rs.reduce((a,r)=>a+r.right,0),wrong=rs.reduce((a,r)=>a+r.wrong,0),total=right+wrong,pct=total?Math.round(100*right/total):0;$("stats").textContent=total?`${pct}% correct • ${total} attempts`:"Progress starts here";$("progress").style.width=pct+"%"}
function distractors(answer){
 let same=ALL.filter(x=>x.id!==current.id&&x.cat===current.cat).map(x=>dir==="es-en"?x.en:x.es);
 if(same.length<3)same=ALL.filter(x=>x.id!==current.id).map(x=>dir==="es-en"?x.en:x.es);
 same=[...new Set(same)].sort(()=>Math.random()-.5).slice(0,3);return [...same,answer].sort(()=>Math.random()-.5)
}
function newCard(){
 stopRecognition();clearResultTimer();answered=false;card.className="card";feedback.replaceChildren();feedback.className="feedback";current=pick();dir=Math.random()<.5?"es-en":"en-es";
 mode=["type","choice","speak"][Math.floor(Math.random()*3)];card.classList.add("mode-"+mode);
 const prompt=dir==="es-en"?current.es:current.en, answer=dir==="es-en"?current.en:current.es, accepted=answer;
 $("category").textContent=current.cat;$("mode").textContent=mode==="type"?"Type":mode==="choice"?"Multiple choice":"Speak";
 $("direction").textContent=dir==="es-en"?"Spanish → English":"English → Spanish";$("prompt").textContent=prompt;$("answer").textContent=accepted;$("pair").textContent=prompt+"  ↔  "+accepted;
 renderControls(answer,accepted);updateStats()
}
function renderControls(answer,accepted){
 controls.innerHTML="";
 if(mode==="type"){
  controls.innerHTML='<form class="inputrow" id="form"><input id="entry" autocomplete="off" autocapitalize="none" spellcheck="false" aria-label="Your answer"><button class="primary">Check</button></form>';
  $("form").onsubmit=e=>{e.preventDefault();grade(correct($("entry").value,accepted))};setTimeout(()=>$("entry").focus(),80)
 } else if(mode==="choice"){
  let d=document.createElement("div");d.className="choices";distractors(answer).forEach(v=>{let b=document.createElement("button");b.className="choice";b.textContent=v;b.onclick=()=>grade(correct(v,accepted));d.appendChild(b)});controls.appendChild(d)
 } else renderSpeech(accepted);
 appendSkipControl()
}
function appendSkipControl(){let b=document.createElement("button");b.className="skip";b.type="button";b.textContent="Skip / I don’t know";b.onclick=()=>grade(false,{skipped:true});controls.appendChild(b)}
function clearResultTimer(){
 if(resultTimer){clearTimeout(resultTimer);resultTimer=null}
 if(confettiTimer){clearTimeout(confettiTimer);confettiTimer=null}
 if(confettiLayer){confettiLayer.remove();confettiLayer=null}
}
function launchConfetti(){
 const colors=["#20a45b","#f4c542","#ef6b57","#5b8def","#a66dd4"];clearResultTimer();confettiLayer=document.createElement("div");confettiLayer.className="confettiBurst";confettiLayer.setAttribute("aria-hidden","true");
 for(let i=0;i<34;i++){let piece=document.createElement("i");piece.className="confettiPiece";piece.style.background=colors[i%colors.length];piece.style.setProperty("--x",Math.round((Math.random()-.5)*680)+"px");piece.style.setProperty("--y",Math.round(-180+Math.random()*620)+"px");piece.style.setProperty("--r",Math.round((Math.random()-.5)*1100)+"deg");piece.style.setProperty("--d",(Math.random()*.18).toFixed(2)+"s");confettiLayer.appendChild(piece)}
 document.body.appendChild(confettiLayer);confettiTimer=setTimeout(()=>{if(confettiLayer){confettiLayer.remove();confettiLayer=null}confettiTimer=null},1400)
}
function clearSpeechWatchdog(){if(speechWatchdog){clearTimeout(speechWatchdog);speechWatchdog=null}}
function stopRecognition(){
 clearSpeechWatchdog();const r=activeRecognition;activeRecognition=null;
 if(r){r.onstart=null;r.onaudiostart=null;r.onspeechstart=null;r.onspeechend=null;r.onresult=null;r.onerror=null;r.onend=null;try{r.abort()}catch(e){}}
}
function appendSpeechTyping(answer){
 let divider=document.createElement("div");divider.className="speechDivider";divider.textContent="or type your answer";
 let form=document.createElement("form");form.className="inputrow";form.innerHTML='<input autocomplete="off" autocapitalize="none" spellcheck="false" aria-label="Type your spoken answer instead"><button class="primary">Check</button>';
 form.onsubmit=e=>{e.preventDefault();grade(correct(form.querySelector("input").value,answer))};controls.append(divider,form)
}
function renderSpeech(answer){
 const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
 let s=document.createElement("div");s.className="micstatus";s.setAttribute("aria-live","polite");
 if(!SR){s.textContent="Speech recognition is not available here. Type your answer below or skip this card.";controls.appendChild(s);appendSpeechTyping(answer);return}
 let b=document.createElement("button");b.className="speak";b.type="button";b.textContent="Tap to speak";s.textContent="Tap the microphone, or type your answer below.";controls.append(b,s);appendSpeechTyping(answer);
 b.onclick=()=>{
  stopRecognition();controls.querySelectorAll(".override").forEach(o=>o.remove());
  const r=new SR(),cardAtAttempt=current;let hadResult=false,hadError=false,timedOut=false;activeRecognition=r;b.disabled=true;b.textContent="Listening…";s.textContent="Starting the microphone…";
  const isCurrent=()=>current===cardAtAttempt&&!answered;
  const finishIdle=(message)=>{clearSpeechWatchdog();if(activeRecognition===r)activeRecognition=null;b.disabled=false;b.textContent="Try microphone again";s.textContent=message};
  r.lang=answerLocale(dir);r.continuous=false;r.interimResults=false;r.maxAlternatives=5;
  r.onstart=()=>{if(isCurrent())s.textContent="Microphone on — say your answer."};
  r.onaudiostart=()=>{if(isCurrent())s.textContent="Listening — say your answer now."};
  r.onspeechstart=()=>{if(isCurrent())s.textContent="Got it — checking your answer…"};
  r.onspeechend=()=>{try{r.stop()}catch(e){}};
  r.onresult=e=>{if(!isCurrent())return;hadResult=true;clearSpeechWatchdog();if(activeRecognition===r)activeRecognition=null;b.disabled=false;b.textContent="Try microphone again";let heard=recognitionAlternatives(e);s.textContent=heard.length?'Heard: '+heard.slice(0,3).map(h=>'“'+h+'”').join(" / "):"Nothing came through. Try again or type your answer below.";if(!heard.length)return;if(spokenAnswerMatches(heard,answer))grade(true);else{let o=document.createElement("button");o.className="override";o.type="button";o.textContent="That’s what I said";o.onclick=()=>grade(true);controls.insertBefore(o,controls.querySelector(".speechDivider"));s.textContent+=' If that was correct, tap “That’s what I said.”'}};
  r.onerror=e=>{if(!isCurrent()||timedOut)return;hadError=true;const messages={"not-allowed":"Microphone permission was denied. Allow microphone access, retry, type below, or skip.","service-not-allowed":"Speech recognition is blocked. Retry, type below, or skip.","audio-capture":"No microphone was found. Retry, type below, or skip.","no-speech":"No speech was heard. Retry or type your answer below.",network:"Speech recognition had a network problem. Retry or type below.",aborted:"Listening stopped. Retry or type your answer below."};finishIdle(messages[e.error]||"The microphone didn’t respond. Retry or type your answer below.")};
  r.onend=()=>{if(!isCurrent()||hadResult||hadError||timedOut)return;finishIdle("Nothing came through. Try the microphone again or type your answer below.")};
  speechWatchdog=setTimeout(()=>{if(!isCurrent()||activeRecognition!==r)return;timedOut=true;activeRecognition=null;try{r.abort()}catch(e){}finishIdle("The microphone didn’t respond. Try again or type your answer below.")},8000);
  try{r.start()}catch(e){hadError=true;finishIdle("The microphone couldn’t start. Try again or type your answer below.")}
 }
}
function grade(ok,{skipped=false}={}){
 if(answered)return;answered=true;stopRecognition();clearResultTimer();save(current.id,ok);updateStats();
 if(skipped){feedback.textContent="Skipped — review the answer";feedback.className="feedback bad";card.classList.add("revealed");return}
 let resultAnswer=document.createElement("span");resultAnswer.className="resultAnswer";resultAnswer.textContent=$("answer").textContent;
 let resultMark=document.createElement("span");resultMark.className="resultMark";resultMark.setAttribute("aria-hidden","true");resultMark.textContent=ok?"✓":"×";
 let resultText=document.createElement("span");resultText.className="resultText";resultText.textContent=ok?"Correct!":"Incorrect, but keep trying!";feedback.replaceChildren(resultAnswer,resultMark,resultText);
 feedback.className="feedback result "+(ok?"good":"bad");
 if(ok)launchConfetti();
 resultTimer=setTimeout(()=>{card.classList.add("revealed");resultTimer=null},ok?1250:1150)
}
$("next").onclick=newCard;$("reset").onclick=()=>{if(confirm("Reset all saved flash-card progress?")){progress={};localStorage.removeItem(PROGRESS_KEY);newCard()}};
if("serviceWorker"in navigator)window.addEventListener("load",()=>navigator.serviceWorker.register("./sw.js",{updateViaCache:"none"}).catch(()=>{}));
newCard();
