const CACHE="espanol-cards-v7";const ASSETS=["./","./index.html","./answer-utils.js?v=7","./vocabulary.js?v=7","./app.js?v=7","./manifest.webmanifest"];
self.addEventListener("install",e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener("activate",e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener("fetch",e=>{
 if(e.request.method!=="GET"||new URL(e.request.url).origin!==self.location.origin)return;
 e.respondWith((async()=>{
  try{const response=await fetch(e.request),cache=await caches.open(CACHE);await cache.put(e.request,response.clone());return response}
  catch(error){return await caches.match(e.request)||(e.request.mode==="navigate"&&await caches.match("./index.html"))||Response.error()}
 })())
});
