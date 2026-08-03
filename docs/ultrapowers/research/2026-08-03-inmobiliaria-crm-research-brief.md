# Research Brief: CRM Inmobiliario Montana Realty

**Fecha:** 2026-08-03
**Spec:** `docs/ultrapowers/specs/2026-08-03-inmobiliaria-crm-design.md`
**Método:** 4 agentes de investigación en paralelo (API de EasyBroker verificada con llamadas reales al sandbox oficial; stack verificado contra docs oficiales + repo de referencia TOP-DIGITAL-SYSTEM en producción; PWA/push contra docs de Next.js/WebKit; panorama CRM contra fuentes de la industria).

## Contexto

CRM inmobiliario (Next.js 16 + Supabase + Vercel, PWA) con integración de solo lectura a EasyBroker. El research valida la API de EasyBroker, fija los patrones actuales del stack, confirma la viabilidad de push notifications gratis, y extrae reglas del estado del arte en CRMs inmobiliarios codificables sin IA.

---

## 1. EasyBroker API (verificado con llamadas reales al sandbox)

### Confirmado

- **Auth:** header `X-Authorization: <api_key>`. Base prod `https://api.easybroker.com/v1`. La key se genera en Configuraciones → "API para programadores". **Requiere cuenta de paga** de EasyBroker.
- **Sandbox oficial:** `https://api.stagingeb.com` con key pública de prueba `l7u502p8v46ba3ppgvj5y2aad50lb9` (datos ficticios: 1,473 propiedades, 955 leads). **Desarrollar contra el sandbox; cambiar a la key real de Montana al final.**
- **Propiedades:** `GET /v1/properties` — paginación `page`/`limit` (máx **50**), envelope `{pagination: {next_page, total}, content: []}`. Filtros clave: `search[statuses][]`, `search[updated_after]` (para sync incremental), `search[operation_type]`.
  - **Lista** trae: `public_id`, `title`, `title_image_full/thumb`, `location` (string), `operations[]` (type/amount/currency/commission), `bedrooms`, `bathrooms`, `parking_spaces`, `property_type` (string español localizado), **`lot_size` y `construction_size` (m², floats)** ✅ — la superficie que necesita el precio/m² sí existe, `updated_at`, `agent`.
  - **Detalle** (`GET /v1/properties/{id}`) agrega: `description`, `location` como objeto (lat/lng, calle, CP), `images[]` completas, `public_url`, `half_bathrooms`, `age`, etc. → **sync en 2 niveles:** lista para todo + detalle (N+1) solo para propiedades nuevas/cambiadas (`updated_after` como cursor).
- **Leads:** `GET /v1/contact_requests` (path real con guion bajo) — campos: `id`, `name`, `phone`, `email`, `property_id` (public_id EB), `message`, **`source`** (portal/sitio de origen), **`happened_at`** (NO existe `created_at`; filtros `happened_after`/`happened_before` top-level). Cursor de sync = `happened_after`.
- **Sin webhooks.** El patrón oficial es polling — la integración Zapier de EasyBroker sondea **cada 15 minutos**. Nuestro cron de 15 min es exactamente el patrón sancionado.
- **Rate limit:** 20 req/s. Timestamps con offset `-06:00` → normalizar a UTC al guardar.
- **Estatus:** las respuestas de propiedades NO traen campo `status`; se obtiene consultando por `search[statuses][]` (published/not_published/sold/rented/…) o `GET /v1/listing_statuses` (limit máx 100).

### Hallazgo crítico

- **La API NO expone en qué portal está publicada cada propiedad.** La sindicación por portal solo se ve en la UI de EasyBroker. Consecuencias para el diseño:
  - `propiedad_portales` pasa a ser **marcado manual opcional** (checkbox por portal en el detalle de propiedad, para quien quiera llevar ese registro).
  - La inteligencia automática real es **leads por portal** vía el campo `source` de cada contact request — "Inmuebles24 genera el 70% de tus leads" sí es automático y es el dato de negocio más valioso.
- **Lamudi:** sí recibe propiedades vía EasyBroker (a través de "Proppit by Lamudi"). Vivanuncios/Trovit no aparecen en la lista actual de portales de EasyBroker (Vivanuncios históricamente iba con Inmuebles24).
- **Inmuebles24:** desde el rompimiento EasyBroker↔Inmuebles24 (2023), los leads de Inmuebles24 llegan a EasyBroker vía la extensión de Chrome "EasyBroker Assistant" con chequeo **diario** y solo si la computadora del admin está prendida → los leads de Inmuebles24 pueden llegar con horas/un día de retraso. Documentar esta limitación al cliente; mejora futura posible: parseo directo de los emails de notificación de Inmuebles24.

### No confirmado (validar con la key real de Montana)

- Valores exactos de `source` en producción por portal.
- Qué planes de EasyBroker incluyen API (docs solo dicen "cuenta de paga") — **confirmar que el plan de Montana la incluye antes de construir el sync**.

---

## 2. Stack: Next.js 16 + Supabase (patrones verificados en producción)

El repo TOP-DIGITAL-SYSTEM (Next 16.2.10, @supabase/ssr 0.12.x, supabase-js 2.110.x, Tailwind 4, shadcn/Base UI, vitest 4) es la plantilla de patrones probados. Puntos clave:

- **Next.js 16:** `proxy.ts` reemplaza `middleware.ts` (runtime Node). APIs de request asíncronas (`await cookies()`). Caching opt-in — **dejar todo dinámico** (correcto para CRM auth-heavy). Turbopack default.
- **Auth (@supabase/ssr 0.12):** cookies con `getAll()`/`setAll()`; 3 clientes (server por-request, browser con `realtime: { worker: true }`, admin con `server-only` + `SUPABASE_SECRET_KEY`). Keys nuevas: `sb_publishable_...` / `sb_secret_...`. Guard con `getClaims()` (verificación local JWKS); `getUser()` para mutaciones sensibles. En `proxy.ts`: `getClaims()` inmediatamente tras crear el cliente (meter lógica en medio causa logouts aleatorios); copiar cookies refrescadas a las respuestas de redirect. **El proxy no es frontera de seguridad** — re-verificar rol en cada `layout.tsx` con un helper memoizado con React `cache()`.
- **Matcher del proxy:** excluir `manifest.webmanifest` (rompe instalación PWA) y `api/cron/` (el cron de Vercel no sigue redirects — moriría en silencio).
- **RLS admin/asesor (patrón híbrido probado):**
  - Custom Access Token Hook inyecta `user_role` en el JWT (para routing rápido en proxy) — con grants exactos a `supabase_auth_admin` (si el hook falla, **nadie puede iniciar sesión**).
  - Dentro de las policies, la verdad es la tabla `usuarios` vía helpers `security definer` en schema `private` (`private.is_admin()`), envueltos en `(select ...)` para caching initPlan. Patrón por tabla: `using (asesor_id = (select auth.uid()) or (select private.is_admin()))`.
  - **Column-level grants** para congelar campos de propiedad/asignación (un asesor no puede reasignarse leads: `revoke update ... grant update (columnas_permitidas)`).
  - Datos financieros sensibles: tabla separada solo-admin (default deny > enmascarar columnas).
  - Tests RLS con JWTs reales (patrón `test:rls` + `vitest.integration.config.ts`). Recordar: SELECT denegado por RLS = resultados vacíos, no error.
- **Realtime:** **Broadcast en canales privados; nunca `postgres_changes`** (legacy, no escala). Patrón: INSERT normal (RLS valida) → trigger `AFTER INSERT` llama `realtime.broadcast_changes()` — autorización de canal vía RLS en `realtime.messages` (solo SELECT, sin INSERT = nadie emite desde el browser); `revoke execute` de la función trigger (fix del security advisor). Cliente: `setAuth()` antes de suscribir, `private: true`, refetch + dedupe al reconectar (no hay replay).
- **Seguimientos append-only (defensa en capas):** (1) RLS solo SELECT+INSERT, (2) `REVOKE UPDATE, DELETE` a nivel grants, (3) trigger `RAISE EXCEPTION` — la capa 3 detiene hasta al service-role.
- **Cron:**
  - **Hobby: máx 1×/día** (y dispara en cualquier minuto de la hora) — un sync de 15 min es **imposible** en Hobby vía Vercel Cron.
  - **Pro: `*/15 * * * *` funciona** con precisión por minuto. `maxDuration` 300s default (Fluid Compute).
  - **Regla de decisión: plan Pro → Vercel Cron (route handler + `CRON_SECRET` fail-closed, comparte código con el botón "Sincronizar ahora" como Server Action). Hobby → Supabase pg_cron + pg_net llamando la misma ruta segura.** Sin retries y con posibles invocaciones duplicadas → diseñar el sync **idempotente** (upserts por `easybroker_id`) con lock si la corrida puede exceder el intervalo.
- **Server Actions** para mutaciones desde nuestra UI; **Route Handlers** solo para agentes externos (cron, ICS del calendario, futuros webhooks).

---

## 3. PWA + Push notifications (gratis, confirmado)

- **Instalación:** `app/manifest.ts` + service worker artesanal (`public/sw.js`) es el estándar oficial documentado por Next.js — sin librerías. Requisitos: manifest válido (íconos 192/512, `display: standalone`) + HTTPS. `next-pwa` está muerto (archivado 2023); Serwist solo si algún día se quiere offline.
- **Web Push gratis con `web-push` (npm) + claves VAPID** — es el patrón del propio tutorial oficial de Next.js. Sin servicios de paga: Google/Apple/Mozilla operan la entrega.
  - **Android Chrome:** funciona completo, hasta sin instalar. Es el happy path de los asesores.
  - **iPhone:** funciona desde iOS 16.4 **solo con la app instalada en pantalla de inicio** (vía Safari). El permiso requiere gesto del usuario. iOS 18.4+ agrega Declarative Web Push (más confiable + badge en el ícono).
  - **Gotchas Vercel:** runtime Node (no Edge) para `web-push`; `await`/`Promise.allSettled` los envíos (no fire-and-forget); borrar suscripciones al recibir 404/410; guardar suscripciones por usuario en Postgres.
- **Badging** (numerito en el ícono): posible en Android e iOS 16.4+.
- **UX de adopción (asesores no técnicos):** detectar `display-mode: standalone`; Android: capturar `beforeinstallprompt` y mostrar botón propio "Instalar aplicación" tras el primer login; iOS: tarjeta visual paso a paso en español ("Compartir → Agregar a pantalla de inicio"), advertir si abren desde el navegador integrado de WhatsApp. **Pre-prompt de dos pasos** para notificaciones (explicar el valor antes de disparar el prompt nativo — un rechazo es casi irreversible). En iOS: instalar primero, pedir permiso dentro de la app instalada (particiones de storage separadas).
- **Nueva tabla requerida:** `push_suscripciones` (usuario, endpoint, keys, created_at).

---

## 4. Estado del arte en CRMs inmobiliarios → reglas codificables

### Los números que justifican el diseño (speed-to-lead)

- Responder ≤5 min vs 30 min = **21× más probabilidad de calificar** el lead (MIT/InsideSales — estudio canónico citado por toda la industria).
- **78% de compradores se queda con el primer asesor que responde.**
- Tasa de contacto cae ~10× después de la primera hora.
- Promedio real de respuesta en México: **4–18 horas** (fuentes vendor, direccional). → La oportunidad competitiva está aquí.

### Reglas a codificar (sin IA, todas con datos propios)

1. **Speed-to-lead:** push al asesor al asignarle lead (0 min); si no registra ningún contacto en **5 min** → recordatorio; en **60 min** → alerta a admin; KPI de dashboard = **mediana de tiempo de primera respuesta** por asesor. (Refina el semáforo de 24/48h del spec: ese queda como capa de "abandono", esta es la capa de "velocidad".)
2. **Cadencia de seguimiento** (Follow Up Boss / Zillow, adaptado): Día 0: contacto inmediato; días 1–2: 2–3 intentos/día; días 3–10: 1 toque/día; después semanal, luego mensual indefinido (los leads de portal compran a 3–12 meses — el seguimiento largo es obligatorio). ~50% de las ventas ocurren después del 5° contacto; el asesor promedio abandona al 2°. → v1: **tareas de seguimiento sugeridas** por lead según su etapa/antigüedad (lista "a quién tocar hoy"), no un motor de campañas completo.
3. **Scoring** (ya en spec, señales validadas): consulta repetida del mismo lead (vía dedup EasyBroker) es la señal #1; agregar "respondió/interactuó" cuando el asesor registre respuesta del lead en el seguimiento.
4. **Colas de trabajo > solo kanban:** los líderes usan "Smart Lists" (a quién llamar hoy) como vista de trabajo diaria; el kanban es la vista de pipeline. → La pantalla "Inicio" del asesor debe ser una **cola de acciones del día** (visitas de hoy + leads nuevos + seguimientos vencidos), que el spec ya define — confirmado como patrón correcto.
5. **WhatsApp primero:** >75% de las consultas inmobiliarias en México llegan por WhatsApp. Plantillas + links `wa.me` + registrar seguimiento al usar plantilla = flujo central, no adorno.

### Hueco de EasyBroker CRM (nuestra ventaja)

Sin evidencia de que EasyBroker CRM tenga: alertas de velocidad de respuesta, escalamiento, scoring, cadencias automáticas, ni control de actividad por asesor. (Inferido de ausencia en su marketing — validar con la experiencia real de Montana.) Nuestro sistema compite exactamente ahí, dejándole a EasyBroker lo que hace bien (publicación multi-portal).

---

## Enfoque recomendado (síntesis)

1. **Stack confirmado:** Next.js 16 (App Router, proxy.ts, todo dinámico) + Supabase (RLS híbrida con hook + helpers security definer, Broadcast para realtime, defensa en capas para append-only) + Vercel. Copiar patrones del repo de referencia, adaptando `cliente_id` → `asesor_id`.
2. **Sync EasyBroker:** desarrollar contra el sandbox oficial; sync incremental idempotente (`updated_after`/`happened_after` como cursores, upsert por `easybroker_id`); 2 niveles (lista + detalle N+1 solo para cambiados); cadencia 15 min en Vercel Pro o pg_cron en Hobby (decidir al conocer el plan de Vercel del usuario).
3. **Spec ajustado:** portal-por-propiedad manual (API no lo da); inteligencia de portales = leads por `source`; superficie m² confirmada; agregar tabla `push_suscripciones`; speed-to-lead como capa de reglas encima del semáforo.
4. **Push notifications gratis** entran a v1 (Fase 3 con la PWA): `web-push` + VAPID, pre-prompt de dos pasos, guía de instalación iOS en español.

## Notas de implementación

- Librerías: `web-push` 3.6.7 (runtime Node), sin librería PWA, shadcn con Base UI (patrón del repo), `date-fns`, `@dnd-kit` para kanban (probados en el repo de referencia).
- Env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `EASYBROKER_API_KEY`, `CRON_SECRET`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`.
- Sync: normalizar timestamps EB (-06:00) a UTC; `property_type` llega como string español localizado; `location` string en lista vs objeto en detalle.
- El cron de Vercel no reintenta y puede duplicar invocaciones → idempotencia obligatoria.
- Pendientes de validar con el cliente: plan de EasyBroker incluye API; plan de Vercel (Hobby vs Pro) decide el mecanismo de cron; valores reales de `source` por portal.

## Fuentes

- **EasyBroker:** dev.easybroker.com (docs oficiales + llamadas reales al sandbox api.stagingeb.com), ayuda.easybroker.com (portales, EasyBroker Assistant).
- **Stack:** repo TOP-DIGITAL-SYSTEM (producción, primera mano), supabase.com/docs (SSR, RBAC, Broadcast, Cron), vercel.com/docs (cron limits, Fluid Compute), nextjs.org (release 16).
- **PWA/Push:** nextjs.org/docs (guía PWA oficial), webkit.org (Declarative Web Push, iOS 16.4/18.4), web.dev (promote-install), npm registry (versiones verificadas).
- **CRM:** help.followupboss.com (Lead Flow, Action Plans), Zillow Premier Agent (plan 10 días), estudio MIT/InsideSales (speed-to-lead), Proyectoras LATAM (WhatsApp >75%), Red Financiera/AMPI (ruptura Inmuebles24-EasyBroker 2023).
