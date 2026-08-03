# Decisiones operativas

## 2026-08-03 — Cutover a la cuenta real de EasyBroker

- El desarrollo se hizo contra el sandbox oficial (`api.stagingeb.com`); ese día se conectó la cuenta real de Montana Realty (`api.easybroker.com`).
- Se purgaron todos los datos de prueba del sandbox (1,345+ propiedades ficticias, leads y notificaciones de tests). Se conservaron los 3 leads del seed como demo de bandeja (limpiar antes del go-live, tarea 21).
- **Leads "desde hoy"** (decisión del cliente): el cursor de leads se inicializó en la fecha del cutover. Los 1,496 leads históricos permanecen en EasyBroker y NO se importan. Solo los leads nuevos caen a la bandeja.
- Primer sync real: 153 propiedades importadas, 0 errores. Idempotencia verificada con segunda corrida.
- Los 3 usuarios seed (`admin@montana.test`, `asesor1/2@montana.test`) siguen activos para el piloto; crear usuarios reales y desactivar los seed antes del go-live.
