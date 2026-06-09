// Minimal service worker — satisfies PWA installability without caching sensitive data.
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Empty fetch handler — presence is required for PWA installability.
// We deliberately do NOT call event.respondWith() so the browser handles every
// request natively. Calling respondWith(fetch(request)) in a payment app is
// risky: if the inner fetch throws (network error), the unhandled rejection can
// silently break auth and payment API calls in ways native fetch error handling
// would not.
self.addEventListener('fetch', () => {});
