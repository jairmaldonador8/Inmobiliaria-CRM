# Historia de eventos del lead — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use ultrapowers:subagent-driven-development (recommended) or ultrapowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tabla append-only `lead_eventos` con captura híbrida (trigger en `leads` + `registrarEvento()` en acciones), backfill, timeline en el detalle del lead y panel «Cómo van los leads» en el dashboard admin.

**Architecture:** Trigger AFTER en `leads` (SECURITY DEFINER, schema `private`) anota cambios de ficha; las acciones de negocio emiten eventos semánticos vía helper best-effort con cliente inyectado. Append-only en 3 capas (RLS solo select/insert + revoke + trigger RAISE EXCEPTION, patrón 0002/0006). Lectura: consultas puras `(SupabaseClient, ...)` estilo `src/lib/dashboard/consultas.ts`, agregación en JS.

**Tech Stack:** Next.js 16.2 App Router (modelo SIN cacheComponents → `revalidatePath`), supabase-js con cliente de sesión en actions / admin en cron, vitest (`npm run test:rls` contra DEV), Tailwind slate/white en detalle + kit Fintech Muro solo en árbol móvil del dashboard.

**Referencias:** Spec `docs/ultrapowers/specs/2026-08-10-lead-eventos-design.md` · Research `docs/ultrapowers/research/2026-08-10-lead-eventos-research.md` · Skills: `supabase:supabase`, `ultrapowers-dev:supabase-patterns`, `ultrapowers-dev:sql-best-practices`, `fintech-muro-ui` (solo Task 9 móvil).

**Preferencias:** auto-commit ON (commit al cerrar cada task), auto-push OFF.

**Precisiones sobre el spec (del research, no cambian el diseño):**
- `seguimiento_registrado` se emite SOLO desde `registrarSeguimiento` (`src/lib/seguimientos/acciones.ts`) — las demás acciones que insertan seguimientos-de-sistema (visitas, whatsapp, cierre) emiten su evento semántico propio; así no hay dobles.
- El actor del camino trigger es `auth.uid()` (null = sistema/service-role) — verificado contra docs Supabase.
- Mediana de primera respuesta en JS (ordenar y tomar el centro), no RPC: consistente con la casa; `percentile_cont` queda como optimización futura.
- Timeline con estilo de `TimelineSeguimientos` (slate/white), NO Fintech Muro: la página donde vive aún no está rediseñada.

---

### Task 1: Migración 0016 — tabla, RLS, triggers y backfill

**Files:**
- Create: `supabase/migrations/0016_lead_eventos.sql`

- [ ] **Step 1: Escribir la migración completa**

```sql
-- Migracion 0016: lead_eventos — historia append-only del lead.
-- Spec: docs/ultrapowers/specs/2026-08-10-lead-eventos-design.md
-- 3 capas append-only (patron 0002 seguimientos + 0013/0014 grants):
-- RLS solo select/insert, revoke update/delete, trigger RAISE EXCEPTION.

create table public.lead_eventos (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  tipo text not null check (tipo in (
    'lead_creado','lead_asignado','lead_reasignado','etapa_cambiada',
    'lead_archivado','lead_desarchivado',
    'seguimiento_registrado','whatsapp_enviado','whatsapp_desenlace',
    'visita_agendada','visita_realizada','visita_cancelada',
    'tomado_de_bandeja',
    'escalamiento_paso','push_recordatorio'
  )),
  actor_id uuid references public.usuarios(user_id),  -- null = sistema
  payload jsonb not null default '{}'::jsonb,
  ocurrido_en timestamptz not null default now()
);
create index on public.lead_eventos (lead_id, ocurrido_en desc);
create index on public.lead_eventos (tipo, ocurrido_en desc);

-- ===== Capa 1: RLS (solo select/insert; update/delete deny por default) =====
alter table public.lead_eventos enable row level security;

create policy lead_eventos_select_admin on public.lead_eventos
  for select to authenticated using (private.is_admin());

-- Asesor: eventos de sus leads, sin tipos de supervision.
create policy lead_eventos_select_asesor on public.lead_eventos
  for select to authenticated using (
    tipo not in ('escalamiento_paso','push_recordatorio')
    and exists (
      select 1 from public.leads l
      where l.id = lead_eventos.lead_id and l.asesor_id = (select auth.uid())
    )
  );

-- Insert desde la app: actor real, sin tipos de supervision, lead visible.
create policy lead_eventos_insert_app on public.lead_eventos
  for insert to authenticated with check (
    actor_id = (select auth.uid())
    and tipo not in ('escalamiento_paso','push_recordatorio',
                     'lead_creado','lead_asignado','lead_reasignado',
                     'etapa_cambiada','lead_archivado','lead_desarchivado')
    and (
      private.is_admin()
      or exists (
        select 1 from public.leads l
        where l.id = lead_eventos.lead_id and l.asesor_id = (select auth.uid())
      )
    )
  );
-- Nota: los tipos de trigger tampoco son insertables por la app — solo el
-- trigger DEFINER los escribe. Supervision entra por service role (cron).

-- ===== Capa 2: grants (patron 0013/0014 revoke-then-grant + columnas 0006) =====
revoke all on public.lead_eventos from anon, authenticated;
grant select on public.lead_eventos to authenticated;
grant insert (lead_id, tipo, actor_id, payload)
  on public.lead_eventos to authenticated;  -- id/ocurrido_en server-managed

-- ===== Trigger de captura en leads (SECURITY DEFINER, patron research) =====
create or replace function private.leads_anota_eventos()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();  -- null bajo service role = sistema
begin
  if tg_op = 'INSERT' then
    insert into public.lead_eventos (lead_id, tipo, actor_id, payload)
    values (new.id, 'lead_creado', v_actor, jsonb_strip_nulls(jsonb_build_object(
      'fuente', new.fuente, 'fuente_detalle', new.fuente_detalle,
      'propiedad_id', new.propiedad_id)));
    if new.asesor_id is not null then
      insert into public.lead_eventos (lead_id, tipo, actor_id, payload)
      values (new.id, 'lead_asignado', v_actor,
              jsonb_build_object('de', null, 'a', new.asesor_id));
    end if;
    return new;
  end if;

  if new.asesor_id is distinct from old.asesor_id then
    insert into public.lead_eventos (lead_id, tipo, actor_id, payload)
    values (new.id,
      case when old.asesor_id is null then 'lead_asignado' else 'lead_reasignado' end,
      v_actor, jsonb_build_object('de', old.asesor_id, 'a', new.asesor_id));
  end if;
  if new.etapa is distinct from old.etapa then
    insert into public.lead_eventos (lead_id, tipo, actor_id, payload)
    values (new.id, 'etapa_cambiada', v_actor,
            jsonb_build_object('de', old.etapa, 'a', new.etapa));
  end if;
  if new.archivado is distinct from old.archivado then
    insert into public.lead_eventos (lead_id, tipo, actor_id, payload)
    values (new.id,
      case when new.archivado then 'lead_archivado' else 'lead_desarchivado' end,
      v_actor, '{}'::jsonb);
  end if;
  return new;
end;
$$;
revoke execute on function private.leads_anota_eventos() from public, anon, authenticated;

drop trigger if exists leads_anota_eventos on public.leads;
create trigger leads_anota_eventos
  after insert or update on public.leads
  for each row execute function private.leads_anota_eventos();

-- ===== Backfill (ANTES de instalar el bloqueo; idempotente) =====
-- Re-ejecutable: si el bloqueo ya existia (re-corrida), se quita primero.
drop trigger if exists lead_eventos_bloquea_update_delete on public.lead_eventos;
delete from public.lead_eventos where payload->>'backfill' = 'true';

insert into public.lead_eventos (lead_id, tipo, actor_id, payload, ocurrido_en)
select id, 'lead_creado', null, jsonb_strip_nulls(jsonb_build_object(
    'fuente', fuente, 'fuente_detalle', fuente_detalle,
    'propiedad_id', propiedad_id, 'backfill', 'true')), creado_en
from public.leads;

insert into public.lead_eventos (lead_id, tipo, actor_id, payload, ocurrido_en)
select id, 'lead_asignado', null,
       jsonb_build_object('a', asesor_id, 'backfill', 'true'), asignado_en
from public.leads where asesor_id is not null and asignado_en is not null;

insert into public.lead_eventos (lead_id, tipo, actor_id, payload, ocurrido_en)
select lead_id, 'seguimiento_registrado', autor_id,
       jsonb_build_object('tipo', tipo, 'seguimiento_id', id, 'backfill', 'true'),
       creado_en
from public.seguimientos;

insert into public.lead_eventos (lead_id, tipo, actor_id, payload, ocurrido_en)
select lead_id, 'escalamiento_paso', null,
       jsonb_build_object('paso', paso, 'backfill', 'true'), ejecutado_en
from public.lead_escalamientos;

insert into public.lead_eventos (lead_id, tipo, actor_id, payload, ocurrido_en)
select v.lead_id,
       case v.estado when 'realizada' then 'visita_realizada'
                     when 'cancelada' then 'visita_cancelada'
                     else 'visita_agendada' end,
       null, jsonb_build_object('visita_id', v.id, 'backfill', 'true'), v.creada_en
from public.visitas v;

insert into public.lead_eventos (lead_id, tipo, actor_id, payload, ocurrido_en)
select lead_id, 'whatsapp_enviado', autor_id,
       jsonb_build_object('contacto_id', id, 'backfill', 'true'), creado_en
from public.contactos_whatsapp;

insert into public.lead_eventos (lead_id, tipo, actor_id, payload, ocurrido_en)
select lead_id, 'whatsapp_desenlace', autor_id,
       jsonb_build_object('contacto_id', id, 'desenlace', resultado, 'backfill', 'true'),
       resuelto_en
from public.contactos_whatsapp
where resultado <> 'pendiente' and resuelto_en is not null;

-- ===== Capa 3: inmutable incluso para service role (patron 0002) =====
create or replace function private.lead_eventos_inmutable()
returns trigger
language plpgsql
as $$
begin
  raise exception 'lead_eventos es inmutable';
end;
$$;
create trigger lead_eventos_bloquea_update_delete
  before update or delete on public.lead_eventos
  for each row execute function private.lead_eventos_inmutable();
```

> Columnas ya verificadas contra 0001/0013 por el revisor del plan: `contactos_whatsapp(resultado, resuelto_en, autor_id, creado_en)` y `visitas.creada_en` (con «a») son los nombres reales — el SQL de arriba está listo para aplicarse tal cual.

- [ ] **Step 2: Aplicar a DEV**

Run: `node scripts/aplicar-migracion.mjs supabase/migrations/0016_lead_eventos.sql`
Expected: éxito sin errores.

- [ ] **Step 3: Smoke SQL** — con el mismo mecanismo del script (o test rápido): `select tipo, count(*) from lead_eventos group by tipo` debe mostrar los tipos backfilleados (`lead_creado` ≥ nº de leads).

- [ ] **Step 4: Commit** *(auto-commit ON)* — `git add supabase/migrations/0016_lead_eventos.sql && git commit -m "feat: migracion 0016 lead_eventos (tabla append-only, trigger de captura y backfill)"`

### Task 2: Tests de integración de la capa de datos

**Files:**
- Create: `src/test/lead-eventos.integration.test.ts`
- Modify: `src/test/guardias-rls.integration.test.ts` (~línea 151) y `src/test/contactos-rls.integration.test.ts` (~línea 162)

- [ ] **Step 0: Arreglar teardowns rotos por la 0016** — con la migración aplicada, TODO lead es imborrable (su `lead_creado` en cascada choca con el bloqueo de `lead_eventos`), y esos dos archivos borran leads fixture en `afterAll` (supabase-js devuelve `{error}` sin lanzar → fuga silenciosa de fixtures en DEV; en guardias además falla el delete de `propiedades` encadenado). Cambiarlos al patrón archivar de `src/test/easybroker-sync.integration.test.ts:223` (`update({ archivado: true, propiedad_id: null })` — el `propiedad_id: null` desengancha la propiedad para que el delete de `propiedades` fixture que sigue SÍ funcione), y **asertar** que ese update no devolvió error.

- [ ] **Step 1: Escribir tests** (patrón exacto de `src/test/rls.integration.test.ts`: clientes `svc` + `admin@montana.test` + `asesor1@`/`asesor2@` con `Password123!`, seeds existentes; fixtures nombradas `TEST-EVT-%`; recordar que las filas de eventos NO se pueden borrar en teardown — archivar el lead fixture, patrón documentado en ese archivo). Casos:
  1. Insert de lead (svc) → aparece `lead_creado` con payload.fuente; update de `etapa` → `etapa_cambiada {de,a}`; asignar asesor → `lead_asignado`; actor_id null bajo svc.
  2. Update de etapa con cliente asesor autenticado → evento con `actor_id` = uid del asesor.
  3. `update`/`delete` sobre `lead_eventos` como svc → error `lead_eventos es inmutable`; como asesor → error/0 filas.
  4. Asesor NO ve eventos de leads ajenos (select vacío) ni tipos de supervisión en los suyos (insertar `escalamiento_paso` vía svc y verificar que el asesor no lo lista, admin sí).
  5. Asesor NO puede insertar `escalamiento_paso` ni `etapa_cambiada` directo (policy lo rechaza).

- [ ] **Step 2: Correr** — `npm run test:rls -- lead-eventos` → PASS (5 tests).

- [ ] **Step 3: Commit** *(auto-commit ON)*

### Task 3: Helper `registrarEvento`

**Files:**
- Create: `src/lib/eventos/registrar.ts` (módulo normal, SIN `'use server'` — lo importan actions y cron)
- Create: `src/lib/eventos/registrar.test.ts` (unit, vitest normal `npm test`)

- [ ] **Step 1: Test primero** — con un stub de `SupabaseClient` (patrón de los tests de `dashboard/consultas`): (a) inserta la fila correcta en `lead_eventos`; (b) si el insert devuelve `error`, NO lanza — resuelve y `console.error` fue llamado.

- [ ] **Step 2: Implementación mínima**

```ts
import type { SupabaseClient } from '@supabase/supabase-js'

export type TipoEventoApp =
  | 'seguimiento_registrado' | 'whatsapp_enviado' | 'whatsapp_desenlace'
  | 'visita_agendada' | 'visita_realizada' | 'visita_cancelada'
  | 'tomado_de_bandeja' | 'escalamiento_paso' | 'push_recordatorio'

/**
 * Best-effort: la accion principal NUNCA falla por no poder anotar el evento
 * (misma semantica que los seguimientos-de-sistema de la casa).
 * actorId null = sistema (cron/service role).
 */
export async function registrarEvento(
  supabase: SupabaseClient, leadId: string, tipo: TipoEventoApp,
  payload: Record<string, unknown> = {}, actorId: string | null = null
): Promise<void> {
  const { error } = await supabase
    .from('lead_eventos')
    .insert({ lead_id: leadId, tipo, actor_id: actorId, payload })
  if (error) console.error(`registrarEvento(${tipo}) fallo:`, error.message)
}
```

- [ ] **Step 3: Correr unit tests** → PASS. **Step 4: Commit** *(auto-commit ON)*

### Task 4: Instrumentar acciones de negocio

**Files (modificar; leer cada función antes de tocar):**
- `src/lib/seguimientos/acciones.ts` → en `registrarSeguimiento` (tras insert exitoso): `registrarEvento(supabase, leadId, 'seguimiento_registrado', { tipo }, usuario.user_id)`
- `src/lib/contactos/acciones.ts` → `registrarSalidaWhatsapp`: `whatsapp_enviado { contacto_id }`; `resolverContacto` Y el camino auto-`sin_reporte`: `whatsapp_desenlace { contacto_id, desenlace }`
- `src/lib/visitas/acciones.ts` → `agendarVisita`/`reagendarVisita`: `visita_agendada { visita_id }` (reagendar con `{ reagendada: true }`); `marcarVisitaRealizada`: `visita_realizada`; `cancelarVisita`: `visita_cancelada`
- `src/lib/leads/acciones.ts` → `tomarLead`: `tomado_de_bandeja` (el trigger emitirá además `lead_asignado` — intencional, la UI colapsa)

Reglas: llamar DESPUÉS de que la escritura principal tuvo éxito; actor = usuario de la acción; NO tocar los `revalidatePath` existentes; no emitir `seguimiento_registrado` desde acciones que insertan seguimientos-de-sistema (visitas/whatsapp/cierre — su evento semántico ya lo cubre; el cambio de etapa lo cubre el trigger).

- [ ] **Step 1: Instrumentar los 4 archivos** · **Step 2:** `npm test` y `npm run test:rls` → PASS (los tests de visitas/contactos existentes no deben romperse; el stub de eventos no aplica — son best-effort) · **Step 3: Commit** *(auto-commit ON)*

### Task 5: Instrumentar escalamiento (cron)

**Files:**
- Modify: `src/lib/guardias/escalamiento.ts` — dentro de `procesarEscalamientos`, tras cada paso registrado con éxito en `lead_escalamientos` (insert sin 23505): `registrarEvento(supabase, leadId, 'escalamiento_paso', { paso })`; tras cada push de recordatorio enviado: `push_recordatorio { paso }`. Actor null (service role).
- Test: extender el test de integración/unit existente de escalamiento (buscar cómo se prueba `procesarEscalamientos`) verificando que el stub/DEV recibe los eventos.

- [ ] **Step 1: Instrumentar** · **Step 2: Tests** → PASS · **Step 3: Commit** *(auto-commit ON)*

### Task 6: Timeline en el detalle del lead

**Files:**
- Create: `src/lib/eventos/consultas.ts` — `eventosDeLead(supabase, leadId): Promise<EventoTimeline[]>`: últimos 50 (`order ocurrido_en desc`), + mapa de nombres (query a `usuarios` con los uuids de `actor_id` ∪ `payload.a/de`); colapso: descartar `lead_asignado` si existe `tomado_de_bandeja` del mismo lead+actor en el mismo minuto.
- Create: `src/lib/eventos/formato.ts` — `etiquetaEvento(tipo, payload, nombres): string` con textos en español («Llegó desde portal», «Se asignó a {nombre}», «Pasó a {etapa}» usando el formato de etapas existente en `src/lib/leads/formato.ts`, «Se le envió WhatsApp», «Visita agendada», …) + icono por tipo (lucide, mapa como `ICONOS_TIPO` de `timeline-seguimientos.tsx`).
- Create: `src/components/eventos/timeline-eventos.tsx` — copiar estructura visual EXACTA de `src/components/seguimientos/timeline-seguimientos.tsx` (ol + línea vertical + `formatDistanceToNow` locale `es`, `suppressHydrationWarning`, empty-state con borde dashed).
- Modify: `src/app/(asesor)/asesor/leads/[id]/page.tsx` y `src/app/(admin)/admin/leads/[id]/page.tsx` — sección nueva «Historia del lead» al final (h2 `text-sm font-semibold text-slate-900`), consulta dentro del `Promise.all` existente con el MISMO cliente de la página (sesión: la RLS filtra supervisión sola para el asesor).
- Test: unit de `formato.ts` (cada tipo → texto) y del colapso en `consultas.ts` (stub).

- [ ] **Step 1: Tests de formato/colapso** · **Step 2: Implementar consulta+componente+integración** · **Step 3:** `npm test` PASS y `npm run build` OK · **Step 4: Commit** *(auto-commit ON)*

### Task 7: Métricas «Cómo van los leads»

**Files:**
- Modify: `src/lib/dashboard/consultas.ts` — 4 funciones nuevas, mismo contrato `(supabase, ahora = new Date())`, fechas con `src/lib/fechas/monterrey.ts`:
  1. `embudoPorEtapa` → `{ etapa, cuenta }[]` de leads activos (tabla `leads`, no archivados).
  2. `medianaPrimeraRespuesta7d` → por cada lead con `lead_asignado` en los últimos 7 días, delta a su primer `whatsapp_enviado`/`seguimiento_registrado` posterior; mediana en JS (ordenar deltas, tomar centro); `null` si no hay datos. Excluir eventos `backfill` no: incluirlos está bien (son historia real).
  3. `leadsPorFuente30d` → conteo por `payload.fuente` de `lead_creado` en 30 días.
  4. `actividadContacto7d` → `number[7]` por día Monterrey de eventos de contacto (patrón exacto de `serieLeads30Dias`).
- Test: unit con stub (patrón de los tests existentes de `dashboard/consultas`), incluyendo mediana con nº par/impar de deltas y lead sin contacto (se ignora).

- [ ] **Step 1: Tests primero** → FAIL · **Step 2: Implementar** → PASS · **Step 3: Commit** *(auto-commit ON)*

### Task 8: Panel en el dashboard admin (ambos árboles)

**Files:**
- Create: `src/components/dashboard/panel-como-van-leads.tsx` — recibe las 4 métricas ya consultadas como props (patrón `PanelLeadsEnRiesgo`); DOS variantes internas o props `variante: 'movil' | 'escritorio'`: móvil con kit `@/components/fintech/` (StatCard/TarjetaGlass — cargar skill `fintech-muro-ui` al implementar), escritorio slate/white clásico.
- Modify: `src/app/(admin)/admin/page.tsx` — consultar las métricas junto a las existentes (mismo cliente y `Promise.all`, best-effort `.catch`), render en el árbol `lg:hidden` Y en `hidden lg:block`.
- Nota UI: si `medianaPrimeraRespuesta7d` es null → «Aún sin datos suficientes»; leyenda pequeña «Las métricas maduran conforme se acumula historia».

- [ ] **Step 1: Implementar** · **Step 2:** `npm run build` OK · **Step 3: Commit** *(auto-commit ON)*

### Task 9: Verificación end-to-end local

- [ ] **Step 1:** Suite completa: `npm test` y `npm run test:rls` → todo PASS.
- [ ] **Step 2:** Verificación en navegador (OBLIGATORIA — regla del proyecto, memoria `verificacion-en-navegador`): `npm run dev` contra DEV; como asesor mover un lead de etapa y registrar un seguimiento → ambos aparecen en «Historia del lead» al instante; como admin abrir el mismo lead → ver además el rastro completo; dashboard admin → panel con datos reales de DEV (móvil y escritorio via viewport).
- [ ] **Step 3:** Commit final si quedó algo suelto. NO push (auto-push OFF).
