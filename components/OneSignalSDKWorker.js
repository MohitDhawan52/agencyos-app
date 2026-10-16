// OneSignal removed — this worker unregisters itself so it stops intercepting requests
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil(
    self.registration.unregister().then(() => self.clients.matchAll()).then(clients => {
      clients.forEach(client => client.navigate(client.url));
    })
  );
});