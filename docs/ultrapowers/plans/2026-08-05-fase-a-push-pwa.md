# Fase A — Push PWA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use ultrapowers:subagent-driven-development (recommended) or ultrapowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Infraestructura de Web Push para Klo-Ser: PWA instalable + service worker + suscripciones en Supabase + helper `enviarPush` enganchado al seam de notificaciones existente.

**Architecture:** `app/manifest.ts` + `public/sw.js` a mano (sin librerías PWA, Turbopack es default), `web-push` con VAPID en runtime Node (default de este Next), tabla `push_suscripciones` con RLS de dueño, y el envío colgado de `crearNotificacion` (seam único: todo lo que ya notifica campanita empieza a empujar push sin tocar a los llamadores).

**Tech Stack:** Next.js 16.2.12 (¡leer docs locales en `node_modules/next/dist/docs/`, NO memoria: proxy.ts, params async, GET sin caché!), web-push 3.6.7, Supabase (RLS), Vitest.

**Skills:** `pwa-web-push` (proyecto — LEERLO antes de empezar), `testing-tdd`, `typescript-best-practices`, `supabase-patterns`, `resilience`. Donde `nextjs-patterns` contradiga los docs locales, mandan los docs locales (regla AGENTS.md).

**Preferencias:** auto-commit ON, auto-push ON → los pasos de commit se ejecutan.

**Referencias:** spec `docs/ultrapowers/specs/2026-08-05-guardias-design.md`, research `docs/ultrapowers/research/2026-08-05-guardias-push-research.md`.

---

## Mapa de archivos

| Archivo | Responsabilidad |
|---|---|
| `supabase/migrations/0007_push_suscripciones.sql` (crear) | Tabla + RLS |
| `src/lib/env.ts` / `src/lib/env-server.ts` (modificar) | Accessors VAPID |
| `src/lib/push/enviar.ts` (crear) | `enviarPush()` — envío + poda 404/410 |
| `src/lib/push/acciones.ts` (crear) | Server actions guardar/eliminar suscripción |
| `src/lib/notificaciones/crear.ts` (modificar) | Enganchar push tras insertar campanita |
| `src/app/manifest.ts` (crear) | Manifest PWA |
| `public/sw.js` (crear) | Push + notificationclick |
| `public/icons/icon-192.png`, `icon-512.png` (crear) | Copiados de `design-propuestas/assets/logo/icon-ventana-{192,512}.png` |
| `next.config.ts` (modificar) | Headers de `/sw.js` |
| `src/components/push/registro-push.tsx` (crear) | Registro SW + re-sync al abrir |
| `src/components/push/banner-instalacion.tsx` (crear) | UX instalar + pre-prompt permiso |
| `src/app/(admin)/admin/layout.tsx`, `src/app/(asesor)/asesor/layout.tsx` (modificar) | Montar los dos componentes |
| `src/test/push-enviar.test.ts`, `src/test/rls.integration.test.ts` (crear/modificar) | Pruebas |

---

### Task 1: Dependencias, llaves VAPID y accessors de env

**Files:** Modify: `package.json`, `src/lib/env.ts`, `src/lib/env-server.ts`, `.env.local` (NO se commitea)

- [ ] **Step 1:** `npm install web-push` y `npm install -D @types/web-push`
- [ ] **Step 2:** Generar llaves UNA vez: `npx web-push generate-vapid-keys`. Agregar a `.env.local`:

```
NEXT_PUBLIC_VAPID_PUBLIC_KEY=<publicKey>
VAPID_PRIVATE_KEY=<privateKey>
VAPID_SUBJECT=mailto:jairmaldonador8@gmail.com
```

⚠️ Estas llaves son PERMANENTES: rotarlas invalida todas las suscripciones. No pegarlas en el chat.

- [ ] **Step 3:** En `src/lib/env.ts` agregar (mismo patrón `requerida`):

```ts
export function vapidPublicKey(): string {
  return requerida(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY, 'NEXT_PUBLIC_VAPID_PUBLIC_KEY')
}
```

- [ ] **Step 4:** En `src/lib/env-server.ts` agregar `vapidPrivateKey()` y `vapidSubject()` con el mismo patrón del módulo.
- [ ] **Step 5:** `npm run build` — debe compilar. **Commit** `feat: dependencias y env de web push (VAPID)` y push.

### Task 2: Migración `push_suscripciones` + RLS + test de integración

**Files:** Create: `supabase/migrations/0007_push_suscripciones.sql` · Modify: `src/test/rls.integration.test.ts`

- [ ] **Step 1:** Escribir la migración:

```sql
-- 0007: suscripciones de Web Push (varias por usuario: una por dispositivo)
create table push_suscripciones (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references usuarios(user_id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  creada_en timestamptz not null default now()
);
create index on push_suscripciones (usuario_id);

alter table push_suscripciones enable row level security;

-- Cada usuario administra SOLO sus suscripciones; service role (cron/envíos) brinca RLS.
create policy push_select_propias on push_suscripciones
  for select to authenticated using (usuario_id = (select auth.uid()));
create policy push_insert_propias on push_suscripciones
  for insert to authenticated with check (usuario_id = (select auth.uid()));
create policy push_update_propias on push_suscripciones
  for update to authenticated using (usuario_id = (select auth.uid()))
  with check (usuario_id = (select auth.uid()));
create policy push_delete_propias on push_suscripciones
  for delete to authenticated using (usuario_id = (select auth.uid()));
```

- [ ] **Step 2:** Aplicarla igual que 0001–0006 (`npx supabase db push`; si el CLI no está ligado, correr el SQL en el editor de Supabase y dejar el archivo commiteado igual).
- [ ] **Step 3 (test primero para el caso nuevo):** en `src/test/rls.integration.test.ts` agregar describe `push_suscripciones` siguiendo el patrón existente del archivo: (a) asesor1 inserta la suya y la lee; (b) asesor1 NO ve la de asesor2 (select regresa 0 filas); (c) asesor1 NO puede insertar con `usuario_id` de asesor2 (error de policy). Correr: `npm run test:rls` → los 3 casos pasan.
- [ ] **Step 4:** **Commit** `feat: tabla push_suscripciones con RLS de dueño (0007)` y push.

### Task 3: `enviarPush()` — TDD con web-push mockeado

**Files:** Create: `src/lib/push/enviar.ts`, `src/test/push-enviar.test.ts`

- [ ] **Step 1: Test que falla.** `src/test/push-enviar.test.ts` con `vi.mock('web-push')` **y** `vi.stubEnv` (o mocks de `@/lib/env` y `@/lib/env-server`) para las VAPID — los tests unitarios NO cargan `.env.local` y los accessors lanzan si faltan. Casos: (a) manda a TODAS las suscripciones del destinatario y espera (`await`) cada envío; (b) al recibir `WebPushError` con statusCode 410 (o 404) BORRA esa fila y no lanza; (c) sin suscripciones → no lanza, regresa `{ enviados: 0 }`; (d) el payload incluye `title`, `body` y `data.url`. Correr `npm run test -- push-enviar` → falla (módulo no existe).
- [ ] **Step 2: Implementación mínima** `src/lib/push/enviar.ts`:

```ts
import 'server-only'
import webpush, { WebPushError } from 'web-push'
import type { SupabaseClient } from '@supabase/supabase-js'
import { vapidPublicKey } from '@/lib/env'
import { vapidPrivateKey, vapidSubject } from '@/lib/env-server'

export interface DatosPush {
  titulo: string
  cuerpo: string
  url?: string | null
}

/**
 * Envía Web Push a todas las suscripciones del destinatario. Best-effort:
 * nunca lanza (el push es un empujón; la campanita es la fuente de verdad).
 * Igual que crearNotificacion, recibe el cliente por DI (el cron pasa el
 * admin client). Poda suscripciones muertas (404/410) al vuelo.
 * SIEMPRE await: en Vercel un envío sin await muere al responder la función.
 */
export async function enviarPush(
  supabase: SupabaseClient,
  destinatarioId: string,
  { titulo, cuerpo, url }: DatosPush
): Promise<{ enviados: number }> {
  webpush.setVapidDetails(vapidSubject(), vapidPublicKey(), vapidPrivateKey())

  const { data: subs, error } = await supabase
    .from('push_suscripciones')
    .select('id, endpoint, p256dh, auth')
    .eq('usuario_id', destinatarioId)
  if (error || !subs || subs.length === 0) return { enviados: 0 }

  // iOS revoca la suscripción tras ~3 pushes sin notificación visible: el SW
  // SIEMPRE muestra showNotification con este payload.
  const payload = JSON.stringify({ title: titulo, body: cuerpo, data: { url: url ?? '/' } })

  const resultados = await Promise.allSettled(
    subs.map((s) =>
      webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        payload
      )
    )
  )

  const muertas = subs.filter((_, i) => {
    const r = resultados[i]
    return (
      r.status === 'rejected' &&
      r.reason instanceof WebPushError &&
      (r.reason.statusCode === 404 || r.reason.statusCode === 410)
    )
  })
  if (muertas.length > 0) {
    await supabase.from('push_suscripciones').delete().in('id', muertas.map((s) => s.id))
  }

  return { enviados: resultados.filter((r) => r.status === 'fulfilled').length }
}
```

- [ ] **Step 3:** `npm run test -- push-enviar` → PASS. **Commit** `feat: helper enviarPush con poda de suscripciones muertas` y push.

### Task 4: Enganchar push al seam de notificaciones

**Files:** Modify: `src/lib/notificaciones/crear.ts` · Test: `src/test/notificaciones-push.test.ts` (crear)

Todo lo que hoy campanea (`lead_asignado`, avisos a admins) empieza a empujar push sin tocar `acciones.ts` ni el sync.

- [ ] **Step 1: Test que falla:** mock de `@/lib/push/enviar`; `crearNotificacion` llama `enviarPush` con el mismo destinatario/texto/url tras insertar; si `enviarPush` revienta, `crearNotificacion` NO lanza (try/catch con `console.error`). `notificarAdmins` empuja a cada admin.
- [ ] **Step 2:** Implementar: en `crearNotificacion`, tras el insert exitoso, `try { await enviarPush(supabase, destinatarioId, { titulo: 'Klo-Ser', cuerpo: texto, url }) } catch (e) { console.error(...) }`. En `notificarAdmins`, empujar por cada admin insertado (reusar la lista que ya consulta).
- [ ] **Step 3:** `npm run test` (suite completa) → PASS. **Commit** `feat: push web enganchado a crearNotificacion` y push.

### Task 5: Manifest + iconos

**Files:** Create: `src/app/manifest.ts`, `public/icons/icon-192.png`, `public/icons/icon-512.png`

- [ ] **Step 1:** Copiar iconos: `cp design-propuestas/assets/logo/icon-ventana-192.png public/icons/icon-192.png` (ídem 512).
- [ ] **Step 2:** `src/app/manifest.ts`:

```ts
import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Klo-Ser · Montana Realty',
    short_name: 'Klo-Ser',
    description: 'Del lead al cierre',
    start_url: '/',
    display: 'standalone',
    background_color: '#F2EDE4', // hueso (paleta Muro)
    theme_color: '#221B14', // tinta
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  }
}
```

- [ ] **Step 3:** Verificar (solo lectura) que `src/proxy.ts` ya excluye `manifest.webmanifest` del matcher (línea ~145) — sin esa exclusión la instalación muere en redirect de auth. Ya está hecho; NO tocar.
- [ ] **Step 4:** `npm run build` → OK. **Commit** `feat: manifest PWA e iconos de la ventana` y push.

### Task 6: Service worker + headers

**Files:** Create: `public/sw.js` · Modify: `next.config.ts`

- [ ] **Step 1:** `public/sw.js` (JS plano, sin bundler):

```js
self.addEventListener('push', (event) => {
  let datos = { title: 'Klo-Ser', body: '', data: { url: '/' } }
  try { datos = { ...datos, ...event.data.json() } } catch {}
  // SIEMPRE mostrar notificación: iOS revoca la suscripción tras ~3 pushes silenciosos.
  event.waitUntil(
    self.registration.showNotification(datos.title, {
      body: datos.body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: datos.data,
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url || '/'
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((lista) => {
      for (const cliente of lista) {
        if (new URL(cliente.url).origin === self.location.origin && 'focus' in cliente) {
          cliente.focus()
          return cliente.navigate ? cliente.navigate(url) : clients.openWindow(url)
        }
      }
      return clients.openWindow(url)
    })
  )
})
```

- [ ] **Step 2:** En `next.config.ts` agregar (los headers se evalúan ANTES que `/public`, sí aplican al asset):

```ts
async headers() {
  return [
    {
      source: '/sw.js',
      headers: [
        { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
        { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
        { key: 'Content-Security-Policy', value: "default-src 'self'; script-src 'self'" },
      ],
    },
  ]
},
```

- [ ] **Step 3:** `npm run build` → OK. **Commit** `feat: service worker de push con deep-link` y push.

### Task 7: Suscripción — server actions + registro con re-sync

**Files:** Create: `src/lib/push/acciones.ts`, `src/components/push/registro-push.tsx` · Modify: ambos layouts · Test: `src/test/push-acciones.test.ts`

- [ ] **Step 1: Test que falla** para `guardarSuscripcion`: guarda con upsert por `endpoint` para el usuario actual; rechaza si no hay sesión. (Mock de `usuarioActual` y del cliente supabase, patrón de tests existentes.)
- [ ] **Step 2:** `src/lib/push/acciones.ts`:

```ts
'use server'

import { usuarioActual } from '@/lib/auth/usuario-actual'
import { createClient } from '@/lib/supabase/server'

export interface SuscripcionPush {
  endpoint: string
  keys: { p256dh: string; auth: string }
}

export async function guardarSuscripcion(sub: SuscripcionPush, userAgent?: string) {
  const usuario = await usuarioActual()
  if (!usuario) return { error: 'Sin sesión' }
  const supabase = await createClient()
  const { error } = await supabase.from('push_suscripciones').upsert(
    {
      usuario_id: usuario.user_id,
      endpoint: sub.endpoint,
      p256dh: sub.keys.p256dh,
      auth: sub.keys.auth,
      user_agent: userAgent ?? null,
    },
    { onConflict: 'endpoint' }
  )
  return error ? { error: 'No se pudo guardar la suscripción' } : {}
}

export async function eliminarSuscripcion(endpoint: string) {
  const usuario = await usuarioActual()
  if (!usuario) return { error: 'Sin sesión' }
  const supabase = await createClient()
  await supabase.from('push_suscripciones').delete().eq('endpoint', endpoint)
  return {}
}
```

(Nota: RLS garantiza que solo toca filas propias; el upsert de un endpoint ajeno falla por policy.)

- [ ] **Step 3:** `src/components/push/registro-push.tsx` (`'use client'`, sin UI — montado siempre): al montar, si hay `serviceWorker` en navigator: `register('/sw.js', { scope: '/', updateViaCache: 'none' })`; **re-sync en cada apertura** (pushsubscriptionchange NO es confiable): si `Notification.permission === 'granted'` → `pushManager.getSubscription()`; si existe, re-mandar a `guardarSuscripcion` (upsert barato); si es null, `subscribe({ userVisibleOnly: true, applicationServerKey: vapidPublicKey() })` y guardar.
- [ ] **Step 4:** Montar `<RegistroPush />` en `src/app/(admin)/admin/layout.tsx` y `src/app/(asesor)/asesor/layout.tsx`.
- [ ] **Step 5:** `npm run test` + `npm run build` → PASS. **Commit** `feat: suscripción push con re-sync al abrir` y push.

### Task 8: UX de instalación y permiso (banner es-MX)

**Files:** Create: `src/components/push/banner-instalacion.tsx` · Modify: ambos layouts

Seguir @pwa-web-push al pie: (1) ocultar todo si `display-mode: standalone` y ya hay permiso; (2) Android: capturar `beforeinstallprompt` → botón «Instalar aplicación»; (3) iOS no instalado: tarjeta «Toca **Compartir** → **Agregar a pantalla de inicio**» + aviso si es browser embebido de WhatsApp; (4) **pre-prompt en dos pasos** para notificaciones («Activa avisos para enterarte al instante cuando te asignen un lead») — solo ese tap dispara `Notification.requestPermission()` y, si concede, suscribe (reusar la lógica del Task 7 vía props/hook compartido) y llama `navigator.storage.persist()`; (5) descartes en `localStorage` (`kloser-push-banner`), re-ofrecer solo en momentos significativos.

- [ ] **Step 1:** Implementar el componente (estilos con la paleta actual de la app; sin nuevas dependencias).
- [ ] **Step 2:** Montarlo en ambos layouts junto a `RegistroPush`.
- [ ] **Step 3:** Revisión manual con `next dev --experimental-https` en el teléfono o DevTools device mode: banner aparece solo cuando corresponde. `npm run build` → OK. **Commit** `feat: banner de instalación PWA y pre-prompt de notificaciones` y push.

### Task 9: Indicador admin «sin notificaciones»

**Files:** Modify: consulta y componente de la lista de asesores (`src/lib/asesores/`, `src/components/asesores/`)

El spec pide avisar al admin cuando un asesor **activo** no tiene push.

Nota previa: hoy la consulta vive como función privada `obtenerAsesores()` dentro
de `src/app/(admin)/admin/asesores/page.tsx` — extraerla primero a
`src/lib/asesores/consultas.ts` (export) para poder testearla.

- [ ] **Step 1: Test que falla:** la consulta extraída incluye `tiene_push` (EXISTS sobre `push_suscripciones` vía admin client); el badge solo aplica a asesores con `activo = true`.
- [ ] **Step 2:** Implementar el campo y un badge discreto «Sin notificaciones» en la fila del asesor cuando `!tiene_push`.
- [ ] **Step 3:** `npm run test` → PASS. **Commit** `feat: badge de asesores sin push para el admin` y push.

### Task 10: Verificación end-to-end y producción

- [ ] **Step 1:** Local: `next dev --experimental-https` → instalar, aceptar permiso, y desde un script one-off (node REPL) llamar `enviarPush` al propio usuario → la notificación aparece con la app cerrada y el click abre la URL.
- [ ] **Step 2:** Cargar env vars en Vercel **desde bash con `printf`** (¡NUNCA pipe de PowerShell: mete `\r` y produce 403 indescifrables!): `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` (Sensitive), `VAPID_SUBJECT`.
- [ ] **Step 3:** Push a main (deploy) y smoke test en producción con un usuario seed: instalar en un teléfono real, asignar un lead de prueba desde el admin → llega push. Verificar además que la campanita sigue funcionando igual.
- [ ] **Step 4:** Marcar en `docs/decisiones.md` una línea con la fecha y el alta de push (comportamiento nuevo en producción). **Commit** y push.

---

## Después de este plan

La **Fase B (guardias + asignación + escalamiento)** tiene su propio plan (`2026-08-05-fase-b-guardias.md`, se escribe al terminar esta fase) y consume `enviarPush` y la PWA de aquí. No adelantar nada de Fase B en esta. Ojo de numeración: este plan consume la migración **0007**; las tablas de guardias de Fase B empiezan en **0008** (el spec decía "0007" para ambas — manda esta nota).
