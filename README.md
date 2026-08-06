# CRM Inmobiliario — Montana Realty

CRM interno para Montana Realty: bandeja y asignación de leads, kanban por asesor, seguimientos inmutables, plantillas de WhatsApp, sugerencias internas y sincronización automática con EasyBroker. Webapp móvil-primero (los asesores la usan desde el teléfono).

## Stack

- **Next.js 16** (App Router, `src/proxy.ts` en lugar de middleware) + Tailwind 4 + shadcn/ui
- **Supabase** (Postgres + Auth con hook de rol en el JWT + RLS como frontera de seguridad)
- **EasyBroker API** (solo lectura: propiedades y contact requests, sync idempotente cada 15 min)
- **Vercel** (hosting) + **Playwright/Vitest** (E2E y tests)

## Desarrollo

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # tests unitarios
npm run test:rls   # tests de integración RLS (contra la DB en la nube)
```

Variables en `.env.local` (no se commitea): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `EASYBROKER_API_KEY`, `EASYBROKER_BASE_URL`, `CRON_SECRET`.

## Producción

- **URL:** https://inmobiliaria-crm-inky.vercel.app (proyecto `inmobiliaria-crm`, team Creacify). El subdominio propio de Montana se conecta después desde el dashboard de Vercel (Settings → Domains).
- **Deploy:** `vercel deploy --prod` (CLI ya ligado vía `.vercel/`).

### Cron de sincronización (decisión operativa)

El plan **Hobby** de Vercel solo permite crons diarios, así que el sync de EasyBroker **NO** usa Vercel Cron (no hay `vercel.json`). Quedó programado con **pg_cron dentro de Supabase**:

- Job `easybroker-sync-15min` (`*/15 * * * *`) llama con `pg_net` a `GET /api/cron/easybroker-sync` con `Authorization: Bearer <CRON_SECRET>`.
- El secret vive en Supabase Vault (`cron_secret_easybroker`).
- Ver estado: `select * from cron.job;` y últimas corridas: `select * from cron.job_run_details order by start_time desc limit 10;`
- Si se migra a Vercel Pro: desprogramar el job (`select cron.unschedule('easybroker-sync-15min');`) y restaurar `vercel.json` con el cron `*/15 * * * *` a esa ruta.

La ruta es fail-closed (401 sin el Bearer correcto) y el sync tiene lease de ejecución única de 5 min, cursores idempotentes y dedup de leads repetidos.

### Cron de reintento del espejo a Google Calendar (`gcal-retry`)

El espejo de visitas a Google Calendar (ver skill `google-calendar`) marca una visita `gcal_sync_estado = 'pendiente'` cuando Google falla de forma transitoria. El job `gcal-retry` es quien la reintenta con backoff exponencial, igual que `easybroker-sync-15min`, programado por **pg_cron dentro de Supabase**:

**Crítico: este job se crea por SQL, NUNCA desde el UI de "Cron Jobs" de Supabase** — ese UI capa `timeout_milliseconds` a 5000, insuficiente para un lote que puede tardar más. Correrlo desde el SQL Editor:

```sql
select cron.schedule('gcal-retry-5min', '*/5 * * * *', $$
  select net.http_get(
    url := 'https://www.klo-ser.com/api/cron/gcal-retry',
    headers := jsonb_build_object('Authorization', 'Bearer ' ||
      (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret_easybroker')),
    timeout_milliseconds := 30000
  )
$$);
```

(El SQL anterior **no se ha ejecutado todavía** — el job se programa cuando la rama `feat/google-calendar` llegue a producción, reutilizando el mismo secret de Vault que `easybroker-sync-15min`.)

- La ruta (`src/app/api/cron/gcal-retry/route.ts`) es fail-closed (401 sin el Bearer correcto) y responde SIEMPRE 200, con los errores del lote en el body — para que pg_net no registre la corrida como fallida por fallos parciales.
- Lote acotado a 20 visitas por corrida, ordenadas por `gcal_proximo_intento` (las más atrasadas primero). Claim atómico por fila (UPDATE condicional) antes de tocar cada una, así dos ticks traslapados nunca reintentan la misma visita dos veces.
- Backoff exponencial: `1 min * 2^gcal_intentos` (1, 2, 4, 8, 16, 32 min). Tope de 6 intentos: al agotarlos, la visita queda `gcal_sync_estado = 'error'` con el motivo en `gcal_ultimo_error` (dead letter, requiere diagnóstico manual).
- Ver estado y últimas corridas con las mismas consultas de `cron.job` / `cron.job_run_details` de arriba.
