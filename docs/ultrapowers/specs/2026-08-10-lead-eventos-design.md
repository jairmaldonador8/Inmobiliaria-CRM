# Spec: Historia de eventos del lead (`lead_eventos`)

Fecha: 2026-08-10 · Estado: aprobado en conversación, pendiente revisión final del usuario

## Contexto y objetivo

Hoy la historia de un lead está regada: `seguimientos` (notas manuales), `lead_escalamientos` (pasos del cron), timestamps sueltos (`creado_en`, `asignado_en`) — y muchos hechos no se registran en ningún lado (cambios de etapa, pushes, tomas de bandeja). Lo que no se captura hoy se pierde para siempre.

Objetivo: una tabla append-only `lead_eventos` que registre todo lo que le pasa a cada lead, una línea de tiempo en el detalle del lead para verla, y un primer panel de métricas para que el admin entienda cómo van los leads. Es el cimiento de datos del expediente (roca 3) y de las métricas de dirección (roca 5).

Decisión previa (2026-08-10): multi-tenant diferido; este diseño es single-tenant como todo el sistema actual.

## Alcance

1. Tabla `lead_eventos` + RLS append-only + grants.
2. Captura híbrida: triggers para cambios de la fila `leads`, código para acciones de negocio.
3. Backfill de la historia reconstruible desde datos existentes.
4. Línea de tiempo en el detalle del lead (asesor y admin).
5. Panel «Cómo van los leads» en el dashboard admin (métricas v1 sobre eventos).

### Fuera de alcance

- Multi-tenant / `agencia_id`.
- Expediente completo del lead (roca 3): la timeline es solo la primera pieza.
- Analíticas profundas (cohortes, comparativas por asesor, exportes): siguiente fase, ya con datos acumulándose.
- Eventos de propiedades (esto es solo leads).

## Esquema

```sql
create table public.lead_eventos (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  tipo text not null check (tipo in (
    -- triggers (fila leads)
    'lead_creado','lead_asignado','lead_reasignado','etapa_cambiada',
    'lead_archivado','lead_desarchivado',
    -- código (acciones de negocio)
    'seguimiento_registrado','whatsapp_enviado','whatsapp_desenlace',
    'visita_agendada','visita_realizada','visita_cancelada',
    'tomado_de_bandeja',
    -- código, solo admin (supervisión)
    'escalamiento_paso','push_recordatorio'
  )),
  actor_id uuid references public.usuarios(user_id),  -- null = sistema (sync/cron)
  payload jsonb not null default '{}'::jsonb,
  ocurrido_en timestamptz not null default now()
);
create index on public.lead_eventos (lead_id, ocurrido_en desc);
create index on public.lead_eventos (tipo, ocurrido_en desc);  -- para métricas
```

- `tipo` como text + check, mismo criterio que `lead_escalamientos` (0014). Agregar un tipo = ampliar el check en migración.
- `payload` por tipo: `lead_creado` → `{fuente, fuente_detalle?, propiedad_id?}` (lo pone el trigger desde la fila nueva; el backfill igual); `etapa_cambiada` → `{de, a}`; `lead_asignado`/`reasignado` → `{de, a}`; `escalamiento_paso` → `{paso}` (incluye el correo al dueño del paso `dueno_120` — el correo no es un evento aparte: es parte del paso); `whatsapp_desenlace` → `{desenlace}`; eventos de backfill → `{..., backfill: true}`.
- No existe `correo_enviado`: hoy el único correo del sistema es el de escalamiento al dueño (supervisión, no contacto con el lead). Si algún día hay correo al lead, se agrega el tipo en su propia migración.

### Append-only (garantía dura)

- RLS habilitado. Policies: **solo** `select` e `insert`; ninguna de `update`/`delete` (deny por default).
- Grants (criterio 0013/0014): revoke all primero; conceder solo `select, insert` a `authenticated`. Ni siquiera con un bug de policy se puede editar/borrar desde la app.

### Visibilidad (RLS de select)

- **Admin**: todo.
- **Asesor**: eventos de leads que ya puede ver (mismo predicado que la RLS de `leads`), **excluyendo** los tipos de supervisión (`escalamiento_paso`, `push_recordatorio`). Mismo criterio que `propiedades_internas`: herramienta de dirección, invisible al asesor.
- Insert: `authenticated` puede insertar solo eventos de tipos no-supervisión sobre leads que ve; los de supervisión y los del sync/cron entran por service role o trigger.

## Captura híbrida (sin traslapes)

**Triggers** — dueños de los cambios de la fila `leads`. Un trigger `after insert or update on leads` (función `security definer`) emite: `lead_creado`, `lead_asignado`/`lead_reasignado` (cambio de `asesor_id`), `etapa_cambiada` (cambio de `etapa`), `lead_archivado`/`lead_desarchivado` (cambio de `archivado`). Actor: `auth.uid()` si existe; null (sistema) bajo service role. Imposible que un punto de escritura nuevo «se olvide» de anotar estos.

**Código** — dueño de las acciones de negocio. Helper único `registrarEvento(leadId, tipo, payload, actorId?)` en `src/lib/eventos/registrar.ts`, llamado desde los puntos existentes:

| Punto de escritura | Evento(s) |
|---|---|
| `src/lib/leads/acciones.ts`, `acciones-asesor.ts` | `seguimiento_registrado`, `tomado_de_bandeja` |
| `src/lib/contactos/acciones.ts` | `whatsapp_enviado`, `whatsapp_desenlace` |
| `src/lib/guardias/escalamiento.ts` | `escalamiento_paso`, `push_recordatorio` |
| `src/lib/visitas/acciones.ts` | `visita_agendada`, `visita_realizada`, `visita_cancelada` |
| `src/lib/leads/avance-automatico.ts` | (nada: la etapa la anota el trigger) |
| `src/lib/easybroker/sync.ts` | (nada: creación/asignación las anota el trigger) |

Regla: el registro del evento **no debe tumbar la acción principal** — si `registrarEvento` falla, se loggea y la acción sigue.

Caso conocido: al tomar un lead de la bandeja, el código emite `tomado_de_bandeja` y el trigger, al ver el cambio de `asesor_id`, emite además `lead_asignado`. **Ambos son intencionales** (uno es la acción, otro el cambio de ficha); la timeline colapsa el par — si hay un `tomado_de_bandeja` del mismo lead y actor dentro del mismo minuto, el `lead_asignado` no se muestra.

## Backfill

Migración (o script one-off con service role) que reconstruye lo reconstruible, todo con `payload.backfill = true` y `ocurrido_en` = el timestamp original:

- `leads.creado_en` → `lead_creado`; `leads.asignado_en` → `lead_asignado`.
- `seguimientos` → `seguimiento_registrado` (actor = `autor_id`).
- `lead_escalamientos` → `escalamiento_paso`.
- `visitas` → `visita_agendada`/`realizada`/`cancelada` según estado.
- `contactos_whatsapp` → `whatsapp_enviado` (+ desenlace si ya quedó registrado).

Idempotente (re-ejecutable sin duplicar): estrategia **borra-e-inserta** — cada corrida elimina todos los eventos con `payload->>'backfill' = 'true'` y los regenera. Cambios de etapa históricos: irrecuperables, se asume.

## Línea de tiempo (UI)

En el detalle del lead — `src/app/(asesor)/asesor/leads/[id]/page.tsx` y `src/app/(admin)/admin/leads/[id]/page.tsx` — sección nueva al final: lista vertical (icono + texto en español + fecha relativa), últimos 50 eventos, server component, estilo kit Fintech Muro. Sin filtros ni paginación en esta fase. Textos: «Llegó desde portal», «Se asignó a Karla», «Pasó a negociación», «Se le envió WhatsApp». El asesor no ve los eventos de supervisión (lo garantiza la RLS, no la UI).

## Panel «Cómo van los leads» (métricas v1, admin)

Sección en el dashboard admin (junto a «Leads en riesgo»), consultas en `src/lib/dashboard/consultas.ts`:

1. **Embudo por etapa**: leads activos en cada etapa (fuente: `leads`, no requiere eventos).
2. **Tiempo de primera respuesta**: mediana de `lead_asignado` → primer evento de contacto (`whatsapp_enviado` o `seguimiento_registrado`) por semana. Fuente: `lead_eventos`. Los eventos de supervisión (escalamientos, recordatorios) NO cuentan como contacto.
3. **Leads nuevos por fuente** (últimos 30 días): fuente: `lead_eventos.lead_creado` + payload.
4. **Actividad de la semana**: conteo de eventos de contacto por día (los últimos 7 días).

Nota honesta en la UI: las métricas basadas en eventos maduran conforme se acumula historia; el backfill da un arranque parcial.

## Pruebas

- Integración (patrón `*.integration.test.ts` existente, contra DEV):
  - El trigger anota creado/asignado/etapa/archivado, con actor correcto (uid vs sistema).
  - RLS: `update`/`delete` fallan incluso como admin; asesor no ve tipos de supervisión ni eventos de leads ajenos; asesor no puede insertar tipos de supervisión.
  - Backfill idempotente.
- Unit: `registrarEvento` no propaga errores (la acción principal sobrevive).
- Verificación en navegador (regla de la casa): mover un lead de etapa y ver el evento aparecer en la timeline; panel de métricas con datos de DEV.

## Criterios de éxito

1. Cualquier cambio de ficha o acción de negocio sobre un lead queda registrado sin intervención manual.
2. Nadie — ni admin, ni un bug de la app — puede editar o borrar un evento.
3. El detalle del lead muestra la historia legible en español.
4. El admin responde desde el dashboard: ¿cuántos leads hay por etapa?, ¿qué tan rápido contestamos?, ¿de dónde llegan?, ¿cuánta actividad hubo esta semana?
5. La historia previa reconstruible quedó backfilleada y marcada como tal.
