# Decisiones operativas

## 2026-08-03 — Cutover a la cuenta real de EasyBroker

- El desarrollo se hizo contra el sandbox oficial (`api.stagingeb.com`); ese día se conectó la cuenta real de Montana Realty (`api.easybroker.com`).
- Se purgaron todos los datos de prueba del sandbox (1,345+ propiedades ficticias, leads y notificaciones de tests). Se conservaron los 3 leads del seed como demo de bandeja (limpiar antes del go-live, tarea 21).
- **Leads "desde hoy"** (decisión del cliente): el cursor de leads se inicializó en la fecha del cutover. Los 1,496 leads históricos permanecen en EasyBroker y NO se importan. Solo los leads nuevos caen a la bandeja.
- Primer sync real: 153 propiedades importadas, 0 errores. Idempotencia verificada con segunda corrida.
- Los 3 usuarios seed (`admin@montana.test`, `asesor1/2@montana.test`) siguen activos para el piloto; crear usuarios reales y desactivar los seed antes del go-live.

## 2026-08-04 — Deploy a producción (Vercel)

- Proyecto `inmobiliaria-crm` en el team Creacify; URL de producción: https://inmobiliaria-crm-inky.vercel.app (el alias corto `inmobiliaria-crm.vercel.app` ya estaba tomado por un tercero — NO es nuestro).
- Plan de Vercel confirmado: **Hobby** → el cron `*/15` de Vercel no está permitido; se eliminó `vercel.json` y el sync quedó programado con **pg_cron + pg_net** dentro de Supabase (job `easybroker-sync-15min`, secret en Vault como `cron_secret_easybroker`). Detalle en README.
- Mismo proyecto Supabase de desarrollo (`sdyyczntaydzodyjtpgc`) sirve como producción del piloto: ya contiene el catálogo real (153 propiedades) y el cursor de leads "desde hoy".
- Smoke test en producción: login admin → dashboard con KPIs, login asesor (viewport móvil) → cola del día, propiedades cargan, cron 401 sin auth y 200 con Bearer; la primera corrida real importó 2 leads nuevos de EasyBroker.
- Gotcha registrado: `vercel env add` alimentado por pipe de PowerShell agrega `\r` al valor (los 6 secrets quedaron corruptos y el Bearer daba 401); se recargaron con `printf '%s'` desde bash.
- Pendientes para go-live real: crear usuarios reales y desactivar los seed (`*@montana.test`), conectar el subdominio de Montana en Vercel → Domains, y (opcional) rotar las keys de Supabase que se pegaron en el chat durante el setup.
