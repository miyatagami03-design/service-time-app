const CACHE='service-time-local-v201-20260908';
const ASSETS=[
  './',
  './index.html',
  './style.css?v=201',
  './app.js?v=201',
  './manifest.webmanifest?v=201',
  './icon-180.png',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install',event=>{
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then(cache=>cache.addAll(ASSETS))
  );
});

self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);
  if(url.origin!==self.location.origin)return;

  // HTML/navigation is always checked online first so deployments appear immediately.
  if(event.request.mode==='navigate'){
    event.respondWith((async()=>{
      try{
        const fresh=await fetch(event.request,{cache:'no-store'});
        const cache=await caches.open(CACHE);
        await cache.put('./index.html',fresh.clone());
        return fresh;
      }catch{
        return (await caches.match('./index.html')) || Response.error();
      }
    })());
    return;
  }

  // JS/CSS/manifest are also network-first; cache is only an offline fallback.
  event.respondWith((async()=>{
    try{
      const fresh=await fetch(event.request,{cache:'no-store'});
      if(fresh && fresh.ok){
        const cache=await caches.open(CACHE);
        await cache.put(event.request,fresh.clone());
      }
      return fresh;
    }catch{
      return (await caches.match(event.request)) || Response.error();
    }
  })());
});
