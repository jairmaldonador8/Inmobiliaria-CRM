# Fase C — Escalamiento v2: rondas en digest + panel «Leads en riesgo» — Spec y plan

> **For agentic workers:** REQUIRED SUB-SKILL: ultrapowers:executing-plans. Aprobado por Jair y el dueño el 2026-08-09 (conversación directa; este doc ES el spec). Base: Fase B en producción (`docs/ultrapowers/plans/2026-08-09-fase-b-guardias.md` — leer su «Contexto del repo», sigue vigente).

**Goal:** Que el lead sin contestar insista (rondas repetidas en digest) hasta las 2h, y que a partir de ahí la dirección tenga un panel accionable en su dashboard.

## Decisiones de producto (tomadas con Jair)

1. **Recordatorios al asesor responsable**: cada `recordatorio` min (15 default), repetidos, EN DIGEST (un push con todos sus leads pendientes: «2 leads sin atender: Ana 45 min, Luis 15 min»), hasta el umbral del dueño (120).
2. **Escalamiento abierto**: cada `abierto` min (30 default), repetido — re-broadcast a TODOS los asesores activos en digest («2 leads disponibles — el primero que los tome se los queda»), hasta el umbral del dueño. «Tomar lead» sin cambios (CAS, el primero gana).
3. **A las 2h el problema cambia de manos**: paso al dueño (correo+push, como hoy) Y el lead aparece en el panel «Leads en riesgo» del dashboard admin con 3 acciones: **WhatsApp al asesor** (wa.me prellenado con `usuarios.telefono`), **reasignar** (inline, reusa `reasignarLead`), **ver lead**. Después de 120 ya NO hay más rondas a asesores.
4. **VIP sin cambios**: un solo recordatorio al dueño (no spamearlo; su panel ya lo muestra).
5. La cultura del «se lo pueden quitar» se sostiene con lo que ya existe: seguimiento de sistema registra cada toma. (Futuro, NO ahora: reporte semanal de primera respuesta por asesor.)

## Diseño técnico

- **Migración 0015**: en `lead_escalamientos`, reemplazar el CHECK de `paso` por uno que acepte rondas: `recordatorio_r[0-9]+`, `abierto_r[0-9]+`, `dueno_120`, `recordatorio_vip`. La tabla está VACÍA en prod y dev (rol aún sin capturar) → rename limpio, sin datos legacy. UNIQUE(lead_id, paso) sigue siendo la idempotencia.
- **Rondas por edad** (en `escalamiento.ts`): para un lead de edad E min, las rondas debidas de recordatorio son r1..rN con N = cuantas veces cabe `recordatorio` en min(E, dueno-1); ídem abierto con su intervalo. Se registra CADA ronda vencida (cron caído se pone al día) pero el digest se manda UNA vez por corrida.
- **Digest por corrida**: acumular por destinatario y mandar un solo push+campanita por asesor (sus recordatorios) y un solo push+campanita por asesor activo (los abiertos). El texto lista nombre + minutos.
- **`tomarLead` / elegibilidad**: `leadEnEscalamientoAbierto` cambia de `.eq('paso','abierto_30')` a `.like('paso','abierto_r%')`.
- **Panel «Leads en riesgo»** (`src/app/(admin)/admin/page.tsx` + componentes en `src/components/guardias/`): leads `etapa=nuevo`, no archivados, con paso `dueno_120`, sin respuesta manual → card por lead: nombre, minutos, asesor responsable (nombre+teléfono); acciones: wa.me, selector inline de reasignación (`reasignarLead` existente), link al lead. Solo-admin (dashboard admin).

## Tasks

- [ ] **1. Migración 0015** (`supabase/migrations/0015_escalamiento_rondas.sql`): drop constraint del CHECK viejo + nuevo CHECK con regex de rondas. Aplicar a DEV con `node scripts/aplicar-migracion.mjs`; a PROD al final (es compatible: el motor viejo escribe 'dueno_120'/'recordatorio_vip' que siguen pasando… los pasos 'recordatorio_15'/'abierto_30' viejos YA NO — por eso 0015 se aplica a PROD JUNTO con el deploy, o antes solo si el rol sigue sin capturar).
- [ ] **2. Motor de rondas + digest** (`src/lib/guardias/escalamiento.ts` + reescritura de `src/test/guardias-escalamiento.test.ts`): casos — rondas acumuladas tras cron caído; digest único por corrida y por destinatario; nada después de 120; VIP igual que antes; idempotencia por ronda; respuesta manual detiene todo.
- [ ] **3. Elegibilidad abierta por rondas** (`consultas.ts` `.like('paso','abierto_r%')` + test en tomar-lead).
- [ ] **4. Consulta de leads en riesgo** (`src/lib/guardias/consultas.ts`: `leadsEnRiesgo(supabase)` — join con usuarios para nombre/teléfono del asesor) + tests.
- [ ] **5. Panel UI en dashboard admin** (sección nueva; acciones wa.me + reasignar inline + ver lead). Skill `fintech-muro-ui`. Verificar EN NAVEGADOR (playwright, patrón Fase B: login admin@montana.test en DEV).
- [ ] **6. Suite completa + integración** (`npm test`, `npm run test:rls`).
- [ ] **7. Deploy**: 0015 a PROD + push a main + corrida manual del cron (patrón Fase B, net.http_get con secret del Vault → esperar 200 ok:true).
