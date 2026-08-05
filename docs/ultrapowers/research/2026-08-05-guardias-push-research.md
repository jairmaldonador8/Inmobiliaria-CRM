# Research Brief: Push PWA + Guardias con escalamiento

> Deep-research del 2026-08-05 para el spec `2026-08-05-guardias-design.md`.
> Fuentes: docs locales de `node_modules/next/dist/docs/` (Next 16.2.12 del
> repo), web (oficiales WebKit/Chromium/npm/Resend, cross-checked), y lectura
> del código del repo.

## Contexto

Fase A: PWA con Web Push (VAPID) en Next.js 16 sobre Vercel/Supabase.
Fase B: guardias + asignación en el sync + escalador vía pg_cron.

## Hallazgos clave — Next.js 16 de ESTE repo (difiere del conocimiento común)

- `middleware.ts` ya no existe: se llama **`proxy.ts`** (el repo ya usa
  `src/proxy.ts`) y corre en **runtime Node.js por default**; poner
  `export const runtime` en proxy LANZA error.
- Route handlers `GET` **NO se cachean por default** (opt-in con
  `dynamic = 'force-static'`). No agregar `force-dynamic` por reflejo.
- `params`/`searchParams`/`cookies()`/`headers()` son **async, sin shim** — el
  acceso síncrono se eliminó del todo en 16.
- Turbopack es el bundler default → **no usar next-pwa (muerto) ni Serwist**
  (requiere webpack). Service worker a mano en `public/sw.js`.
- Manifest: convención **`app/manifest.ts`** (`MetadataRoute.Manifest`), se
  sirve como `/manifest.webmanifest` — ya está excluido del matcher del proxy
  (`src/proxy.ts:145`, requisito para que la instalación no muera en redirect).
- Headers para `/sw.js` vía `headers()` de `next.config.ts`:
  `Cache-Control: no-cache, no-store, must-revalidate` (+ Content-Type y CSP;
  bloque exacto en el guide local `02-guides/progressive-web-apps.md`).
- El guide oficial desaconseja `beforeinstallprompt`; el skill del proyecto lo
  usa **solo para el banner de Android** — decisión deliberada, se mantiene
  (en iOS va tarjeta manual con instrucciones).

## Hallazgos clave — Web Push 2026

- **Librería: `web-push@3.6.7`** (npm) sigue siendo el estándar; protocolo
  congelado (RFC 8030/8291/8292), `aes128gcm` default. Corre en runtime Node
  (default de route handlers en este Next). Aún NO está en `package.json` —
  instalar junto con `@types/web-push`.
- **En serverless SIEMPRE `await` cada `sendNotification()`** (nunca
  fire-and-forget: Fluid Compute puede suspender antes de entregar). Batch con
  `Promise.allSettled` inspeccionando cada resultado.
- **404/410 del push service ⇒ borrar la suscripción** en ese momento. 403 =
  VAPID mal configurado; 413 = payload >4KB; 429 = back-off.
- **`pushsubscriptionchange` NO es confiable** (Chrome casi nunca lo dispara;
  iOS suelta suscripciones sin avisar). Mecanismo de carga: **re-sync en cada
  apertura de la app** — `pushManager.getSubscription()`, comparar endpoint,
  re-upsert; si hay permiso pero no suscripción, re-suscribir.
- **iOS**: mínimo 16.4; **instalación a pantalla de inicio sigue siendo
  obligatoria** (sin cambios hasta iOS 18/26); permiso solo dentro de gesto de
  usuario; la app instalada tiene **partición de storage separada** de Safari
  (pedir permiso DENTRO de la app instalada). **Penalización de push
  silencioso**: todo evento push debe terminar en `showNotification(...)` — ~3
  pushes sin notificación visible y iOS revoca la suscripción en silencio.
  Entrega real iOS ~70–85% (Android ~90–95%).
- **Declarative Web Push** (iOS 18.4+): opcional; dar al payload esa forma JSON
  exime de la penalización de silencio en iOS nuevos. Nicety, no requisito.
- **Chrome**: la auto-revocación de permisos (2025) **excluye apps instaladas**;
  el apagón de FCM legacy (2024) no afecta Web Push con VAPID.
- **VAPID**: generar una vez con `npx web-push generate-vapid-keys`;
  `NEXT_PUBLIC_VAPID_PUBLIC_KEY` + `VAPID_PRIVATE_KEY` (Sensitive). **Nunca
  rotar a la ligera** (invalida TODAS las suscripciones). Gotcha propio del
  repo: cargar env vars desde bash/`printf` (el pipe de PowerShell mete `\r` →
  403 inexplicables).
- Deep-link en `notificationclick`: patrón focus-existing-window + `navigate`,
  con `data.url` en el payload; URLs dentro del scope del manifest (fuera de
  scope iOS abre hoja de navegador embebida).
- Testing local: `next dev --experimental-https`.

## Hallazgos clave — patrones del repo a reutilizar

- **Cron**: copiar `src/app/api/cron/easybroker-sync/route.ts` — fail-closed
  (`!secreto || header !== Bearer` → 401), `Request` plano, `maxDuration = 300`,
  admin client dentro del handler. El prefijo `api/cron` ya está excluido del
  proxy ⇒ `/api/cron/escalamiento` no requiere tocar el matcher. Un endpoint
  `/api/push/*` de suscripción SÍ debe pasar por el proxy (necesita sesión).
- **Deuda encontrada**: el `cron.schedule(...)` del sync nunca se commiteó (se
  creó a mano en el dashboard). Fase B debe dejar el SQL del nuevo job (y de
  paso el del sync) versionado en `supabase/`.
- **Notificaciones**: `crearNotificacion(supabase, {destinatarioId, tipo,
  texto, url})` y `notificarAdmins(...)` en `src/lib/notificaciones/crear.ts`
  (reciben el cliente por DI; INSERT requiere service-role). La función privada
  `registrarAsignacion` en `src/lib/leads/acciones.ts` es el **punto único** de
  seguimiento+notificación al asignar — ahí se engancha el push.
- **CAS existente**: `asignarLead` usa `.is('asesor_id', null)` (bandeja);
  «Tomar lead» usará `.eq('asesor_id', asesorOriginal)` como fijó el spec.
- **Timezone es greenfield**: no hay ningún helper de zona horaria en el repo
  (date-fns 4 solo para display). Recomendación: **`@date-fns/tz`** (par
  nativo de date-fns v4) para el resolutor de guardias en TS — testeable con
  vitest, que es donde el spec exige unitarias. El escalador NO necesita tz
  (aritmética absoluta sobre `timestamptz escalamiento_desde`); la zona
  `America/Monterrey` solo interviene al resolver qué guardia cubre «ahora» y
  en el calendario del admin.

## Enfoque recomendado (consolidado)

Fase A: `app/manifest.ts` + `public/sw.js` a mano + `web-push@3.6.7` en server
actions/route handlers Node; tabla `push_suscripciones` UNIQUE(endpoint),
varias filas por usuario; poda en 404/410 + re-sync al abrir; permiso tras
gesto y tras instalación (obligatorio iOS); todo push termina en
`showNotification`; payload con forma declarativa para iOS 18.4+.
Fase B: resolutor en TS con `@date-fns/tz`; escalador como
`/api/cron/escalamiento` clonando el patrón Bearer; job pg_cron cada 5 min con
SQL versionado; correo del paso 2 h con **Resend** (free tier 3,000/mes,
100/día — sobra para decenas/mes), instalado vía Vercel Marketplace.

## Fuentes principales

- Local: `node_modules/next/dist/docs/01-app/02-guides/progressive-web-apps.md`,
  `.../16-proxy.md`, `.../upgrading/version-16.md`, `.../route-handlers.md`,
  `.../manifest.md` — convenciones reales de ESTE Next.
- `.claude/skills/pwa-web-push/SKILL.md` (verificado 2026-08-03, alineado).
- npm registry + GitHub web-push-libs — v3.6.7, estado de mantenimiento.
- WebKit blog (declarative push, Safari 18.4/18.5); Chromium blog
  (auto-revocación 2025); MDN (`pushsubscriptionchange`); Resend pricing.
- Código del repo: `sync.ts`, `acciones.ts`, `crear.ts`, `proxy.ts`, README.
