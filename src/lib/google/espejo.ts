import 'server-only'

/**
 * Espejo de visitas en el Google Calendar del asesor (Task 8).
 *
 * El CRM es la fuente de verdad; Google Calendar es SOLO un espejo. Cuando
 * un asesor conectado agenda/reagenda/cancela una visita
 * (`src/lib/visitas/acciones.ts`), este módulo intenta reflejar el cambio en
 * su calendario `primary`. Si Google falla por cualquier razón, la
 * operación del CRM NUNCA debe fallar por eso: la visita queda marcada
 * `pendiente` y el cron `gcal-retry` (Task 10) reintenta con backoff.
 *
 * Las columnas `gcal_*` de `visitas` NO son escribibles por `authenticated`
 * (migración 0009: el grant de columna se acotó a propósito para que un
 * asesor no pueda falsificar el estado del espejo) — por eso este módulo usa
 * SIEMPRE `createAdminClient()` (service-role), nunca el cliente de sesión
 * que usan las server actions que lo invocan.
 *
 * Todo lo que toca red (refresh de access token, llamadas a la Calendar API)
 * se recibe por inyección de dependencias con defaults reales, para poder
 * testear cada rama sin tocar la red — mismo patrón de `fetchFn` que
 * `src/lib/google/oauth.ts`.
 *
 * Elegí el SDK scoped `@googleapis/calendar` (NO el monolito `googleapis`,
 * ~200 MB) en vez de fetch directo al REST: aquí sí vale la pena — a
 * diferencia de los 3 endpoints de OAuth (login), el CRUD de eventos tiene
 * más superficie (insert/patch/delete/update, query params como
 * `sendUpdates`) y el SDK ya modela los tipos de `Schema$Event` y los
 * errores HTTP (`GaxiosError` con `.response.status`), evitando reinventar
 * ese mapeo a mano. El paquete scoped pesa ~850 KB instalado (vs. ~200 MB de
 * `googleapis`), aceptable para una función serverless.
 */

import { auth, calendar, type calendar_v3 } from '@googleapis/calendar'
import type { SupabaseClient } from '@supabase/supabase-js'

import { createAdminClient } from '@/lib/supabase/admin'
import {
  marcarRevocada,
  obtenerConexion,
  obtenerRefreshTokenDescifrado,
} from '@/lib/google/conexiones'
import { ErrorGrantInvalido, refrescarAccessToken, type FetchFn } from '@/lib/google/oauth'
import { ZONA_HORARIA } from '@/lib/fechas/monterrey'
import { enviarPush } from '@/lib/push/enviar'

const CALENDAR_ID = 'primary'
const DOMINIO_KLO_SER = 'https://www.klo-ser.com'

// ---------------------------------------------------------------------------
// id determinista del evento
// ---------------------------------------------------------------------------

/**
 * Id determinista del evento de Google para una visita — hace que el insert
 * sea idempotente: si el reintento repite el mismo `visitaId`, Google
 * responde 409 (ya existe) en vez de crear un duplicado.
 *
 * Requisito de la API de Calendar: charset base32hex MINÚSCULA (`a-v0-9`),
 * largo 5–1024. El hex de un UUID (dígitos y `a-f`) ya es subconjunto válido
 * de ese charset — se le quitan los guiones y se le antepone un prefijo
 * (también dentro de `a-v`) para que nunca colisione con un id creado a mano
 * por el asesor en su calendario.
 */
export function idEventoDeVisita(visitaId: string): string {
  return `visita${visitaId.replace(/-/g, '').toLowerCase()}`
}

// ---------------------------------------------------------------------------
// construcción del evento
// ---------------------------------------------------------------------------

export interface VisitaParaEvento {
  id: string
  /** Fecha/hora ISO 8601 con offset (UTC), tal como sale de `visitas.fecha`. */
  fecha: string
  duracionMin: number
}

export interface LeadParaEvento {
  id: string
  nombre: string
  telefono: string | null
}

export interface PropiedadParaEvento {
  titulo: string
}

/**
 * Cuerpo del evento de Google Calendar para una visita. Sin `attendees` — es
 * un espejo, no invita a nadie (la invitación real, si la hay, la maneja
 * WhatsApp — ver `confirmacion-whatsapp.ts`). El `sendUpdates: 'none'` que
 * completa ese contrato va en la LLAMADA a la API (insert/patch/delete), no
 * en este cuerpo.
 */
export function construirEvento(
  visita: VisitaParaEvento,
  lead: LeadParaEvento,
  propiedad?: PropiedadParaEvento | null
): calendar_v3.Schema$Event {
  const inicio = new Date(visita.fecha)
  const fin = new Date(inicio.getTime() + visita.duracionMin * 60_000)

  const lineas = [
    lead.telefono ? `Teléfono: ${lead.telefono}` : null,
    `Ver el lead en Klo-Ser: ${DOMINIO_KLO_SER}/asesor/leads/${lead.id}`,
    propiedad ? `Propiedad: ${propiedad.titulo}` : null,
  ].filter((linea): linea is string => Boolean(linea))

  return {
    summary: `Visita — ${lead.nombre}`,
    description: lineas.join('\n'),
    start: { dateTime: inicio.toISOString(), timeZone: ZONA_HORARIA },
    end: { dateTime: fin.toISOString(), timeZone: ZONA_HORARIA },
    extendedProperties: { private: { visitaId: visita.id } },
  }
}

// ---------------------------------------------------------------------------
// cliente de Calendar (inyectable)
// ---------------------------------------------------------------------------

/** Subconjunto de `calendar_v3.Calendar` que este módulo necesita — así los tests inyectan un fake sin el SDK real. */
export interface ClienteCalendarMinimo {
  events: {
    insert(params: {
      calendarId: string
      requestBody: calendar_v3.Schema$Event
      sendUpdates: 'none'
    }): Promise<unknown>
    update(params: {
      calendarId: string
      eventId: string
      requestBody: calendar_v3.Schema$Event
      sendUpdates: 'none'
    }): Promise<unknown>
    patch(params: {
      calendarId: string
      eventId: string
      requestBody: calendar_v3.Schema$Event
      sendUpdates: 'none'
    }): Promise<unknown>
    delete(params: { calendarId: string; eventId: string; sendUpdates: 'none' }): Promise<unknown>
  }
}

export type CrearClienteCalendar = (accessToken: string) => ClienteCalendarMinimo

/** Cliente real: un `OAuth2Client` con el access token ya vigente (recién refrescado) como credencial. */
function crearClienteCalendarPorDefecto(accessToken: string): ClienteCalendarMinimo {
  const clienteOAuth = new auth.OAuth2()
  clienteOAuth.setCredentials({ access_token: accessToken })
  return calendar({ version: 'v3', auth: clienteOAuth }) as unknown as ClienteCalendarMinimo
}

/** Código de estado HTTP de un error del SDK (`GaxiosError`-like), sin asumir `instanceof` para que los tests puedan lanzar objetos planos. */
function statusDeError(err: unknown): number | undefined {
  if (err && typeof err === 'object' && 'response' in err) {
    const respuesta = (err as { response?: { status?: number } }).response
    return respuesta?.status
  }
  return undefined
}

function mensajeDeError(err: unknown): string {
  if (err instanceof Error) return err.message
  return 'Error desconocido al sincronizar con Google Calendar'
}

/** Insert con id propio; 409 (ya existe) es éxito idempotente — repone `status: 'confirmed'` por si el asesor lo había cancelado/borrado a mano. */
async function crearEvento(
  cliente: ClienteCalendarMinimo,
  eventId: string,
  cuerpo: calendar_v3.Schema$Event
): Promise<void> {
  try {
    await cliente.events.insert({
      calendarId: CALENDAR_ID,
      requestBody: { ...cuerpo, id: eventId },
      sendUpdates: 'none',
    })
  } catch (err) {
    if (statusDeError(err) !== 409) throw err
    await cliente.events.update({
      calendarId: CALENDAR_ID,
      eventId,
      requestBody: { ...cuerpo, status: 'confirmed' },
      sendUpdates: 'none',
    })
  }
}

/** Delete; 404/410 (el evento ya no existe) es éxito — el asesor pudo haberlo borrado a mano. */
async function cancelarEvento(cliente: ClienteCalendarMinimo, eventId: string): Promise<void> {
  try {
    await cliente.events.delete({ calendarId: CALENDAR_ID, eventId, sendUpdates: 'none' })
  } catch (err) {
    const status = statusDeError(err)
    if (status !== 404 && status !== 410) throw err
  }
}

// ---------------------------------------------------------------------------
// sincronizarVisita
// ---------------------------------------------------------------------------

type FilaVisitaSync = {
  id: string
  fecha: string
  duracion_min: number
  estado: 'agendada' | 'realizada' | 'cancelada'
  asesor_id: string
  gcal_event_id: string | null
  lead: LeadParaEvento | null
  propiedad: PropiedadParaEvento | null
}

export interface DependenciasSincronizacion {
  /** Por defecto el `fetch` global — inyectable para tests (mismo patrón que `refrescarAccessToken`). */
  fetchFn?: FetchFn
  /** Por defecto el cliente real del SDK — inyectable para tests. */
  crearClienteCalendar?: CrearClienteCalendar
  /** Por defecto `new Date()` — inyectable para fijar `gcal_proximo_intento` en tests. */
  ahora?: Date
}

async function marcarSincronizada(
  supabase: SupabaseClient,
  visitaId: string,
  eventId?: string
): Promise<void> {
  const cambios: Record<string, unknown> = {
    gcal_sync_estado: 'sincronizada',
    gcal_ultimo_error: null,
  }
  if (eventId) cambios.gcal_event_id = eventId
  await supabase.from('visitas').update(cambios).eq('id', visitaId)
}

async function marcarSinConexion(supabase: SupabaseClient, visitaId: string): Promise<void> {
  await supabase.from('visitas').update({ gcal_sync_estado: 'sin_conexion' }).eq('id', visitaId)
}

/** El cron (Task 10) es quien lleva la cuenta de `gcal_intentos` (incremento atómico al reclamar la fila); aquí solo se marca el estado y el próximo intento aproximado. */
async function marcarPendiente(
  supabase: SupabaseClient,
  visitaId: string,
  mensajeError: string,
  ahora: Date
): Promise<void> {
  await supabase
    .from('visitas')
    .update({
      gcal_sync_estado: 'pendiente',
      gcal_proximo_intento: new Date(ahora.getTime() + 60_000).toISOString(),
      gcal_ultimo_error: mensajeError,
    })
    .eq('id', visitaId)
}

/** Notifica al asesor que su conexión quedó revocada y necesita reconectar (best-effort: `enviarPush` nunca lanza). */
async function notificarReconexion(supabase: SupabaseClient, asesorId: string): Promise<void> {
  await enviarPush(supabase, asesorId, {
    titulo: 'Reconecta tu Google Calendar',
    cuerpo: 'Tu conexión con Google dejó de funcionar. Vuelve a conectar tu cuenta para seguir sincronizando tus visitas.',
    url: '/asesor',
  })
}

/**
 * Sincroniza UNA visita con el Google Calendar de su asesor. Se llama tras
 * el éxito en base de datos de `agendarVisita`/`reagendarVisita`/`cancelarVisita`
 * (y, más adelante, desde el cron `gcal-retry`) — nunca debe usarse para
 * decidir si la operación del CRM tuvo éxito, solo para reflejarla.
 *
 * Vuelve a leer la visita completa con el cliente ADMIN (no confía en datos
 * que le pase el caller) para poder derivar la operación correcta a partir
 * del estado actual en base de datos: es lo que hace este módulo seguro de
 * reintentar (por el hook y, después, por el cron) sin parámetros adicionales
 * que puedan quedar desincronizados de la fila real.
 */
export async function sincronizarVisita(
  visitaId: string,
  dependencias: DependenciasSincronizacion = {}
): Promise<void> {
  const fetchFn = dependencias.fetchFn ?? fetch
  const crearCliente = dependencias.crearClienteCalendar ?? crearClienteCalendarPorDefecto
  const ahora = dependencias.ahora ?? new Date()

  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('visitas')
    .select(
      'id, fecha, duracion_min, estado, asesor_id, gcal_event_id, lead:leads(id, nombre, telefono), propiedad:propiedades(titulo)'
    )
    .eq('id', visitaId)
    .maybeSingle()

  if (error || !data) {
    console.error('sincronizarVisita: no se pudo leer la visita', visitaId, error?.message)
    return
  }

  const visita = data as unknown as FilaVisitaSync
  if (!visita.lead) {
    console.error('sincronizarVisita: la visita no tiene lead legible, se omite', visitaId)
    return
  }

  // Cancelada que nunca llegó a sincronizarse: no hay nada que borrar en
  // Google, así que no hace falta ni conexión ni red.
  if (visita.estado === 'cancelada' && !visita.gcal_event_id) {
    await marcarSincronizada(supabase, visitaId)
    return
  }

  const conexion = await obtenerConexion(visita.asesor_id)
  if (!conexion || conexion.estado !== 'activa') {
    await marcarSinConexion(supabase, visitaId)
    return
  }

  let refreshToken: string | null
  try {
    refreshToken = await obtenerRefreshTokenDescifrado(visita.asesor_id)
  } catch {
    // Token perdido/corrupto (ver JSDoc de descifrarToken): terminal, mismo
    // tratamiento que un ErrorGrantInvalido — no es transitorio.
    await marcarRevocada(visita.asesor_id)
    await notificarReconexion(supabase, visita.asesor_id)
    await marcarSinConexion(supabase, visitaId)
    return
  }
  if (!refreshToken) {
    await marcarSinConexion(supabase, visitaId)
    return
  }

  let accessToken: string
  try {
    accessToken = await refrescarAccessToken(refreshToken, fetchFn)
  } catch (err) {
    if (err instanceof ErrorGrantInvalido) {
      await marcarRevocada(visita.asesor_id)
      await notificarReconexion(supabase, visita.asesor_id)
      await marcarSinConexion(supabase, visitaId)
      return
    }
    // Fallo de red / 5xx al refrescar: transitorio.
    await marcarPendiente(supabase, visitaId, mensajeDeError(err), ahora)
    return
  }

  const cliente = crearCliente(accessToken)

  try {
    if (visita.estado === 'cancelada') {
      // gcal_event_id no puede ser null aquí (la rama de arriba ya cubrió ese caso).
      await cancelarEvento(cliente, visita.gcal_event_id as string)
      await marcarSincronizada(supabase, visitaId)
      return
    }

    if (!visita.gcal_event_id) {
      const eventId = idEventoDeVisita(visita.id)
      const cuerpo = construirEvento(
        { id: visita.id, fecha: visita.fecha, duracionMin: visita.duracion_min },
        visita.lead,
        visita.propiedad
      )
      await crearEvento(cliente, eventId, cuerpo)
      await marcarSincronizada(supabase, visitaId, eventId)
      return
    }

    const cuerpo = construirEvento(
      { id: visita.id, fecha: visita.fecha, duracionMin: visita.duracion_min },
      visita.lead,
      visita.propiedad
    )
    await cliente.events.patch({
      calendarId: CALENDAR_ID,
      eventId: visita.gcal_event_id,
      requestBody: cuerpo,
      sendUpdates: 'none',
    })
    await marcarSincronizada(supabase, visitaId)
  } catch (err) {
    // Fallo de red / 5xx / 429 al hablar con la Calendar API: transitorio.
    await marcarPendiente(supabase, visitaId, mensajeDeError(err), ahora)
  }
}
