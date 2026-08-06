---
name: google-calendar
description: Use when writing or debugging any code that touches Google Calendar — OAuth connect/disconnect de asesores, espejo de visitas a Calendar, freebusy/disponibilidad, cifrado de refresh tokens, o el cron gcal-retry.
---

# Google Calendar (integración Klo-Ser)

## Overview
Sync unidireccional: el CRM es la fuente de verdad; Calendar del asesor es un
espejo. Hechos verificados contra docs oficiales de Google/Node/Supabase el
2026-08-06 (research brief `docs/ultrapowers/research/2026-08-06-google-calendar-research.md`).

## OAuth (cuentas @gmail.com personales)

- Auth URL `https://accounts.google.com/o/oauth2/v2/auth` con
  `access_type=offline&prompt=consent` SIEMPRE — sin `prompt=consent` Google
  NO reenvía refresh_token en reconexiones (solo llega en la primera
  autorización). Upsert conservando el token anterior si la respuesta no trae.
- **NUNCA dejar la app en modo Testing:** los refresh tokens con scopes de
  Calendar expiran a los **7 días** del consentimiento. Publicar «In
  production» sin verificar (tokens duraderos; tope de por vida 100 usuarios;
  pantalla «app no verificada») y tramitar verificación sensitive en paralelo
  (gratis, ~10 días: privacy policy en el mismo dominio, Search Console,
  video demo, justificación de scopes).
- Scopes: `calendar.events.owned` + `calendar.freebusy`. Nada más.
- **`invalid_grant` en refresh = terminal, NO reintentar:** marcar conexión
  `revocada`, borrar token, push al asesor para reconectar.
- Desconectar: `POST https://oauth2.googleapis.com/revoke` (tumba el grant
  completo); 400 `invalid_token` = ya revocado → éxito. Borrar de BD siempre.
- Librería: `@googleapis/calendar` (scoped). NO instalar el monolito
  `googleapis` (~200 MB en la función serverless).
- `state` firmado (HMAC user_id + expiración 10 min) contra CSRF.

## Espejo de eventos (Calendar API v3)

- **Idempotencia por id propio:** generar el `id` del evento derivado del id
  de la visita (charset base32hex minúscula `a-v0-9`, 5–1024 chars). Retry
  del insert con mismo id → **409 = éxito idempotente**. Añadir
  `extendedProperties.private.visitaId` para búsqueda inversa.
- Body mínimo: `summary`, `description`, `start`/`end` con `dateTime` RFC3339
  **y** `timeZone: 'America/Monterrey'`. Sin `attendees` (no invita a nadie)
  + `sendUpdates: 'none'` explícito (`sendNotifications` está deprecado).
- Delete con 404/410 = evento ya no existe → **tratar como éxito** (doc
  oficial). Si el asesor borró el evento a mano, el id queda quemado
  (`status: cancelled`): reinsertar da 409 → hacer `update` reponiendo
  `status: 'confirmed'`.
- `freebusy.query` (`POST /freeBusy`, `items: [{id:'primary'}]`) devuelve
  solo bloques `{start,end}` ocupados; ventanas cortas (1 semana). **All-day
  creados en la UI suelen ser «Free» → no aparecen en freebusy** (no refleja
  vacaciones).
- Errores: 401 → refrescar access token; 403/429/5xx → backoff exponencial
  con jitter. Cuotas holgadas (600 req/min/usuario).

## Cifrado de refresh tokens

- `node:crypto` AES-256-GCM (no WebCrypto, no Vault/pgsodium — pgsodium en
  deprecación). Formato almacenado: `v1.` + base64(`iv(12)||ct||tag(16)`).
- Clave 32 bytes base64 en env `GOOGLE_TOKEN_SECRET` (cargar con printf desde
  bash — el pipe de PowerShell mete `\r`). `authTagLength: 16` explícito.
- **AAD = `user_id`** (`setAAD`): un ciphertext copiado a otra fila no
  descifra. Rotación: prefijo de versión selecciona la env key.
- Fallo de descifrado = token perdido (no transitorio): marcar conexión para
  re-auth; jamás loggear material del token.

## Cron gcal-retry

- Job pg_cron **creado por SQL, nunca por el UI de Supabase** (el UI capa
  `timeout_milliseconds` a 5000): `net.http_get(url, headers con Bearer del
  Vault, timeout_milliseconds := 30000)`. pg_net es fire-and-forget — la
  fiabilidad vive en las columnas (`gcal_sync_estado`, `gcal_intentos`,
  `gcal_proximo_intento`), no en el tick.
- Handler: copiar el bloque auth 401 fail-closed de
  `src/app/api/cron/easybroker-sync/route.ts`; responder siempre 200 con
  errores en el body; lote acotado (10–20) ordenado por `gcal_proximo_intento`.
- **Claim atómico por fila** (sin SKIP LOCKED a este volumen):
  ```sql
  UPDATE visitas SET gcal_intentos = gcal_intentos + 1,
    gcal_proximo_intento = now() + (interval '1 min' * pow(2, gcal_intentos))
  WHERE id = $1 AND gcal_sync_estado = 'pendiente'
    AND gcal_proximo_intento <= now()
  ```
  Quien no afecta filas, no procesa. No sostener locks durante la llamada a
  Google. Tope ~5–6 intentos → `error` + `gcal_ultimo_error`.
- Visita cancelada sin `gcal_event_id` → marcar `sincronizada` sin llamar a
  Google.
- Monitoreo: `cron.job_run_details` + logs Vercel; NO `net._http_response`
  (unlogged, TTL 6 h).

## Common mistakes

- Confiar en el modo Testing de Google (tokens mueren en 7 días).
- Olvidar `prompt=consent` y quedarse sin refresh_token al reconectar.
- Reintentar `invalid_grant` en loop.
- Crear el job de cron desde el UI de Supabase (timeout 5 s).
- Usar `revalidateTag(tag)` de 1 argumento o `updateTag` en Route Handlers —
  Next 16 (ver `node_modules/next/dist/docs/`; los docs locales mandan).
