# Integración Google Calendar — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use ultrapowers:subagent-driven-development (recommended) or ultrapowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** CRUD mínimo de visitas (Fase 0) + conexión opcional Google Calendar por asesor con espejo unidireccional CRM→Calendar, advertencia de conflictos vía free/busy, y retry por pg_cron (Fase 1).

**Architecture:** El CRM es fuente de verdad; Calendar es espejo. Server actions de visitas llaman a Google en línea (best-effort); si falla, columnas `gcal_*` en `visitas` guardan el estado y `/api/cron/gcal-retry` reintenta con backoff. Refresh tokens cifrados AES-256-GCM app-side. Todo sigue el spec `docs/ultrapowers/specs/2026-08-06-google-calendar-design.md` y el research brief `docs/ultrapowers/research/2026-08-06-google-calendar-research.md`.

**Tech Stack:** Next.js 16.2.12 (App Router, Server Actions, Route Handlers), Supabase (Postgres + RLS + pg_cron/pg_net), `@googleapis/calendar` (scoped), `node:crypto` AES-256-GCM, vitest.

**Skills:** `google-calendar` (proyecto — leer ANTES de cada tarea de Fase 1), `fintech-muro-ui` (toda UI), `easybroker-api` (patrón cron), docs locales `node_modules/next/dist/docs/` (mandan sobre memoria: `cookies()` async, `revalidateTag` 2 args, `redirect()` fuera de try/catch).

**Preferencias:** auto-commit ON, auto-push ON → cada tarea termina con commit+push.

**Convenciones del repo (obligatorias):**
- Actions: archivo `'use server'`, primera línea `requireAsesor()`/`requireAdmin()` (`src/lib/auth/usuario-actual.ts`), retorno `{ ok: true } | { error: string }` (tipo `ResultadoAccion` en `src/lib/leads/acciones.ts:12`), mutaciones vía `createAdminClient()`, mensajes en español, update condicional + filas afectadas para concurrencia, efectos secundarios best-effort en try/catch.
- Tests: `src/test/*.test.ts(x)`, `npm test` (unit) / `npm run test:rls` (integración). Stub `server-only` en `src/test/stubs/server-only.ts`.
- Inyección de dependencias para testear sin red (patrón `sincronizarEasyBroker`).

---

## FASE 0 — CRUD mínimo de visitas

### Task 1: Migración 0008 — visitas + google_conexiones

**Files:**
- Create: `supabase/migrations/0008_visitas_gcal.sql`

- [ ] **Step 1: Verificar numeración libre** — `ls supabase/migrations/`; si 0008 ya existe (proyecto guardias llegó primero), usar el siguiente número y ajustar el resto del plan.

- [ ] **Step 2: Escribir la migración**

```sql
-- 0008: CRUD de visitas (duración) + espejo Google Calendar
alter table visitas
  add column duracion_min integer not null default 60 check (duracion_min between 15 and 480),
  add column gcal_event_id text,
  add column gcal_sync_estado text not null default 'sin_conexion'
    check (gcal_sync_estado in ('sincronizada', 'pendiente', 'error', 'sin_conexion')),
  add column gcal_intentos integer not null default 0,
  add column gcal_proximo_intento timestamptz,
  add column gcal_ultimo_error text;

create index visitas_gcal_pendientes_idx on visitas (gcal_proximo_intento)
  where gcal_sync_estado = 'pendiente';

create table google_conexiones (
  user_id uuid primary key references usuarios(user_id) on delete cascade,
  google_email text not null,
  refresh_token_cifrado text not null,
  estado text not null default 'activa' check (estado in ('activa', 'revocada')),
  creada_en timestamptz not null default now(),
  actualizada_en timestamptz not null default now()
);

alter table google_conexiones enable row level security;

-- El asesor ve su propia conexión (para la card del dashboard); el token
-- cifrado NUNCA se selecciona desde el cliente — la columna queda protegida
-- por column grant: revocamos select del rol authenticated sobre ella.
create policy google_conexiones_select_propia on google_conexiones
  for select to authenticated using (user_id = (select auth.uid()));
create policy google_conexiones_delete_propia on google_conexiones
  for delete to authenticated using (user_id = (select auth.uid()));

revoke select (refresh_token_cifrado) on google_conexiones from authenticated;
-- Insert/update solo por service role (sin policy para authenticated).
```

- [ ] **Step 3: Aplicar en Supabase** — igual que migraciones previas (SQL editor o `supabase db push` según el flujo documentado en README). Verificar: `select column_name from information_schema.columns where table_name = 'visitas';` incluye las 6 nuevas.

- [ ] **Step 4: Extender test de RLS** — en `src/test/rls.integration.test.ts` añadir casos: (a) asesor A no ve la conexión de asesor B; (b) `select refresh_token_cifrado` como authenticated falla. Run: `npm run test:rls`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0008_visitas_gcal.sql src/test/rls.integration.test.ts
git commit -m "feat: migracion visitas duracion + gcal + google_conexiones"
git push
```

### Task 2: Server actions de visitas

**Files:**
- Create: `src/lib/visitas/acciones.ts`
- Create: `src/lib/visitas/validacion.ts` (funciones puras testeables)
- Test: `src/test/visitas-validacion.test.ts`

- [ ] **Step 1: Test de validación (falla primero)**

```ts
// src/test/visitas-validacion.test.ts
import { describe, expect, it } from 'vitest'
import { validarDatosVisita } from '@/lib/visitas/validacion'

describe('validarDatosVisita', () => {
  it('rechaza fecha en el pasado', () => {
    const r = validarDatosVisita({ fecha: '2020-01-01T10:00:00Z', duracionMin: 60 })
    expect(r).toEqual({ error: 'La fecha debe ser futura' })
  })
  it('rechaza duración fuera de rango', () => {
    const r = validarDatosVisita({ fecha: futuraISO(), duracionMin: 10 })
    expect(r).toEqual({ error: 'La duración debe ser de 15 minutos a 8 horas' })
  })
  it('acepta datos válidos', () => {
    expect(validarDatosVisita({ fecha: futuraISO(), duracionMin: 60 })).toEqual({ ok: true })
  })
})
function futuraISO() { return new Date(Date.now() + 86_400_000).toISOString() }
```

Run: `npm test -- visitas-validacion`. Expected: FAIL (módulo no existe).

- [ ] **Step 2: Implementar `validacion.ts`** (pura, sin server-only) y verificar PASS.

- [ ] **Step 3: Implementar `acciones.ts`** siguiendo `src/lib/leads/acciones.ts`:

```ts
'use server'
// agendarVisita({ leadId, propiedadId?, fecha, duracionMin }): requireAsesor();
//   verificar que el lead pertenece al asesor (o requireAdmin para admins —
//   seguir el patrón de autorización de seguimientos existente);
//   insert en visitas con asesor_id = usuario.user_id, estado 'agendada';
//   seguimiento tipo 'sistema' best-effort: `Visita agendada para <fecha>`;
//   revalidatePath de /asesor/leads/[id] y /asesor (dashboard);
//   retorno { ok: true, visitaId } | { error }.
// reagendarVisita(visitaId, { fecha, duracionMin }): update condicional
//   .eq('asesor_id', usuario.user_id).eq('estado', 'agendada') + filas afectadas.
// cancelarVisita(visitaId): update estado -> 'cancelada', mismas guardas.
```

En Fase 1 (Task 8) estas actions ganan el hook de sync — dejar un único punto de salida exitoso por action para engancharlo fácil.

- [ ] **Step 4: `npm test` y `npm run lint`** — PASS/limpio.

- [ ] **Step 5: Commit** — `feat: server actions de visitas (agendar/reagendar/cancelar)`

### Task 3: UI — agendar desde la ficha del lead + confirmación WhatsApp

**Files:**
- Create: `src/components/visitas/hoja-agendar-visita.tsx` (client)
- Create: `src/components/visitas/confirmacion-whatsapp.ts` (puro: arma el texto)
- Modify: `src/app/(asesor)/asesor/leads/[id]/page.tsx` (montar junto a `BotonWhatsApp`, `:146`)
- Modify: `src/app/(admin)/admin/leads/[id]/page.tsx` (mismo montaje)
- Test: `src/test/visitas-confirmacion-whatsapp.test.ts`

- [ ] **Step 1: Test del mensaje de confirmación (falla primero)** — casos: con propiedad, **sin propiedad** (requisito del spec), formato de fecha en es-MX zona America/Monterrey. Expected: FAIL.

- [ ] **Step 2: Implementar `confirmacion-whatsapp.ts`** — reutilizar helpers de `src/lib/plantillas/rellenar.ts` si aplican; salida = texto para `https://wa.me/<tel>?text=<encoded>`. PASS.

- [ ] **Step 3: Hoja de agendar** — seguir skill `fintech-muro-ui` y el patrón de `src/test/hoja-asignar-lead.test.tsx` / componente correspondiente: campos propiedad (select opcional de propiedades activas), fecha, hora, duración (default 60); botón «Agendar visita» junto al `BotonWhatsApp` en ambas fichas; al éxito, toast (sonner) con acción «Confirmar por WhatsApp» que abre el deep link. Test de componente (`.test.tsx`) con Testing Library: submit llama la action con los datos correctos y muestra la opción de WhatsApp al éxito.

- [ ] **Step 4: `npm test` + revisar en dev** (`npm run dev`, ficha de un lead, flujo completo). PASS.

- [ ] **Step 5: Commit** — `feat: agendar visita desde la ficha del lead + confirmacion WhatsApp`

### Task 4: Listado de próximas visitas en dashboard asesor

**Files:**
- Modify: `src/lib/dashboard/consultas.ts` (ya tiene `citasHoy` en `:146` — añadir `proximasVisitas(asesorId, limite=5)`)
- Modify: dashboard asesor (localizar sección en `src/app/(asesor)/asesor/` — la card va dentro del dashboard existente, SIN página nueva ni cambio de tab bar)
- Test: `src/test/dashboard-consultas.test.ts` (extender)

- [ ] **Step 1: Test de consulta (falla)** — próximas visitas ordenadas por fecha, solo `estado = 'agendada'`, solo futuras, con nombre de lead y propiedad. FAIL → implementar → PASS.
- [ ] **Step 2: Card de lista** siguiendo `fintech-muro-ui` (glass card, mismo sistema). Acciones por fila: reagendar / cancelar (reusan la hoja de Task 3).
- [ ] **Step 3: `npm test` PASS.**
- [ ] **Step 4: Commit** — `feat: proximas visitas en dashboard asesor`

---

## FASE 1 — Google Calendar

### Task 5: Cifrado de tokens (TDD estricto)

**Files:**
- Create: `src/lib/google/cifrado.ts`
- Test: `src/test/google-cifrado.test.ts`

**Skills:** `google-calendar` §Cifrado.

- [ ] **Step 1: Tests (fallan primero)**

```ts
import { describe, expect, it } from 'vitest'
import { cifrarToken, descifrarToken } from '@/lib/google/cifrado'

// clave de prueba: 32 bytes fijos en base64
const CLAVE = Buffer.alloc(32, 7).toString('base64')

describe('cifrado de tokens', () => {
  it('roundtrip con AAD', () => {
    const c = cifrarToken('refresh-123', 'user-abc', CLAVE)
    expect(c.startsWith('v1.')).toBe(true)
    expect(descifrarToken(c, 'user-abc', CLAVE)).toBe('refresh-123')
  })
  it('AAD distinto no descifra (ciphertext movido de fila)', () => {
    const c = cifrarToken('refresh-123', 'user-abc', CLAVE)
    expect(() => descifrarToken(c, 'user-OTRO', CLAVE)).toThrow()
  })
  it('dos cifrados del mismo texto difieren (IV aleatorio)', () => {
    expect(cifrarToken('x', 'u', CLAVE)).not.toBe(cifrarToken('x', 'u', CLAVE))
  })
  it('versión desconocida lanza error identificable', () => {
    expect(() => descifrarToken('v9.abc', 'u', CLAVE)).toThrow(/versión/i)
  })
})
```

Run: `npm test -- google-cifrado`. Expected: FAIL.

- [ ] **Step 2: Implementar** exactamente el patrón del research brief §3: `createCipheriv('aes-256-gcm')`, IV 12 bytes random, `setAAD(userId)`, formato `v1.` + base64(`iv||ct||tag`), `authTagLength: 16` explícito en decipher, tercer parámetro `claveBase64` opcional con default `process.env.GOOGLE_TOKEN_SECRET` (inyectable para test). PASS.

- [ ] **Step 3: Commit** — `feat: cifrado AES-256-GCM de tokens google`

### Task 6: Cliente Google (OAuth + Calendar, inyectable)

**Files:**
- Create: `src/lib/google/oauth.ts` (URLs, intercambio, refresh, revoke — fetch directo al REST, sin SDK)
- Create: `src/lib/google/estado.ts` (state HMAC firmado con expiración)
- Test: `src/test/google-oauth.test.ts` (fetch mockeado con `vi.fn()`)

**Skills:** `google-calendar` §OAuth. Decisión de librería: para OAuth basta fetch directo (3 endpoints); `@googleapis/calendar` se instala en Task 8 solo para eventos. Menos dependencias en las rutas OAuth.

- [ ] **Step 1: Tests (fallan)** — casos:
  - `urlAutorizacion(state)` incluye `access_type=offline`, `prompt=consent`, scopes `calendar.events.owned` + `calendar.freebusy`, `redirect_uri` de env.
  - `intercambiarCodigo(codigo, fetchFn)` → POST a `oauth2.googleapis.com/token`, devuelve `{ refreshToken, email }` (email vía id_token o userinfo… usar el campo `id_token` decodificado — sin verificar firma, viene directo de Google por TLS).
  - `refrescarAccessToken(refreshToken, fetchFn)` → access token; respuesta 400 `invalid_grant` → lanza `ErrorGrantInvalido` (clase propia).
  - `revocarToken(token, fetchFn)` → 200 ok; 400 `invalid_token` NO lanza (ya revocado = éxito).
  - `crearState(userId)` / `validarState(state)`: HMAC con `GOOGLE_TOKEN_SECRET`, expira a los 10 min, userId recuperable.
- [ ] **Step 2: Implementar → PASS.**
- [ ] **Step 3: Commit** — `feat: cliente oauth google (state firmado, refresh, revoke)`

### Task 7: Rutas OAuth + card «Conectar Google Calendar»

**Files:**
- Create: `src/app/api/google/oauth/start/route.ts`
- Create: `src/app/api/google/oauth/callback/route.ts`
- Create: `src/lib/google/conexiones.ts` (guardarConexion, obtenerConexion, desconectar — service role)
- Create: `src/lib/google/acciones.ts` (`'use server'`: `desconectarGoogle()`)
- Create: `src/components/google/card-conexion.tsx`
- Modify: dashboard asesor (montar card)
- Test: `src/test/google-conexiones.test.ts`

**Notas Next 16:** `cookies()` async; `redirect()`/`NextResponse.redirect` desde handler = 307; leer `request.nextUrl.searchParams`.

- [ ] **Step 1: Tests de `conexiones.ts` (fallan)** — upsert conserva token anterior si el nuevo es null (regla `prompt=consent` del brief); `desconectar` revoca (mock) y borra fila aun si revoke falla (best-effort). PASS tras implementar.
- [ ] **Step 2: `start/route.ts`** — sesión del asesor (mismo helper de sesión que usan las páginas), `crearState(user_id)`, redirect a `urlAutorizacion(state)`.
- [ ] **Step 3: `callback/route.ts`** — validar `state` (inválido/expirado → redirect a `/asesor?gcal=error`), intercambiar código, cifrar token (Task 5), `guardarConexion`, redirect `/asesor?gcal=conectado`.
- [ ] **Step 4: Card** (estados sin conectar / conectada con email / revocada con aviso) según `fintech-muro-ui`; leer estado vía select RLS (sin el token, revocado por column grant). Botón desconectar llama `desconectarGoogle()`.
- [ ] **Step 5: Verificación manual en dev** con credenciales de un proyecto Google Cloud de prueba (crear OAuth client Web, redirect `http://localhost:3000/api/google/oauth/callback`). Conectar, ver fila en `google_conexiones`, desconectar.
- [ ] **Step 6: Commit** — `feat: conexion google calendar por asesor (oauth + card)`

### Task 8: Espejo de visitas (módulo sync + hook en actions)

**Files:**
- Create: `src/lib/google/espejo.ts` (construirEvento, idEventoDeVisita, sincronizarVisita — inyectable)
- Modify: `src/lib/visitas/acciones.ts` (hook post-éxito)
- Test: `src/test/google-espejo.test.ts`

**Skills:** `google-calendar` §Espejo. Instalar SDK: `npm i @googleapis/calendar` (NUNCA `googleapis` monolito).

- [ ] **Step 1: Tests (fallan)**
  - `idEventoDeVisita(uuid)`: determinista, charset `[a-v0-9]`, 5–1024 chars (mapear hex del uuid: dígitos igual, `a-f` igual — hex ⊂ base32hex — quitar guiones, prefijo `visita`).
  - `construirEvento(visita, lead, propiedad?)`: summary `Visita — {lead}`, start/end con `dateTime` + `timeZone: 'America/Monterrey'`, end = fecha + duracion_min, `extendedProperties.private.visitaId`, sin `attendees`.
  - `construirEvento` — description: incluye teléfono del lead, link a la visita en Klo-Ser (`https://<dominio>/asesor/leads/<leadId>`), y la propiedad cuando existe; caso sin propiedad también cubierto.
  - `sincronizarVisita(supabase, visita, calendarioMock)`: crear → insert con id propio y `sendUpdates: 'none'`; respuesta 409 → tratar como éxito y hacer update reponiendo `status: 'confirmed'`; reagendar → patch; cancelar → delete con 404/410 = éxito; visita cancelada sin `gcal_event_id` → marca `sincronizada` sin llamar; fallo de red → estado `pendiente` + `gcal_proximo_intento` now+1min; `invalid_grant` → conexión `revocada` + push al asesor (`enviarPush` mockeado) + visita `sin_conexion`.
- [ ] **Step 2: Implementar → PASS.**
- [ ] **Step 3: Hook en las 3 actions** — tras el éxito de BD, `try { await sincronizarVisita(...) } catch { /* ya quedó pendiente */ }`; la action nunca falla por Google (garantía del spec).
- [ ] **Step 4: `npm test` completo PASS.**
- [ ] **Step 5: Commit** — `feat: espejo de visitas a google calendar (idempotente)`

### Task 9: Disponibilidad + advertencia de conflictos

**Files:**
- Create: `src/app/api/google/disponibilidad/route.ts` (GET `?asesor=<id>&desde=<ISO>&hasta=<ISO>`)
- Create: `src/lib/google/disponibilidad.ts` (combina freebusy + visitas CRM, inyectable)
- Modify: `src/components/visitas/hoja-agendar-visita.tsx` (consulta al elegir fecha/hora; advertencia no bloqueante)
- Test: `src/test/google-disponibilidad.test.ts`

- [ ] **Step 1: Tests (fallan)** — mezcla bloques de freebusy mock + visitas agendadas del CRM (fecha + duracion_min); sin conexión Google → solo visitas CRM; error de Google → responde bloques del CRM con `advertenciaParcial: true` (falla abierta); solape correcto de intervalos.
- [ ] **Step 2: Implementar módulo + route** (auth: sesión requerida; solo el propio asesor o admin). PASS.
- [ ] **Step 3: UI** — al elegir fecha/hora, fetch a la route; si choca, texto ámbar «{Asesor} ya tiene un compromiso de HH:mm a HH:mm» y se permite continuar (spec).
- [ ] **Step 4: Commit** — `feat: disponibilidad y advertencia de conflictos al agendar`

### Task 10: Cron gcal-retry

**Files:**
- Create: `src/app/api/cron/gcal-retry/route.ts`
- Create: `src/lib/google/retry.ts` (procesarPendientes — claim por fila, inyectable)
- Modify: `supabase/migrations/0008_visitas_gcal.sql` — NO; el job va en README (patrón actual: jobs fuera de migraciones)
- Modify: `README.md` (documentar el SQL del job junto al de easybroker)
- Test: `src/test/google-retry.test.ts`

**Skills:** `google-calendar` §Cron. Copiar bloque auth de `src/app/api/cron/easybroker-sync/route.ts:26-29`.

- [ ] **Step 1: Tests (fallan)** — claim por fila (visita ya procesada por otro tick no afecta filas → se salta); backoff exponencial en `gcal_proximo_intento`; tope 6 intentos → `error` + `gcal_ultimo_error`; lote máx 20 ordenado por `gcal_proximo_intento`; cancelada sin event_id → `sincronizada` directo; **auth del handler: sin header o secret malo → 401, secret bueno → 200** (patrón easybroker). PASS tras implementar.
- [ ] **Step 2: Route** — `maxDuration = 60`, Bearer `CRON_SECRET` fail-closed, siempre 200 con resumen `{ ok, procesadas, errores }`, log `[cron/gcal-retry]`.
- [ ] **Step 3: Crear el job en Supabase por SQL** (NO por el UI — cap de 5 s):

```sql
select cron.schedule('gcal-retry-5min', '*/5 * * * *', $$
  select net.http_get(
    url := 'https://<dominio-prod>/api/cron/gcal-retry',
    headers := jsonb_build_object('Authorization', 'Bearer ' ||
      (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret_easybroker')),
    timeout_milliseconds := 30000
  )
$$);
```

Documentarlo en README junto al job de easybroker (mismo `CRON_SECRET`/Vault secret).

- [ ] **Step 4: Verificar** — `select * from cron.job;` muestra el job; forzar una visita `pendiente` y ver que el siguiente tick la sincroniza (logs Vercel).
- [ ] **Step 5: Commit** — `feat: cron gcal-retry con backoff y claim por fila`

### Task 11: Env vars, verificación de Google y E2E manual

**Files:**
- Modify: `README.md` (sección Google Calendar: env vars, setup del proyecto Google Cloud, estrategia producción-sin-verificar, checklist de verificación)
- Modify: `.env.example` si existe (añadir `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_TOKEN_SECRET`)

- [ ] **Step 1: Google Cloud producción** — proyecto OAuth: consent screen External, **publicar «In production» sin verificar ANTES de conectar al primer asesor real** (modo Testing mata tokens a los 7 días — skill `google-calendar`); redirect URIs de prod y preview; scopes `calendar.events.owned` + `calendar.freebusy`.
- [ ] **Step 2: Env vars en Vercel** — generar `GOOGLE_TOKEN_SECRET` con `openssl rand -base64 32`; cargar las 3 vars **desde bash con printf** (gotcha `\r` de PowerShell, memoria del proyecto). Redeploy.
- [ ] **Step 3: E2E manual con cuenta Gmail de prueba** — conectar → agendar (evento aparece en Calendar, sin invitación) → reagendar (evento se mueve) → cancelar (desaparece) → borrar evento a mano en Calendar y reagendar (se recrea) → revocar en myaccount.google.com y agendar (push de reconexión, visita queda `sin_conexion`) → reconectar.
- [ ] **Step 4: Iniciar trámite de verificación** (paralelo, no bloquea): Search Console del dominio, página de privacidad en el dominio, video demo, justificación de scopes. Registrar estado en `docs/decisiones.md`.
- [ ] **Step 5: Commit final** — `docs: setup google calendar (env, verificacion, e2e)`

---

## Orden y dependencias

```
Task 1 → Task 2 → Task 3 → Task 4        (Fase 0 completa y desplegable sola)
Task 1 → Task 5 → Task 6 → Task 7        (conexión OAuth)
Task 2 + Task 7 → Task 8 → Task 10       (espejo y retry)
Task 7 → Task 9                          (disponibilidad; usa Task 3 para la UI)
Task 8 + Task 9 + Task 10 → Task 11      (cierre)
```

Fase 0 se puede desplegar a producción antes de empezar Fase 1 (las columnas `gcal_*` quedan en `sin_conexion` y no estorban).

## Verificación global antes de dar por terminado

- [ ] `npm test` y `npm run test:rls` en verde; `npm run lint` limpio; `npm run build` sin errores.
- [ ] E2E manual de Task 11 completo.
- [ ] Skill `ultrapowers:verification-before-completion` antes de reportar éxito.
