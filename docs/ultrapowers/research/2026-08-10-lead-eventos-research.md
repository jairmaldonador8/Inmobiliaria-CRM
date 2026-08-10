# Research Brief: Historia de eventos del lead

Fecha: 2026-08-10 · Spec: `../specs/2026-08-10-lead-eventos-design.md`

## Contexto

Tabla append-only `lead_eventos` con captura híbrida (trigger en `leads` + helper en código), backfill, timeline y métricas v1. Dos frentes investigados: (A) Supabase/Postgres para el trigger, el blindaje append-only y las agregaciones; (B) convenciones del repo, incluido el Next.js 16.2 no-estándar.

## Hallazgos clave — Supabase/Postgres

1. **Actor en triggers**: `auth.uid()` funciona dentro de funciones trigger originadas en requests del API (lee `request.jwt.claims->>'sub'`); bajo service role o conexión directa devuelve **null** → null = sistema, tal como está en el spec. No hay que pasar el actor a mano en el camino trigger.
2. **DEFINER, no INVOKER**: con SECURITY INVOKER el insert del trigger a `lead_eventos` tendría que pasar las policies de la app como `authenticated` — y un rechazo **tumbaría el write original a `leads`**. La función va `SECURITY DEFINER`, owner `postgres` (bypassrls y owner de las tablas), `set search_path = ''`, referencias schema-calificadas, `revoke execute from public, anon, authenticated`, fuera de schemas expuestos. (Los triggers no requieren EXECUTE del invocador.)
3. **Append-only en 3 capas**: (1) RLS con policies solo select/insert (deny por default), (2) revoke de update/delete a `authenticated` (patrón 0013/0014), (3) trigger `BEFORE UPDATE OR DELETE → RAISE EXCEPTION` que frena también al service role (patrón 2ndQuadrant audit-trigger). **El repo ya tiene precedente exacto**: `seguimientos_bloquea_update_delete` (0006) — replicar.
4. **Mediana**: `percentile_cont(0.5) within group (order by ...)` acepta `interval` nativo y devuelve `interval`. La métrica de primera respuesta se calcula sobre `ocurrido_en` (timestamptz), sin tocar payload — sin gotchas jsonb.
5. **PostgREST**: `.insert().select()` exige policy de SELECT en la tabla escrita (`leads`, ya existe); irrelevante para `lead_eventos` con el trigger en DEFINER.

## Hallazgos clave — Repo

1. **Next.js 16.2.12** (docs locales en `node_modules/next/dist/docs/01-app/`): «Server Functions», `params` es Promise (`await params`, el repo ya lo hace), middleware renombrado a **proxy** (`src/proxy.ts`). Existe el modelo nuevo Cache Components (`'use cache'`, `updateTag`, `refresh`) **pero el repo NO lo habilita** → seguir el modelo previo: `revalidatePath()` tras mutaciones, como todo el código existente. No mezclar modelos.
2. **Server actions de la casa**: `'use server'` arriba, solo exports async (constantes exportadas tumban la página); auth con `requireAsesor()`/`usuarioActual()`; **cliente de sesión** (`@/lib/supabase/server`) — nunca service role en actions, RLS es la frontera; retorno `{ ok: true } | { error: string }`; escrituras secundarias best-effort con `console.error`. `registrarEvento()` debe vivir en **módulo normal sin `'use server'`** para ser importable desde actions y cron, y **recibir el `SupabaseClient` por parámetro** (patrón `procesarEscalamientos`).
3. **Cron/escalamiento**: `procesarEscalamientos(supabase, ahora)` puro, invocado por `api/cron/escalamiento` con `createAdminClient()` → los eventos de supervisión entran bajo service role (actor null). Idempotencia por INSERT + UNIQUE (23505 = ya hecho).
4. **Migraciones**: `supabase/migrations/NNNN_nombre.sql`, sigue la **0016**; se aplican con `node scripts/aplicar-migracion.mjs <archivo>` (DEV por default, `--prod` para producción). Tests de integración: `npm run test:rls` (vitest, `.env.local` → DEV), clientes por rol creados a mano con seeds `admin@montana.test`/`asesor1@`/`asesor2@` + `Password123!`, `svc` con secret key. Denegación de SELECT por RLS = filas vacías, no error. Con el bloqueo de update/delete, los fixtures de eventos **no se pueden borrar** en teardown (mismo trade-off ya documentado con seguimientos).
5. **UI**: detalle de lead asesor es **slate/white** (no Fintech Muro; F2-F4 pendientes) y ya tiene el molde `TimelineSeguimientos` + `formatDistanceToNow` locale `es`. Dashboard admin tiene **dos árboles JSX** (móvil Fintech Muro / escritorio clásico) → el panel de métricas se agrega en ambos; consultas como funciones puras `(SupabaseClient, ahora?)` en `src/lib/dashboard/consultas.ts`, fechas con `src/lib/fechas/monterrey.ts`.

## Desviaciones del spec (decididas con base en hallazgos)

- **Timeline estilo `TimelineSeguimientos` (slate/white)**, no kit Fintech Muro: consistencia con la página donde vive; se re-estiliza cuando F2-F4 alcancen esa pantalla.
- **Tercera capa de blindaje** (trigger RAISE EXCEPTION en update/delete) agregada al diseño de la migración, replicando 0006.
- La migración será la **0016**; el backfill respeta borra-e-inserta **solo si** el trigger de bloqueo lo permite → el bloqueo debe exceptuar el delete del backfill o el backfill corre ANTES de instalar el bloqueo en la misma migración (decisión de plan: backfill dentro de la 0016, bloqueo al final).

## Fuentes

- github.com/orgs/supabase/discussions/22769 — `auth.uid()` en triggers; null bajo service role.
- supabase.com/docs/guides/database/functions — DEFINER: search_path vacío, revoke execute.
- supabase.com/docs/guides/database/postgres/row-level-security — deny por default; bypassrls.
- postgresql.org/docs/current/ddl-rowsecurity.html — owner/superuser bypasean salvo FORCE.
- postgresql.org/docs/current/functions-aggregate.html — `percentile_cont` con `interval`.
- github.com/2ndQuadrant/audit-trigger — patrón RAISE EXCEPTION.
- Repo: `node_modules/next/dist/docs/01-app/` (v16.2.12), `0006_seguimientos_hardening.sql`, `escalamiento.ts`, `acciones-asesor.ts`, `rls.integration.test.ts`, `scripts/aplicar-migracion.mjs`.
