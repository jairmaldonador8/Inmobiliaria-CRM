# Contexto — Klo-Ser (CRM Inmobiliario Montana Realty)

> Resumen para dar contexto a Claude. Actualizado: 2026-08-05.

## Qué es
CRM inmobiliario para Montana Realty. El producto se llama **Klo-Ser** (pronunciado «clóser», tagline propuesto «Del lead al cierre»). Dos roles: **admin** (dirección) y **asesor** (móvil-first). Los leads llegan solos desde EasyBroker y caen a una bandeja; el admin los asigna, el asesor los trabaja en kanban con seguimientos y WhatsApp con plantillas.

## Stack
- Next.js 16.2 (App Router) + TypeScript, Tailwind, shadcn/base-ui, dnd-kit, sonner.
- Supabase: Postgres + RLS por rol, Auth con custom auth hook, migraciones en `supabase/migrations/`. **Dos proyectos desde el 2026-08-06** — producción `sdyyczntaydzodyjtpgc` (valores solo en Vercel) y desarrollo `fewbcrcacqrwxrxpwnxv`, que es a donde apunta `.env.local` y por tanto `npm run dev`, `npm test` y `npm run test:rls`. Antes de esa fecha no había separación y los comandos locales escribían en producción; no vuelvas a asumir que son el mismo proyecto.
- Tests: Vitest (unit + integración RLS contra Supabase real). Desarrollo con TDD.
- Deploy: Vercel Hobby, proyecto `inmobiliaria-crm` (team Creacify). URL: https://inmobiliaria-crm-inky.vercel.app (¡el alias sin sufijo es de un tercero!). Deploy = push a `main`.

## Módulos ya construidos (todo en `main`, desplegado)
1. Auth: login/logout, layouts por rol `(admin)`/`(asesor)`, proxy con redirección por rol, auth hook excluye inactivos.
2. Sync EasyBroker: cliente TDD contra fixtures, sync idempotente con dedup de leads y lease; corre cada 15 min vía **pg_cron + pg_net en Supabase** (job `easybroker-sync-15min`, secret en Vault `cron_secret_easybroker` → GET `/api/cron/easybroker-sync` con Bearer CRON_SECRET). No hay Vercel Cron (plan Hobby).
3. Gestión de asesores (soft delete), inventario de propiedades (admin y asesor).
4. Bandeja de leads con asignación y captura manual; kanban del asesor con captura rápida.
5. Detalle de lead con seguimientos + envío WhatsApp con plantillas; CRUD de plantillas.
6. Cola del día del asesor + notificaciones; módulo de sugerencias internas.
7. Dashboard admin (F1) con KPIs y estados vacíos.
8. Rediseño visual aplicado a la app: paleta «Muro» opción B + wordmark Jost (commit `cbef33b`).

## Estado de datos (cutover 2026-08-03)
- Conectada la cuenta REAL de EasyBroker; 153 propiedades importadas, 0 errores.
- Decisión del cliente: leads «desde hoy» — los 1,496 históricos NO se importan.
- Usuarios seed activos para el piloto: `admin@montana.test`, `asesor1/2@montana.test` (Password123!).

## Marca y diseño (decisiones cerradas)
- **Dirección vigente: «Muro»** — fondo hueso/beige, cafés elegantes, Poppins, brutalismo elegante. Rechazado: dark lima neón y serif con cursivas. Paleta: Hueso #F2EDE4, Arena #D8C9B0, Ocre #C98A3B, Barro #9C6B4A, Café #6B4A33, Tinta #221B14, urgencia #A34E28. Claim «Un buen cierre se construye».
- Fondo del sistema: opción B «muro profundo» `#E5DAC4` / panel #FAF7F1. Hay **modo noche** cálido sin neón (toggle luna, localStorage `kloser-tema`).
- **Logo final**: Jost 200, MAYÚSCULAS, tracking 0.42–0.46em, guion café a media altura; assets en `design-propuestas/assets/logo/`. Ícono app: «la ventana» (cuadrado café con guion hueso).
- Wordmark animado «El acuerdo» (klo/ser entran de lados opuestos, guion nace al centro, sin destellos); símbolo «el check que cierra»; loader = anillo.
- Gráficas (paleta validada daltonismo): #65A30D, #0891B2, #EA580C, #6366F1; rojo #F87171 solo urgencia >24 h.
- Mockups en `design-propuestas/`: `sistema-klo-ser.html` (mockup vigente «Muro OS»: login glass sobre foto, sidebar tinta, dashboard de cápsulas), `landing-klo-ser.html`, `campana-klo-ser.html`, `logos-klo-ser*.html`. `propuesta-montana-realty.html` (dark Obsidiana) quedó obsoleto. Faltan por migrar al mockup Muro: bandeja, asesores, plantillas, perfil, detalle de lead.

## Pendientes para go-live real
1. Crear usuarios reales y desactivar seeds `*@montana.test`.
2. Conectar subdominio de Montana en Vercel → Domains.
3. Rotar keys de Supabase que se pegaron en chat durante el setup.
4. Limpiar los 3 leads demo del seed (tarea 21 en decisiones).
5. Regenerar screenshots `design-propuestas/assets/shots/` (muestran fondo beige viejo).

## Gotchas conocidos
- `vercel env add` alimentado por pipe de PowerShell mete `\r` en el valor → cargar secrets con `printf '%s'` desde bash.
- Next.js de este repo tiene breaking changes vs. lo conocido: leer `node_modules/next/dist/docs/` antes de escribir código (regla de AGENTS.md).

## Docs internas
- `docs/decisiones.md` — bitácora de decisiones operativas.
- `docs/ultrapowers/{plans,research,specs}` — planes y specs de las fases.
- `README.md` — detalle del cron y setup.
