---
name: pwa-web-push
description: Use when implementing or debugging PWA installability, the service worker, or Web Push notifications (VAPID) — including the install/permission UX for asesores.
---

# PWA + Web Push (free, no paid services)

## Overview
Official Next.js 16 pattern: `app/manifest.ts` + hand-rolled `public/sw.js` + `web-push` npm (3.6.7) with VAPID keys in Server Actions. No PWA library (`next-pwa` is dead; Serwist only if offline caching is ever needed). Push delivery is free — Google/Apple/Mozilla run the push services. Verified 2026-08-03; reliability findings added 2026-08-05 (see research brief `docs/ultrapowers/research/2026-08-05-guardias-push-research.md`).

## Setup

- Installability: valid manifest (name, 192px + 512px PNG icons, `display: 'standalone'`, `start_url`) + HTTPS. That's all — offline support NOT required.
- Register SW manually: `navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' })`. Serve `sw.js` with `Cache-Control: no-cache, no-store, must-revalidate` via `headers()` in next.config.
- Exclude `manifest.webmanifest` from the proxy.ts matcher (browser fetches it without cookies — auth redirect breaks install).
- VAPID: `npx web-push generate-vapid-keys` → `NEXT_PUBLIC_VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY`.
- Local test: `next dev --experimental-https`.

## Sending (server)

```ts
import webpush from 'web-push' // Node runtime ONLY — never Edge
webpush.setVapidDetails('mailto:admin@...', publicKey, privateKey)
const results = await Promise.allSettled(subs.map(s => webpush.sendNotification(s, payload)))
// NEVER fire-and-forget on Vercel: un-awaited sends are killed when the function returns.
// Delete subscriptions that return 404/410 (stale).
```

Store subscriptions per user in Postgres (`push_suscripciones`: usuario_id, endpoint UNIQUE, p256dh, auth — multiple rows per user, one per device). Scheduled pushes (visit reminders) go through the cron, not waitUntil.

## Subscription lifecycle (load-bearing)

- **`pushsubscriptionchange` is NOT reliable (2026):** Chrome effectively never fires it on expiry; iOS drops subscriptions without firing it. Implement the handler as a bonus, but the real mechanism is **re-sync on every app open**: `pushManager.getSubscription()` → compare endpoint with what the server has → upsert; if permission is `granted` but subscription is null, re-subscribe silently.
- **iOS silent-push penalty:** EVERY `push` event MUST end in `event.waitUntil(self.registration.showNotification(...))`. After ~3 pushes with no visible notification, iOS silently revokes the subscription. Never send data-only pushes.
- **Declarative Web Push (iOS 18.4+):** shaping the payload as the declarative JSON (`{"web_push": 8030, "notification": {title, body, navigate, ...}}`) lets new iOS render it without waking the SW and exempts it from the silent-push penalty; keep the SW `push` handler as fallback for everything else. Optional but cheap resilience.
- Real-world delivery: iOS ~70–85%, Android ~90–95% — push is a nudge, not a guarantee; the campanita (in-app) remains source of truth.

## Platform reality

| | Android Chrome | iOS Safari |
|---|---|---|
| Push | Full, even uninstalled | **iOS 16.4+, ONLY when installed to home screen** (Safari tab has no PushManager; Chrome-on-iOS can't help) |
| Install prompt | `beforeinstallprompt` → own button | **No API** — manual steps card |
| Badging | Yes | iOS 16.4+ (`navigator.setAppBadge()`); iOS 18.4+ Declarative Web Push can badge from payload |

iOS quirks: permission prompt requires a user gesture; the installed app has a SEPARATE storage partition from the Safari tab (user logs in again after installing; request push permission INSIDE the installed app, not the tab); deleting the home-screen icon kills the subscription; call `navigator.storage.persist()` after notification permission to resist 7-day eviction. Server (Supabase) is always source of truth — never keep unsent local-only data.

## UX pattern (non-technical users, es-MX)

1. Hide everything if `window.matchMedia('(display-mode: standalone)').matches`.
2. Android: capture `beforeinstallprompt`, `preventDefault()`, show "Instalar aplicación" banner after first login, call `prompt()` on tap.
3. iOS (detect UA + not standalone): visual card — "1. Toca **Compartir** en Safari → 2. **Agregar a pantalla de inicio** → 3. **Agregar**". Warn if opened inside WhatsApp's in-app browser ("ábrelo en Safari"). Exact es-MX label varies by iOS version — verify on device.
4. **Two-step pre-prompt for notifications:** own explainer first ("Activa avisos para enterarte al instante cuando te asignen un lead") with a button; only that tap fires `Notification.requestPermission()`. A denied native prompt is nearly irreversible.
5. Sequencing on iOS: install first → then ask for push on first standalone launch. Remember dismissals in localStorage; re-offer only at meaningful moments.

## Common mistakes

- Sending push from Edge runtime (web-push needs Node crypto).
- Fire-and-forget `sendNotification` on Vercel (killed at response end).
- Not cleaning 404/410 subscriptions → growing dead list, slow sends.
- Requesting permission on page load (guaranteed denial) or in the Safari tab on iOS (doesn't carry to the installed app).
- Adding Serwist/offline caching "just in case" — YAGNI; the official guide's minimal setup is the target.
- Data-only/silent pushes on iOS (subscription revoked after ~3) — always `showNotification`.
- Trusting `pushsubscriptionchange` to keep the subscription table fresh — re-sync on app open instead.
- Rotating VAPID keys casually — it invalidates EVERY subscription; treat them as permanent.
