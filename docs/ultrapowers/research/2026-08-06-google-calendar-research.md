# Research Brief: Integración Google Calendar (spec 2026-08-06)

> Sintetiza 5 investigaciones paralelas (2026-08-06): OAuth/verificación de
> Google, Calendar API v3, cifrado de tokens, patrón outbox pg_cron/pg_net, y
> docs locales de Next.js 16. Alimenta skills-audit → writing-plans.

## Contexto

CRM inmobiliario (Next.js 16.2.12 App Router + Supabase, Vercel Hobby).
Vamos a: CRUD mínimo de visitas (Fase 0), conexión OAuth por asesor (Gmail
personal), espejo de visitas al calendario `primary`, free/busy para
advertencia de conflictos, y retry vía pg_cron.

## Hallazgos clave

### 1. OAuth — el modo Testing NO es puente viable (CORRECCIÓN AL SPEC)

- **Refresh tokens de apps External+Testing expiran a los 7 días** del
  consentimiento con scopes de Calendar (excepción solo para scopes básicos).
  Confirmado en 2 páginas oficiales de Google.
- **Estrategia correcta:** publicar «In production» sin verificar desde el
  día 1 → tokens duraderos, pantalla «app no verificada», tope de por vida de
  **100 usuarios** nuevos. Tramitar verificación sensitive en paralelo.
- **Verificación:** `calendar.events*` y `calendar.freebusy` son **sensitive,
  no restricted** → sin CASA, **costo $0**, timeline oficial «hasta 10 días».
  Requisitos: brand verification, política de privacidad **en el mismo
  dominio** que la app, dominio verificado en Search Console, **video demo**
  (YouTube unlisted) del flujo OAuth, justificación por escrito de cada scope.
- **Flujo:** `access_type=offline&prompt=consent` SIEMPRE (sin `prompt=consent`
  Google no reenvía refresh_token en reconexiones). Guardar con upsert
  conservando el token anterior si la respuesta no trae uno. PKCE opcional
  (buena práctica; Google no lo exige a clientes web confidenciales — el
  token endpoint exige `client_secret` igual). `state` firmado imprescindible.
- **`invalid_grant` = estado terminal**: no reintentar; marcar conexión
  `revocada`, borrar token, pedir reconexión. Causas: revocación del usuario,
  7 días de Testing, 6 meses sin uso, >100 tokens por cuenta/cliente.
- **Desconectar:** `POST https://oauth2.googleapis.com/revoke` con el refresh
  token (tumba el grant completo); 400 `invalid_token` = ya revocado, tratar
  como éxito. Borrar el token de la BD siempre.
- **Librería:** usar **`@googleapis/calendar`** (scoped, v16.x) o
  `google-auth-library` + fetch REST. **NO instalar el monolito `googleapis`**
  (~200 MB, infla la función serverless y el cold start).
- Endpoints: auth `https://accounts.google.com/o/oauth2/v2/auth`, token
  `https://oauth2.googleapis.com/token`, revoke
  `https://oauth2.googleapis.com/revoke`.

### 2. Calendar API v3 — idempotencia con id propio

- **Patrón oficial anti-duplicados:** generar nuestro propio `id` de evento
  (charset base32hex minúscula `a-v0-9`, 5–1024 chars, único por calendario),
  derivado del id de la visita (p. ej. uuid hex → mapear a base32hex). Retry
  del insert con el mismo id → **409 = éxito idempotente**. Complementar con
  `extendedProperties.private.visitaId` para reconciliación/búsqueda inversa
  (`events.list?privateExtendedProperty=visitaId%3D...`).
- **Cuerpo mínimo:** solo `start`/`end` (`dateTime` RFC3339 **+ `timeZone:
  "America/Monterrey"`** — mandar ambos). Sin `attendees` → no se envía
  ninguna invitación; fijar `sendUpdates: 'none'` por higiene
  (`sendNotifications` está deprecado).
- **Actualizar:** `events.patch` cuesta 3 unidades de cuota y reemplaza
  arrays completos; para nuestro caso (solo fechas) `patch` está bien.
- **Borrar:** 404/410 en delete = evento ya no existe → **tratar como éxito**
  (doc oficial: «no further action is necessary»). Usuario que borró a mano
  el evento: el id queda «quemado» (status cancelled) — reinsertar con el
  mismo id da 409; la salida es `update` reponiendo `status: 'confirmed'`.
- **freebusy.query:** `POST /freeBusy` con `timeMin/timeMax/timeZone` +
  `items: [{id: 'primary'}]`; respuesta = bloques `{start,end}` ocupados.
  Funciona con solo el scope `calendar.freebusy`. Consultar ventanas cortas
  (semana). **Matiz:** eventos all-day creados en la UI de Google suelen ser
  «Free» (transparency) → NO aparecen en free/busy; no asumir que refleja
  vacaciones.
- **Errores:** 401 → refrescar access token; 403/429 `rateLimitExceeded` y
  5xx → backoff exponencial con jitter; cuotas 2026: 10k req/min/proyecto,
  600 req/min/usuario, 1M/día (sobra por órdenes de magnitud).
- Sin deprecaciones que nos afecten (2024–2026); ojo al anuncio may-2026 de
  nuevo modelo de tiers de cuota.

### 3. Cifrado de tokens — `node:crypto` AES-256-GCM app-side

- **`node:crypto` `createCipheriv('aes-256-gcm')`**, no WebCrypto (server
  Node puro; API síncrona más simple, tag explícito) y **no Supabase
  Vault/pgsodium**: pgsodium está en «pending deprecation» oficial y Vault
  está diseñado para secretos de plataforma, no para un secreto por fila; con
  cifrado app-side la DB nunca ve plaintext.
- **Formato:** `v1.` + base64(`iv(12) || ciphertext || tag(16)`). Clave de
  32 bytes en env (`GOOGLE_TOKEN_SECRET` base64, generar con
  `openssl rand -base64 32`, cargar desde bash con printf — gotcha PowerShell
  conocido). `authTagLength: 16` explícito en el decipher.
- **AAD = `user_id`** (`setAAD`) — liga el ciphertext a su fila; un token
  copiado a otra fila no descifra.
- **Rotación por versionado de clave:** el prefijo `v1.` selecciona la env
  key (`..._V2` conviviendo con `..._V1`); re-cifrado perezoso.
- **Fallo de descifrado = token perdido, no error transitorio:** marcar
  conexión para re-auth, no reintentar, no loggear material sensible.

### 4. Outbox/retry — patrón del repo confirmado como estado del arte

- Repo hoy: pg_cron job creado **a mano por SQL** (no en migraciones;
  documentado en README/docs/decisiones.md), pg_net `http_get` → endpoint con
  `Authorization: Bearer CRON_SECRET` fail-closed, secret en Supabase Vault
  (`cron_secret_easybroker`), `maxDuration = 300`, respuesta siempre 200 con
  errores en el body, lease app-side `lock_until` (0004) vía update
  condicional.
- **Crear el job gcal-retry por SQL, NO por el UI de Supabase** — el UI capa
  `timeout_milliseconds` a 5000; por SQL se fija libre (30–50 s). pg_net es
  fire-and-forget: el timeout no aborta la función Vercel, solo pierde la
  respuesta.
- **Claim atómico por fila** (no hace falta `FOR UPDATE SKIP LOCKED` a este
  volumen): `UPDATE ... SET gcal_intentos = gcal_intentos+1,
  gcal_proximo_intento = <futuro> WHERE id = X AND gcal_sync_estado =
  'pendiente' AND gcal_proximo_intento <= now()` — quien no afecta filas no
  procesa. No sostener locks durante la llamada de red.
- **Backoff:** `proximo_intento = now() + base * 2^intentos`, tope ~5–6
  intentos → `error` (dead letter visible). Lote acotado (10–20 filas) por
  corrida, ordenado por `gcal_proximo_intento`.
- Monitoreo: `cron.job_run_details` + logs Vercel + `gcal_sync_estado` (no
  confiar en `net._http_response`: unlogged, TTL 6 h).
- pg_cron soporta sub-minuto si algún día se necesita; sin límites por plan.

### 5. Next.js 16.2.12 — rupturas vs. lo clásico (docs locales mandan)

- `cookies()`/`headers()`/`params`/`searchParams` **solo async** (sync
  removido en 16). `params` de route handlers es Promise; tipos
  `RouteContext<'/ruta'>`.
- **`revalidateTag(tag)` de 1 argumento DEPRECADO** (error de TS). Nueva
  firma: `revalidateTag(tag, 'max')` o `{ expire: 0 }`. Nuevos `updateTag` y
  `refresh` — **SOLO en Server Actions, lanzan en Route Handlers**.
  `revalidatePath` sigue igual. El repo hoy usa solo `revalidatePath` vía
  helpers (`revalidarRutasLeads()`).
- `middleware.ts` → **`proxy.ts`** (repo ya migró). GET handlers y `fetch`
  **no se cachean por defecto**. `useFormState` → `useActionState`.
- `redirect()` lanza `NEXT_REDIRECT` → llamar **fuera de try/catch**; 303 en
  actions, 307 en handlers (o `NextResponse.redirect`).
- **Convenciones del repo a imitar:** archivo `'use server'` completo;
  primera línea de cada action = guardia `requireAsesor()`/`requireAdmin()`;
  retorno `{ ok: true } | { error: string }` (errores de negocio como valor);
  `createAdminClient()` para mutaciones que RLS bloquea, `await
  createClient()` por petición para sesión; nombres/mensajes en español;
  update condicional + filas afectadas para concurrencia; efectos secundarios
  best-effort en try/catch; cron handler copia el bloque de auth 401 de
  `easybroker-sync`.
- Server Actions: son endpoints POST públicos → auth dentro de cada action
  (el proxy no es frontera); body limit 1 MB; action IDs rotan ≤14 días.

## Enfoque recomendado (delta vs. spec)

El spec queda válido con dos correcciones ya aplicadas:
1. Decisión 5: publicar «In production» sin verificar desde el día 1 (no
   Testing); verificación en paralelo.
2. Scope de escritura: `calendar.events.owned` en vez de `calendar.events`.

Refinamientos para el plan (no cambian el spec): id de evento propio
(idempotencia dura) + `extendedProperties.private.visitaId`; AAD con user_id
en el cifrado; job pg_cron por SQL con timeout explícito y documentado en
migración/README; `@googleapis/calendar` scoped; claim por fila en el retry.

## Notas de implementación

- Env vars: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_TOKEN_SECRET`
  (base64 32 bytes), redirect URI registrada para prod y preview; secrets
  desde bash (gotcha PowerShell `\r`).
- Pre-requisitos de verificación a iniciar temprano (van en paralelo al
  código): Search Console del dominio, página de privacidad en el dominio,
  video demo.
- Cuenta Gmail de prueba para E2E antes de soltar a asesores.

## Sources

Consolidadas de los 5 reportes (URLs completas en los transcripts de agentes):
docs oficiales de Google Identity (web-server, oauth2#expiration, publishing
status 15549945/7454865, sensitive-scope-verification, best-practices),
Calendar API v3 reference (events insert/update/patch/delete, freebusy,
guides/errors, guides/quota, release notes), Node.js crypto docs, Supabase
docs (Vault, pgsodium deprecation, Cron, pg_net) + GitHub discussions
(#37574 cap 5s del UI, pg_net #74), docs locales
`node_modules/next/dist/docs/` (version-16.md, server-actions.md,
route.md, revalidateTag/updateTag/refresh), y código del repo
(`src/app/api/cron/easybroker-sync/route.ts`, `src/lib/easybroker/sync.ts`,
`src/lib/leads/acciones.ts`).
