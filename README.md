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

Variables en `.env.local` (no se commitea): ver `.env.example` para la lista completa.

### ⚠️ Entornos: nunca desarrolles contra producción

Hay **dos** proyectos Supabase. `.env.local` apunta al de **desarrollo**, y ahí deben quedarse `npm run dev`, `npm test` y `npm run test:rls` — esas suites crean y borran filas de verdad en la base a la que apunten.

| | Supabase | EasyBroker | Dónde viven las variables |
|---|---|---|---|
| **Desarrollo** | `CRM Inmobiliario DEV` (`fewbcrcacqrwxrxpwnxv`) | sandbox `api.stagingeb.com` (llave pública, datos ficticios) | `.env.local` |
| **Producción** | `CRM Inmobiliario` (`sdyyczntaydzodyjtpgc`) | `api.easybroker.com` (llave real de Montana) | solo en Vercel |

No copies los valores de producción a `.env.local`. En agosto de 2026, tenerlos ahí provocó que una demo local creara una cita real sobre una prospecto real.

Para apuntar un comando puntual a un proyecto concreto:

```bash
node scripts/aplicar-migracion.mjs --sql "select ..."          # DEV (por defecto)
node scripts/aplicar-migracion.mjs --prod --sql "select ..."   # producción, avisa en la salida
```

Para aplicar una migración al proyecto Supabase (mismo flujo con el que se aplicó la 0007):

```bash
node scripts/aplicar-migracion.mjs supabase/migrations/00XX_lo_que_sea.sql
node scripts/aplicar-migracion.mjs --sql "select 1"   # consulta suelta
```

Requiere `SUPABASE_ACCESS_TOKEN` en `.env.local`. Ojo: el proyecto Supabase es dev **y** producción del piloto.

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

#### Poll rápido de leads (`easybroker-leads-1min`)

EasyBroker **no tiene webhooks** (ver skill `easybroker-api`), así que el "tiempo real" máximo es acortar el polling. La misma ruta acepta `?fase=leads`: corre **solo** la fase de contact requests (1–2 requests por vuelta, muy por debajo del rate limit) y deja propiedades y estatus al sync completo de 15 min. Con el job de cada minuto, un lead de EasyBroker cae al CRM (con push y guardias) en ≤ 90 s. Comparte el lease con el sync completo: si coinciden, el poll se salta esa vuelta — sin pérdida, porque el sync completo también trae la fase de leads.

Programarlo por SQL (mismo criterio que `gcal-retry`: **nunca desde el UI de Cron Jobs**):

```sql
select cron.schedule('easybroker-leads-1min', '* * * * *', $$
  select net.http_get(
    url := 'https://www.klo-ser.com/api/cron/easybroker-sync?fase=leads',
    headers := jsonb_build_object('Authorization', 'Bearer ' ||
      (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret_easybroker')),
    timeout_milliseconds := 60000
  )
$$);
```

(Programado en producción desde 2026-08-14.)

#### Catálogo casi en tiempo real (`easybroker-propiedades-2min`)

Pedido del Live test (2026-08-17): las ediciones de propiedades en EasyBroker — **fotos incluidas** — deben verse en el CRM en minutos, no en 15. La misma ruta acepta `?fase=propiedades`: corre solo la fase de propiedades (cursor incremental por `updated_after`, y las existentes ahora **re-piden el detalle** para refrescar fotos/descripción/ubicación) más un **barrido de respaldo** que refresca el detalle de las 5 propiedades activas con la `ultima_sync` más vieja por corrida — cubre el caso de que EasyBroker no bumpee `updated_at` cuando solo cambian fotos. Sin leads (tienen su poll de 1 min) ni `listing_statuses` (la parte cara, sigue en el sync de 15 min).

```sql
select cron.schedule('easybroker-propiedades-2min', '*/2 * * * *', $$
  select net.http_get(
    url := 'https://www.klo-ser.com/api/cron/easybroker-sync?fase=propiedades',
    headers := jsonb_build_object('Authorization', 'Bearer ' ||
      (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret_easybroker')),
    timeout_milliseconds := 120000
  )
$$);
```

(Programado en producción el 2026-08-17.)

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

## Captura de leads del sitio oficial de Montana

El sitio oficial (repo aparte, lo desarrolla el equipo) manda sus leads directo al CRM **en tiempo real**: su backend hace `POST /api/leads/captura` con `Authorization: Bearer <LEADS_CAPTURA_SECRET>` en cuanto un visitante manda un formulario. El lead entra por la MISMA tubería que los de EasyBroker (dedup por teléfono/email, guardias, push + campanita), con `fuente = 'sitio'` (migración 0018).

- **Server-to-server únicamente**: el secreto jamás va en el bundle del navegador; el formulario postea al backend del sitio y ese backend nos llama.
- Idempotente por `solicitud_id` (el sitio manda un uuid por envío): reintentar es siempre seguro.
- El proxy excluye la ruta de su matcher (`src/proxy.ts`); la puerta es el propio handler, fail-closed.
- Env var `LEADS_CAPTURA_SECRET`: una por entorno (DEV en `.env.local`, prod en Vercel — recuerda el redeploy al agregarla).
- Contrato completo, ejemplos y cómo probar: **`docs/integracion-sitio-montana.md`** (es el doc que se le entrega al dev del sitio).

## Captaciones (asesor sube → admin revisa → un click a EasyBroker)

El asesor sube su captación en `/asesor/captaciones` (fotos a Supabase Storage, bucket público `captaciones`) y ve **el score de calidad en vivo** — las reglas que los portales mexicanos premian (motor en `src/lib/captaciones/score.ts`, estilo «Panoramix» de Inmuebles24). El admin la revisa en `/admin/captaciones` (anillo + checklist) y con un click la **carga a EasyBroker** (`POST /v1/properties`, beta) — con las iniciales del asesor al final de la descripción (convención Montana) y el switch «publicar de inmediato / subir apagada».

Aprendizajes del sandbox (2026-08-14) que el código ya blinda:

- **Lat/lng son obligatorias** para la API (bloqueante del score).
- **`location.name` debe existir tal cual en `GET /v1/locations`**: antes de cargar, la colonia se resuelve contra el catálogo y, si no está, el error sugiere las parecidas. Ojo: el **sandbox de staging rechaza cualquier location** (hasta el ejemplo de su propia doc) — la validación real solo ocurre contra el EasyBroker de producción. **La primera carga real conviene hacerla con el switch en «apagada»** y revisarla en EB antes de publicar.
- La selección de portales por propiedad NO la expone la API: se hace dentro de EasyBroker.
- La API no permite borrar propiedades: una carga es definitiva (por eso el candado de bloqueantes y la alerta en el dialog).

Migración `0020` (tabla + bucket + RLS). La fuente de las fotos exige `*.supabase.co` en `next.config.ts`.

## Integración con Google Calendar

Cada asesor conecta su cuenta desde su dashboard; las visitas del CRM se espejan en su calendario principal. El CRM es la fuente de verdad: editar el evento en Google **no** modifica la visita en Klo-Ser. Detalles de implementación en el skill de proyecto `google-calendar`.

### Puesta en marcha (pendiente al 2026-08-06)

**1. Proyecto en Google Cloud Console.** Crear credenciales OAuth de tipo *Aplicación web* y anotar el client ID y el client secret. Redirect URIs autorizadas:

- `https://www.klo-ser.com/api/google/oauth/callback` (producción — ojo: **con `www`**, el apex hace 308 a www)
- `http://localhost:3000/api/google/oauth/callback` (desarrollo)

Scopes solicitados (los mínimos que necesita la integración):

- `https://www.googleapis.com/auth/calendar.events.owned` — crear/editar/borrar eventos en calendarios propios
- `https://www.googleapis.com/auth/calendar.freebusy` — leer disponibilidad (sin ver títulos ni contenido)

**2. ⚠️ Publicar la app «In production» ANTES de conectar al primer asesor real.** En modo *Testing*, Google **caduca los refresh tokens a los 7 días** cuando hay scopes de Calendar, así que los asesores tendrían que reconectar cada semana. Publicada sin verificar, los tokens dejan de caducar; el costo es la pantalla de «app no verificada» y un tope de por vida de 100 usuarios nuevos — holgado para la agencia.

**3. Variables de entorno** (`.env.local` y Vercel): `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_TOKEN_SECRET` y `GOOGLE_REDIRECT_URI`. Generar el secret de cifrado con `openssl rand -base64 32`.

> **Gotcha conocido:** cargar secretos a Vercel con un pipe de PowerShell mete un `\r` al final y el valor llega corrupto. Usar `printf '%s' "$VALOR" | vercel env add NOMBRE production` desde bash.

**4. Verificación de la app (trámite gratuito, en paralelo — no bloquea).** Google la exige porque los scopes de Calendar son *sensibles* (no *restringidos*, así que **no** aplica la auditoría anual de seguridad CASA ni tiene costo). Timeline oficial: hasta 10 días. Requisitos:

- Dominio `klo-ser.com` verificado en Google Search Console
- Política de privacidad publicada **en ese mismo dominio**, explicando qué datos de Google se acceden, cómo se usan y cómo se almacenan
- Video demo (YouTube, no listado) mostrando el flujo de consentimiento completo y el uso de cada scope
- Justificación por escrito de por qué se necesita cada scope

### Checklist de E2E manual (con una cuenta Gmail de prueba)

- [ ] Conectar el calendario desde el dashboard del asesor
- [ ] Agendar una visita → el evento aparece en Google Calendar, **sin mandar invitaciones**
- [ ] Reagendar → el evento se mueve
- [ ] Cancelar → el evento desaparece
- [ ] Borrar el evento a mano en Google y reagendar → se vuelve a crear
- [ ] Revocar el acceso en myaccount.google.com y agendar → llega el push de reconexión y la visita queda `sin_conexion`
- [ ] Reconectar → vuelve a sincronizar
