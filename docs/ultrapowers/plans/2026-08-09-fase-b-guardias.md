# Fase B — Guardias, asignación automática y escalamiento — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use ultrapowers:subagent-driven-development (recommended) or ultrapowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Los leads de EasyBroker se asignan solos al asesor de guardia (o al dueño si son VIP) y escalan con push 15/30/120 min hasta que alguien conteste.

**Architecture:** Migración 0014 agrega 4 tablas + 1 columna. El resolutor de asignación se engancha en `crearLeadEnBandeja` del sync (fallo → bandeja, el sync jamás pierde un lead). Un cron cada 5 min (`/api/cron/escalamiento`, mismo patrón Bearer que easybroker-sync) ejecuta pasos idempotentes vía UNIQUE en `lead_escalamientos`. Push reutiliza `enviarPush`; correo del paso 2h vía Resend (fetch directo, sin SDK).

**Tech Stack:** Next.js App Router + Supabase (RLS patrón 0002) + web-push existente + Resend REST + vitest.

**Spec:** `docs/ultrapowers/specs/2026-08-05-guardias-design.md` (leerlo primero — tiene TODAS las decisiones de producto).

> **ESTADO 2026-08-09 — Tasks 1–12 COMPLETAS** en la rama `feat/guardias` (485 tests unit + 66 de integración verdes; UI verificada en navegador con playwright contra DEV). **Falta SOLO la Task 13** (checklist manual de producción, abajo) — requiere al usuario: cuenta Resend, secrets en Vercel, aplicar 0014 a PROD, pg_cron y configuración inicial en la UI. Notas de ejecución: el texto de la notificación de bandeja conserva «nombre — fuente» (contrato del test de integración del sync) y las guardias fixture de tests RLS usan fechas PASADAS para no alimentar al resolutor real.

---

## Contexto del repo (leer esto y NO re-explorar)

| Qué | Dónde | Nota |
|---|---|---|
| Última migración | `supabase/migrations/0013_contactos_whatsapp.sql` | La nueva es **0014** |
| Patrón RLS | `supabase/migrations/0002_rls.sql` | `private.is_admin()` security definer; policies `to authenticated` con `(select private.is_admin())` |
| Insert de lead nuevo (sync) | `src/lib/easybroker/sync.ts:687` `crearLeadEnBandeja` | Dedup 23505 = duplicado silencioso; ahí se engancha el resolutor |
| Patrón asignación | `src/lib/leads/acciones.ts:87` `asignarLead` | Candado `.is('asesor_id', null)`, `registrarAsignacion` (seguimiento sistema + notificación), service role |
| Push | `src/lib/push/enviar.ts` `enviarPush(supabase, destinatarioId, {titulo, cuerpo, url})` | Best-effort, nunca lanza, poda 404/410 |
| Notificación in-app | `src/lib/notificaciones/crear.ts` `crearNotificacion` / `notificarAdmins` | |
| Cron con Bearer | `src/app/api/cron/easybroker-sync/route.ts` | Fail-closed si falta env; `maxDuration = 300` |
| Timezone | `src/lib/fechas/monterrey.ts` | `convertirFechaHoraMonterreyAIso`, `diaMonterrey`, `inicioDeDiaMonterrey` — NO calcular offsets a mano |
| Tests | `src/test/*.test.ts` (vitest) | RLS integration: patrón de `src/test/contactos-rls.integration.test.ts` |
| Rutas admin | `src/app/(admin)/admin/{bandeja,leads,propiedades,ajustes,...}` | |
| Rutas asesor | `src/app/(asesor)/asesor/{leads,perfil,...}` | Cola del día = `src/app/(asesor)/asesor/page.tsx` |
| Entornos | memoria `entornos-dev-prod` | `.env.local` → proyecto DEV de Supabase. Migraciones SOLO a DEV; prod se toca en el checklist final |
| Perfil dual Jair | memoria `perfil-dual-jair` | El dueño puede tener rol admin con vista asesor — por eso VIP se detecta por propiedad, NO por `asesor_id == dueño` |
| Correo | Resend (decidido en research 2026-08-05, free tier 3k/mes) | REST directo con fetch; sin SDK |

**Skills a cargar según task:** `supabase:supabase` (Task 1), `easybroker-api` (Task 4), `fintech-muro-ui` (Tasks 8, 10, 11 — UI móvil).

**Decisiones de implementación tomadas al planear** (complementan el spec):

1. **VIP se recalcula, no se persiste**: el escalador determina VIP re-evaluando `propiedades_internas.exclusiva` + `propiedades.precio >= umbral` (helper compartido `esLeadVip`). Evita columna extra y funciona aunque el dueño también cubra guardias.
2. **`dueno_user_id` sin configurar → regla VIP apagada** (el lead sigue el flujo normal de guardia). Fail-safe, nada revienta.
3. **VIP sin rol cargado**: se asigna al dueño con `escalamiento_desde = now()` (no hay turno del cual diferir).
4. **Idempotencia del escalador**: INSERT en `lead_escalamientos` ANTES del side effect; si el INSERT pierde (23505) no se envía nada. At-most-once por paso.
5. **`hora_fin = '00:00'`** se interpreta como medianoche del día siguiente (cobertura termina 00:00, decisión 1 del spec).
6. **Correo del dueño**: clave `correo_dueno` en `configuracion` (no hay email en `usuarios`).
7. **Secret propio** para el cron nuevo: `CRON_SECRET_ESCALAMIENTO`.

---

### Task 1: Migración 0014 — schema, RLS y seed

**Files:**
- Create: `supabase/migrations/0014_guardias.sql`

- [ ] **Step 1: Escribir la migración**

```sql
-- Migracion 0014: guardias, configuracion, propiedades_internas,
-- lead_escalamientos y leads.escalamiento_desde (Fase B guardias).
-- Spec: docs/ultrapowers/specs/2026-08-05-guardias-design.md

-- ===== guardias: rol mensual, un asesor por turno =====
create table public.guardias (
  id uuid primary key default gen_random_uuid(),
  fecha date not null,
  turno text not null check (turno in ('manana','tarde')),
  hora_inicio time not null,
  hora_fin time not null,
  asesor_id uuid not null references public.usuarios(user_id),
  creado_en timestamptz not null default now(),
  unique (fecha, turno)
);
create index on public.guardias (fecha);

-- ===== configuracion: key-value del org (solo admin; el sync lee con service role) =====
create table public.configuracion (
  clave text primary key,
  valor jsonb not null,
  actualizado_en timestamptz not null default now()
);

-- ===== propiedades_internas: marca exclusiva INVISIBLE para asesores =====
-- Tabla aparte a proposito: admin y asesor comparten rol authenticated y RLS
-- es por fila — una columna en propiedades seria visible. NO agregar ahi.
create table public.propiedades_internas (
  propiedad_id uuid primary key references public.propiedades(id) on delete cascade,
  exclusiva boolean not null default false,
  actualizado_en timestamptz not null default now()
);

-- ===== lead_escalamientos: pasos ejecutados (UNIQUE = idempotencia del cron) =====
create table public.lead_escalamientos (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  paso text not null check (paso in ('recordatorio_15','abierto_30','dueno_120','recordatorio_vip')),
  ejecutado_en timestamptz not null default now(),
  unique (lead_id, paso)
);

-- ===== leads.escalamiento_desde: snapshot del reloj (NULL = no escala) =====
alter table public.leads add column escalamiento_desde timestamptz;

-- ===== RLS =====
alter table public.guardias enable row level security;
alter table public.configuracion enable row level security;
alter table public.propiedades_internas enable row level security;
alter table public.lead_escalamientos enable row level security;

-- guardias: todos los autenticados leen (el asesor ve el rol); escribe solo admin
create policy "autenticado lee guardias" on public.guardias
  for select to authenticated using (true);
create policy "admin inserta guardias" on public.guardias
  for insert to authenticated with check ((select private.is_admin()));
create policy "admin actualiza guardias" on public.guardias
  for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "admin elimina guardias" on public.guardias
  for delete to authenticated using ((select private.is_admin()));

-- configuracion / propiedades_internas / lead_escalamientos: SOLO admin
-- (sin policy para asesor = deny por default; el asesor ni sabe que existen)
create policy "admin lee configuracion" on public.configuracion
  for select to authenticated using ((select private.is_admin()));
create policy "admin escribe configuracion" on public.configuracion
  for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

create policy "admin lee propiedades_internas" on public.propiedades_internas
  for select to authenticated using ((select private.is_admin()));
create policy "admin escribe propiedades_internas" on public.propiedades_internas
  for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

-- lead_escalamientos: admin solo lectura; escrituras SOLO service role (el cron)
create policy "admin lee lead_escalamientos" on public.lead_escalamientos
  for select to authenticated using ((select private.is_admin()));

-- ===== grants (RLS es el guardian; grants por tabla como en 0009/0010) =====
grant select, insert, update, delete on public.guardias to authenticated;
grant select, insert, update, delete on public.configuracion to authenticated;
grant select, insert, update, delete on public.propiedades_internas to authenticated;
grant select on public.lead_escalamientos to authenticated;

-- ===== seed de configuracion (el admin ajusta desde la UI) =====
insert into public.configuracion (clave, valor) values
  ('umbral_vip_mxn',     'null'::jsonb),
  ('dueno_user_id',      'null'::jsonb),
  ('correo_dueno',       'null'::jsonb),
  ('turno_manana',       '{"inicio":"09:00","fin":"15:00"}'::jsonb),
  ('turno_tarde',        '{"inicio":"15:00","fin":"00:00"}'::jsonb),
  ('escalamiento_min',   '{"recordatorio":15,"abierto":30,"dueno":120}'::jsonb);
```

> Antes de aplicar: revisar los grants reales de 0009/0010 y ajustar si el patrón difiere.

- [ ] **Step 2: Aplicar SOLO a DEV** (`.env.local` apunta a DEV — memoria `entornos-dev-prod`)

Run: `npx supabase db push`
Expected: `0014_guardias.sql` aplicada sin errores.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0014_guardias.sql
git commit -m "feat: migracion 0014 guardias, configuracion, propiedades_internas y escalamientos"
```

---

### Task 2: Consultas de guardia, configuración y helper VIP

**Files:**
- Create: `src/lib/guardias/consultas.ts`
- Test: `src/test/guardias-consultas.test.ts`

- [ ] **Step 1: Tests que fallan** — casos: ventana de turno normal; `hora_fin: '00:00'` cruza a medianoche del día siguiente; `guardiaActiva` en frontera exacta (inicio inclusive, fin exclusivo); hueco entre turnos → null; `siguienteGuardia` salta guardias pasadas del mismo día; `leerConfiguracion` con claves `null` devuelve defaults tipados; `esLeadVip` por exclusiva, por umbral, sin propiedad → false, umbral null → solo exclusiva cuenta.

- [ ] **Step 2: Implementar**

```ts
// src/lib/guardias/consultas.ts  (sin 'use server'; lo consumen sync y cron)
import type { SupabaseClient } from '@supabase/supabase-js'
import { convertirFechaHoraMonterreyAIso, diaMonterrey } from '@/lib/fechas/monterrey'

export interface Guardia {
  id: string; fecha: string; turno: 'manana' | 'tarde'
  hora_inicio: string; hora_fin: string; asesor_id: string
}
export interface ConfiguracionGuardias {
  umbralVipMxn: number | null
  duenoUserId: string | null
  correoDueno: string | null
  escalamientoMin: { recordatorio: number; abierto: number; dueno: number }
  turnoManana: { inicio: string; fin: string }
  turnoTarde: { inicio: string; fin: string }
}

/** Ventana [inicio, fin) en instantes UTC. hora_fin <= hora_inicio => termina al dia siguiente (00:00 = medianoche). */
export function ventanaGuardia(g: Pick<Guardia, 'fecha' | 'hora_inicio' | 'hora_fin'>): { inicio: Date; fin: Date }

/** Guardia cuya ventana cubre `ahora` (consulta fecha de hoy y ayer en Monterrey por el turno que cruza medianoche). */
export async function guardiaActiva(supabase: SupabaseClient, ahora: Date): Promise<Guardia | null>

/** Primera guardia futura (inicio > ahora), o null si no hay rol cargado. */
export async function siguienteGuardia(supabase: SupabaseClient, ahora: Date): Promise<Guardia | null>

export async function leerConfiguracion(supabase: SupabaseClient): Promise<ConfiguracionGuardias>

/** VIP = exclusiva en propiedades_internas O precio >= umbral. Sin propiedad o sin umbral+sin marca => false. */
export async function esLeadVip(
  supabase: SupabaseClient, propiedadId: string | null, config: ConfiguracionGuardias
): Promise<boolean>
```

- [ ] **Step 3: Verificar** — Run: `npx vitest run src/test/guardias-consultas.test.ts` → PASS
- [ ] **Step 4: Commit** — `feat: consultas de guardias, configuracion y regla VIP`

---

### Task 3: Resolutor de asignación (lógica pura + wrapper)

**Files:**
- Create: `src/lib/guardias/resolutor.ts`
- Test: `src/test/guardias-resolutor.test.ts`

- [ ] **Step 1: Tests que fallan** — los 8 casos del spec: guardia activa; frontera de medianoche; hueco entre turnos → siguiente; domingo sin rol → siguiente; mes sin capturar → bandeja; VIP por exclusiva; VIP por umbral; empate exclusiva+umbral (VIP una sola vez). Más: VIP fuera de horario difiere `escalamientoDesde` al inicio del siguiente turno; VIP sin rol → `escalamientoDesde = ahora`; `duenoUserId` null → VIP apagado.

- [ ] **Step 2: Implementar la decisión pura**

```ts
export type DecisionAsignacion =
  | { tipo: 'vip'; asesorId: string; escalamientoDesde: string; fueraDeHorario: boolean }
  | { tipo: 'guardia_activa'; asesorId: string; escalamientoDesde: string }
  | { tipo: 'guardia_futura'; asesorId: string; escalamientoDesde: string } // avisa al dueño
  | { tipo: 'bandeja' } // sin rol => notificar admins como hoy

export function decidirAsignacion(entrada: {
  ahora: Date
  esVip: boolean
  config: ConfiguracionGuardias
  activa: Guardia | null
  siguiente: Guardia | null
}): DecisionAsignacion
```

Reglas (orden del spec): VIP (con dueño configurado) → dueño, `escalamientoDesde` = now si hay guardia activa, inicio del siguiente turno si no, now si tampoco hay rol. Luego guardia activa → ese asesor, desde now. Luego siguiente → ese asesor, desde su `hora_inicio` (snapshot — ediciones posteriores del rol NO lo mueven). Sin nada → bandeja.

- [ ] **Step 3: Verificar** → PASS. **Step 4: Commit** — `feat: resolutor de asignacion por guardias`

---

### Task 4: Integrar el resolutor al sync

**Files:**
- Modify: `src/lib/easybroker/sync.ts` (rama 3 de `procesarContactRequests`, hoy `crearLeadEnBandeja` línea ~687)
- Test: `src/test/guardias-sync.test.ts` (unit con mocks, patrón de los tests existentes del sync)

Cargar skill `easybroker-api` antes de tocar el sync.

- [ ] **Step 1: Tests que fallan** — lead nuevo con guardia activa → insert lleva `asesor_id` + `asignado_en` + `escalamiento_desde` y dispara seguimiento sistema «Asignado por guardia a X» + `crearNotificacion` + `enviarPush` al asesor; fuera de horario → además push al dueño; VIP → push «Lead VIP — decide quién lo atiende» al dueño y NO al asesor de guardia; **resolutor lanza → lead cae a bandeja con `escalamiento_desde` NULL + alerta admin (el sync JAMÁS pierde un lead)**; dedup 23505 intacto (no notifica).

- [ ] **Step 2: Implementar** — nueva función `crearLeadAsignado` que: (a) resuelve la decisión en try/catch (catch → decisión bandeja + `notificarAdmins` de la falla), (b) hace el INSERT único con los campos de la decisión (conservando el manejo 23505), (c) side effects best-effort según el tipo de decisión. Los leads asignados a mano desde bandeja (`asignarLead`) NO se tocan: `escalamiento_desde` queda NULL ahí.

- [ ] **Step 3: Toda la suite del sync** — Run: `npx vitest run src/test/easybroker-mapeo.test.ts src/test/guardias-sync.test.ts` → PASS
- [ ] **Step 4: Commit** — `feat: el sync asigna leads por guardia con escalamiento`

---

### Task 5: Motor de escalamiento

**Files:**
- Create: `src/lib/guardias/escalamiento.ts`
- Test: `src/test/guardias-escalamiento.test.ts`

- [ ] **Step 1: Tests que fallan (reloj simulado — `ahora` siempre inyectado)** — cada umbral dispara UNA sola vez (el 23505 en `lead_escalamientos` suprime el side effect); lead de 45 min sin 15 previo ejecuta 15 y 30 en la misma corrida (cron caído procesa por edad acumulada); `escalamiento_desde` futuro (lead nocturno) → no hace nada; seguimiento manual (`tipo != 'sistema'`, posterior a `asignado_en`) → skip total; etapa != nuevo no aparece (filtro de query); VIP → solo `recordatorio_vip` al dueño, nunca 30/120; paso 30 pushea a TODOS los asesores activos con deep-link al lead; paso 120 → correo + push al dueño.

- [ ] **Step 2: Implementar**

```ts
export async function procesarEscalamientos(
  supabase: SupabaseClient, ahora: Date
): Promise<{ procesados: number; pasosEjecutados: string[]; errores: string[] }>
```

Query base: `etapa = 'nuevo'`, `archivado = false`, `asesor_id not null`, `escalamiento_desde not null`, `escalamiento_desde <= ahora`. Por lead: descartar si tiene seguimiento manual posterior a `asignado_en`; `esVip = esLeadVip(...)`; edad = `ahora - escalamiento_desde`. Ejecutar pasos por umbral (config `escalamiento_min`), cada uno: INSERT a `lead_escalamientos` primero → si ganó, side effect. Errores por lead se acumulan, nunca tumban la corrida (patrón del sync).

- [ ] **Step 3: Verificar** → PASS. **Step 4: Commit** — `feat: motor de escalamiento de leads sin contestar`

---

### Task 6: Correo transaccional (Resend)

**Files:**
- Create: `src/lib/correo/enviar.ts`
- Test: `src/test/correo-enviar.test.ts`
- Modify: `src/lib/env-server.ts` (agregar `resendApiKey()`, seguir patrón existente)

- [ ] **Step 1: Tests que fallan** — sin API key → `{ enviado: false }` sin lanzar; fetch 200 → `{ enviado: true }`; fetch falla/red → `{ enviado: false }` sin lanzar (contrato de `enviarPush`: el correo es empujón, nunca tumba al cron).

- [ ] **Step 2: Implementar** — `enviarCorreo({ para, asunto, html })` con `fetch('https://api.resend.com/emails', { headers: { Authorization: Bearer ... } })`. Sin SDK. `from`: configurable con default `onboarding@resend.dev` hasta tener dominio.

- [ ] **Step 3: Verificar** → PASS. **Step 4: Commit** — `feat: envio de correo transaccional via Resend`

---

### Task 7: Endpoint de cron `/api/cron/escalamiento`

**Files:**
- Create: `src/app/api/cron/escalamiento/route.ts` (calcar `easybroker-sync/route.ts`; secret `CRON_SECRET_ESCALAMIENTO`, fail-closed)
- Test: `src/test/escalamiento-route.test.ts` — 401 sin Bearer, 401 con secret ausente en env, 200 con Bearer correcto.

- [ ] Step 1: tests → fallan. Step 2: implementar (llama `procesarEscalamientos(createAdminClient(), new Date())`). Step 3: PASS. Step 4: Commit — `feat: endpoint de cron para escalamiento`

---

### Task 8: Acción «Tomar lead»

**Files:**
- Modify: `src/lib/leads/acciones.ts` (nueva `tomarLead`), consulta de elegibilidad en `src/lib/guardias/consultas.ts`
- Modify: página de detalle de lead del asesor (`src/app/(asesor)/asesor/leads/[id]/...` — ubicar el archivo real al ejecutar) + componente botón
- Test: `src/test/tomar-lead.test.ts`

- [ ] **Step 1: Tests que fallan** — elegible solo si: etapa `nuevo`, no archivado, existe fila `abierto_30`; CAS usa `.eq('asesor_id', asesorOriginal)` (NO `.is(null)` — el lead SÍ tiene asesor): el primero gana, el segundo recibe «Este lead ya fue tomado»; al ganar → seguimiento sistema «{Asesor} tomó el lead desde escalamiento» + notificación al asesor original y al admin.

- [ ] **Step 2: Implementar** — `tomarLead(leadId)`: requiere asesor activo (patrón `usuario-actual`), service role lee elegibilidad + asesor vigente, CAS, side effects best-effort. La elegibilidad del botón la resuelve el server component vía la consulta (service role) — el cliente NUNCA lee `lead_escalamientos`.

- [ ] Step 3: PASS. Step 4: Commit — `feat: tomar lead desde escalamiento abierto`

---

### Task 9: Server actions de admin (rol, config, exclusiva)

**Files:**
- Create: `src/lib/guardias/acciones.ts` (`'use server'`, todo `requireAdmin`)
- Create: `src/lib/propiedades/internas.ts` (`marcarExclusiva(propiedadId, exclusiva)` — upsert en `propiedades_internas`)
- Test: `src/test/guardias-acciones.test.ts`

- [ ] **Step 1: Tests que fallan** — `guardarGuardia(fecha, turno, asesorId | null)`: null borra el turno, upsert por UNIQUE(fecha, turno), valida asesor activo (patrón `obtenerAsesorActivo`), horas default desde `configuracion`; `copiarSemanaAnterior(lunesDestino)`: copia los 7 días previos → destino, sin pisar turnos ya capturados; `guardarConfiguracion`: valida umbral numérico > 0, tiempos 15 < 30 < 120, horas `HH:mm`.

- [ ] Step 2: implementar. Step 3: PASS. Step 4: Commit — `feat: acciones admin de rol de guardias y configuracion`

---

### Task 10: UI Admin — calendario de guardias + configuración + toggle exclusiva

**Files:**
- Create: `src/app/(admin)/admin/guardias/page.tsx` + componentes en `src/components/guardias/`
- Modify: detalle de propiedad admin (`src/app/(admin)/admin/propiedades/...`) — toggle «Exclusiva»
- Modify: nav/layout admin para la entrada «Guardias»

Cargar skill `fintech-muro-ui` (estilo móvil del repo).

- [ ] Calendario del mes: grid de días, tap → sheet con los 2 turnos y selector de asesor; huecos sin cubrir en rojo; «copiar semana anterior»; navegación entre meses.
- [ ] Sección de configuración en la misma página: horarios default, umbral VIP, tiempos de escalamiento, dueño (selector de usuario) y correo del dueño.
- [ ] Toggle «Exclusiva» en la propiedad (solo vista admin — lee/escribe `propiedades_internas`).
- [ ] Verificación EN NAVEGADOR (memoria `verificacion-en-navegador`: los tests verdes no bastan): capturar rol, copiar semana, hueco en rojo, toggle exclusiva.
- [ ] Commit — `feat: pantalla admin de guardias y marca exclusiva`

---

### Task 11: UI Asesor — banner de guardia + rol solo lectura

**Files:**
- Modify: `src/app/(asesor)/asesor/page.tsx` (banner «Estás de guardia hoy 14:00–00:00» en la cola del día)
- Create: `src/app/(asesor)/asesor/guardias/page.tsx` (rol del mes, solo lectura — la RLS ya lo permite)
- Modify: botón «Tomar lead» visible en el detalle del lead cuando está en escalamiento abierto (consume la elegibilidad de Task 8)

- [ ] Implementar + verificar en navegador (banner solo el día/turno correcto; push abre el lead por deep-link).
- [ ] Commit — `feat: banner de guardia y rol visible para asesores`

---

### Task 12: Tests de integración RLS

**Files:**
- Test: `src/test/guardias-rls.integration.test.ts` (patrón exacto de `src/test/contactos-rls.integration.test.ts`)

- [ ] Casos: asesor NO lee `configuracion`, NO lee `propiedades_internas` (ni sabe que existe), NO lee `lead_escalamientos`, NO escribe `guardias`; asesor SÍ lee `guardias`; admin SÍ todo; «Tomar lead» concurrente: dos asesores, solo uno gana el CAS.
- [ ] Run suite completa: `npx vitest run` → PASS. Commit — `test: integracion RLS de guardias`

---

### Task 13: Checklist de salida a producción (manual, coordinado con el usuario)

- [ ] Crear cuenta/API key de **Resend** (paso del usuario) y cargar `RESEND_API_KEY` + `CRON_SECRET_ESCALAMIENTO` en Vercel — ⚠️ memoria `gotcha-vercel-env-powershell`: cargar secrets con `printf` desde bash, NUNCA pipe de PowerShell.
- [ ] Aplicar 0014 a PROD (memoria `entornos-dev-prod` — proyecto de Supabase de producción).
- [ ] pg_cron en PROD (patrón de `easybroker-sync-15min`, secret desde Vault):

```sql
select cron.schedule('escalamiento-5min', '*/5 * * * *', $$
  select net.http_get(
    url := 'https://<url-prod>/api/cron/escalamiento',
    headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret_escalamiento'))
  );
$$);
```

- [ ] Configurar en la UI: dueño, correo del dueño, umbral VIP, horarios reales de Montana; capturar el rol del mes.
- [ ] Prueba E2E en prod: lead de staging EB → asignación + push; dejar uno sin contestar 15 min → recordatorio.
