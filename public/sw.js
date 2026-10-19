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

// ---------------------------------------------------------------------------
// Payment notifications for sound devices (see src/lib/sound-device-push.ts).
//
// A /speaker page that is still awake announces the payment itself (chime and
// voice), so its notification is silent. When the page is frozen — the phone
// is asleep — it can't answer, and the notification plays the device's sound.
// ---------------------------------------------------------------------------

/** How long a frozen page gets to answer before we assume it can't announce. */
const SPEAKER_REPLY_MS = 1500;
/** Matches the server's replay window: older payments are shown, not sounded. */
const STALE_AFTER_MS = 2 * 60 * 1000;

function isSpeakerClient(client) {
  try {
    return new URL(client.url).pathname === '/speaker';
  } catch {
    return false;
  }
}

/** Hands the payment to one open speaker page; true if it announced it aloud. */
function askSpeaker(client, payment) {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => resolve(false), SPEAKER_REPLY_MS);
    channel.port1.onmessage = (event) => {
      clearTimeout(timer);
      resolve(event.data && event.data.announced === true);
    };
    client.postMessage({ type: 'nibtera-payment', payment }, [channel.port2]);
  });
}

async function announcedBySpeakerPage(payment) {
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  const speakers = windows.filter(isSpeakerClient);
  if (speakers.length === 0) return false;
  const answers = await Promise.all(speakers.map((client) => askSpeaker(client, payment)));
  return answers.some(Boolean);
}

function formatAmount(amount, currency) {
  const value = Number(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${value} ${currency || ''}`.trim();
}

async function showPaymentNotification(payment) {
  const announced = await announcedBySpeakerPage(payment);
  const occurredAt = Date.parse(payment.occurredAt) || Date.now();
  const silent = announced || Date.now() - occurredAt > STALE_AFTER_MS;

  const amount = formatAmount(payment.amount, payment.currency);
  const title = payment.type === 'test' ? `Test payment: ${amount}` : `Payment received: ${amount}`;
  const body = [payment.payerName ? `from ${payment.payerName}` : null, payment.channel].filter(Boolean).join(' · ');

  await self.registration.showNotification(title, {
    body,
    // One notification per payment, even if it is pushed to several devices in this browser.
    tag: `payment-${payment.id}`,
    icon: '/icon-192.png',
    timestamp: occurredAt,
    silent,
    vibrate: silent ? undefined : [300, 150, 300],
    data: { url: '/speaker' },
  });
}

self.addEventListener('push', (event) => {
  let payment;
  try {
    payment = event.data ? event.data.json() : null;
  } catch {
    payment = null;
  }
  if (!payment || typeof payment.amount !== 'number') return;
  event.waitUntil(showPaymentNotification(payment));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/speaker';
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const speaker = windows.find(isSpeakerClient);
      if (speaker) return speaker.focus();
      return self.clients.openWindow(url);
    })()
  );
});
