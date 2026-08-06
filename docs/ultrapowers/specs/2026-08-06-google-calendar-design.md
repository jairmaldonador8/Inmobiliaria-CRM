# Integración Google Calendar — Diseño

> Spec aprobado en brainstorming el 2026-08-06. Primera pieza del bloque de
> agenda: desbloquea después el self-scheduling de leads (spec futuro), que
> reutilizará el endpoint de disponibilidad definido aquí.

## Problema

Las visitas se agendan en Klo-Ser pero viven solo ahí: el asesor no las ve en
su Google Calendar, no le suenan los recordatorios nativos de Google, y nada
impide agendarle una visita encima de un compromiso personal. La empresa pidió
(estilo GoHighLevel): que cada asesor pueda conectar su Google Calendar desde
su dashboard y que las citas del CRM se plasmen automáticamente en él,
«bloqueando» el horario.

## Decisiones tomadas con el usuario

1. **Conexión opcional por asesor**, desde su dashboard (card «Conectar Google
   Calendar»). Quien no conecte sigue trabajando igual que hoy.
2. **Sync unidireccional CRM → Calendar, más lectura de disponibilidad.** El
   CRM es la única fuente de verdad. Editar/mover/borrar el evento en Google
   Calendar NO modifica la visita en Klo-Ser. Sí leemos free/busy del
   calendario del asesor para detectar choques.
3. **Destino: calendario principal** del asesor (no un calendario secundario).
   Sus recordatorios nativos funcionan sin configurar nada.
4. **Conflictos: advertir pero permitir.** Al elegir fecha/hora se muestra
   «{Asesor} ya tiene un compromiso de X a Y», pero se puede agendar de todos
   modos. Si Google no responde, la advertencia se omite y el agendado sigue
   (falla abierta; nunca bloquea el negocio).
5. **Cuentas: Gmail personal.** La app OAuth necesitará verificación de Google
   (trámite gratuito: política de privacidad, dominio verificado, justificar
   scopes). Mientras tanto, modo testing con hasta 100 usuarios de prueba
   cubre a la agencia.
6. **Costo: $0 extra.** API de Calendar gratuita (~1M llamadas/día de cuota);
   corre sobre el Supabase y Vercel actuales. Se descartó intermediario tipo
   Nylas (~$1.50–3 USD/asesor/mes).

## Enfoque elegido

Integración directa con la API de Google (sin intermediarios), con llamada en
línea al agendar + cola de reintentos vía pg_cron para fallas — el mismo
patrón de resiliencia que ya corre en producción para el sync de EasyBroker.

## Prerequisito dentro del alcance: CRUD mínimo de visitas (Fase 0)

**Hallazgo de la revisión:** la tabla `visitas` existe desde 0001, pero hoy no
hay ninguna pantalla ni server action que cree, reagende o cancele visitas (el
único uso es el conteo `citasHoy` del dashboard). Sin eso, no hay nada que
sincronizar. Este proyecto incluye por tanto una **Fase 0**:

- Server actions `agendarVisita`, `reagendarVisita`, `cancelarVisita`
  (validación con RLS existente; seguimiento automático en el lead al agendar,
  patrón de `asignarLead`).
- Formulario de visita desde la ficha del lead: propiedad (opcional), fecha,
  hora y duración. Listado simple de próximas visitas del asesor **dentro de
  su dashboard existente** (sin página nueva ni cambio al tab bar del rediseño
  Fintech Muro en esta fase). UI móvil según skill `fintech-muro-ui`.
- Los hooks de sync de la Fase 1 se cuelgan de estas actions desde el día uno.

## Datos

### Tabla nueva: `google_conexiones`

- `user_id` (PK/FK a `usuarios.user_id`) — una conexión por asesor.
- `google_email` — cuenta conectada, para mostrar «Conectado como …».
- `refresh_token_cifrado` — cifrado AES-GCM con secret en env del servidor
  (`GOOGLE_TOKEN_SECRET`); nunca se guarda ni se loguea en claro.
- `estado` — `activa` | `revocada`.
- `creada_en`, `actualizada_en`.
- RLS: cada asesor ve/borra solo su fila; solo el servidor (service role)
  escribe tokens.

### Columnas nuevas en `visitas`

- `duracion_min integer not null default 60` — la tabla solo tiene `fecha`
  (inicio); Google Calendar exige inicio y fin, y la disponibilidad necesita
  saber cuánto ocupa cada visita. Editable en el formulario (default 1 h).
- `gcal_event_id text` — id del evento espejo en Google.
- `gcal_sync_estado text` — `sincronizada` | `pendiente` | `error` |
  `sin_conexion` (default).
- `gcal_intentos integer not null default 0` y
  `gcal_proximo_intento timestamptz` — soporte del backoff del cron.
- `gcal_ultimo_error text` — último mensaje de error, visible para diagnóstico.

Migraciones desde `0008` (numeración siguiente disponible; coordinar con el
proyecto de guardias, que también reservó desde 0008 — el primero que llegue a
main toma el número).

## Componentes

### 1. Flujo OAuth (conectar/desconectar)

- `GET /api/google/oauth/start` — redirige al consentimiento de Google con
  `state` firmado (HMAC con user_id + expiración) y
  `access_type=offline&prompt=consent` para garantizar refresh token.
- `GET /api/google/oauth/callback` — valida `state`, intercambia el código,
  cifra y guarda el refresh token, marca conexión `activa`, redirige al
  dashboard con confirmación.
- Desconectar: revoca el token contra Google (`oauth2.revoke`) y borra la fila.
- Scopes mínimos: `calendar.events` (crear/editar/borrar eventos) +
  `calendar.freebusy` (leer disponibilidad). Nada más.

### 2. Card en dashboard del asesor

Estados: sin conectar (botón «Conectar Google Calendar») → conectada
(«Conectado como fulano@gmail.com», botón desconectar) → revocada (aviso
«Reconecta tu calendario» con botón). Sigue el sistema visual vigente del
dashboard móvil (skill `fintech-muro-ui`).

### 3. Sync de visitas (CRM → Calendar)

Hook en las server actions de visita de la Fase 0, solo si el asesor tiene
conexión `activa`:

- **Crear visita** → crear evento en calendario principal: título
  «Visita — {nombre del lead}», descripción con propiedad, teléfono del lead y
  link a la visita en Klo-Ser; inicio = `fecha`, fin = `fecha + duracion_min`,
  zona horaria explícita `America/Monterrey` (la que ya usa el dashboard);
  guarda `gcal_event_id`.
- **Reagendar** → actualizar fechas del evento.
- **Cancelar** → eliminar el evento.

La llamada a Google ocurre en línea (el asesor ve el evento al instante). Si
falla, la visita se guarda igual con `gcal_sync_estado = 'pendiente'` — la
operación del CRM nunca falla por culpa de Google.

### 4. Reintentos: `/api/cron/gcal-retry`

Job de pg_cron (patrón existente: pg_net → endpoint con secret) cada 5 min:
toma visitas `pendiente` con `gcal_proximo_intento` vencido, reintenta la
operación correspondiente (crear / actualizar / borrar según el estado actual
de la visita), con backoff exponencial vía `gcal_intentos` y tope de intentos;
al agotarlos marca `error`. Caso especial: visita cancelada que nunca llegó a
sincronizar (`pendiente` sin `gcal_event_id`) → se marca `sincronizada` (nada
que reflejar en Google) sin llamar a la API. Access tokens se obtienen del refresh token al vuelo (cache en memoria
por request; no se persisten).

### 5. Disponibilidad: `GET /api/google/disponibilidad`

Parámetros: asesor, rango horario. Combina free/busy de Google (si hay
conexión activa) + visitas agendadas en el CRM. Respuesta: lista de bloques
ocupados (sin títulos ni detalles del evento — privacidad: free/busy solo
devuelve ocupado/libre). El formulario de visita la consulta al elegir
fecha/hora y muestra la advertencia de choque. **Esta API es la base del
self-scheduling futuro.**

## Manejo de errores

- **Token revocado/inválido** (401/`invalid_grant`): conexión → `revocada`,
  push al asesor («Reconecta tu Google Calendar») usando `enviarPush`
  existente. Las visitas siguen normales con `sin_conexion` hasta reconectar.
- **Rate limit / 5xx de Google:** la visita queda `pendiente` y el cron
  reintenta. La advertencia de conflictos falla abierta (se omite).
- **Evento borrado a mano en Calendar:** al reagendar, si Google devuelve 404
  se recrea el evento. (Consecuencia aceptada del sync unidireccional.)
- **Desconexión con visitas futuras:** los eventos ya creados se quedan en el
  calendario del asesor; no se borran (decisión: son sus citas reales).

## Configuración (env vars)

- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — credenciales OAuth del
  proyecto en Google Cloud Console.
- `GOOGLE_TOKEN_SECRET` — llave AES-GCM para cifrar refresh tokens.
- Redirect URI (`/api/google/oauth/callback`) registrada en Google Cloud
  Console para producción y preview. Ojo con el gotcha conocido de `vercel
  env` + PowerShell (usar bash/printf para setear secrets).

## Seguridad

- Refresh tokens cifrados (AES-GCM, secret solo en env de Vercel); jamás en
  logs ni en el cliente.
- `state` de OAuth firmado y con expiración corta (10 min) contra CSRF.
- Endpoint de cron protegido con secret (patrón existente).
- RLS en `google_conexiones`; el token nunca viaja al navegador.
- Free/busy no expone títulos ni contenido de eventos personales.

## Testing

- **Unit:** cifrado/descifrado de tokens; construcción del cuerpo del evento
  (fechas y zona horaria); transición de estados de sync; lógica de backoff;
  validaciones de las server actions de visitas (Fase 0).
- **Integración (vitest.integration):** callback OAuth con `state` inválido /
  expirado; endpoint de disponibilidad (Google mockeado) mezclando visitas
  CRM; `gcal-retry` con secret bueno/malo y visitas en cada estado.
- **E2E manual:** cuenta Gmail de prueba en modo testing — conectar, agendar,
  reagendar, cancelar, revocar desde Google y verificar el flujo de
  reconexión.

## Fuera de alcance (specs futuros)

- Self-scheduling de leads (#3) — construirá sobre `/api/google/disponibilidad`.
- Recordatorios persistentes al dueño (#1) — independiente; candidato a spec
  corto inmediato.
- Asistente de voz «Klo» (#4) — al final; la mayor parte de su valor lo cubren
  #1–#3.
- Sync bidireccional (webhooks de Google) — descartado en v1 a propósito.
