const CACHE='peak-training-v3-readiness-auth-20261025';
const ASSETS=['./','./index.html','./styles.css','./core.js','./xlsx-import.js','./app.js','./cloud-config.js','./cloud-auth.js','./builtin-program.json','./manifest.webmanifest','./icon.svg','./icon-192.png','./icon-512.png','./PEAK_Programme_Template.xlsx'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)));self.skipWaiting()});
self.addEventListener('activate',event=>{event.waitUntil((async()=>{const keys=await caches.keys();await Promise.all(keys.filter(key=>key.startsWith('peak-training-')&&key!==CACHE).map(key=>caches.delete(key)));await self.clients.claim()})())});
self.addEventListener('fetch',event=>{if(event.request.method!=='GET'||new URL(event.request.url).origin!==self.location.origin)return;
 event.respondWith((async()=>{const cache=await caches.open(CACHE);try{
  // Network-first makes cloud-config.js & app updates reach returning users without
  // requiring a cache-version change on every subsequent website edit.
  const network=await fetch(event.request);if(network.ok)cache.put(event.request,network.clone());return network;
 }catch(e){const hit=await cache.match(event.request);if(hit)return hit;if(event.request.mode==='navigate')return await cache.match('./index.html');throw e}})())
});
