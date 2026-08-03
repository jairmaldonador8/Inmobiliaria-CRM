# Fase 1 "El corazón" — CRM Montana Realty — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use ultrapowers:subagent-driven-development (recommended) or ultrapowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Webapp desplegable con login por roles (admin/asesor), CRM de leads completo (bandeja → asignación → kanban → seguimientos), sync de propiedades y leads desde el sandbox de EasyBroker, feedback interno y plantillas de WhatsApp.

**Architecture:** Next.js 16 App Router (todo dinámico, `proxy.ts`) + Supabase (Postgres/RLS híbrida con auth hook, Auth email+password) + Vercel. Seguridad en la base: RLS "owner-or-admin" con helpers `security definer`, column grants para congelar asignaciones, seguimientos append-only en 3 capas. Sync EasyBroker idempotente con cursores, contra sandbox oficial.

**Tech Stack:** Next 16.2.x, React 19.2, TypeScript, @supabase/ssr 0.12.x, supabase-js 2.110+, Tailwind 4, shadcn (Base UI), @dnd-kit, sonner, date-fns, vitest 4.

**Referencias obligatorias:**
- Spec: `docs/ultrapowers/specs/2026-08-03-inmobiliaria-crm-design.md`
- Research: `docs/ultrapowers/research/2026-08-03-inmobiliaria-crm-research-brief.md`
- Skills: `@easybroker-api` (toda llamada a la API), `@supabase:supabase`, `@ultrapowers-dev:typescript-best-practices`, `@ultrapowers-dev:testing-tdd`
- Repo de patrones (solo lectura, NO modificar): clonado en el scratchpad de la sesión (`TOP-DIGITAL-SYSTEM`). Si no está clonado: `git clone --depth 1 https://github.com/jairmaldonador8/TOP-DIGITAL-SYSTEM.git` al scratchpad. Copiar patrones de: `src/proxy.ts`, `src/lib/supabase/{server,client,admin}.ts`, `supabase/migrations/0002_rls.sql`, `0003_auth_hook.sql`.
- ⚠️ Next.js 16: la verdad es `node_modules/next/dist/docs/` — NO usar patrones `middleware.ts` de memoria.

**Convenciones:** producto en español (México); nombres de tablas/campos/funciones de dominio en español; código idiomático TS. UI mobile-first para `/asesor`, desktop para `/admin`. Todos los formularios validan con mensajes en español.

**Idioma de commits:** español, prefijos convencionales (`feat:`, `fix:`, `test:`, `chore:`).

---

## Estructura de archivos (mapa de la fase)

```
src/
  proxy.ts                          # auth refresh + redirección por rol (patrón repo ref)
  app/
    layout.tsx, globals.css, page.tsx (login), manifest.ts
    (admin)/admin/{layout.tsx, page.tsx}
    (admin)/admin/bandeja/page.tsx
    (admin)/admin/leads/page.tsx
    (admin)/admin/asesores/{page.tsx, [id]/page.tsx}
    (admin)/admin/propiedades/{page.tsx, [id]/page.tsx}
    (admin)/admin/sugerencias/page.tsx
    (admin)/admin/ajustes/page.tsx        # solo plantillas WhatsApp en F1
    (asesor)/asesor/{layout.tsx, page.tsx}
    (asesor)/asesor/leads/{page.tsx, [id]/page.tsx}
    (asesor)/asesor/propiedades/page.tsx
    api/cron/easybroker-sync/route.ts
  lib/
    supabase/{server.ts, client.ts, admin.ts}
    auth/{usuario-actual.ts, acciones.ts}
    easybroker/{cliente.ts, mapeo.ts, sync.ts}
    leads/{acciones.ts, consultas.ts}
    seguimientos/acciones.ts
    asesores/acciones.ts
    sugerencias/acciones.ts
    plantillas/{acciones.ts, rellenar.ts}
    notificaciones/crear.ts
    utils.ts (cn)
  components/  (ui/ de shadcn + por-feature)
supabase/
  migrations/{0001_schema.sql, 0002_rls.sql, 0003_auth_hook.sql}
  config.toml
scripts/seed.ts
src/test/  (unit) + vitest.config.ts + vitest.integration.config.ts (RLS)
```

---

### Task 1: Scaffold del proyecto

**Files:** Create: proyecto Next.js completo en la raíz del repo.

- [ ] **Step 1:** Scaffold (la raíz ya tiene `docs/` y `.claude/` — usar dir temporal y mover):

```bash
npx create-next-app@latest inmobiliaria-tmp --typescript --tailwind --app --src-dir --turbopack --eslint --yes
# Mover contenido a la raíz del repo (sin pisar docs/ ni .claude/) y borrar inmobiliaria-tmp
```

- [ ] **Step 2:** Instalar dependencias:

```bash
npm i @supabase/ssr @supabase/supabase-js server-only sonner date-fns lucide-react clsx tailwind-merge class-variance-authority next-themes @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
npm i -D vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/jest-dom dotenv tsx
```

- [ ] **Step 3:** `npx shadcn@latest init --yes` y agregar componentes base: `button card input label select badge dialog dropdown-menu table tabs textarea sonner avatar sheet`.
- [ ] **Step 4:** Crear `.env.example` con: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `EASYBROKER_API_KEY`, `EASYBROKER_BASE_URL` (default `https://api.stagingeb.com`), `CRON_SECRET`. Verificar que `.gitignore` cubre `.env*`.
- [ ] **Step 4b:** Crear `vitest.config.ts` (plugin react, environment jsdom, include `src/test/**/*.test.ts?(x)`, exclude `**/*.integration.test.ts`) y script `"test": "vitest run"` en `package.json`.
- [ ] **Step 5:** `npm run build` — Expected: build exitoso.
- [ ] **Step 6: Commit** `chore: scaffold Next.js 16 con Tailwind 4 y shadcn` + push.

### Task 2: Esquema de base de datos (migración 0001)

**Files:** Create: `supabase/migrations/0001_schema.sql`, `supabase/config.toml` (vía `npx supabase init`)

Las 13 tablas del spec §4 + tabla interna `sync_estado` (cursores del sync). Puntos NO negociables:

- [ ] **Step 1:** `npx supabase init` (si falta CLI: `npm i -D supabase`).
- [ ] **Step 2:** Escribir `0001_schema.sql`. Esqueleto de decisiones (código completo en la migración):

```sql
-- Enums
create type rol_usuario as enum ('admin','asesor');
create type etapa_lead as enum ('nuevo','contactado','cita_agendada','visita_realizada','negociacion','apartado','cerrado_ganado','cerrado_perdido');
create type fuente_lead as enum ('portal','whatsapp','referido','redes','walk_in','otro');
create type tipo_interes as enum ('compra','renta');
create type tipo_seguimiento as enum ('llamada','whatsapp','correo','visita','otro','sistema');
create type estado_sugerencia as enum ('nueva','revisada','implementada');

create table agencias (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  comision_pct numeric(5,2) not null default 5.0,
  reparto_asesor_pct numeric(5,2) not null default 50.0,
  umbral_sin_atender_horas int not null default 24,
  umbral_estancada_dias int not null default 30,
  creada_en timestamptz not null default now()
);

create table usuarios (
  user_id uuid primary key references auth.users(id) on delete cascade,
  agencia_id uuid not null references agencias(id),
  rol rol_usuario not null,
  nombre text not null,
  telefono text,
  foto text,
  activo boolean not null default true,
  creado_en timestamptz not null default now()
);

create table propiedades (
  id uuid primary key default gen_random_uuid(),
  agencia_id uuid not null references agencias(id),
  easybroker_id text not null unique,
  titulo text not null,
  tipo text,                       -- string localizado de EB ("Casa", "Departamento")
  operacion text,                  -- 'sale' | 'rental' (de operations[0].type)
  precio numeric(14,2), moneda text,
  ubicacion text,                  -- string de lista EB
  colonia text, ciudad text, lat double precision, lng double precision, -- del detalle
  superficie_construccion numeric(10,2), superficie_terreno numeric(10,2),
  recamaras int, banos numeric(4,1), estacionamientos int,
  estatus text not null default 'published',
  descripcion text, url_publica text,
  fotos jsonb not null default '[]'::jsonb,
  asesor_id uuid references usuarios(user_id),
  activa boolean not null default true,
  publicada_en timestamptz, actualizada_eb timestamptz, ultima_sync timestamptz,
  creada_en timestamptz not null default now()
);

create table leads (
  id uuid primary key default gen_random_uuid(),
  agencia_id uuid not null references agencias(id),
  nombre text not null,
  telefono text, email text,
  fuente fuente_lead not null default 'otro',
  fuente_detalle text,             -- `source` crudo de EB (portal de origen)
  propiedad_id uuid references propiedades(id),
  asesor_id uuid references usuarios(user_id),  -- null = bandeja
  etapa etapa_lead not null default 'nuevo',
  interes tipo_interes,
  presupuesto numeric(14,2),
  zona_interes text,
  notas text,
  easybroker_id text unique,       -- id de contact_request para dedup
  mensaje_original text,
  archivado boolean not null default false,
  creado_en timestamptz not null default now(),
  asignado_en timestamptz
);

create table seguimientos (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id),
  autor_id uuid references usuarios(user_id),   -- null = sistema
  tipo tipo_seguimiento not null,
  propiedad_id uuid references propiedades(id),
  nota text not null,
  creado_en timestamptz not null default now()
);
-- + visitas, operaciones, notificaciones, mensajes, sugerencias,
--   plantillas_mensajes, push_suscripciones, propiedad_portales (spec §4)
-- + sync_estado (recurso text pk, cursor timestamptz, ultimo_ok timestamptz, ultimo_error text)

-- Índices: toda columna usada en policies o filtros frecuentes:
create index on leads (asesor_id); create index on leads (agencia_id);
create index on leads (etapa); create index on leads (telefono); create index on leads (email);
create index on seguimientos (lead_id); create index on propiedades (agencia_id);
create index on notificaciones (destinatario_id) where not leida;
```

`notificaciones`: `id, destinatario_id → usuarios, tipo text, texto text, url text, leida bool default false, creada_en`. `sugerencias`: `id, autor_id, pantalla text, texto, estado estado_sugerencia default 'nueva', creada_en`. `plantillas_mensajes`: `id, agencia_id, nombre, texto, activa bool default true`. `visitas`/`operaciones`/`mensajes`/`push_suscripciones`/`propiedad_portales`: columnas del spec §4 (se usan a fondo en fases 2–3, pero el esquema completo nace aquí).

- [ ] **Step 3:** `npx supabase start` + `npx supabase db reset` — Expected: migración aplica sin errores.
- [ ] **Step 4: Commit** `feat: esquema completo de base de datos (13 tablas + sync_estado)` + push.

### Task 3: RLS (migración 0002) — el corazón de la seguridad

**Files:** Create: `supabase/migrations/0002_rls.sql`
**Patrón:** copiar de `TOP-DIGITAL-SYSTEM/supabase/migrations/0002_rls.sql`, adaptando `cliente_id` → `asesor_id`. Skill: `@supabase:supabase`.

- [ ] **Step 1:** Helpers en schema privado:

```sql
create schema if not exists private;
revoke all on schema private from public;

create or replace function private.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.usuarios
    where user_id = (select auth.uid()) and rol = 'admin' and activo
  );
$$;
revoke execute on function private.is_admin() from public, anon;
grant execute on function private.is_admin() to authenticated;
```

- [ ] **Step 2:** `alter table ... enable row level security` en TODAS las tablas. Policies (patrón owner-or-admin, siempre `to authenticated` y helpers envueltos en `(select ...)`):
  - `usuarios`: select propio o admin; insert/update/delete solo admin (alta de asesores).
  - `leads`: select/update `asesor_id = (select auth.uid()) or (select private.is_admin())`; insert: cualquier autenticado **con** `with check (asesor_id = (select auth.uid()) or asesor_id is null and (select private.is_admin()) or (select private.is_admin()))` — el asesor solo puede crearse leads a sí mismo; el admin puede crear en bandeja.
  - **Column grants en `leads`:** `revoke update on public.leads from authenticated; grant update (nombre, telefono, email, fuente, propiedad_id, etapa, interes, presupuesto, zona_interes, notas, archivado) on public.leads to authenticated;` → **un asesor NO puede tocar `asesor_id` ni `asignado_en`** (reasignar es Server Action de admin vía service-role).
  - `seguimientos`: **append-only 3 capas** — (1) solo policies select (lead propio o admin) + insert (`with check` lead propio o admin, `autor_id = auth.uid()`); (2) `revoke update, delete on public.seguimientos from authenticated;`; (3) trigger `before update or delete → raise exception 'seguimientos es inmutable'`.
  - `propiedades`, `propiedad_portales`, `plantillas_mensajes`: select para todos los autenticados (los asesores consultan inventario); escritura solo admin (el sync escribe con service-role).
  - `sugerencias`: insert cualquier autenticado (`autor_id = auth.uid()`); select propia o admin; update solo admin (estado).
  - `notificaciones`: select/update(`leida`) solo del destinatario; sin insert para authenticated (las crea el sistema vía service-role).
  - `visitas`, `operaciones`, `mensajes`, `push_suscripciones`: policies mínimas owner-or-admin (uso pleno en F2/F3).
  - `operaciones`: **solo admin** en todas las operaciones de escritura; asesor solo select de las suyas.
  - `agencias`, `sync_estado`: select admin; escritura solo service-role.
- [ ] **Step 3:** `npx supabase db reset` — Expected: sin errores.
- [ ] **Step 4: Commit** `feat: RLS owner-or-admin, column grants y seguimientos append-only` + push.

### Task 4: Auth hook (migración 0003) + verificación local

**Files:** Create: `supabase/migrations/0003_auth_hook.sql`
**Patrón:** copiar de repo ref `0003_auth_hook.sql` (los grants exactos son críticos — si el hook falla, NADIE puede iniciar sesión).

- [ ] **Step 1:** `public.custom_access_token_hook(event jsonb)` que lee `rol` de `public.usuarios` e inyecta claim `user_role`. Grants: `grant execute ... to supabase_auth_admin; revoke ... from authenticated, anon, public; grant select on public.usuarios to supabase_auth_admin;` + policy dedicada `to supabase_auth_admin using (true)`.
- [ ] **Step 2:** Habilitar en `supabase/config.toml`: `[auth.hook.custom_access_token] enabled = true, uri = "pg-functions://postgres/public/custom_access_token_hook"`.
- [ ] **Step 3:** `npx supabase db reset` — Expected: sin errores.
- [ ] **Step 4: Commit** `feat: auth hook con claim user_role` + push.

### Task 5: Seed script

**Files:** Create: `scripts/seed.ts`; Modify: `package.json` (script `"seed": "tsx scripts/seed.ts"`)

- [ ] **Step 1:** Con el cliente admin (service-role, local): crear agencia "Montana Realty", usuario admin `admin@montana.test` / `Password123!`, 2 asesores (`asesor1@…`, `asesor2@…`), 3 leads de prueba en bandeja, 2 plantillas WhatsApp ("Primer contacto", "Compartir propiedad"). Idempotente (upserts / check-before-insert).
- [ ] **Step 2:** `npm run seed` — Expected: "Seed completo" y datos visibles en Studio local.
- [ ] **Step 3: Commit** `chore: seed de desarrollo` + push.

### Task 6: Clientes Supabase + proxy.ts

**Files:** Create: `src/lib/supabase/server.ts`, `client.ts`, `admin.ts`, `src/proxy.ts`
**Patrón:** copiar 1:1 del repo ref y ajustar nombres. ⚠️ `getClaims()` va INMEDIATAMENTE después de crear el cliente en el proxy; copiar cookies a los redirects.

- [ ] **Step 1:** Los 3 clientes: `server.ts` (createServerClient con getAll/setAll try/catch, por-request), `client.ts` (createBrowserClient con `realtime: { worker: true }`), `admin.ts` (`import 'server-only'`, SUPABASE_SECRET_KEY, persistSession false).
- [ ] **Step 2:** `src/proxy.ts`: refresh de sesión + reglas: sin sesión y ruta protegida → `/`; con sesión en `/` → `/admin` o `/asesor` según claim `user_role`; rol equivocado en área ajena → su área. Usuario autenticado sin fila en `usuarios` o inactivo → `signOut({ scope: 'local' })` y `/`. **Matcher excluye:** `_next/*`, assets, `manifest.webmanifest`, `api/cron/*`.
- [ ] **Step 3:** Test manual: `npm run dev`, visitar `/admin` sin sesión — Expected: redirect a `/`.
- [ ] **Step 4: Commit** `feat: clientes Supabase y proxy con redirección por rol` + push.

### Task 7: Login + logout + helper de usuario

**Files:** Create: `src/app/page.tsx` (login), `src/lib/auth/acciones.ts`, `src/lib/auth/usuario-actual.ts`, `src/app/(admin)/admin/layout.tsx`, `src/app/(asesor)/asesor/layout.tsx`

- [ ] **Step 1:** `usuario-actual.ts`: `usuarioActual()` memoizado con React `cache()` — `getClaims()` + fila de `usuarios`; `requireAdmin()` / `requireAsesor()` que hacen `redirect()` si no cumple. **El proxy NO es frontera de seguridad: cada layout re-verifica.**
- [ ] **Step 2:** Server Actions `iniciarSesion(formData)` (signInWithPassword + redirect según rol; error en español "Correo o contraseña incorrectos") y `cerrarSesion()`.
- [ ] **Step 3:** Página de login mobile-first: logo Montana, email, contraseña, estados de carga y error.
- [ ] **Step 4:** Layouts admin (sidebar desktop: Dashboard, Bandeja, Leads, Propiedades, Asesores, Sugerencias, Ajustes) y asesor (bottom-nav móvil: Inicio, Leads, Propiedades, Perfil) con `requireAdmin()`/`requireAsesor()`, nombre del usuario y botón de salir. Ítems de fases futuras NO se pintan.
- [ ] **Step 5:** Verificación manual con usuarios del seed: admin → `/admin`, asesor → `/asesor`, credenciales malas → error es-MX.
- [ ] **Step 6: Commit** `feat: login, logout y layouts por rol` + push.

### Task 8: Tests de integración RLS

**Files:** Create: `vitest.integration.config.ts`, `src/test/rls.integration.test.ts`; Modify: `package.json` (`"test:rls"`)
**Patrón:** repo ref `vitest.integration.config.ts`. Corre contra Supabase local con JWTs reales (signInWithPassword de los usuarios seed).

- [ ] **Step 1:** Escribir tests (fallarán si RLS está mal):
  - asesor1 NO ve leads de asesor2 (select → array vacío, no error).
  - asesor1 NO puede `update leads set asesor_id` (column grant → error de permiso).
  - asesor1 NO puede update/delete un seguimiento (→ error, capa 2/3).
  - asesor NO puede insertar en `notificaciones` ni update `propiedades`.
  - admin ve todos los leads; asesor inserta seguimiento solo en lead propio.
  - anon no lee nada.
- [ ] **Step 2:** `npm run test:rls` — Expected: PASS completo.
- [ ] **Step 3: Commit** `test: integración RLS admin/asesor` + push.

### Task 9: Cliente EasyBroker + mapeo (TDD)

**Files:** Create: `src/lib/easybroker/cliente.ts`, `mapeo.ts`, `src/test/easybroker-mapeo.test.ts`, `src/test/fixtures/easybroker/{properties-list.json, property-detail.json, contact-requests.json}`
**Skill:** `@easybroker-api` — TODOS los detalles (headers, cursores, límites, gotchas) están ahí.

- [ ] **Step 1:** Capturar fixtures reales del sandbox (una vez, con curl):

```bash
curl -s -H "X-Authorization: l7u502p8v46ba3ppgvj5y2aad50lb9" "https://api.stagingeb.com/v1/properties?limit=3" > src/test/fixtures/easybroker/properties-list.json
# ídem detalle de una propiedad y contact_requests?limit=3
```

- [ ] **Step 2:** Tests de `mapeo.ts` (fallando primero): `mapearPropiedadLista(json)` → shape de `propiedades` (precio de `operations[0]`, m² floats, `updated_at` -06:00 → UTC); `mapearPropiedadDetalle` (lat/lng, fotos completas); `mapearContactRequest` → shape de `leads` (fuente `portal`, `fuente_detalle` = `source`, `happened_at` → `creado_en` UTC, teléfono normalizado a dígitos con lada).
- [ ] **Step 3:** Run: `npx vitest run easybroker-mapeo` — Expected: FAIL (módulo no existe).
- [ ] **Step 4:** Implementar `mapeo.ts` (funciones puras) y `cliente.ts`: `ebFetch(path, params)` con `X-Authorization`, base URL de env, paginación por `next_page`, throttle simple (≤10 req/s), manejo 401/429/5xx con error tipado.
- [ ] **Step 5:** `npx vitest run easybroker-mapeo` — Expected: PASS.
- [ ] **Step 6: Commit** `feat: cliente y mapeo EasyBroker (TDD contra fixtures del sandbox)` + push.

### Task 10: Sync idempotente + dedup (TDD)

**Files:** Create: `src/lib/easybroker/sync.ts`, `src/test/easybroker-sync.test.ts` (con supabase admin mockeado o contra DB local), `src/lib/notificaciones/crear.ts`

- [ ] **Step 1:** Tests primero: (a) upsert por `easybroker_id` — correr el sync 2 veces no duplica; (b) lead nuevo → fila en bandeja (`asesor_id` null) + notificación a admins; (c) lead con teléfono/email existente → NO crea lead, agrega seguimiento tipo `sistema` con `propiedad_id` y notifica al asesor dueño (si el lead sigue en bandeja sin asesor, notifica a los admins); (d) cursor avanza solo tras éxito; (e) propiedad ausente en reconcile → `activa = false`; (f) lead nuevo con `propiedad_id` → `zona_interes` se prellena con la colonia/ciudad de esa propiedad (regla del spec §4.5 — aplica igual en `capturarLead`).
- [ ] **Step 2:** Implementar `sincronizarEasyBroker()` (usa cliente admin service-role): propiedades por `search[updated_after]` (cursor de `sync_estado`) con detalle N+1 solo para cambiadas + leads por `happened_after`. `crear.ts`: `crearNotificacion(destinatarioId, tipo, texto, url)`.
- [ ] **Step 3:** `npx vitest run easybroker-sync` — Expected: PASS.
- [ ] **Step 4: Commit** `feat: sync EasyBroker idempotente con dedup de leads` + push.

### Task 11: Cron route + botón "Sincronizar ahora"

**Files:** Create: `src/app/api/cron/easybroker-sync/route.ts`, `vercel.json`; Modify: `src/app/(admin)/admin/propiedades/page.tsx` (Task 13 la crea; aquí solo la action)

- [ ] **Step 1:** Route handler GET: fail-closed `if (!secreto || header !== \`Bearer ${secreto}\`) return 401`; llama `sincronizarEasyBroker()`; `export const maxDuration = 300`. `vercel.json`: `{"crons":[{"path":"/api/cron/easybroker-sync","schedule":"*/15 * * * *"}]}` (si el plan resulta Hobby, se cambia a pg_cron — decisión al desplegar).
- [ ] **Step 2:** Server Action `sincronizarAhora()` (requireAdmin) que llama la misma función y `revalidatePath`.
- [ ] **Step 3:** Probar local: `curl -H "Authorization: Bearer $CRON_SECRET" localhost:3000/api/cron/easybroker-sync` — Expected: 200 `{ok: true, propiedades: N, leads: M}`; sin header → 401.
- [ ] **Step 4: Commit** `feat: cron de sync y acción sincronizar ahora` + push.

### Task 12: Alta y gestión de asesores (admin)

**Files:** Create: `src/app/(admin)/admin/asesores/page.tsx`, `src/lib/asesores/acciones.ts`, componentes de formulario

- [ ] **Step 1:** Server Actions (service-role): `crearAsesor(nombre, email, telefono, password)` → `auth.admin.createUser` + fila `usuarios`; `desactivarAsesor(id)` → `activo=false`, sus leads no cerrados vuelven a bandeja (`asesor_id=null`), sus propiedades quedan sin responsable (`propiedades.asesor_id=null`) + notificación a admins; `reactivarAsesor(id)`.
- [ ] **Step 2:** UI: tabla de asesores (nombre, email, teléfono, badge activo/inactivo, # leads activos), dialog de alta, confirmación de desactivar explicando el efecto sobre sus leads.
- [ ] **Step 3:** Verificar: crear asesor → puede iniciar sesión; desactivar → sus leads aparecen en bandeja y su sesión siguiente es rechazada por el proxy.
- [ ] **Step 4: Commit** `feat: gestión de asesores con soft delete` + push.

### Task 13: Propiedades (vistas admin y asesor)

**Files:** Create: `src/app/(admin)/admin/propiedades/{page.tsx, [id]/page.tsx}`, `src/app/(asesor)/asesor/propiedades/page.tsx`, componentes de tarjeta/galería

- [ ] **Step 1:** Admin lista: grid de tarjetas (foto, título, precio formateado MXN, operación venta/renta, estatus, asesor responsable) + filtros (operación, estatus, asesor) + "última sincronización: hace X min" (de `sync_estado`) + botón **Sincronizar ahora** (Task 11). Detalle: galería, datos completos, asignar asesor responsable (select), checkboxes manuales de portales (`propiedad_portales`) y link a `url_publica`.
- [ ] **Step 2:** Asesor lista (mobile-first): buscador + tarjetas compactas para enseñar al cliente (fotos swipe, precio grande, recámaras/baños/m²); badge "tuya" en las suyas.
- [ ] **Step 3:** Verificar con datos del sandbox sincronizados.
- [ ] **Step 4: Commit** `feat: inventario de propiedades admin y asesor` + push.

### Task 14: Bandeja de leads + asignación (admin)

**Files:** Create: `src/app/(admin)/admin/bandeja/page.tsx`, `src/app/(admin)/admin/leads/page.tsx`, `src/lib/leads/{acciones.ts, consultas.ts}`

- [ ] **Step 1:** Server Actions: `asignarLead(leadId, asesorId)` (service-role; set `asesor_id`, `asignado_en=now()`, crea notificación al asesor "Nuevo lead asignado: {nombre}" y seguimiento `sistema` "Asignado a {asesor}"); `reasignarLead` (mismo + nota de reasignación); `capturarLead(datos)` para captura manual del admin (a bandeja o directo a un asesor).
- [ ] **Step 2:** Bandeja: lista de leads sin asignar (nombre, teléfono, fuente con badge del portal via `fuente_detalle`, propiedad de interés, hace cuánto llegó — resaltar >1h en ámbar, >24h en rojo) + select de asesor + botón asignar en una fila. Contador en el nav del admin.
- [ ] **Step 3:** Leads global: tabla completa con filtros (asesor, etapa, fuente) y búsqueda; link al detalle (vista de asesor reutilizada en modo admin).
- [ ] **Step 4:** Verificar: sync trae leads del sandbox → aparecen en bandeja → asignar → desaparece de bandeja y notifica.
- [ ] **Step 5: Commit** `feat: bandeja de leads con asignación y captura manual` + push.

### Task 15: Kanban del asesor + captura rápida

**Files:** Create: `src/app/(asesor)/asesor/leads/page.tsx`, `src/components/leads/{kanban.tsx, columna.tsx, tarjeta-lead.tsx, form-captura-rapida.tsx}`

- [ ] **Step 1:** Kanban con @dnd-kit: columnas = etapas del embudo; en móvil, columnas deslizables horizontalmente y modo alternativo de mover por menú (dnd en touch es frágil — botón "⋮ → Mover a…"). Drag/menu → Server Action `cambiarEtapa(leadId, etapa)` con update optimista.
- [ ] **Step 2:** Tarjeta de lead: nombre, fuente, propiedad de interés, hace cuánto sin seguimiento (badge ámbar >24h — regla del spec §7).
- [ ] **Step 3:** Botón flotante "+ Registrar lead": form de 4 campos (nombre, teléfono, fuente, propiedad opcional con buscador) — captura en segundos; `capturarLead` con `asesor_id = auth.uid()`.
- [ ] **Step 4:** Verificar en viewport móvil (375px) y desktop.
- [ ] **Step 5: Commit** `feat: kanban de leads del asesor con captura rápida` + push.

### Task 16: Detalle de lead + seguimientos + WhatsApp/llamar

**Files:** Create: `src/app/(asesor)/asesor/leads/[id]/page.tsx`, `src/lib/seguimientos/acciones.ts`, `src/lib/plantillas/rellenar.ts`, `src/test/plantillas.test.ts`, componentes de timeline

- [ ] **Step 1 (TDD):** Test de `rellenarPlantilla(texto, contexto)`: sustituye `{nombre}`, `{propiedad}`, `{zona}`, `{precio}` (formato `$4,500,000 MXN`), `{asesor}`; variables sin dato → se omiten limpiamente. Run — Expected: FAIL → implementar → PASS.
- [ ] **Step 2:** Server Action `registrarSeguimiento(leadId, tipo, nota, propiedadId?)`.
- [ ] **Step 3:** Página de detalle (mobile-first): datos del lead (editables los permitidos), acciones grandes: **📞 Llamar** (`tel:`), **💬 WhatsApp** (`https://wa.me/52{telefono}?text={plantilla}` con selector de plantilla → al abrir, registra seguimiento tipo `whatsapp` automático "Se envió plantilla {nombre}"), **+ Seguimiento** (sheet con tipo/nota/propiedad opcional). Timeline inmutable de seguimientos (icono por tipo, autor, fecha relativa es-MX). Selector de etapa. Sección "propiedad de interés".
- [ ] **Step 4:** Admin puede abrir el mismo detalle desde leads global (RLS ya lo permite).
- [ ] **Step 5: Commit** `feat: detalle de lead con seguimientos y acciones WhatsApp` + push.

### Task 17: Inicio del asesor (cola del día) + notificaciones simples

**Files:** Create: `src/app/(asesor)/asesor/page.tsx`, `src/components/notificaciones/lista.tsx`, página/panel de notificaciones

- [ ] **Step 1:** Inicio del asesor = cola de acciones (patrón "Smart List" del research): leads nuevos asignados sin primer contacto (arriba, en rojo si >24h), leads con >24h sin seguimiento, y sus números del mes (leads activos, cerrados). Cada ítem → link directo al detalle.
- [ ] **Step 2:** Lista simple de notificaciones (sin realtime aún — F3): página `/asesor/notificaciones` y contador de no leídas en el nav (badge); marcar leída al abrir. Igual para admin (`/admin` incluye acceso).
- [ ] **Step 3: Commit** `feat: inicio del asesor con cola del día y notificaciones` + push.

### Task 18: Feedback interno (sugerencias)

**Files:** Create: `src/components/sugerencias/boton-sugerencia.tsx` (client, en ambos layouts), `src/lib/sugerencias/acciones.ts`, `src/app/(admin)/admin/sugerencias/page.tsx`

- [ ] **Step 1:** Botón "💡" fijo (esquina inferior en desktop, ítem de menú en móvil) → dialog con textarea; captura `usePathname()` automáticamente. Action `crearSugerencia(pantalla, texto)`.
- [ ] **Step 2:** Panel admin: lista con autor, pantalla, fecha, texto y select de estado (nueva/revisada/implementada).
- [ ] **Step 3: Commit** `feat: módulo de sugerencias internas` + push.

### Task 19: Plantillas WhatsApp (CRUD admin)

**Files:** Create: `src/app/(admin)/admin/ajustes/page.tsx`, `src/lib/plantillas/acciones.ts`

- [ ] **Step 1:** CRUD de plantillas (nombre, texto con chips de variables disponibles, activa) con vista previa en vivo usando `rellenarPlantilla` con datos de ejemplo. (Ajustes de umbrales/comisiones llegan en F2 — la página solo muestra plantillas por ahora.)
- [ ] **Step 2:** Verificar: plantilla creada aparece en el selector de WhatsApp del detalle de lead (Task 16).
- [ ] **Step 3: Commit** `feat: CRUD de plantillas de WhatsApp` + push.

### Task 20: Dashboard admin mínimo (F1) + pulido de estados

**Files:** Create: `src/app/(admin)/admin/page.tsx`, estados vacíos/carga en todas las páginas

- [ ] **Step 1:** Dashboard F1 (el completo es F2): 4 KPIs (leads en bandeja, leads del mes, asesores activos, propiedades activas) + lista de "leads sin atender >24h" por asesor. Server Component con queries directas.
- [ ] **Step 2:** Barrido de estados vacíos (bandeja vacía "🎉 Sin leads pendientes", kanban sin leads, sin propiedades "Sincroniza con EasyBroker") y `loading.tsx` por área.
- [ ] **Step 3:** `npm run build && npm run test && npm run test:rls` — Expected: todo PASS.
- [ ] **Step 4: Commit** `feat: dashboard admin F1 y estados vacíos` + push.

### Task 21: Deploy a Vercel + Supabase producción

**Files:** Modify: variables de entorno en Vercel

- [ ] **Step 1:** Crear proyecto Supabase cloud; `npx supabase link` + `npx supabase db push`; habilitar el auth hook en Dashboard → Authentication → Hooks (⚠️ manual, no viaja con migraciones); correr seed de producción mínimo (agencia + admin real).
- [ ] **Step 2:** Conectar repo a Vercel; setear env vars (EASYBROKER_BASE_URL=staging por ahora, CRON_SECRET aleatorio ≥16 chars). Verificar el plan de Vercel: si Hobby, quitar el cron de `vercel.json` y programar pg_cron (`select cron.schedule(... net.http_post ...)` con el secret en Vault) — documentar cuál quedó en el README.
- [ ] **Step 3:** Smoke test en la URL `*.vercel.app`: login admin, sync manual, asignar lead, seguimiento desde un teléfono real.
- [ ] **Step 4: Commit** `chore: configuración de deploy` + push.
- [ ] **Step 5:** Reportar al usuario: URL de producción, credenciales iniciales, y pendientes para activar datos reales (API key de EasyBroker de Montana, confirmar plan con API, plan de Vercel).

---

## Estacionado explícitamente (no perder)

- **Recuperación de contraseña** (spec §3): en el piloto F1 el admin resetea contraseñas desde el Dashboard de Supabase; el flujo self-service ("¿Olvidaste tu contraseña?") entra en **Fase 3** junto con el pulido.

## Criterios de aceptación de la Fase 1 (del spec)

1. Login único con redirección por rol; asesor jamás ve datos ajenos (tests RLS en verde).
2. Flujo completo: lead entra (sandbox EasyBroker o captura) → bandeja → asignación con notificación → kanban → seguimientos inmutables → cambio de etapa.
3. Sync idempotente cada 15 min + botón manual, con indicador de última sincronización.
4. Feedback interno y plantillas WhatsApp operativas desde el día uno del piloto.
5. Desplegado y usable desde un teléfono real.
