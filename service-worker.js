// Kill-switch for the legacy (2021) FitCheck service worker. Clears its caches, unregisters itself and
// reloads open tabs so returning visitors get FitCheck V2. V2 does not use a service worker.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) await caches.delete(key);
    await self.registration.unregister();
    for (const client of await self.clients.matchAll({ type: 'window' })) client.navigate(client.url);
  })());
});
