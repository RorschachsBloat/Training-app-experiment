const CACHE='peak-training-v1-20261025';
const ASSETS=['./','./index.html','./styles.css','./core.js','./xlsx-import.js','./app.js','./builtin-program.json','./manifest.webmanifest','./icon.svg','./icon-192.png','./icon-512.png','./PEAK_Programme_Template.xlsx'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)));self.skipWaiting()});
self.addEventListener('activate',event=>{event.waitUntil((async()=>{const keys=await caches.keys();await Promise.all(keys.filter(key=>key.startsWith('peak-training-')&&key!==CACHE).map(key=>caches.delete(key)));await self.clients.claim()})())});
self.addEventListener('fetch',event=>{if(event.request.method!=='GET'||new URL(event.request.url).origin!==self.location.origin)return;
 event.respondWith((async()=>{const cache=await caches.open(CACHE);const hit=await cache.match(event.request);if(hit)return hit;try{const network=await fetch(event.request);if(network.ok)cache.put(event.request,network.clone());return network}catch(e){if(event.request.mode==='navigate')return await cache.match('./index.html');throw e}})())});
